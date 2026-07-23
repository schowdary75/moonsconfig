import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { provisioningQueue } from '../jobs/queues.js';
import { billingService } from './billingService.js';
import { migrationRolloutService } from './migrationRolloutService.js';
import { readinessService } from './readinessService.js';
import { tenantBackupService } from './tenantBackupService.js';

export const platformOpsService = {
  async dashboard() {
    const [
      tenants,
      provisioningFailed,
      migrationsFailed,
      webhookFailures,
      pendingDeletions,
      recentSecurity,
      readiness,
    ] = await Promise.all([
      platformPrisma.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
      platformPrisma.provisioningJob.count({ where: { status: 'failed' } }),
      platformPrisma.migrationTarget.count({ where: { status: 'failed' } }),
      platformPrisma.paymentEvent.count({
        where: { processedAt: null, createdAt: { lt: new Date(Date.now() - 5 * 60_000) } },
      }),
      platformPrisma.deletionRequest.count({
        where: { status: { in: ['requested', 'scheduled', 'processing', 'failed'] } },
      }),
      platformPrisma.securityEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      readinessService.check(),
    ]);
    return {
      tenants,
      provisioningFailed,
      migrationsFailed,
      webhookFailures,
      pendingDeletions,
      recentSecurity,
      readiness,
    };
  },

  async tenants() {
    return platformPrisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        country: true,
        schemaVersion: true,
        onboardingStep: true,
        onboardingCompletedAt: true,
        suspendedAt: true,
        retentionEndsAt: true,
        createdAt: true,
        internal: true,
        _count: { select: { memberships: true, domains: true, provisioningJobs: true } },
        trial: true,
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  },

  async retryProvisioning(tenantId: string, operatorId: string) {
    const job = await platformPrisma.provisioningJob.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) throw new AppError(404, 'Provisioning job not found', 'PROVISIONING_NOT_FOUND');
    await platformPrisma.$transaction([
      platformPrisma.provisioningJob.update({
        where: { id: job.id },
        data: { status: 'pending', lastError: null },
      }),
      platformPrisma.tenant.update({ where: { id: tenantId }, data: { status: 'pending' } }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId,
          action: 'ops.provisioning.retry',
          target: job.id,
          metadata: { operatorId },
        },
      }),
    ]);
    await provisioningQueue.add(
      'provision-tenant',
      { jobId: job.id, tenantId },
      { jobId: `tenant-${tenantId}-retry-${job.attemptCount + 1}` },
    );
    return { jobId: job.id, status: 'pending' };
  },

  async requestAccess(
    operatorId: string,
    tenantId: string,
    input: { reason: string; ticket: string; minutes: number },
  ) {
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Company not found', 'TENANT_NOT_FOUND');
    const now = new Date();
    return platformPrisma.operatorAccessGrant.create({
      data: {
        operatorId,
        tenantId,
        reason: input.reason,
        ticket: input.ticket,
        readOnly: true,
        startsAt: now,
        expiresAt: new Date(now.getTime() + Math.min(input.minutes, 30) * 60_000),
      },
    });
  },

  async pendingAccess(tenantId: string) {
    return platformPrisma.operatorAccessGrant.findMany({
      where: { tenantId, approvedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { operator: { select: { name: true, email: true, role: true } } },
    });
  },

  async approveAccess(tenantId: string, grantId: string, approvedById: string) {
    const grant = await platformPrisma.operatorAccessGrant.findFirst({
      where: { id: grantId, tenantId, approvedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!grant)
      throw new AppError(
        404,
        'Support access request not found or expired',
        'ACCESS_GRANT_NOT_FOUND',
      );
    return platformPrisma.$transaction(async (transaction) => {
      const updated = await transaction.operatorAccessGrant.update({
        where: { id: grant.id },
        data: { approvedById, approvedAt: new Date() },
      });
      await transaction.platformAuditEvent.create({
        data: {
          tenantId,
          actorId: approvedById,
          action: 'ops.access.approved',
          target: grant.id,
          metadata: {
            operatorId: grant.operatorId,
            ticket: grant.ticket,
            expiresAt: grant.expiresAt,
          },
        },
      });
      return updated;
    });
  },

  readiness: () => readinessService.check(),
  reconcileBilling: () => billingService.reconcile(),
  migrations: () => migrationRolloutService.list(),
  createMigration: (name: string, version: string) => migrationRolloutService.create(name, version),
  advanceMigration: (id: string) => migrationRolloutService.advance(id),
  retryMigration: (id: string) => migrationRolloutService.retry(id),
  restoreDrill: (artifactId?: string) => tenantBackupService.restoreDrill(artifactId),
};
