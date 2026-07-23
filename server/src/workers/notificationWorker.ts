import { Worker } from 'bullmq';
import { bullConnection, redis } from '../config/redis.js';
import type { NotificationJob } from '../jobs/types.js';
import { notificationRepository } from '../repositories/notificationRepository.js';
import { resolveTenantRuntime, runWithTenant } from '../config/tenantContext.js';

export function createNotificationWorker() {
  return new Worker<NotificationJob>(
    'notification',
    async (job) => {
      const create = () => notificationRepository.create(job.data);
      const notification = job.data.tenantId
        ? await runWithTenant(await resolveTenantRuntime(job.data.tenantId), create)
        : await create();
      await redis.publish(
        'moonsconfig:notifications',
        JSON.stringify({ tenantId: job.data.tenantId, userId: job.data.userId, notification }),
      );
      return notification.id;
    },
    { connection: bullConnection, concurrency: 10 },
  );
}
