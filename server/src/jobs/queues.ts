import { Queue } from 'bullmq';
import { bullConnection } from '../config/redis.js';

const defaults = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
};
export const emailQueue = new Queue('email', {
  connection: bullConnection,
  defaultJobOptions: defaults,
});
export const notificationQueue = new Queue('notification', {
  connection: bullConnection,
  defaultJobOptions: defaults,
});
export const voiceRecoveryQueue = new Queue('voice-recovery', {
  connection: bullConnection,
  defaultJobOptions: {
    ...defaults,
    attempts: 12,
    backoff: { type: 'exponential', delay: 5_000 },
  },
});
export const maintenanceQueue = new Queue('maintenance', {
  connection: bullConnection,
  defaultJobOptions: { ...defaults, attempts: 3 },
});
export const provisioningQueue = new Queue('tenant-provisioning', {
  connection: bullConnection,
  defaultJobOptions: { ...defaults, attempts: 3 },
});
export const accountExportQueue = new Queue('account-export', {
  connection: bullConnection,
  defaultJobOptions: { ...defaults, attempts: 3 },
});
export const billingInvoiceQueue = new Queue('billing-invoice', {
  connection: bullConnection,
  defaultJobOptions: { ...defaults, attempts: 8, backoff: { type: 'exponential', delay: 10_000 } },
});
export const tenantMigrationQueue = new Queue('tenant-migration', {
  connection: bullConnection,
  defaultJobOptions: { ...defaults, attempts: 1 },
});
export const tenantBackupQueue = new Queue('tenant-backup', {
  connection: bullConnection,
  defaultJobOptions: { ...defaults, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
});

export async function closeQueues() {
  await Promise.all([
    emailQueue.close(),
    notificationQueue.close(),
    voiceRecoveryQueue.close(),
    maintenanceQueue.close(),
    provisioningQueue.close(),
    accountExportQueue.close(),
    billingInvoiceQueue.close(),
    tenantMigrationQueue.close(),
    tenantBackupQueue.close(),
  ]);
}
