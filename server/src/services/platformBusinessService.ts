import { platformPrisma } from '../config/platformPrisma.js';
import { resolveTenantRuntime } from '../config/tenantContext.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { emailQueue, billingInvoiceQueue } from '../jobs/queues.js';
import { createOpaqueToken, sha256 } from '../utils/crypto.js';
import { billingService } from './billingService.js';
import { objectStorageService } from './objectStorageService.js';
import { confirmationMatches, recordIsFresh } from './platformBusinessPolicy.js';

export type OperatorRole = 'support' | 'billing' | 'security' | 'platform_admin';

export interface OperatorActor {
  id: string;
  role: OperatorRole;
  requestId: string;
  ipAddress?: string;
}

interface PageQuery {
  page?: number | string;
  pageSize?: number | string;
  query?: string;
  status?: string;
  tenantId?: string;
  plan?: string;
  kind?: string;
}

interface GovernedAction {
  reason: string;
  ticket: string;
  confirmation: string;
  expectedUpdatedAt: string;
}

const membershipRoles = [
  'admin',
  'manager',
  'editor',
  'approver',
  'sales',
  'support',
  'finance',
  'marketing',
  'operations',
  'viewer',
] as const;

function pageValues(query: PageQuery) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function pageResult<T>(items: T[], page: number, pageSize: number, total: number) {
  return { items, page, pageSize, total };
}

function statusFilter(value: string | undefined, allowed: readonly string[]) {
  if (!value) return undefined;
  if (!allowed.includes(value)) {
    throw new AppError(400, `Unsupported status filter: ${value}`, 'INVALID_STATUS_FILTER');
  }
  return value;
}

function assertFresh(actual: Date, expected: string) {
  if (!recordIsFresh(actual, expected)) {
    throw new AppError(
      409,
      'This record changed after it was loaded. Refresh and try again.',
      'STALE_PLATFORM_RECORD',
    );
  }
}

function assertConfirmation(expected: string, actual: string) {
  if (!confirmationMatches(expected, actual)) {
    throw new AppError(400, `Type ${expected} to confirm this action`, 'CONFIRMATION_MISMATCH');
  }
}

function auditMetadata(
  actor: OperatorActor,
  input: { reason: string; ticket: string },
  extra = {},
) {
  return {
    operatorRole: actor.role,
    requestId: actor.requestId,
    reason: input.reason,
    ticket: input.ticket,
    ...extra,
  };
}

async function revokeMembershipSessions(
  membershipId: string,
  tenantId: string,
  tenantUserId: number | null,
) {
  await platformPrisma.platformRefreshToken.updateMany({
    where: { membershipId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!tenantUserId) return;
  try {
    const runtime = await resolveTenantRuntime(tenantId, true);
    await runtime.db.crmAuthSession.deleteMany({ where: { userId: tenantUserId } });
  } catch {
    // Platform revocation is authoritative. Tenant cleanup is retried by the next governed action.
  }
}

async function synchronizeTenantRole(tenantId: string, tenantUserId: number | null, role: string) {
  if (!tenantUserId) return;
  const localRole = role === 'owner' ? 'admin' : role;
  try {
    const runtime = await resolveTenantRuntime(tenantId, true);
    await runtime.db.$transaction(async (transaction) => {
      await transaction.crmAuthSession.deleteMany({ where: { userId: tenantUserId } });
      await transaction.crmUserRoleLink.deleteMany({ where: { userId: tenantUserId } });
      await transaction.crmUser.update({
        where: { id: tenantUserId },
        data: { role: localRole as any },
      });
      await transaction.crmUserRoleLink.create({
        data: { userId: tenantUserId, role: localRole as any },
      });
    });
  } catch (error) {
    throw new AppError(
      503,
      `Platform access was secured, but tenant role synchronization failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      'TENANT_ROLE_SYNC_FAILED',
    );
  }
}

function workspaceWhere(query: PageQuery) {
  const where: any = {};
  if (query.query?.trim()) {
    const term = query.query.trim();
    where.OR = [{ name: { contains: term } }, { slug: { contains: term } }];
  }
  const status = statusFilter(query.status, [
    'pending',
    'pending_activation',
    'provisioning',
    'active',
    'suspended',
    'deleting',
    'deleted',
    'failed',
  ]);
  if (status) where.status = status;
  if (query.plan) where.subscriptions = { some: { planCode: query.plan } };
  return where;
}

function presentWorkspace(tenant: any, storageBytes = 0n, role: OperatorRole = 'support') {
  const now = new Date();
  const trialActive = Boolean(tenant.trial && !tenant.trial.endedAt && tenant.trial.endsAt > now);
  const subscription = tenant.subscriptions?.[0] ?? null;
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    country: tenant.country,
    timezone: tenant.timezone,
    currency: tenant.currency,
    schemaVersion: tenant.schemaVersion,
    onboardingStep: tenant.onboardingStep,
    onboardingCompletedAt: tenant.onboardingCompletedAt,
    suspendedAt: tenant.suspendedAt,
    retentionEndsAt: tenant.retentionEndsAt,
    administrativelySuspendedAt: tenant.administrativelySuspendedAt,
    administrativeSuspensionReason: tenant.administrativeSuspensionReason,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    internal: tenant.internal,
    planCode: trialActive ? 'enterprise' : (subscription?.planCode ?? null),
    billingStatus: trialActive ? 'trialing' : (subscription?.status ?? 'none'),
    trialEndsAt: tenant.trial?.endsAt ?? null,
    renewalAt: subscription?.nextChargeAt ?? subscription?.currentPeriodEnd ?? null,
    outstandingPaise: subscription?.outstandingPaise ?? null,
    seats: subscription?.seats ?? (trialActive ? 10 : null),
    storageBytes: String(storageBytes),
    counts: tenant._count,
    allowedActions:
      role === 'platform_admin'
        ? [
            'edit',
            'reset_onboarding',
            'invite_member',
            'manage_trial',
            'manual_subscription',
            'create_invoice',
            'suspend',
            'reactivate',
            'backup',
            'schedule_deletion',
            'cancel_deletion',
          ]
        : role === 'billing'
          ? ['manage_trial', 'create_invoice', 'billing_reconcile']
          : role === 'security'
            ? ['invite_member', 'membership_security']
            : ['request_support_access', 'retry_provisioning'],
  };
}

export const platformBusinessService = {
  async overview() {
    const now = new Date();
    const [
      workspaces,
      activeTrials,
      subscriptions,
      memberships,
      invoiceBalance,
      provisioningFailures,
      migrationFailures,
      securityAlerts,
      pendingDeletions,
    ] = await Promise.all([
      platformPrisma.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
      platformPrisma.trial.count({ where: { endedAt: null, endsAt: { gt: now } } }),
      platformPrisma.subscription.findMany({
        where: { status: { in: ['active', 'past_due'] } },
        select: { status: true, interval: true, amountPaise: true, outstandingPaise: true },
      }),
      platformPrisma.membership.count({ where: { status: 'active' } }),
      platformPrisma.billingInvoice.aggregate({
        where: { status: { in: ['draft', 'issued', 'failed'] } },
        _sum: { balancePaise: true },
      }),
      platformPrisma.provisioningJob.count({ where: { status: 'failed' } }),
      platformPrisma.migrationTarget.count({ where: { status: 'failed' } }),
      platformPrisma.securityEvent.count({
        where: { resolvedAt: null, severity: { in: ['high', 'critical'] } },
      }),
      platformPrisma.deletionRequest.count({
        where: { status: { in: ['requested', 'scheduled', 'processing', 'failed'] } },
      }),
    ]);
    const monthlyRecurringPaise = subscriptions
      .filter((item) => item.status === 'active' && item.amountPaise !== null)
      .reduce(
        (sum, item) => sum + Math.round(item.amountPaise! / (item.interval === 'annual' ? 12 : 1)),
        0,
      );
    return {
      workspaces,
      activeTrials,
      activeSubscriptions: subscriptions.filter((item) => item.status === 'active').length,
      overdueSubscriptions: subscriptions.filter((item) => item.status === 'past_due').length,
      activeMemberships: memberships,
      monthlyRecurringPaise,
      outstandingPaise:
        subscriptions.reduce((sum, item) => sum + (item.outstandingPaise ?? 0), 0) +
        Number(invoiceBalance._sum.balancePaise ?? 0),
      provisioningFailures,
      migrationFailures,
      securityAlerts,
      pendingDeletions,
    };
  },

  async workspaces(query: PageQuery, role: OperatorRole = 'support') {
    const { page, pageSize, skip } = pageValues(query);
    const where = workspaceWhere(query);
    const [tenants, total] = await platformPrisma.$transaction([
      platformPrisma.tenant.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          country: true,
          timezone: true,
          currency: true,
          schemaVersion: true,
          onboardingStep: true,
          onboardingCompletedAt: true,
          suspendedAt: true,
          retentionEndsAt: true,
          administrativelySuspendedAt: true,
          administrativeSuspensionReason: true,
          createdAt: true,
          updatedAt: true,
          internal: true,
          trial: true,
          subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { memberships: true, domains: true, provisioningJobs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.tenant.count({ where }),
    ]);
    const ids = tenants.map((tenant) => tenant.id);
    const storage = ids.length
      ? await platformPrisma.uploadObject.groupBy({
          by: ['tenantId'],
          where: { tenantId: { in: ids }, status: { in: ['pending', 'processing', 'active'] } },
          _sum: { sizeBytes: true },
        })
      : [];
    const storageMap = new Map(storage.map((item) => [item.tenantId, item._sum.sizeBytes ?? 0n]));
    return pageResult(
      tenants.map((tenant) => presentWorkspace(tenant, storageMap.get(tenant.id) ?? 0n, role)),
      page,
      pageSize,
      total,
    );
  },

  async workspace(tenantId: string, role: OperatorRole = 'support') {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        country: true,
        timezone: true,
        currency: true,
        billingAddress: true,
        gstin: true,
        schemaVersion: true,
        onboardingStep: true,
        onboardingCompletedAt: true,
        suspendedAt: true,
        retentionEndsAt: true,
        administrativelySuspendedAt: true,
        administrativeSuspensionReason: true,
        createdAt: true,
        updatedAt: true,
        internal: true,
        trial: true,
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 5 },
        domains: {
          select: {
            id: true,
            hostname: true,
            kind: true,
            status: true,
            failureReason: true,
            verifiedAt: true,
            activatedAt: true,
            updatedAt: true,
          },
        },
        ssoConfig: {
          select: {
            policy: true,
            verifiedDomains: true,
            updatedAt: true,
          },
        },
        providerCredentials: {
          select: { id: true, provider: true, status: true, lastVerifiedAt: true, updatedAt: true },
        },
        provisioningJobs: {
          select: {
            id: true,
            status: true,
            attemptCount: true,
            lastError: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { memberships: true, domains: true, provisioningJobs: true } },
      },
    });
    if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
    const storage = await platformPrisma.uploadObject.aggregate({
      where: { tenantId, status: { in: ['pending', 'processing', 'active'] } },
      _sum: { sizeBytes: true },
    });
    return {
      ...presentWorkspace(tenant, storage._sum.sizeBytes ?? 0n, role),
      ...tenant,
      storageBytes: String(storage._sum.sizeBytes ?? 0n),
    };
  },

  async memberships(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    const tenant = query.tenantId ? { tenantId: query.tenantId } : {};
    const search = query.query?.trim()
      ? {
          OR: [
            { user: { email: { contains: query.query.trim() } } },
            { user: { name: { contains: query.query.trim() } } },
            { tenant: { name: { contains: query.query.trim() } } },
          ],
        }
      : {};
    if (query.kind === 'invitations') {
      const status = statusFilter(query.status, ['invited', 'active', 'suspended']);
      const where: any = {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(status ? { status } : {}),
        ...(query.query?.trim()
          ? {
              OR: [
                { email: { contains: query.query.trim() } },
                { tenant: { name: { contains: query.query.trim() } } },
              ],
            }
          : {}),
      };
      const [items, total] = await platformPrisma.$transaction([
        platformPrisma.invitation.findMany({
          where,
          select: {
            id: true,
            tenantId: true,
            email: true,
            role: true,
            status: true,
            expiresAt: true,
            acceptedAt: true,
            createdAt: true,
            tenant: { select: { name: true, slug: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        platformPrisma.invitation.count({ where }),
      ]);
      return pageResult(
        items.map((item) => ({ ...item, kind: 'invitation' })),
        page,
        pageSize,
        total,
      );
    }
    const status = statusFilter(query.status, ['invited', 'active', 'suspended']);
    const where: any = {
      ...tenant,
      ...search,
      ...(status ? { status } : {}),
    };
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.membership.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          role: true,
          status: true,
          tenantUserId: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              mobile: true,
              status: true,
              mfaEnabled: true,
              emailVerifiedAt: true,
            },
          },
          tenant: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.membership.count({ where }),
    ]);
    return pageResult(
      items.map((item) => ({ ...item, kind: 'membership' })),
      page,
      pageSize,
      total,
    );
  },

  async subscriptions(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    const status = statusFilter(query.status, [
      'trialing',
      'active',
      'past_due',
      'suspended',
      'cancelled',
      'expired',
    ]);
    const where: any = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(status ? { status } : {}),
      ...(query.plan ? { planCode: query.plan } : {}),
      ...(query.query?.trim() ? { tenant: { name: { contains: query.query.trim() } } } : {}),
    };
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.subscription.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          planCode: true,
          status: true,
          interval: true,
          seats: true,
          provider: true,
          source: true,
          planVersionId: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          lastProviderEventAt: true,
          amountPaise: true,
          outstandingPaise: true,
          nextChargeAt: true,
          pastDueSince: true,
          contractReference: true,
          createdAt: true,
          updatedAt: true,
          tenant: { select: { name: true, slug: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.subscription.count({ where }),
    ]);
    return pageResult(items, page, pageSize, total);
  },

  async invoices(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    const status = statusFilter(query.status, ['draft', 'issued', 'paid', 'void', 'failed']);
    const where: any = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(status ? { status } : {}),
      ...(query.query?.trim()
        ? {
            OR: [
              { invoiceNumber: { contains: query.query.trim() } },
              { legalName: { contains: query.query.trim() } },
              { tenant: { name: { contains: query.query.trim() } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await platformPrisma.$transaction([
      platformPrisma.billingInvoice.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          subscriptionId: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          legalName: true,
          billingAddress: true,
          gstin: true,
          placeOfSupply: true,
          subtotalPaise: true,
          taxPaise: true,
          totalPaise: true,
          amountPaidPaise: true,
          balancePaise: true,
          dueAt: true,
          provider: true,
          providerStatus: true,
          issuedAt: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
          tenant: { select: { name: true, slug: true } },
          lines: {
            select: {
              id: true,
              description: true,
              quantity: true,
              unitAmountPaise: true,
              taxPaise: true,
              hsnSac: true,
            },
          },
          pdfStorageKey: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.billingInvoice.count({ where }),
    ]);
    const items = rows.map(({ pdfStorageKey, ...row }) => ({
      ...row,
      downloadAvailable: Boolean(pdfStorageKey),
    }));
    return pageResult(items, page, pageSize, total);
  },

  async paymentEvents(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    statusFilter(query.status, ['processed', 'pending']);
    const where: any = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.status === 'processed'
        ? { processedAt: { not: null } }
        : query.status === 'pending'
          ? { processedAt: null }
          : {}),
      ...(query.query?.trim()
        ? {
            OR: [
              { providerEventId: { contains: query.query.trim() } },
              { eventType: { contains: query.query.trim() } },
              { tenant: { name: { contains: query.query.trim() } } },
            ],
          }
        : {}),
    };
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.paymentEvent.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          provider: true,
          providerEventId: true,
          eventType: true,
          providerCreatedAt: true,
          processedAt: true,
          createdAt: true,
          tenant: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.paymentEvent.count({ where }),
    ]);
    return pageResult(items, page, pageSize, total);
  },

  async accessGrants(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    statusFilter(query.status, ['pending', 'active']);
    const where: any = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.status === 'pending' ? { approvedAt: null, revokedAt: null } : {}),
      ...(query.status === 'active'
        ? { approvedAt: { not: null }, revokedAt: null, expiresAt: { gt: new Date() } }
        : {}),
    };
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.operatorAccessGrant.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          reason: true,
          ticket: true,
          readOnly: true,
          startsAt: true,
          expiresAt: true,
          approvedAt: true,
          revokedAt: true,
          createdAt: true,
          tenant: { select: { name: true, slug: true } },
          operator: { select: { id: true, name: true, email: true, role: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.operatorAccessGrant.count({ where }),
    ]);
    return pageResult(items, page, pageSize, total);
  },

  async auditEvents(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    const where: any = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.query?.trim() ? { action: { contains: query.query.trim() } } : {}),
    };
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.platformAuditEvent.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          action: true,
          target: true,
          metadata: true,
          ipAddress: true,
          previousHash: true,
          eventHash: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
          operator: { select: { id: true, name: true, email: true, role: true } },
          tenant: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.platformAuditEvent.count({ where }),
    ]);
    return pageResult(items, page, pageSize, total);
  },

  async securityEvents(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    statusFilter(query.status, ['open']);
    const where: any = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.status === 'open' ? { resolvedAt: null } : {}),
      ...(query.query?.trim() ? { eventType: { contains: query.query.trim() } } : {}),
    };
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.securityEvent.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          eventType: true,
          severity: true,
          source: true,
          ipAddress: true,
          resolvedAt: true,
          createdAt: true,
          tenant: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.securityEvent.count({ where }),
    ]);
    return pageResult(items, page, pageSize, total);
  },

  async workspaceSecurity(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    const where = workspaceWhere(query);
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.tenant.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          updatedAt: true,
          ssoConfig: {
            select: {
              policy: true,
              verifiedDomains: true,
              workosOrganizationId: true,
              updatedAt: true,
            },
          },
          domains: {
            select: { id: true, hostname: true, kind: true, status: true, verifiedAt: true },
          },
          providerCredentials: {
            select: { id: true, provider: true, status: true, lastVerifiedAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.tenant.count({ where }),
    ]);
    return pageResult(items, page, pageSize, total);
  },

  async provisioningJobs(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    const status = statusFilter(query.status, ['pending', 'processing', 'completed', 'failed']);
    const where: any = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(status ? { status } : {}),
      ...(query.query?.trim() ? { tenant: { name: { contains: query.query.trim() } } } : {}),
    };
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.provisioningJob.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          status: true,
          attemptCount: true,
          lastError: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          tenant: { select: { name: true, slug: true, schemaVersion: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.provisioningJob.count({ where }),
    ]);
    return pageResult(items, page, pageSize, total);
  },

  async migrationRollouts(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    const status = statusFilter(query.status, [
      'draft',
      'running',
      'paused',
      'completed',
      'failed',
    ]);
    const where: any = {
      ...(status ? { status } : {}),
      ...(query.query?.trim()
        ? {
            OR: [
              { migrationName: { contains: query.query.trim() } },
              { targetVersion: { contains: query.query.trim() } },
            ],
          }
        : {}),
    };
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.migrationRollout.findMany({
        where,
        select: {
          id: true,
          migrationName: true,
          targetVersion: true,
          status: true,
          currentStage: true,
          startedAt: true,
          completedAt: true,
          pausedReason: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { targets: true } },
          targets: {
            select: { status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.migrationRollout.count({ where }),
    ]);
    return pageResult(
      items.map(({ targets, ...item }) => ({
        ...item,
        targetStatusCounts: targets.reduce<Record<string, number>>((counts, target) => {
          counts[target.status] = (counts[target.status] ?? 0) + 1;
          return counts;
        }, {}),
      })),
      page,
      pageSize,
      total,
    );
  },

  async backups(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    const status = statusFilter(query.status, [
      'pending',
      'processing',
      'active',
      'failed',
      'revoked',
      'deleted',
    ]);
    const where: any = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(status ? { status } : {}),
      ...(query.query?.trim() ? { tenant: { name: { contains: query.query.trim() } } } : {}),
    };
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.backupArtifact.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          kind: true,
          status: true,
          checksum: true,
          schemaVersion: true,
          sizeBytes: true,
          capturedAt: true,
          expiresAt: true,
          restoredAt: true,
          lastError: true,
          createdAt: true,
          tenant: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.backupArtifact.count({ where }),
    ]);
    return pageResult(
      items.map((item) => ({ ...item, sizeBytes: item.sizeBytes?.toString() ?? null })),
      page,
      pageSize,
      total,
    );
  },

  async lifecycle(query: PageQuery) {
    const { page, pageSize, skip } = pageValues(query);
    const status = statusFilter(
      query.status,
      query.kind === 'exports'
        ? ['pending', 'processing', 'completed', 'failed', 'expired']
        : ['requested', 'scheduled', 'processing', 'completed', 'cancelled', 'failed'],
    );
    const where: any = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(status ? { status } : {}),
    };
    if (query.kind === 'exports') {
      const [items, total] = await platformPrisma.$transaction([
        platformPrisma.accountExport.findMany({
          where,
          select: {
            id: true,
            tenantId: true,
            status: true,
            sha256: true,
            sizeBytes: true,
            expiresAt: true,
            lastError: true,
            createdAt: true,
            completedAt: true,
            tenant: { select: { name: true, slug: true } },
            requestedBy: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        platformPrisma.accountExport.count({ where }),
      ]);
      return pageResult(
        items.map((item) => ({ ...item, sizeBytes: item.sizeBytes?.toString() ?? null })),
        page,
        pageSize,
        total,
      );
    }
    const [items, total] = await platformPrisma.$transaction([
      platformPrisma.deletionRequest.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          status: true,
          executeAt: true,
          reason: true,
          lastError: true,
          attemptCount: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
          tenant: { select: { name: true, slug: true, status: true, updatedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      platformPrisma.deletionRequest.count({ where }),
    ]);
    return pageResult(items, page, pageSize, total);
  },

  async suspendWorkspace(tenantId: string, input: GovernedAction, actor: OperatorActor) {
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
    assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
    assertConfirmation(tenant.slug, input.confirmation);
    if (tenant.status === 'deleted' || tenant.status === 'deleting') {
      throw new AppError(409, 'A deleting workspace cannot be suspended', 'INVALID_TENANT_STATE');
    }
    const now = new Date();
    const memberships = await platformPrisma.membership.findMany({
      where: { tenantId },
      select: { id: true, tenantUserId: true },
    });
    await platformPrisma.$transaction([
      platformPrisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'suspended',
          suspendedAt: now,
          administrativelySuspendedAt: now,
          administrativeSuspensionReason: input.reason,
          administrativelySuspendedById: actor.id,
        },
      }),
      platformPrisma.platformRefreshToken.updateMany({
        where: { membershipId: { in: memberships.map((item) => item.id) }, revokedAt: null },
        data: { revokedAt: now },
      }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId,
          operatorId: actor.id,
          action: 'ops.workspace.administratively_suspended',
          target: tenantId,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, {
            previousStatus: tenant.status,
            nextStatus: 'suspended',
          }),
        },
      }),
    ]);
    try {
      const runtime = await resolveTenantRuntime(tenantId, true);
      await runtime.db.crmAuthSession.deleteMany({});
    } catch {
      // The platform status and refresh-token revocation already block routed access.
    }
    return { tenantId, status: 'suspended', administrativelySuspendedAt: now };
  },

  async reactivateWorkspace(tenantId: string, input: GovernedAction, actor: OperatorActor) {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        trial: true,
        subscriptions: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 },
        deletionRequests: { where: { status: { in: ['requested', 'scheduled', 'processing'] } } },
      },
    });
    if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
    assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
    assertConfirmation(tenant.slug, input.confirmation);
    if (tenant.deletionRequests.length) {
      throw new AppError(
        409,
        'Cancel deletion before reactivating this workspace',
        'DELETION_ACTIVE',
      );
    }
    const now = new Date();
    const accessActive = Boolean(
      (tenant.trial && !tenant.trial.endedAt && tenant.trial.endsAt > now) ||
      tenant.subscriptions.some(
        (subscription) => !subscription.currentPeriodEnd || subscription.currentPeriodEnd > now,
      ),
    );
    if (!accessActive) {
      throw new AppError(
        409,
        'A valid trial or paid subscription is required before reactivation',
        'BILLING_ACCESS_REQUIRED',
      );
    }
    await platformPrisma.$transaction([
      platformPrisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'active',
          suspendedAt: null,
          retentionEndsAt: null,
          administrativelySuspendedAt: null,
          administrativeSuspensionReason: null,
          administrativelySuspendedById: null,
        },
      }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId,
          operatorId: actor.id,
          action: 'ops.workspace.administratively_reactivated',
          target: tenantId,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, {
            previousStatus: tenant.status,
            nextStatus: 'active',
          }),
        },
      }),
    ]);
    return { tenantId, status: 'active' };
  },

  async updateMembership(
    tenantId: string,
    membershipId: string,
    input: GovernedAction & { role?: string; status?: 'active' | 'suspended' },
    actor: OperatorActor,
  ) {
    const membership = await platformPrisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: true, tenant: true },
    });
    if (!membership) throw new AppError(404, 'Membership not found', 'MEMBERSHIP_NOT_FOUND');
    assertFresh(membership.updatedAt, input.expectedUpdatedAt);
    assertConfirmation(membership.user.email, input.confirmation);
    if (membership.role === 'owner' || input.role === 'owner') {
      throw new AppError(
        409,
        'Use ownership transfer for owner changes',
        'OWNERSHIP_TRANSFER_REQUIRED',
      );
    }
    if (input.role && !membershipRoles.includes(input.role as any)) {
      throw new AppError(400, 'Invalid membership role', 'INVALID_MEMBERSHIP_ROLE');
    }
    const previous = { role: membership.role, status: membership.status };
    const nextRole = input.role ?? membership.role;
    const nextStatus = input.status ?? membership.status;
    await platformPrisma.$transaction([
      platformPrisma.membership.update({
        where: { id: membership.id },
        data: { role: nextRole as any, status: nextStatus },
      }),
      platformPrisma.platformRefreshToken.updateMany({
        where: { membershipId: membership.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId,
          operatorId: actor.id,
          action: 'ops.membership.updated',
          target: membership.id,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, {
            userId: membership.userId,
            previous,
            next: { role: nextRole, status: nextStatus },
          }),
        },
      }),
    ]);
    await synchronizeTenantRole(tenantId, membership.tenantUserId, nextRole);
    return { id: membership.id, role: nextRole, status: nextStatus };
  },

  async revokeSessions(
    tenantId: string,
    membershipId: string,
    input: Pick<GovernedAction, 'reason' | 'ticket' | 'confirmation'>,
    actor: OperatorActor,
  ) {
    const membership = await platformPrisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: true },
    });
    if (!membership) throw new AppError(404, 'Membership not found', 'MEMBERSHIP_NOT_FOUND');
    assertConfirmation(membership.user.email, input.confirmation);
    await revokeMembershipSessions(membership.id, tenantId, membership.tenantUserId);
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        operatorId: actor.id,
        action: 'ops.membership.sessions_revoked',
        target: membership.id,
        ipAddress: actor.ipAddress,
        metadata: auditMetadata(actor, input, { userId: membership.userId }),
      },
    });
    return { revoked: true };
  },

  async transferOwnership(
    tenantId: string,
    input: GovernedAction & { targetMembershipId: string },
    actor: OperatorActor,
  ) {
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
    assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
    assertConfirmation(tenant.slug, input.confirmation);
    const [currentOwner, target] = await Promise.all([
      platformPrisma.membership.findFirst({ where: { tenantId, role: 'owner', status: 'active' } }),
      platformPrisma.membership.findFirst({
        where: { id: input.targetMembershipId, tenantId, status: 'active' },
      }),
    ]);
    if (!currentOwner) throw new AppError(409, 'Workspace has no active owner', 'OWNER_NOT_FOUND');
    if (!target)
      throw new AppError(404, 'Target active membership not found', 'MEMBERSHIP_NOT_FOUND');
    if (currentOwner.id === target.id) return { ownerMembershipId: target.id };
    await platformPrisma.$transaction([
      platformPrisma.membership.update({ where: { id: currentOwner.id }, data: { role: 'admin' } }),
      platformPrisma.membership.update({ where: { id: target.id }, data: { role: 'owner' } }),
      platformPrisma.platformRefreshToken.updateMany({
        where: { membershipId: { in: [currentOwner.id, target.id] }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId,
          operatorId: actor.id,
          action: 'ops.membership.ownership_transferred',
          target: target.id,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, {
            previousOwnerMembershipId: currentOwner.id,
            nextOwnerMembershipId: target.id,
          }),
        },
      }),
    ]);
    await Promise.all([
      synchronizeTenantRole(tenantId, currentOwner.tenantUserId, 'admin'),
      synchronizeTenantRole(tenantId, target.tenantUserId, 'admin'),
    ]);
    return { ownerMembershipId: target.id };
  },

  async resendInvitation(
    tenantId: string,
    invitationId: string,
    input: Pick<GovernedAction, 'reason' | 'ticket' | 'confirmation'>,
    actor: OperatorActor,
  ) {
    const invitation = await platformPrisma.invitation.findFirst({
      where: { id: invitationId, tenantId },
      include: { tenant: true },
    });
    if (!invitation || invitation.status !== 'invited') {
      throw new AppError(404, 'Active invitation not found', 'INVITATION_NOT_FOUND');
    }
    assertConfirmation(invitation.email, input.confirmation);
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    await platformPrisma.$transaction([
      platformPrisma.invitation.update({
        where: { id: invitation.id },
        data: { tokenHash: sha256(token), expiresAt },
      }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId,
          operatorId: actor.id,
          action: 'ops.membership.invitation_resent',
          target: invitation.id,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, { email: invitation.email, expiresAt }),
        },
      }),
    ]);
    await emailQueue.add(
      'company-invitation',
      {
        tenantId,
        to: invitation.email,
        subject: `You are invited to ${invitation.tenant.name} on MooNsConfig`,
        text: `Accept your invitation within 7 days: ${env.appPublicUrl}/accept-invitation?token=${encodeURIComponent(token)}`,
        idempotencyKey: `ops-invitation:${invitation.id}:${expiresAt.getTime()}`,
      },
      { jobId: `ops-invitation-${invitation.id}-${expiresAt.getTime()}` },
    );
    return { id: invitation.id, expiresAt, ...(env.nodeEnv === 'production' ? {} : { token }) };
  },

  async revokeInvitation(
    tenantId: string,
    invitationId: string,
    input: Pick<GovernedAction, 'reason' | 'ticket' | 'confirmation'>,
    actor: OperatorActor,
  ) {
    const invitation = await platformPrisma.invitation.findFirst({
      where: { id: invitationId, tenantId },
    });
    if (!invitation || invitation.status !== 'invited') {
      throw new AppError(404, 'Active invitation not found', 'INVITATION_NOT_FOUND');
    }
    assertConfirmation(invitation.email, input.confirmation);
    await platformPrisma.$transaction([
      platformPrisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'suspended', expiresAt: new Date() },
      }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId,
          operatorId: actor.id,
          action: 'ops.membership.invitation_revoked',
          target: invitation.id,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, { email: invitation.email }),
        },
      }),
    ]);
    return { revoked: true };
  },

  async reconcileBilling(input: { reason: string; ticket: string }, actor: OperatorActor) {
    const result = await billingService.reconcile();
    await platformPrisma.platformAuditEvent.create({
      data: {
        operatorId: actor.id,
        action: 'ops.billing.reconciled',
        target: 'razorpay',
        ipAddress: actor.ipAddress,
        metadata: auditMetadata(actor, input, result),
      },
    });
    return result;
  },

  async retryInvoiceSync(
    invoiceId: string,
    input: Pick<GovernedAction, 'reason' | 'ticket' | 'confirmation'>,
    actor: OperatorActor,
  ) {
    const invoice = await platformPrisma.billingInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    assertConfirmation(invoice.invoiceNumber, input.confirmation);
    if (!['failed', 'paid', 'issued'].includes(invoice.status)) {
      throw new AppError(
        409,
        'This invoice is not eligible for synchronization',
        'INVOICE_SYNC_BLOCKED',
      );
    }
    await billingInvoiceQueue.add(
      'zoho-invoice',
      { invoiceId: invoice.id },
      { jobId: `invoice-retry-${invoice.id}-${Date.now()}` },
    );
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId: invoice.tenantId,
        operatorId: actor.id,
        action: 'ops.billing.invoice_sync_retried',
        target: invoice.id,
        ipAddress: actor.ipAddress,
        metadata: auditMetadata(actor, input, { invoiceNumber: invoice.invoiceNumber }),
      },
    });
    return { queued: true };
  },

  async invoiceDownload(invoiceId: string) {
    const invoice = await platformPrisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      select: { pdfStorageKey: true },
    });
    if (!invoice?.pdfStorageKey)
      throw new AppError(404, 'Invoice PDF is not available', 'INVOICE_PDF_NOT_FOUND');
    const url = await objectStorageService.downloadUrl(
      env.aws.exportBucket,
      invoice.pdfStorageKey,
      15 * 60,
    );
    if (!url) throw new AppError(409, 'Local invoice download is unavailable', 'LOCAL_PDF_ONLY');
    return { url, expiresIn: 900 };
  },

  async requestAccessGrant(
    tenantId: string,
    input: Pick<GovernedAction, 'reason' | 'ticket' | 'confirmation'> & { minutes: number },
    actor: OperatorActor,
  ) {
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
    assertConfirmation(tenant.slug, input.confirmation);
    const now = new Date();
    const existing = await platformPrisma.operatorAccessGrant.findFirst({
      where: {
        operatorId: actor.id,
        tenantId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (existing) return existing;
    return platformPrisma.$transaction(async (transaction) => {
      const grant = await transaction.operatorAccessGrant.create({
        data: {
          operatorId: actor.id,
          tenantId,
          reason: input.reason,
          ticket: input.ticket,
          readOnly: true,
          startsAt: now,
          expiresAt: new Date(now.getTime() + Math.min(input.minutes, 30) * 60_000),
        },
      });
      await transaction.platformAuditEvent.create({
        data: {
          tenantId,
          operatorId: actor.id,
          action: 'ops.access.requested',
          target: grant.id,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, {
            readOnly: true,
            expiresAt: grant.expiresAt,
          }),
        },
      });
      return grant;
    });
  },

  async revokeAccessGrant(
    grantId: string,
    input: Pick<GovernedAction, 'reason' | 'ticket' | 'confirmation'>,
    actor: OperatorActor,
  ) {
    const grant = await platformPrisma.operatorAccessGrant.findUnique({
      where: { id: grantId },
      include: { tenant: true },
    });
    if (!grant) throw new AppError(404, 'Access grant not found', 'ACCESS_GRANT_NOT_FOUND');
    assertConfirmation(grant.ticket, input.confirmation);
    if (grant.revokedAt) return { revoked: true, revokedAt: grant.revokedAt };
    const revokedAt = new Date();
    await platformPrisma.$transaction([
      platformPrisma.operatorAccessGrant.update({ where: { id: grant.id }, data: { revokedAt } }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId: grant.tenantId,
          operatorId: actor.id,
          action: 'ops.access.revoked',
          target: grant.id,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, { accessOperatorId: grant.operatorId }),
        },
      }),
    ]);
    return { revoked: true, revokedAt };
  },

  async scheduleDeletion(tenantId: string, input: GovernedAction, actor: OperatorActor) {
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Workspace not found', 'TENANT_NOT_FOUND');
    assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
    assertConfirmation(`DELETE ${tenant.slug}`, input.confirmation);
    const existing = await platformPrisma.deletionRequest.findFirst({
      where: { tenantId, status: { in: ['requested', 'scheduled', 'processing'] } },
    });
    if (existing)
      return { id: existing.id, status: existing.status, executeAt: existing.executeAt };
    const executeAt = new Date(Date.now() + 7 * 86_400_000);
    const created = await platformPrisma.$transaction(async (transaction) => {
      const record = await transaction.deletionRequest.create({
        data: {
          tenantId,
          requestedBy: actor.id,
          executeAt,
          status: 'scheduled',
          reason: input.reason,
        },
      });
      await transaction.tenant.update({
        where: { id: tenantId },
        data: { status: 'suspended', suspendedAt: new Date(), retentionEndsAt: executeAt },
      });
      await transaction.platformRefreshToken.updateMany({
        where: { membership: { tenantId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.platformAuditEvent.create({
        data: {
          tenantId,
          operatorId: actor.id,
          action: 'ops.lifecycle.deletion_scheduled',
          target: record.id,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, { executeAt }),
        },
      });
      return record;
    });
    return { id: created.id, status: created.status, executeAt };
  },

  async cancelDeletion(tenantId: string, input: GovernedAction, actor: OperatorActor) {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        trial: true,
        subscriptions: { where: { status: 'active' } },
        deletionRequests: {
          where: { status: { in: ['requested', 'scheduled'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!tenant || !tenant.deletionRequests[0]) {
      throw new AppError(404, 'Scheduled deletion not found', 'DELETION_NOT_FOUND');
    }
    assertFresh(tenant.updatedAt, input.expectedUpdatedAt);
    assertConfirmation(tenant.slug, input.confirmation);
    const record = tenant.deletionRequests[0];
    if (record.executeAt <= new Date()) {
      throw new AppError(409, 'Deletion can no longer be cancelled', 'DELETION_IN_PROGRESS');
    }
    const now = new Date();
    const billingActive = Boolean(
      (tenant.trial && !tenant.trial.endedAt && tenant.trial.endsAt > now) ||
      tenant.subscriptions.some(
        (subscription) => !subscription.currentPeriodEnd || subscription.currentPeriodEnd > now,
      ),
    );
    const active = billingActive && !tenant.administrativelySuspendedAt;
    await platformPrisma.$transaction([
      platformPrisma.deletionRequest.update({
        where: { id: record.id },
        data: { status: 'cancelled', cancelledAt: now },
      }),
      platformPrisma.tenant.update({
        where: { id: tenantId },
        data: active
          ? { status: 'active', suspendedAt: null, retentionEndsAt: null }
          : { status: 'suspended', retentionEndsAt: new Date(now.getTime() + 90 * 86_400_000) },
      }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId,
          operatorId: actor.id,
          action: 'ops.lifecycle.deletion_cancelled',
          target: record.id,
          ipAddress: actor.ipAddress,
          metadata: auditMetadata(actor, input, { workspaceRestored: active }),
        },
      }),
    ]);
    return { cancelled: true, workspaceRestored: active };
  },
};
