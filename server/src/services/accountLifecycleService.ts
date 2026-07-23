import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';

export const accountLifecycleService = {
  async requestDeletion(tenantId: string, requestedBy: string, reason?: string) {
    const existing = await platformPrisma.deletionRequest.findFirst({
      where: { tenantId, status: { in: ['requested', 'scheduled', 'processing'] } },
    });
    if (existing)
      return { id: existing.id, status: existing.status, executeAt: existing.executeAt };
    const executeAt = new Date(Date.now() + 7 * 86_400_000);
    const request = await platformPrisma.$transaction(async (transaction) => {
      const created = await transaction.deletionRequest.create({
        data: { tenantId, requestedBy, executeAt, status: 'scheduled', reason },
      });
      await transaction.tenant.update({
        where: { id: tenantId },
        data: { status: 'suspended', suspendedAt: new Date(), retentionEndsAt: executeAt },
      });
      await transaction.membership.updateMany({
        where: { tenantId, userId: { not: requestedBy } },
        data: { status: 'suspended' },
      });
      await transaction.platformAuditEvent.create({
        data: {
          tenantId,
          actorId: requestedBy,
          action: 'account.deletion.requested',
          target: created.id,
          metadata: { executeAt, reason },
        },
      });
      return created;
    });
    return { id: request.id, status: request.status, executeAt: request.executeAt };
  },

  async cancelDeletion(tenantId: string, requestedBy: string) {
    const request = await platformPrisma.deletionRequest.findFirst({
      where: { tenantId, status: { in: ['requested', 'scheduled'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!request) throw new AppError(404, 'Scheduled deletion not found', 'DELETION_NOT_FOUND');
    if (request.executeAt <= new Date())
      throw new AppError(409, 'Deletion can no longer be cancelled', 'DELETION_IN_PROGRESS');
    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: { trial: true, subscriptions: { where: { status: 'active' } } },
    });
    const now = new Date();
    const hasAccess = Boolean(
      (tenant?.trial && !tenant.trial.endedAt && tenant.trial.endsAt > now) ||
      tenant?.subscriptions.some(
        (subscription) => !subscription.currentPeriodEnd || subscription.currentPeriodEnd > now,
      ),
    );
    await platformPrisma.$transaction([
      platformPrisma.deletionRequest.update({
        where: { id: request.id },
        data: { status: 'cancelled', cancelledAt: now },
      }),
      platformPrisma.tenant.update({
        where: { id: tenantId },
        data: hasAccess
          ? { status: 'active', suspendedAt: null, retentionEndsAt: null }
          : { status: 'suspended', retentionEndsAt: new Date(now.getTime() + 90 * 86_400_000) },
      }),
      platformPrisma.membership.updateMany({ where: { tenantId }, data: { status: 'active' } }),
      platformPrisma.platformAuditEvent.create({
        data: {
          tenantId,
          actorId: requestedBy,
          action: 'account.deletion.cancelled',
          target: request.id,
        },
      }),
    ]);
    return { cancelled: true, workspaceRestored: hasAccess };
  },
};
