import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import type { ProvisioningJob } from '../jobs/types.js';
import { provisionTenant } from '../services/tenantProvisioningService.js';

export function createProvisioningWorker() {
  return new Worker<ProvisioningJob>(
    'tenant-provisioning',
    (job) => provisionTenant(job.data.jobId, job.data.tenantId),
    { connection: bullConnection, concurrency: 2 },
  );
}
