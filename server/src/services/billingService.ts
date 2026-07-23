import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { platformPrisma } from '../config/platformPrisma.js';
import {
  COMMERCIAL_PLANS,
  publicPlanCatalog,
  type BillingInterval,
} from '../constants/commercialPlans.js';
import { AppError } from '../errors/AppError.js';
import { sha256 } from '../utils/crypto.js';
import { billingInvoiceService } from './billingInvoiceService.js';
import { emailQueue } from '../jobs/queues.js';
import { billingMayActivateWorkspace } from './platformBusinessPolicy.js';
import { planCatalogService } from './planCatalogService.js';

type SelfServePlan = 'starter' | 'business';

async function razorpay<T>(path: string, init: RequestInit): Promise<T> {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new AppError(503, 'Subscription checkout is not configured', 'BILLING_NOT_CONFIGURED');
  }
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json()) as T & { error?: { description?: string } };
  if (!response.ok) {
    throw new AppError(
      502,
      payload.error?.description || 'Billing provider request failed',
      'BILLING_PROVIDER_ERROR',
    );
  }
  return payload;
}

async function providerPlan(
  tenantId: string,
  planCode: SelfServePlan,
  interval: BillingInterval,
  seats: number,
) {
  const existing = await platformPrisma.tenantPrice.findUnique({
    where: { tenantId_planCode_interval_seats: { tenantId, planCode, interval, seats } },
  });
  if (existing?.providerPlanId) return existing;
  const published = await planCatalogService.publishedPlan(planCode);
  const fallback = COMMERCIAL_PLANS[planCode];
  const plan = published ?? fallback;
  const maxSeats = plan.maxSeats;
  if (seats < 1 || (maxSeats !== null && seats > maxSeats))
    throw new AppError(400, 'Invalid seat count', 'INVALID_SEAT_COUNT');
  const base = interval === 'annual' ? plan.annualPricePaise! : plan.monthlyPricePaise!;
  const amountPaise =
    base +
    Math.max(0, seats - plan.includedSeats) *
      plan.extraSeatPricePaise! *
      (interval === 'annual' ? 10 : 1);
  const created = await razorpay<{ id: string }>('/plans', {
    method: 'POST',
    body: JSON.stringify({
      period: interval === 'annual' ? 'yearly' : 'monthly',
      interval: 1,
      item: {
        name: `MooNsConfig ${plan.name} (${seats} seats)`,
        amount: amountPaise,
        currency: 'INR',
        description: `${plan.name} ${interval} subscription`,
      },
      notes: { tenant_id: tenantId, plan_code: planCode, seats: String(seats) },
    }),
  });
  return platformPrisma.tenantPrice.upsert({
    where: { tenantId_planCode_interval_seats: { tenantId, planCode, interval, seats } },
    update: { providerPlanId: created.id, amountPaise },
    create: {
      tenantId,
      planCode,
      interval,
      seats,
      amountPaise,
      providerPlanId: created.id,
      ...(published ? { planVersionId: published.planVersionId } : {}),
    },
  });
}

function webhookTenant(payload: any) {
  return payload?.payload?.subscription?.entity?.notes?.tenant_id as string | undefined;
}

async function assertTargetCapacity(tenantId: string, planCode: SelfServePlan, seats: number) {
  const [memberships, invitations, storage] = await Promise.all([
    platformPrisma.membership.count({ where: { tenantId, status: 'active' } }),
    platformPrisma.invitation.count({
      where: { tenantId, status: 'invited', expiresAt: { gt: new Date() } },
    }),
    platformPrisma.uploadObject.aggregate({
      where: { tenantId, status: { in: ['pending', 'processing', 'active'] } },
      _sum: { sizeBytes: true },
    }),
  ]);
  const occupiedSeats = memberships + invitations;
  if (occupiedSeats > seats) {
    throw new AppError(
      409,
      `Remove pending invitations or staff before selecting ${seats} seats`,
      'DOWNGRADE_SEAT_LIMIT',
    );
  }
  const usedBytes = storage._sum.sizeBytes ?? 0n;
  const published = await planCatalogService.publishedPlan(planCode);
  const storageBytes = published?.storageBytes ?? COMMERCIAL_PLANS[planCode].storageBytes;
  if (usedBytes > BigInt(storageBytes)) {
    throw new AppError(
      409,
      'Storage use exceeds the target plan; remove files before downgrading',
      'DOWNGRADE_STORAGE_LIMIT',
    );
  }
}

async function billingNotice(tenantId: string, eventId: string, subject: string, text: string) {
  const owner = await platformPrisma.membership.findFirst({
    where: { tenantId, role: 'owner' },
    include: { user: true },
  });
  if (!owner) return;
  await emailQueue.add(
    'billing-notice',
    {
      tenantId,
      to: owner.user.email,
      subject,
      text,
      idempotencyKey: `billing:${eventId}`,
    },
    { jobId: `billing-${sha256(eventId).slice(0, 32)}` },
  );
}

export const billingService = {
  plans: publicPlanCatalog,

  async reconcile() {
    if (!env.razorpay.keyId || !env.razorpay.keySecret) return { checked: 0, changed: 0 };
    const subscriptions = await platformPrisma.subscription.findMany({
      where: {
        provider: 'razorpay',
        providerSubscriptionId: { not: null },
        status: { in: ['active', 'past_due', 'suspended'] },
      },
    });
    let changed = 0;
    for (const subscription of subscriptions) {
      const provider = await razorpay<any>(
        `/subscriptions/${subscription.providerSubscriptionId}`,
        { method: 'GET' },
      );
      const mapped =
        provider.status === 'active' || provider.status === 'authenticated'
          ? 'active'
          : provider.status === 'pending'
            ? 'past_due'
            : provider.status === 'cancelled'
              ? 'cancelled'
              : 'suspended';
      if (mapped === subscription.status) continue;
      const administrativeHold = await platformPrisma.tenant.findUnique({
        where: { id: subscription.tenantId },
        select: { administrativelySuspendedAt: true },
      });
      await platformPrisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: mapped,
          currentPeriodStart: provider.current_start
            ? new Date(provider.current_start * 1000)
            : subscription.currentPeriodStart,
          currentPeriodEnd: provider.current_end
            ? new Date(provider.current_end * 1000)
            : subscription.currentPeriodEnd,
          lastProviderEventAt: new Date(),
          nextChargeAt: provider.current_end
            ? new Date(provider.current_end * 1000)
            : subscription.currentPeriodEnd,
          pastDueSince: mapped === 'past_due' ? (subscription.pastDueSince ?? new Date()) : null,
          ...(mapped === 'active' ? { outstandingPaise: 0 } : {}),
        },
      });
      if (
        mapped === 'active' &&
        billingMayActivateWorkspace(administrativeHold?.administrativelySuspendedAt)
      ) {
        await platformPrisma.tenant.update({
          where: { id: subscription.tenantId },
          data: { status: 'active', suspendedAt: null, retentionEndsAt: null },
        });
      } else {
        const active = await platformPrisma.subscription.count({
          where: {
            tenantId: subscription.tenantId,
            id: { not: subscription.id },
            status: 'active',
          },
        });
        if (!active)
          await platformPrisma.tenant.update({
            where: { id: subscription.tenantId },
            data: {
              status: 'suspended',
              suspendedAt: new Date(),
              retentionEndsAt: new Date(Date.now() + 90 * 86_400_000),
            },
          });
      }
      await platformPrisma.platformAuditEvent.create({
        data: {
          tenantId: subscription.tenantId,
          action: 'billing.subscription.reconciled',
          target: subscription.id,
          metadata: { from: subscription.status, to: mapped },
        },
      });
      changed += 1;
    }
    return { checked: subscriptions.length, changed };
  },

  async current(tenantId: string) {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: { trial: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    if (!tenant) throw new AppError(404, 'Company not found', 'TENANT_NOT_FOUND');
    return {
      tenantStatus: tenant.status,
      trial: tenant.trial,
      subscriptions: tenant.subscriptions,
    };
  },

  async checkout(
    tenantId: string,
    input: { planCode: SelfServePlan; interval: BillingInterval; seats: number },
  ) {
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Company not found', 'TENANT_NOT_FOUND');
    const plan =
      (await planCatalogService.publishedPlan(input.planCode)) ?? COMMERCIAL_PLANS[input.planCode];
    if (input.seats < 1 || (plan.maxSeats !== null && input.seats > plan.maxSeats)) {
      throw new AppError(400, `Choose between 1 and ${plan.maxSeats} seats`, 'INVALID_SEAT_COUNT');
    }
    await assertTargetCapacity(tenantId, input.planCode, input.seats);
    const price = await providerPlan(tenantId, input.planCode, input.interval, input.seats);
    const providerSubscription = await razorpay<{ id: string; short_url?: string }>(
      '/subscriptions',
      {
        method: 'POST',
        body: JSON.stringify({
          plan_id: price.providerPlanId,
          total_count: input.interval === 'annual' ? 10 : 120,
          quantity: 1,
          customer_notify: true,
          notes: { tenant_id: tenantId, plan_code: input.planCode, seats: String(input.seats) },
        }),
      },
    );
    await platformPrisma.subscription.create({
      data: {
        tenantId,
        planCode: input.planCode,
        interval: input.interval,
        seats: input.seats,
        status: 'suspended',
        provider: 'razorpay',
        providerSubscriptionId: providerSubscription.id,
        amountPaise: price.amountPaise,
        planVersionId: price.planVersionId,
        entitlementSnapshot: (await planCatalogService.publishedPlan(input.planCode)) ?? undefined,
        pricingSnapshot: (await planCatalogService.publishedPlan(input.planCode)) ?? undefined,
      },
    });
    return {
      keyId: env.razorpay.keyId,
      subscriptionId: providerSubscription.id,
      checkoutUrl: providerSubscription.short_url ?? null,
      amountPaise: price.amountPaise,
      currency: 'INR',
    };
  },

  async change(
    tenantId: string,
    input: { planCode: SelfServePlan; interval: BillingInterval; seats: number },
  ) {
    const current = await platformPrisma.subscription.findFirst({
      where: {
        tenantId,
        status: 'active',
        provider: 'razorpay',
        providerSubscriptionId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!current?.providerSubscriptionId) return this.checkout(tenantId, input);
    const targetPlan =
      (await planCatalogService.publishedPlan(input.planCode)) ?? COMMERCIAL_PLANS[input.planCode];
    if (input.seats < 1 || (targetPlan.maxSeats !== null && input.seats > targetPlan.maxSeats)) {
      throw new AppError(
        400,
        `Choose between 1 and ${targetPlan.maxSeats} seats`,
        'INVALID_SEAT_COUNT',
      );
    }
    const price = await providerPlan(tenantId, input.planCode, input.interval, input.seats);
    const rank = { starter: 1, business: 2, enterprise: 3 } as const;
    const upgrade =
      rank[input.planCode] > rank[current.planCode] ||
      (rank[input.planCode] === rank[current.planCode] && input.seats > current.seats);
    if (!upgrade) await assertTargetCapacity(tenantId, input.planCode, input.seats);
    await razorpay(`/subscriptions/${current.providerSubscriptionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        plan_id: price.providerPlanId,
        quantity: 1,
        schedule_change_at: upgrade ? 'now' : 'cycle_end',
      }),
    });
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        action: upgrade
          ? 'billing.subscription.upgrade_requested'
          : 'billing.subscription.downgrade_scheduled',
        target: current.id,
        metadata: {
          fromPlan: current.planCode,
          toPlan: input.planCode,
          seats: input.seats,
          interval: input.interval,
        },
      },
    });
    return {
      subscriptionId: current.providerSubscriptionId,
      effective: upgrade ? 'immediate' : 'renewal',
      amountPaise: price.amountPaise,
      currency: 'INR',
    };
  },

  async cancel(tenantId: string, atPeriodEnd: boolean) {
    const subscription = await platformPrisma.subscription.findFirst({
      where: {
        tenantId,
        provider: 'razorpay',
        providerSubscriptionId: { not: null },
        status: { in: ['active', 'past_due'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription?.providerSubscriptionId) {
      throw new AppError(404, 'Active subscription not found', 'SUBSCRIPTION_NOT_FOUND');
    }
    await razorpay(`/subscriptions/${subscription.providerSubscriptionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancel_at_cycle_end: atPeriodEnd ? 1 : 0 }),
    });
    await platformPrisma.subscription.update({
      where: { id: subscription.id },
      data: atPeriodEnd
        ? { cancelAtPeriodEnd: true }
        : { status: 'cancelled', currentPeriodEnd: new Date() },
    });
    if (!atPeriodEnd) {
      await platformPrisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'suspended',
          suspendedAt: new Date(),
          retentionEndsAt: new Date(Date.now() + 90 * 86_400_000),
        },
      });
    }
    return { cancelAtPeriodEnd: atPeriodEnd };
  },

  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!env.razorpay.webhookSecret || !signature) {
      throw new AppError(401, 'Invalid billing webhook signature', 'INVALID_WEBHOOK_SIGNATURE');
    }
    const expected = createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
    const left = Buffer.from(expected);
    const right = Buffer.from(signature);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new AppError(401, 'Invalid billing webhook signature', 'INVALID_WEBHOOK_SIGNATURE');
    }
  },

  async processWebhook(rawBody: Buffer, eventId: string | undefined) {
    const payload = JSON.parse(rawBody.toString('utf8')) as any;
    const providerCreatedAt = Number(payload.created_at)
      ? new Date(Number(payload.created_at) * 1000)
      : new Date();
    const providerEventId = eventId || sha256(rawBody.toString('utf8'));
    const tenantId = webhookTenant(payload);
    const existing = await platformPrisma.paymentEvent.findUnique({ where: { providerEventId } });
    if (existing?.processedAt) return { duplicate: true };
    const event =
      existing ??
      (await platformPrisma.paymentEvent.create({
        data: {
          tenantId,
          provider: 'razorpay',
          providerEventId,
          eventType: String(payload.event || 'unknown'),
          payloadHash: sha256(rawBody.toString('utf8')),
          payload,
          providerCreatedAt,
        },
      }));
    const providerSubscription = payload?.payload?.subscription?.entity;
    const providerSubscriptionId = providerSubscription?.id as string | undefined;
    const subscription = providerSubscriptionId
      ? await platformPrisma.subscription.findUnique({ where: { providerSubscriptionId } })
      : null;
    if (subscription) {
      if (
        subscription.lastProviderEventAt &&
        subscription.lastProviderEventAt > providerCreatedAt
      ) {
        await platformPrisma.paymentEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
        return { processed: true, ignoredAsStale: true };
      }
      const eventType = String(payload.event);
      if (
        ['subscription.activated', 'subscription.charged', 'subscription.resumed'].includes(
          eventType,
        )
      ) {
        const periodStart = providerSubscription.current_start
          ? new Date(providerSubscription.current_start * 1000)
          : new Date();
        const periodEnd = providerSubscription.current_end
          ? new Date(providerSubscription.current_end * 1000)
          : null;
        const providerPrice = providerSubscription.plan_id
          ? await platformPrisma.tenantPrice.findUnique({
              where: { providerPlanId: providerSubscription.plan_id },
            })
          : null;
        await platformPrisma.$transaction([
          platformPrisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'active',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              ...(providerPrice
                ? {
                    planCode: providerPrice.planCode,
                    interval: providerPrice.interval,
                    seats: providerPrice.seats,
                    amountPaise: providerPrice.amountPaise,
                  }
                : {}),
              outstandingPaise: 0,
              nextChargeAt: periodEnd,
              pastDueSince: null,
              lastProviderEventAt: providerCreatedAt,
            },
          }),
          platformPrisma.tenant.updateMany({
            where: {
              id: subscription.tenantId,
              administrativelySuspendedAt: null,
            },
            data: { status: 'active', suspendedAt: null, retentionEndsAt: null },
          }),
          platformPrisma.trial.updateMany({
            where: { tenantId: subscription.tenantId, endedAt: null },
            data: { endedAt: new Date() },
          }),
        ]);
        if (eventType === 'subscription.charged') {
          const amountPaise = Number(
            payload?.payload?.payment?.entity?.amount ?? providerPrice?.amountPaise ?? 0,
          );
          if (Number.isSafeInteger(amountPaise) && amountPaise > 0) {
            await billingInvoiceService.createForPayment({
              tenantId: subscription.tenantId,
              subscriptionId: subscription.id,
              eventId: providerEventId,
              amountPaise,
              description: `${providerPrice?.planCode ?? subscription.planCode} subscription`,
            });
          }
          await billingNotice(
            subscription.tenantId,
            providerEventId,
            'MooNsConfig payment received',
            'Your workspace is active and the payment has been recorded.',
          );
        }
      } else if (['subscription.pending'].includes(eventType)) {
        const outstanding = Number(payload?.payload?.payment?.entity?.amount ?? 0);
        await platformPrisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'past_due',
            pastDueSince: subscription.pastDueSince ?? providerCreatedAt,
            ...(Number.isSafeInteger(outstanding) && outstanding > 0
              ? { outstandingPaise: outstanding }
              : {}),
            lastProviderEventAt: providerCreatedAt,
          },
        });
        await billingNotice(
          subscription.tenantId,
          providerEventId,
          'MooNsConfig payment requires attention',
          `Update your payment authorization at ${env.appPublicUrl}/settings/billing.`,
        );
      } else if (
        ['subscription.halted', 'subscription.cancelled', 'subscription.completed'].includes(
          eventType,
        )
      ) {
        const status = eventType === 'subscription.cancelled' ? 'cancelled' : 'suspended';
        await platformPrisma.subscription.update({
          where: { id: subscription.id },
          data: { status, lastProviderEventAt: providerCreatedAt },
        });
        const otherActive = await platformPrisma.subscription.count({
          where: {
            tenantId: subscription.tenantId,
            id: { not: subscription.id },
            status: 'active',
          },
        });
        if (!otherActive) {
          await platformPrisma.tenant.update({
            where: { id: subscription.tenantId },
            data: {
              status: 'suspended',
              suspendedAt: new Date(),
              retentionEndsAt: new Date(Date.now() + 90 * 86_400_000),
            },
          });
        }
        await billingNotice(
          subscription.tenantId,
          providerEventId,
          'MooNsConfig workspace locked',
          `Recover billing or export your data at ${env.appPublicUrl}/settings/billing.`,
        );
      }
    }
    await platformPrisma.paymentEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });
    return { processed: true };
  },
};
