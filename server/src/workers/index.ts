import { logger } from '../logger/index.js';
import { createEmailWorker } from './emailWorker.js';
import { createMaintenanceWorker } from './maintenanceWorker.js';
import { createNotificationWorker } from './notificationWorker.js';
import { startEmailListener, stopEmailListener } from '../legacy/api/email.listener.js';
import { createProvisioningWorker } from './provisioningWorker.js';
import { recoverPendingProvisioningJobs } from '../services/platformRegistrationService.js';
import { platformLifecycleService } from '../services/platformLifecycleService.js';
import { redis } from '../config/redis.js';
import { createAccountExportWorker } from './accountExportWorker.js';
import { createBillingInvoiceWorker } from './billingInvoiceWorker.js';
import { billingService } from '../services/billingService.js';
import { createTenantMigrationWorker } from './tenantMigrationWorker.js';
import { createTenantBackupWorker } from './tenantBackupWorker.js';
import { tenantBackupQueue } from '../jobs/queues.js';
import { platformPrisma } from '../config/platformPrisma.js';

const workers = [
  createEmailWorker(),
  createNotificationWorker(),
  createMaintenanceWorker(),
  createProvisioningWorker(),
  createAccountExportWorker(),
  createBillingInvoiceWorker(),
  createTenantMigrationWorker(),
  createTenantBackupWorker(),
];
void recoverPendingProvisioningJobs()
  .then((count) => count && logger.info('Recovered pending tenant provisioning jobs', { count }))
  .catch((error) => logger.error('Pending provisioning recovery failed', { error }));
async function runLifecycle() {
  const lock = await redis.set(
    'moonsconfig:platform:lifecycle-lock',
    String(process.pid),
    'EX',
    3300,
    'NX',
  );
  if (!lock) return;
  const result = await platformLifecycleService.run();
  const billing = await billingService.reconcile();
  const backupCutoff = new Date(Date.now() - 23 * 60 * 60_000);
  const backupTargets = await platformPrisma.tenant.findMany({
    where: {
      status: { in: ['active', 'suspended'] },
      OR: [
        { backupArtifacts: { none: {} } },
        { backupArtifacts: { none: { capturedAt: { gt: backupCutoff }, status: 'active' } } },
      ],
    },
    select: { id: true },
  });
  await Promise.all(
    backupTargets.map((tenant) =>
      tenantBackupQueue.add(
        'tenant-backup',
        { tenantId: tenant.id },
        { jobId: `backup-${tenant.id}-${new Date().toISOString().slice(0, 10)}` },
      ),
    ),
  );
  logger.info('Platform lifecycle scan completed', {
    ...result,
    billing,
    backupsQueued: backupTargets.length,
  });
}
void runLifecycle().catch((error) => logger.error('Platform lifecycle scan failed', { error }));
const lifecycleTimer = setInterval(
  () =>
    void runLifecycle().catch((error) => logger.error('Platform lifecycle scan failed', { error })),
  60 * 60_000,
);
lifecycleTimer.unref();
void startEmailListener().catch((error) => logger.error('IMAP listener failed', { error }));
for (const worker of workers)
  worker.on('failed', (job, error) =>
    logger.error('Queue job failed', { queue: worker.name, jobId: job?.id, error }),
  );

async function shutdown(signal: string) {
  logger.info('Worker shutdown requested', { signal });
  clearInterval(lifecycleTimer);
  await stopEmailListener();
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
logger.info('BullMQ workers started');
