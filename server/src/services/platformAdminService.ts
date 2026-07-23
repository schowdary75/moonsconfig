import { platformPrisma } from '../config/platformPrisma.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import {
  accountExportQueue,
  billingInvoiceQueue,
  emailQueue,
  provisioningQueue,
  tenantBackupQueue,
} from '../jobs/queues.js';
import { createOpaqueToken, sha256 } from '../utils/crypto.js';
import { normalizeTenantSlug } from '../utils/tenantNaming.js';
import { platformRegistrationService } from './platformRegistrationService.js';
import { planCatalogService } from './planCatalogService.js';
import { domainService } from './domainService.js';
import { ssoService } from './ssoService.js';
import { providerCredentialService } from './providerCredentialService.js';
import { migrationRolloutService } from './migrationRolloutService.js';
import { billingService } from './billingService.js';
import type { OperatorActor } from './platformBusinessService.js';

export interface GovernedMutation {
  reason: string;
  ticket?: string;
  confirmation?: string;
  expectedUpdatedAt?: string;
  idempotencyKey: string;
}

function assertConfirmation(expected: string, actual?: string) {
  if (expected.trim().toLowerCase() !== actual?.trim().toLowerCase()) {
    throw new AppError(400, `Type ${expected} to confirm this action`, 'CONFIRMATION_MISMATCH');
  }
}

function assertFresh(updatedAt: Date, expected?: string) {
  if (!expected || updatedAt.getTime() !== new Date(expected).getTime()) {
    throw new AppError(409, 'This record changed after it was loaded', 'STALE_PLATFORM_RECORD');
  }
}

function jsonSafe(value: unknown): any {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)),
  );
}

async function audit(
  actor: OperatorActor,
  action: string,
  target: string,
  input: GovernedMutation,
  tenantId?: string,
  metadata: Record<string, unknown> = {},
) {
  return platformPrisma.platformAuditEvent.create({
    data: {
      tenantId,
      operatorId: actor.id,
      action,
      target,
      ipAddress: actor.ipAddress,
      metadata: jsonSafe({
        operatorRole: actor.role,
        requestId: actor.requestId,
        reason: input.reason,
        ticket: input.ticket,
        ...metadata,
      }),
    },
  });
}

async function governed<T>(
  actor: OperatorActor,
  action: string,
  target: string,
  input: GovernedMutation,
  work: () => Promise<T>,
) {
  const existing = await platformPrisma.governedOperation.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (
      existing.operatorId !== actor.id ||
      existing.action !== action ||
      existing.target !== target
    ) {
      throw new AppError(
        409,
        'Idempotency key was used for a different operation',
        'IDEMPOTENCY_CONFLICT',
      );
    }
    if (existing.result !== null) return existing.result as T;
    throw new AppError(409, 'This operation is already in progress', 'OPERATION_IN_PROGRESS');
  }
  await platformPrisma.governedOperation.create({
    data: { idempotencyKey: input.idempotencyKey, operatorId: actor.id, action, target },
  });
  try {
    const result = await work();
    await platformPrisma.governedOperation.update({
      where: { idempotencyKey: input.idempotencyKey },
      data: { result: jsonSafe(result) },
    });
    return result;
  } catch (error) {
    await platformPrisma.governedOperation
      .delete({ where: { idempotencyKey: input.idempotencyKey } })
      .catch(() => undefined);
    throw error;
  }
}

async function ownerFor(tenantId: string) {
  const owner = await platformPrisma.membership.findFirst({
    where: { tenantId, role: 'owner', status: 'active' },
    include: { user: true },
  });
  if (!owner) throw new AppError(409, 'Workspace has no active owner', 'OWNER_REQUIRED');
  return owner;
}

export const platformAdminService = {
  async createWorkspace(input: any, actor: OperatorActor) {
    return governed(actor, 'ops.workspace.created', input.slug, input, async () => {
      assertConfirmation('CREATE WORKSPACE', input.confirmation);
      const result = await platformRegistrationService.register(
        {
          ownerName: input.ownerName,
          email: input.ownerEmail,
          mobile: input.ownerMobile,
          password: createOpaqueToken() + 'Aa1!',
          companyName: input.name,
          slug: input.slug,
          country: input.country || 'IN',
          timezone: input.timezone || 'Asia/Kolkata',
          billingAddress: input.billingAddress,
          gstin: input.gstin || null,
          acceptedTerms: true,
          acceptedPrivacy: true,
          acceptedDpa: true,
        },
        actor.ipAddress,
        'platform-operations-console',
        { adminCreated: true, operatorId: actor.id },
      );
      if (input.internal || input.beta) {
        await platformPrisma.tenant.update({
          where: { id: result.registrationId },
          data: { internal: Boolean(input.internal || input.beta) },
        });
      }
      await audit(
        actor,
        'ops.workspace.created',
        result.registrationId,
        input,
        result.registrationId,
        {
          slug: result.slug,
          ownerEmail: input.ownerEmail,
        },
      );
      return result;
    });
  },

  async updateWorkspace(tenantId: string, input: any, actor: OperatorActor) {
    return governed(actor, 'ops.workspace.updated', tenantId, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      const nextSlug = input.slug ? normalizeTenantSlug(input.slug) : tenant.slug;
      const updated = await platformPrisma.$transaction(async (tx) => {
        if (nextSlug !== tenant.slug) {
          const hostname = `${nextSlug}.${env.appBaseDomain}`.toLowerCase();
          const collision = await tx.tenant.findFirst({
            where: {
              OR: [{ slug: nextSlug }, { domains: { some: { hostname } } }],
              id: { not: tenantId },
            },
          });
          if (collision)
            throw new AppError(409, 'Workspace slug is already in use', 'SLUG_ALREADY_USED');
          await tx.domain.updateMany({
            where: { tenantId, kind: 'platform_subdomain' },
            data: { hostname },
          });
        }
        return tx.tenant.update({
          where: { id: tenantId },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.slug !== undefined ? { slug: nextSlug } : {}),
            ...(input.country !== undefined ? { country: input.country } : {}),
            ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
            ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress } : {}),
            ...(input.gstin !== undefined ? { gstin: input.gstin || null } : {}),
            ...(input.internal !== undefined ? { internal: input.internal } : {}),
          },
          select: { id: true, name: true, slug: true, status: true, updatedAt: true },
        });
      });
      await audit(actor, 'ops.workspace.updated', tenantId, input, tenantId, {
        previous: { name: tenant.name, slug: tenant.slug },
        resulting: updated,
      });
      return updated;
    });
  },

  async resetOnboarding(tenantId: string, input: GovernedMutation, actor: OperatorActor) {
    return governed(actor, 'ops.workspace.onboarding_reset', tenantId, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      const result = await platformPrisma.tenant.update({
        where: { id: tenantId },
        data: { onboardingStep: 'company_profile', onboardingCompletedAt: null },
        select: { id: true, onboardingStep: true, updatedAt: true },
      });
      await audit(actor, 'ops.workspace.onboarding_reset', tenantId, input, tenantId);
      return result;
    });
  },

  async inviteMember(tenantId: string, input: any, actor: OperatorActor) {
    return governed(
      actor,
      'ops.membership.invited',
      `${tenantId}:${input.email}`,
      input,
      async () => {
        const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
        assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
        assertConfirmation(tenant.slug, input.confirmation);
        const inviter = await ownerFor(tenantId);
        const { invitationService } = await import('./invitationService.js');
        const result = await invitationService.invite(tenantId, inviter.userId, {
          email: input.email,
          role: input.role,
        });
        await audit(actor, 'ops.membership.invited', result.id, input, tenantId, {
          email: input.email,
          role: input.role,
        });
        return result;
      },
    );
  },

  async removeMembership(
    tenantId: string,
    membershipId: string,
    input: GovernedMutation,
    actor: OperatorActor,
  ) {
    return governed(actor, 'ops.membership.removed', membershipId, input, async () => {
      const membership = await platformPrisma.membership.findFirst({
        where: { id: membershipId, tenantId },
        include: { user: true },
      });
      if (!membership) throw new AppError(404, 'Membership not found', 'MEMBERSHIP_NOT_FOUND');
      assertFresh(membership.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(membership.user.email, input.confirmation);
      if (membership.role === 'owner')
        throw new AppError(
          409,
          'Transfer ownership before removing this member',
          'FINAL_OWNER_PROTECTED',
        );
      await platformPrisma.$transaction([
        platformPrisma.platformRefreshToken.updateMany({
          where: { membershipId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        platformPrisma.membership.delete({ where: { id: membershipId } }),
      ]);
      await audit(actor, 'ops.membership.removed', membershipId, input, tenantId, {
        email: membership.user.email,
      });
      return { removed: true };
    });
  },

  async resetMemberMfa(
    tenantId: string,
    membershipId: string,
    input: GovernedMutation,
    actor: OperatorActor,
  ) {
    return governed(actor, 'ops.membership.mfa_reset', membershipId, input, async () => {
      const membership = await platformPrisma.membership.findFirst({
        where: { id: membershipId, tenantId },
        include: { user: true },
      });
      if (!membership) throw new AppError(404, 'Membership not found', 'MEMBERSHIP_NOT_FOUND');
      assertFresh(membership.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(membership.user.email, input.confirmation);
      await platformPrisma.$transaction([
        platformPrisma.platformRefreshToken.updateMany({
          where: { userId: membership.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        platformPrisma.mfaMethod.updateMany({
          where: { userId: membership.userId, disabledAt: null },
          data: { disabledAt: new Date() },
        }),
        platformPrisma.platformUser.update({
          where: { id: membership.userId },
          data: { mfaEnabled: false },
        }),
      ]);
      await audit(actor, 'ops.membership.mfa_reset', membershipId, input, tenantId, {
        email: membership.user.email,
      });
      return { reset: true, sessionsRevoked: true };
    });
  },

  async manageTrial(tenantId: string, input: any, actor: OperatorActor) {
    return governed(actor, `ops.trial.${input.action}`, tenantId, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({
        where: { id: tenantId },
        include: { trial: true },
      });
      if (!tenant?.trial) throw new AppError(404, 'Trial not found', 'TRIAL_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      const now = new Date();
      const endsAt =
        input.action === 'extend'
          ? new Date(
              Math.max(now.getTime(), tenant.trial.endsAt.getTime()) +
                Math.min(input.days, 30) * 86_400_000,
            )
          : tenant.trial.endsAt;
      const trial = await platformPrisma.trial.update({
        where: { tenantId },
        data: input.action === 'extend' ? { endsAt, endedAt: null } : { endedAt: now, endsAt: now },
      });
      if (input.action === 'extend' && !tenant.administrativelySuspendedAt) {
        await platformPrisma.tenant.update({
          where: { id: tenantId },
          data: { status: 'active', suspendedAt: null },
        });
      }
      await audit(actor, `ops.trial.${input.action}`, trial.id, input, tenantId, {
        endsAt: trial.endsAt,
      });
      return trial;
    });
  },

  async createManualSubscription(input: any, actor: OperatorActor) {
    return governed(actor, 'ops.subscription.manual_created', input.tenantId, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: input.tenantId } });
      if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      await planCatalogService.ensureVersionOne(actor.id);
      const plan = await planCatalogService.publishedPlan('enterprise');
      if (!plan)
        throw new AppError(409, 'Published Enterprise plan is unavailable', 'CATALOG_UNAVAILABLE');
      const subscription = await platformPrisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planCode: 'enterprise',
          status: input.status || 'active',
          interval: input.interval || 'annual',
          seats: input.seats,
          provider: null,
          source: 'manual_enterprise',
          amountPaise: input.amountPaise,
          outstandingPaise: input.outstandingPaise ?? input.amountPaise,
          contractReference: input.contractReference,
          currentPeriodStart: new Date(input.periodStart),
          currentPeriodEnd: new Date(input.periodEnd),
          nextChargeAt: new Date(input.periodEnd),
          planVersionId: plan?.planVersionId,
          entitlementSnapshot: plan,
          pricingSnapshot: plan,
        },
      });
      await platformPrisma.subscriptionChange.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          operatorId: actor.id,
          changeType: 'created',
          resultingState: jsonSafe(subscription),
          reason: input.reason,
          ticket: input.ticket,
          idempotencyKey: `${input.idempotencyKey}:ledger`,
        },
      });
      if (subscription.status === 'active' && !tenant.administrativelySuspendedAt) {
        await platformPrisma.tenant.update({
          where: { id: tenant.id },
          data: { status: 'active', suspendedAt: null },
        });
      }
      await audit(actor, 'ops.subscription.manual_created', subscription.id, input, tenant.id, {
        contractReference: input.contractReference,
      });
      return subscription;
    });
  },

  async createProviderCheckout(input: any, actor: OperatorActor) {
    return governed(actor, 'ops.subscription.checkout_created', input.tenantId, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: input.tenantId } });
      if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      const result = await billingService.checkout(tenant.id, {
        planCode: input.planCode,
        interval: input.interval,
        seats: input.seats,
      });
      await audit(
        actor,
        'ops.subscription.checkout_created',
        result.subscriptionId,
        input,
        tenant.id,
        { planCode: input.planCode, seats: input.seats },
      );
      return result;
    });
  },

  async changeSubscription(subscriptionId: string, input: any, actor: OperatorActor) {
    return governed(actor, `ops.subscription.${input.action}`, subscriptionId, input, async () => {
      const subscription = await platformPrisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { tenant: true },
      });
      if (!subscription)
        throw new AppError(404, 'Subscription not found', 'SUBSCRIPTION_NOT_FOUND');
      assertFresh(subscription.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(subscription.tenant.slug, input.confirmation);
      if (subscription.source === 'razorpay' && ['mark_paid', 'set_dues'].includes(input.action)) {
        throw new AppError(
          409,
          'Razorpay financial state can only change through webhooks or reconciliation',
          'PROVIDER_STATE_IMMUTABLE',
        );
      }
      const previous = jsonSafe(subscription);
      if (subscription.source === 'razorpay') {
        const result =
          input.action === 'cancel'
            ? await billingService.cancel(subscription.tenantId, true)
            : input.action === 'change'
              ? await billingService.change(subscription.tenantId, {
                  planCode: input.planCode,
                  interval: input.interval,
                  seats: input.seats,
                })
              : (() => {
                  throw new AppError(
                    409,
                    'This Razorpay action is not supported',
                    'PROVIDER_ACTION_REQUIRED',
                  );
                })();
        const current = await platformPrisma.subscription.findUniqueOrThrow({
          where: { id: subscriptionId },
        });
        await platformPrisma.subscriptionChange.create({
          data: {
            tenantId: subscription.tenantId,
            subscriptionId,
            operatorId: actor.id,
            changeType: input.action,
            previousState: previous,
            resultingState: jsonSafe(current),
            reason: input.reason,
            ticket: input.ticket,
            idempotencyKey: `${input.idempotencyKey}:ledger`,
          },
        });
        await audit(
          actor,
          `ops.subscription.${input.action}`,
          subscriptionId,
          input,
          subscription.tenantId,
          { providerResult: result },
        );
        return result;
      }
      const data: any = {};
      if (input.action === 'cancel') data.cancelAtPeriodEnd = true;
      if (input.action === 'suspend' && subscription.source === 'manual_enterprise')
        data.status = 'suspended';
      if (input.action === 'renew' && subscription.source === 'manual_enterprise') {
        data.status = 'active';
        data.currentPeriodEnd = new Date(input.periodEnd);
        data.nextChargeAt = new Date(input.periodEnd);
        if (input.amountPaise !== undefined) data.amountPaise = input.amountPaise;
      }
      if (input.action === 'change' && subscription.source === 'manual_enterprise') {
        if (input.seats !== undefined) data.seats = input.seats;
        if (input.contractReference !== undefined) data.contractReference = input.contractReference;
        if (input.outstandingPaise !== undefined) data.outstandingPaise = input.outstandingPaise;
      }
      const result = await platformPrisma.subscription.update({
        where: { id: subscription.id },
        data,
      });
      await platformPrisma.subscriptionChange.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId,
          operatorId: actor.id,
          changeType: input.action,
          previousState: previous,
          resultingState: jsonSafe(result),
          reason: input.reason,
          ticket: input.ticket,
          idempotencyKey: `${input.idempotencyKey}:ledger`,
        },
      });
      await audit(
        actor,
        `ops.subscription.${input.action}`,
        subscriptionId,
        input,
        subscription.tenantId,
      );
      return result;
    });
  },

  async createInvoice(input: any, actor: OperatorActor) {
    return governed(actor, 'ops.invoice.created', input.tenantId, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: input.tenantId } });
      if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      const subtotal = input.lines.reduce(
        (sum: number, line: any) => sum + line.quantity * line.unitAmountPaise,
        0,
      );
      const tax = input.lines.reduce((sum: number, line: any) => sum + (line.taxPaise || 0), 0);
      const invoice = await platformPrisma.billingInvoice.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: input.subscriptionId || null,
          invoiceNumber: input.invoiceNumber,
          status: 'draft',
          legalName: input.legalName || tenant.name,
          gstin: input.gstin ?? tenant.gstin,
          billingAddress: input.billingAddress || tenant.billingAddress,
          placeOfSupply: input.placeOfSupply,
          subtotalPaise: subtotal,
          taxPaise: tax,
          totalPaise: subtotal + tax,
          amountPaidPaise: 0,
          balancePaise: subtotal + tax,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          idempotencyKey: `${input.idempotencyKey}:invoice`,
          lines: { create: input.lines },
        },
        include: { lines: true },
      });
      await audit(actor, 'ops.invoice.created', invoice.id, input, tenant.id, {
        invoiceNumber: invoice.invoiceNumber,
      });
      return invoice;
    });
  },

  async invoiceAction(invoiceId: string, input: any, actor: OperatorActor) {
    return governed(actor, `ops.invoice.${input.action}`, invoiceId, input, async () => {
      const invoice = await platformPrisma.billingInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
      assertFresh(invoice.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(invoice.invoiceNumber, input.confirmation);
      if (input.action === 'issue' && invoice.status !== 'draft')
        throw new AppError(409, 'Only draft invoices can be issued', 'INVOICE_IMMUTABLE');
      if (input.action === 'void' && !['draft', 'issued', 'failed'].includes(invoice.status))
        throw new AppError(409, 'Paid invoices require an adjustment record', 'INVOICE_IMMUTABLE');
      const result = await platformPrisma.billingInvoice.update({
        where: { id: invoiceId },
        data:
          input.action === 'issue'
            ? { status: 'issued', issuedAt: new Date() }
            : { status: 'void', balancePaise: 0 },
      });
      if (input.action === 'issue')
        await billingInvoiceQueue.add(
          'zoho-invoice',
          { invoiceId },
          { jobId: `invoice-issue-${invoiceId}` },
        );
      await audit(actor, `ops.invoice.${input.action}`, invoiceId, input, invoice.tenantId, {
        invoiceNumber: invoice.invoiceNumber,
      });
      return result;
    });
  },

  async updateInvoice(invoiceId: string, input: any, actor: OperatorActor) {
    return governed(actor, 'ops.invoice.updated', invoiceId, input, async () => {
      const invoice = await platformPrisma.billingInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
      if (invoice.status !== 'draft')
        throw new AppError(409, 'Issued invoice history is immutable', 'INVOICE_IMMUTABLE');
      assertFresh(invoice.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(invoice.invoiceNumber, input.confirmation);
      const subtotal = input.lines.reduce(
        (sum: number, line: any) => sum + line.quantity * line.unitAmountPaise,
        0,
      );
      const tax = input.lines.reduce((sum: number, line: any) => sum + (line.taxPaise || 0), 0);
      const result = await platformPrisma.$transaction(async (tx) => {
        await tx.billingInvoiceLine.deleteMany({ where: { invoiceId } });
        return tx.billingInvoice.update({
          where: { id: invoiceId },
          data: {
            legalName: input.legalName,
            gstin: input.gstin || null,
            billingAddress: input.billingAddress,
            placeOfSupply: input.placeOfSupply || null,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            subtotalPaise: subtotal,
            taxPaise: tax,
            totalPaise: subtotal + tax,
            balancePaise: subtotal + tax,
            lines: { create: input.lines },
          },
          include: { lines: true },
        });
      });
      await audit(actor, 'ops.invoice.updated', invoiceId, input, invoice.tenantId, {
        invoiceNumber: invoice.invoiceNumber,
      });
      return result;
    });
  },

  async operators(operatorId: string) {
    const [operators, invitations] = await Promise.all([
      platformPrisma.platformOperator.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          mfaVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { sessions: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.platformOperatorInvitation.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const items = [
      ...operators.map((item) => ({ ...item, kind: 'operator' as const })),
      ...invitations.map((item) => ({ ...item, kind: 'invitation' as const })),
    ];
    return {
      items,
      page: 1,
      pageSize: items.length || 25,
      total: items.length,
      currentOperatorId: operatorId,
    };
  },

  async inviteOperator(input: any, actor: OperatorActor) {
    return governed(actor, 'ops.operator.invited', input.email.toLowerCase(), input, async () => {
      assertConfirmation('INVITE OPERATOR', input.confirmation);
      const email = input.email.trim().toLowerCase();
      if (await platformPrisma.platformOperator.findUnique({ where: { email } }))
        throw new AppError(409, 'Operator already exists', 'OPERATOR_EXISTS');
      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
      const invitation = await platformPrisma.platformOperatorInvitation.create({
        data: {
          email,
          name: input.name.trim(),
          role: input.role,
          tokenHash: sha256(token),
          invitedById: actor.id,
          expiresAt,
        },
      });
      const activationUrl = `${env.appPublicUrl}/platform-ops?operatorActivation=${encodeURIComponent(token)}`;
      await emailQueue.add(
        'operator-invitation',
        {
          to: email,
          subject: 'MooNsConfig platform operator invitation',
          text: `Activate your operator account within 24 hours: ${activationUrl}`,
          idempotencyKey: `operator-invitation:${invitation.id}`,
        },
        { jobId: `operator-invitation-${invitation.id}` },
      );
      await audit(actor, 'ops.operator.invited', invitation.id, input, undefined, {
        email,
        role: input.role,
      });
      return {
        id: invitation.id,
        email,
        role: input.role,
        expiresAt,
        ...(env.nodeEnv === 'production' ? {} : { token }),
      };
    });
  },

  async updateOperator(operatorId: string, input: any, actor: OperatorActor) {
    return governed(actor, `ops.operator.${input.action}`, operatorId, input, async () => {
      const operator = await platformPrisma.platformOperator.findUnique({
        where: { id: operatorId },
      });
      if (!operator) throw new AppError(404, 'Operator not found', 'OPERATOR_NOT_FOUND');
      assertFresh(operator.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(operator.email, input.confirmation);
      if (
        operator.id === actor.id &&
        (input.action === 'suspend' || (input.action === 'role' && input.role !== 'platform_admin'))
      ) {
        throw new AppError(
          409,
          'You cannot suspend or demote your current operator session',
          'SELF_ADMIN_PROTECTED',
        );
      }
      if (
        operator.role === 'platform_admin' &&
        (input.action === 'suspend' || (input.action === 'role' && input.role !== 'platform_admin'))
      ) {
        const admins = await platformPrisma.platformOperator.count({
          where: { role: 'platform_admin', status: 'active' },
        });
        if (admins <= 1)
          throw new AppError(
            409,
            'The final active platform administrator is protected',
            'FINAL_ADMIN_PROTECTED',
          );
      }
      const data: any =
        input.action === 'role'
          ? { role: input.role }
          : input.action === 'reactivate'
            ? { status: 'active' }
            : input.action === 'suspend'
              ? { status: 'suspended' }
              : {};
      if (input.action === 'reset_mfa')
        Object.assign(data, {
          mfaSecret: null,
          mfaVerifiedAt: null,
          lastUsedStep: null,
          status: 'suspended',
        });
      const result = await platformPrisma.$transaction(async (tx) => {
        await tx.platformOperatorSession.updateMany({
          where: { operatorId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return tx.platformOperator.update({
          where: { id: operatorId },
          data,
          select: { id: true, email: true, name: true, role: true, status: true, updatedAt: true },
        });
      });
      await audit(actor, `ops.operator.${input.action}`, operatorId, input, undefined, {
        previousRole: operator.role,
        resultingRole: result.role,
      });
      return result;
    });
  },

  async catalogs(actor: OperatorActor) {
    const items = await planCatalogService.list(actor.id);
    return { items: jsonSafe(items), page: 1, pageSize: items.length || 25, total: items.length };
  },

  async createCatalog(input: any, actor: OperatorActor) {
    return governed(actor, 'ops.catalog.created', `v${input.version}`, input, async () => {
      assertConfirmation(`CREATE V${input.version}`, input.confirmation);
      planCatalogService.validatePlans(input.plans);
      const catalog = await platformPrisma.planCatalogVersion.create({
        data: {
          version: input.version,
          notes: input.notes,
          createdById: actor.id,
          plans: {
            create: input.plans.map((plan: any) => ({
              code: plan.code,
              name: plan.name,
              description: plan.description,
              includedSeats: plan.includedSeats,
              maxSeats: plan.maxSeats,
              storageBytes: BigInt(plan.storageBytes),
              monthlyPricePaise: plan.monthlyPricePaise,
              annualPricePaise: plan.annualPricePaise,
              extraSeatPricePaise: plan.extraSeatPricePaise,
              entitlements: { create: plan.entitlements },
            })),
          },
        },
        include: { plans: { include: { entitlements: true } } },
      });
      await audit(actor, 'ops.catalog.created', catalog.id, input, undefined, {
        version: catalog.version,
      });
      return jsonSafe(catalog);
    });
  },

  async publishCatalog(catalogId: string, input: GovernedMutation, actor: OperatorActor) {
    return governed(actor, 'ops.catalog.published', catalogId, input, async () => {
      const catalog = await platformPrisma.planCatalogVersion.findUnique({
        where: { id: catalogId },
        include: { plans: { include: { entitlements: true } } },
      });
      if (!catalog) throw new AppError(404, 'Catalog not found', 'CATALOG_NOT_FOUND');
      if (catalog.status !== 'draft')
        throw new AppError(409, 'Published catalog history is immutable', 'CATALOG_IMMUTABLE');
      assertFresh(catalog.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(`PUBLISH V${catalog.version}`, input.confirmation);
      planCatalogService.validatePlans(catalog.plans);
      const result = await platformPrisma.$transaction(async (tx) => {
        await tx.planCatalogVersion.updateMany({
          where: { status: 'published' },
          data: { status: 'retired' },
        });
        return tx.planCatalogVersion.update({
          where: { id: catalogId },
          data: { status: 'published', publishedAt: new Date(), publishedById: actor.id },
        });
      });
      await audit(actor, 'ops.catalog.published', catalogId, input, undefined, {
        version: catalog.version,
      });
      return result;
    });
  },

  async triggerBackup(tenantId: string, input: GovernedMutation, actor: OperatorActor) {
    return governed(actor, 'ops.backup.triggered', tenantId, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      const artifact = await platformPrisma.backupArtifact.create({
        data: { tenantId, kind: 'logical_export', status: 'pending' },
      });
      await tenantBackupQueue.add(
        'tenant-backup',
        { artifactId: artifact.id, tenantId },
        { jobId: `backup-${artifact.id}` },
      );
      await audit(actor, 'ops.backup.triggered', artifact.id, input, tenantId);
      return artifact;
    });
  },

  async requestDomain(tenantId: string, input: any, actor: OperatorActor) {
    return governed(
      actor,
      'ops.domain.requested',
      `${tenantId}:${input.hostname}`,
      input,
      async () => {
        const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
        assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
        assertConfirmation(tenant.slug, input.confirmation);
        const result = await domainService.request(
          tenantId,
          { operatorId: actor.id },
          input.hostname,
        );
        await audit(actor, 'ops.domain.requested', result.id, input, tenantId, {
          hostname: result.hostname,
        });
        return result;
      },
    );
  },

  async domainAction(tenantId: string, domainId: string, input: any, actor: OperatorActor) {
    return governed(actor, `ops.domain.${input.action}`, domainId, input, async () => {
      const domain = await platformPrisma.domain.findFirst({ where: { id: domainId, tenantId } });
      if (!domain) throw new AppError(404, 'Domain not found', 'DOMAIN_NOT_FOUND');
      assertFresh(domain.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(domain.hostname, input.confirmation);
      const result =
        input.action === 'verify'
          ? await domainService.verify(tenantId, { operatorId: actor.id }, domainId)
          : await domainService.revoke(tenantId, { operatorId: actor.id }, domainId);
      await audit(actor, `ops.domain.${input.action}`, domainId, input, tenantId, {
        hostname: domain.hostname,
      });
      return result;
    });
  },

  async configureSso(tenantId: string, input: any, actor: OperatorActor) {
    return governed(actor, 'ops.sso.configured', tenantId, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      const result = await ssoService.configure(
        tenantId,
        { operatorId: actor.id },
        { policy: input.policy, connectionId: input.connectionId, domains: input.domains },
      );
      await audit(actor, 'ops.sso.configured', tenantId, input, tenantId, {
        policy: input.policy,
        domains: input.domains,
      });
      return result;
    });
  },

  async putProviderCredential(tenantId: string, input: any, actor: OperatorActor) {
    return governed(
      actor,
      'ops.provider.updated',
      `${tenantId}:${input.provider}`,
      input,
      async () => {
        const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
        assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
        assertConfirmation(tenant.slug, input.confirmation);
        const result = await providerCredentialService.put(
          tenantId,
          { operatorId: actor.id },
          input.provider,
          input.credentials,
          input.metadata,
        );
        await audit(actor, 'ops.provider.updated', result.id, input, tenantId, {
          provider: input.provider,
        });
        return result;
      },
    );
  },

  async removeProviderCredential(
    tenantId: string,
    provider: string,
    input: GovernedMutation,
    actor: OperatorActor,
  ) {
    return governed(actor, 'ops.provider.removed', `${tenantId}:${provider}`, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      await providerCredentialService.remove(tenantId, { operatorId: actor.id }, provider);
      await audit(actor, 'ops.provider.removed', provider, input, tenantId, { provider });
      return { removed: true };
    });
  },

  async retryExport(exportId: string, input: GovernedMutation, actor: OperatorActor) {
    return governed(actor, 'ops.export.retried', exportId, input, async () => {
      const record = await platformPrisma.accountExport.findUnique({
        where: { id: exportId },
        include: { tenant: true },
      });
      if (!record) throw new AppError(404, 'Export not found', 'EXPORT_NOT_FOUND');
      assertConfirmation(record.tenant.slug, input.confirmation);
      if (!['failed', 'expired'].includes(record.status))
        throw new AppError(409, 'Export is not retryable', 'EXPORT_NOT_RETRYABLE');
      const updated = await platformPrisma.accountExport.update({
        where: { id: exportId },
        data: { status: 'pending', lastError: null },
      });
      await accountExportQueue.add(
        'account-export',
        { tenantId: record.tenantId, exportId },
        { jobId: `export-retry-${exportId}-${input.idempotencyKey}` },
      );
      await audit(actor, 'ops.export.retried', exportId, input, record.tenantId);
      return updated;
    });
  },

  async createExport(tenantId: string, input: any, actor: OperatorActor) {
    return governed(actor, 'ops.export.requested', tenantId, input, async () => {
      const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant || ['deleted', 'deleting'].includes(tenant.status))
        throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
      assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(tenant.slug, input.confirmation);
      const active = await platformPrisma.accountExport.findFirst({
        where: { tenantId, status: { in: ['pending', 'processing'] } },
      });
      if (active) return active;
      const record = await platformPrisma.accountExport.create({
        data: { tenantId, requestedByOperatorId: actor.id, status: 'pending' },
      });
      await accountExportQueue.add(
        'account-export',
        { tenantId, exportId: record.id },
        { jobId: `operator-export-${record.id}` },
      );
      await audit(actor, 'ops.export.requested', record.id, input, tenantId, {
        legalBasis: input.legalBasis,
      });
      return record;
    });
  },

  async retryDeletion(deletionId: string, input: GovernedMutation, actor: OperatorActor) {
    return governed(actor, 'ops.deletion.retried', deletionId, input, async () => {
      const record = await platformPrisma.deletionRequest.findUnique({
        where: { id: deletionId },
        include: { tenant: true },
      });
      if (!record || record.status !== 'failed')
        throw new AppError(409, 'Deletion is not retryable', 'DELETION_NOT_RETRYABLE');
      assertConfirmation(`RETRY ${record.tenant.slug}`, input.confirmation);
      const now = new Date();
      const result = await platformPrisma.$transaction(async (tx) => {
        await tx.tenant.update({
          where: { id: record.tenantId },
          data: { status: 'suspended', retentionEndsAt: now },
        });
        return tx.deletionRequest.update({
          where: { id: deletionId },
          data: { status: 'scheduled', executeAt: now, lastError: null },
        });
      });
      await audit(actor, 'ops.deletion.retried', deletionId, input, record.tenantId);
      return result;
    });
  },

  async createMigration(input: any, actor: OperatorActor) {
    return governed(actor, 'ops.migration.draft_created', input.migrationName, input, async () => {
      assertConfirmation('CREATE MIGRATION', input.confirmation);
      const result = await migrationRolloutService.createDraft(
        input.migrationName,
        input.targetVersion,
      );
      await audit(actor, 'ops.migration.draft_created', result.id, input, undefined, {
        migrationName: input.migrationName,
        targetVersion: input.targetVersion,
      });
      return result;
    });
  },

  async migrationAction(rolloutId: string, input: any, actor: OperatorActor) {
    return governed(actor, `ops.migration.${input.action}`, rolloutId, input, async () => {
      const rollout = await platformPrisma.migrationRollout.findUnique({
        where: { id: rolloutId },
      });
      if (!rollout) throw new AppError(404, 'Migration rollout not found', 'ROLLOUT_NOT_FOUND');
      assertFresh(rollout.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(rollout.migrationName, input.confirmation);
      const result =
        input.action === 'start'
          ? await migrationRolloutService.start(rolloutId)
          : input.action === 'pause'
            ? await migrationRolloutService.pause(rolloutId, input.reason)
            : input.action === 'advance'
              ? await migrationRolloutService.advance(rolloutId)
              : input.action === 'retry'
                ? await migrationRolloutService.retry(rolloutId)
                : await migrationRolloutService.removeDraft(rolloutId);
      await audit(actor, `ops.migration.${input.action}`, rolloutId, input, undefined, {
        migrationName: rollout.migrationName,
      });
      return result;
    });
  },

  async provisioningAction(jobId: string, input: any, actor: OperatorActor) {
    return governed(actor, `ops.provisioning.${input.action}`, jobId, input, async () => {
      const job = await platformPrisma.provisioningJob.findUnique({
        where: { id: jobId },
        include: { tenant: true },
      });
      if (!job) throw new AppError(404, 'Provisioning job not found', 'PROVISIONING_NOT_FOUND');
      assertFresh(job.updatedAt, input.expectedUpdatedAt);
      assertConfirmation(job.tenant.slug, input.confirmation);
      if (input.action === 'cancel') {
        if (job.startedAt || job.status === 'processing')
          throw new AppError(
            409,
            'Provisioning can only be cancelled before database creation starts',
            'PROVISIONING_CANCEL_BLOCKED',
          );
        await platformPrisma.$transaction([
          platformPrisma.provisioningJob.update({
            where: { id: jobId },
            data: { status: 'failed', lastError: 'Cancelled by platform administrator' },
          }),
          platformPrisma.tenant.update({ where: { id: job.tenantId }, data: { status: 'failed' } }),
        ]);
        await audit(actor, 'ops.provisioning.cancelled', jobId, input, job.tenantId);
        return { cancelled: true };
      }
      if (job.status !== 'failed')
        throw new AppError(
          409,
          'Only failed provisioning can be retried',
          'PROVISIONING_RETRY_BLOCKED',
        );
      await platformPrisma.$transaction([
        platformPrisma.provisioningJob.update({
          where: { id: jobId },
          data: { status: 'pending', lastError: null, startedAt: null, completedAt: null },
        }),
        platformPrisma.tenant.update({ where: { id: job.tenantId }, data: { status: 'pending' } }),
      ]);
      await provisioningQueue.add(
        'provision-tenant',
        { jobId, tenantId: job.tenantId },
        { jobId: `tenant-${job.tenantId}-retry-${input.idempotencyKey}` },
      );
      await audit(actor, 'ops.provisioning.retried', jobId, input, job.tenantId);
      return { jobId, status: 'pending' };
    });
  },
};
