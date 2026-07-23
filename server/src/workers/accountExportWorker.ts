import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { accountExportService } from '../services/accountExportService.js';

export function createAccountExportWorker() {
  return new Worker(
    'account-export',
    async (job) => accountExportService.process(String(job.data.exportId)),
    { connection: bullConnection, concurrency: 1 },
  );
}
