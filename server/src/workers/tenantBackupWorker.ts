import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { tenantBackupService } from '../services/tenantBackupService.js';

export function createTenantBackupWorker() {
  return new Worker(
    'tenant-backup',
    async (job) => tenantBackupService.create(String(job.data.tenantId)),
    { connection: bullConnection, concurrency: 1 },
  );
}
