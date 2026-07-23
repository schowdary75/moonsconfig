import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import type { MaintenanceJob } from '../jobs/types.js';
import { logger } from '../logger/index.js';
import { redis } from '../config/redis.js';
import { sha256 } from '../utils/crypto.js';
import { platformPrisma } from '../config/platformPrisma.js';

const tasks: ScheduledTask[] = [];

async function enqueue(type: MaintenanceJob['type']) {
  const { maintenanceQueue } = await import('../jobs/queues.js');
  const scheduledAt = new Date();
  scheduledAt.setSeconds(0, 0);
  const tenants = await platformPrisma.tenant.findMany({
    where: { status: 'active' },
    select: { id: true },
  });
  let queued = 0;
  for (const tenant of tenants) {
    const key = `moonsconfig:tenant:${tenant.id}:cron:${type}:${scheduledAt.toISOString()}`;
    const acquired = await redis.set(key, process.pid.toString(), 'EX', 3_600, 'NX');
    if (!acquired) continue;
    await maintenanceQueue.add(
      type,
      { tenantId: tenant.id, type, scheduledAt: scheduledAt.toISOString() },
      { jobId: sha256(key) },
    );
    queued += 1;
  }

  let legacyQueued = false;
  if (env.legacyRoutingEnabled) {
    const key = `moonsconfig:legacy:cron:${type}:${scheduledAt.toISOString()}`;
    const acquired = await redis.set(key, process.pid.toString(), 'EX', 3_600, 'NX');
    if (acquired) {
      await maintenanceQueue.add(
        type,
        { type, scheduledAt: scheduledAt.toISOString() },
        { jobId: sha256(key) },
      );
      legacyQueued = true;
    }
  }

  logger.info('Scheduled maintenance jobs', {
    type,
    scheduledAt,
    tenants: queued,
    legacy: legacyQueued,
  });
}

export function startScheduler() {
  if (!env.cron.enabled) return;
  const schedules: Array<[string, string, MaintenanceJob['type']]> = [
    [env.cron.dailyReport, 'daily report', 'daily-report'],
    [env.cron.cleanup, 'cleanup', 'cleanup'],
    [env.cron.dataSync, 'data sync', 'data-sync'],
    [env.cron.autonomousSupport, 'autonomous support', 'autonomous-support'],
    [env.cron.mayaAutopilot, 'Maya autopilot', 'maya-autopilot'],
    [env.cron.mayaOpsSweep, 'Maya ops sweep', 'maya-ops-sweep'],
    [env.cron.travelAutomation, 'travel automation', 'travel-automation'],
    [env.cron.vendorInboxSync, 'vendor inbox sync', 'vendor-inbox-sync'],
  ];
  for (const [expression, label, type] of schedules) {
    if (!cron.validate(expression)) throw new Error(`Invalid ${label} cron expression`);
    tasks.push(
      cron.schedule(
        expression,
        () =>
          void enqueue(type).catch((error) => logger.error('Cron enqueue failed', { type, error })),
        { timezone: 'UTC' },
      ),
    );
  }
  logger.info('Cron scheduler started');
}

export function stopScheduler() {
  for (const task of tasks) task.stop();
}
