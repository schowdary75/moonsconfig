import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { migrationRolloutService } from '../services/migrationRolloutService.js';

export function createTenantMigrationWorker() {
  return new Worker(
    'tenant-migration',
    async (job) => migrationRolloutService.process(String(job.data.targetId)),
    { connection: bullConnection, concurrency: 1 },
  );
}
