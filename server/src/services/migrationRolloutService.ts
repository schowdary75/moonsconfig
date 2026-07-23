import { v4 as uuid } from 'uuid';
import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { tenantMigrationQueue } from '../jobs/queues.js';
import { deployTenantMigrations } from './tenantProvisioningService.js';

async function enqueueStage(rolloutId: string, stage: number) {
  const targets = await platformPrisma.migrationTarget.findMany({
    where: { rolloutId, stage, status: 'pending' },
  });
  await Promise.all(
    targets.map((target) =>
      tenantMigrationQueue.add(
        'tenant-migration',
        { targetId: target.id },
        { jobId: `migration-${target.id}` },
      ),
    ),
  );
  return targets.length;
}

export const migrationRolloutService = {
  async createDraft(migrationName: string, targetVersion: string) {
    const tenants = await platformPrisma.tenant.findMany({
      where: { status: { in: ['active', 'suspended'] } },
      select: { id: true, internal: true },
      orderBy: { id: 'asc' },
    });
    if (!tenants.length)
      throw new AppError(409, 'No tenants are available for migration', 'NO_MIGRATION_TARGETS');
    const external = tenants.filter((tenant) => !tenant.internal);
    const fivePercent = Math.max(1, Math.ceil(external.length * 0.05));
    const twentyFivePercent = Math.max(fivePercent, Math.ceil(external.length * 0.25));
    return platformPrisma.migrationRollout.create({
      data: {
        migrationName,
        targetVersion,
        status: 'draft',
        targets: {
          createMany: {
            data: tenants.map((tenant) => {
              const index = external.findIndex((item) => item.id === tenant.id);
              return {
                tenantId: tenant.id,
                stage: tenant.internal
                  ? 0
                  : index < fivePercent
                    ? 1
                    : index < twentyFivePercent
                      ? 2
                      : 3,
              };
            }),
          },
        },
      },
      include: { _count: { select: { targets: true } } },
    });
  },

  async start(id: string) {
    const rollout = await this.get(id);
    if (rollout.status !== 'draft')
      throw new AppError(409, 'Only a draft migration can be started', 'ROLLOUT_IMMUTABLE');
    await platformPrisma.migrationRollout.update({
      where: { id },
      data: { status: 'running', currentStage: 0, startedAt: new Date() },
    });
    const queued = await enqueueStage(id, 0);
    if (!queued) return this.advance(id);
    return this.get(id);
  },

  async pause(id: string, reason: string) {
    const rollout = await this.get(id);
    if (rollout.status !== 'running')
      throw new AppError(409, 'Only a running migration can be paused', 'ROLLOUT_NOT_RUNNING');
    await platformPrisma.migrationRollout.update({
      where: { id },
      data: { status: 'paused', pausedReason: reason },
    });
    return this.get(id);
  },

  async removeDraft(id: string) {
    const rollout = await this.get(id);
    if (rollout.status !== 'draft')
      throw new AppError(409, 'Started migration history is immutable', 'ROLLOUT_IMMUTABLE');
    await platformPrisma.migrationRollout.delete({ where: { id } });
    return { deleted: true };
  },
  async create(migrationName: string, targetVersion: string) {
    const tenants = await platformPrisma.tenant.findMany({
      where: { status: { in: ['active', 'suspended'] } },
      select: { id: true, internal: true },
      orderBy: { id: 'asc' },
    });
    if (!tenants.length)
      throw new AppError(409, 'No tenants are available for migration', 'NO_MIGRATION_TARGETS');
    const external = tenants.filter((tenant) => !tenant.internal);
    const fivePercent = Math.max(1, Math.ceil(external.length * 0.05));
    const twentyFivePercent = Math.max(fivePercent, Math.ceil(external.length * 0.25));
    const targets = tenants.map((tenant) => ({
      tenantId: tenant.id,
      stage: tenant.internal
        ? 0
        : external.findIndex((item) => item.id === tenant.id) < fivePercent
          ? 1
          : external.findIndex((item) => item.id === tenant.id) < twentyFivePercent
            ? 2
            : 3,
    }));
    const rollout = await platformPrisma.migrationRollout.create({
      data: {
        migrationName,
        targetVersion,
        status: 'running',
        currentStage: 0,
        startedAt: new Date(),
        targets: { createMany: { data: targets } },
      },
    });
    const queued = await enqueueStage(rollout.id, 0);
    if (!queued) return this.advance(rollout.id);
    return this.get(rollout.id);
  },

  async get(id: string) {
    const rollout = await platformPrisma.migrationRollout.findUnique({
      where: { id },
      include: { targets: { orderBy: [{ stage: 'asc' }, { tenantId: 'asc' }] } },
    });
    if (!rollout) throw new AppError(404, 'Migration rollout not found', 'ROLLOUT_NOT_FOUND');
    return rollout;
  },

  async list() {
    return platformPrisma.migrationRollout.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { targets: true } } },
    });
  },

  async advance(id: string) {
    const rollout = await this.get(id);
    if (rollout.status === 'paused' || rollout.status === 'failed')
      throw new AppError(
        409,
        'Resolve failed migration targets before advancing',
        'ROLLOUT_PAUSED',
      );
    const currentIncomplete = rollout.targets.some(
      (target) =>
        target.stage === rollout.currentStage &&
        target.status !== 'completed' &&
        target.status !== 'skipped',
    );
    if (currentIncomplete)
      throw new AppError(
        409,
        'The current rollout stage is not complete',
        'ROLLOUT_STAGE_INCOMPLETE',
      );
    const nextStage = rollout.currentStage + 1;
    if (nextStage > 3 || !rollout.targets.some((target) => target.stage >= nextStage)) {
      await platformPrisma.migrationRollout.update({
        where: { id },
        data: { status: 'completed', completedAt: new Date() },
      });
      return this.get(id);
    }
    await platformPrisma.migrationRollout.update({
      where: { id },
      data: { currentStage: nextStage, status: 'running', pausedReason: null },
    });
    await enqueueStage(id, nextStage);
    return this.get(id);
  },

  async retry(id: string) {
    const rollout = await this.get(id);
    await platformPrisma.migrationTarget.updateMany({
      where: { rolloutId: id, status: 'failed' },
      data: { status: 'pending', lastError: null, leaseOwner: null, leaseExpiresAt: null },
    });
    await platformPrisma.migrationRollout.update({
      where: { id },
      data: { status: 'running', pausedReason: null },
    });
    await enqueueStage(id, rollout.currentStage);
    return this.get(id);
  },

  async process(targetId: string) {
    const leaseOwner = uuid();
    const claimed = await platformPrisma.migrationTarget.updateMany({
      where: {
        id: targetId,
        status: 'pending',
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }],
      },
      data: {
        status: 'running',
        leaseOwner,
        leaseExpiresAt: new Date(Date.now() + 10 * 60_000),
        startedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    const target = await platformPrisma.migrationTarget.findUniqueOrThrow({
      where: { id: targetId },
    });
    try {
      await deployTenantMigrations(target.tenantId);
      await platformPrisma.migrationTarget.update({
        where: { id: target.id },
        data: { status: 'completed', completedAt: new Date(), leaseExpiresAt: null },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 4000) : 'Tenant migration failed';
      await platformPrisma.$transaction([
        platformPrisma.migrationTarget.update({
          where: { id: target.id },
          data: { status: 'failed', lastError: message, leaseExpiresAt: null },
        }),
        platformPrisma.migrationRollout.update({
          where: { id: target.rolloutId },
          data: { status: 'paused', pausedReason: message },
        }),
      ]);
      throw error;
    }
  },
};
