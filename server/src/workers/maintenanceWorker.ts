import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { bullConnection } from '../config/redis.js';
import { authRepository } from '../repositories/authRepository.js';
import { integrationRegistry } from '../integrations/registry.js';
import { emailQueue } from '../jobs/queues.js';
import type { MaintenanceJob } from '../jobs/types.js';
import { notificationRepository } from '../repositories/notificationRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { scheduledJobRepository } from '../repositories/scheduledJobRepository.js';
import { runMayaAutopilotCycle } from '../legacy/api/db.functions.server.js';
import { runMayaOpsSweep } from '../maya/opsSweep.js';
import { reprocessVendorInbox } from '../legacy/api/email.listener.js';
import { processGovernedSupportChats } from '../maya/support/supportChatProcessor.js';
import { runTravelAutomationBatch } from '../services/travelAutomationService.js';
import { getTenantRuntime, resolveTenantRuntime, runWithTenant } from '../config/tenantContext.js';

async function cleanup() {
  const expiredTokens = await authRepository.deleteExpired();
  const tenantId = getTenantRuntime()?.tenantId;
  const uploadDirectory = tenantId
    ? path.resolve(env.uploadDirectory, 'tenants', tenantId)
    : env.uploadDirectory;
  const entries = await fs.readdir(uploadDirectory, { withFileTypes: true }).catch(() => []);
  let uploads = 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.tmp')) continue;
    const file = path.join(uploadDirectory, entry.name);
    const stats = await fs.stat(file);
    if (stats.mtimeMs < cutoff) {
      await fs.rm(file, { force: true });
      uploads += 1;
    }
  }
  return { expiredTokens: expiredTokens.count, uploads };
}

async function dailyReport(scheduledAt: string) {
  const [users, notifications] = await Promise.all([
    reportRepository.countUsers(),
    notificationRepository.countSince(new Date(Date.now() - 86_400_000)),
  ]);
  if (process.env.DAILY_REPORT_RECIPIENT)
    await emailQueue.add(
      'daily-report',
      {
        to: process.env.DAILY_REPORT_RECIPIENT,
        subject: 'MooNsConfig daily report',
        text: `Users: ${users}\nNotifications (24h): ${notifications}`,
        idempotencyKey: `daily-report:${scheduledAt}`,
        tenantId: getTenantRuntime()?.tenantId,
      },
      { jobId: `daily-report-email-${scheduledAt}` },
    );
  return {
    users,
    notifications,
    delivery: process.env.DAILY_REPORT_RECIPIENT ? 'queued' : 'disabled',
  };
}

async function dataSync() {
  const results = [];
  for (const adapter of integrationRegistry.list())
    results.push({ name: adapter.name, ...(await adapter.sync()) });
  return { integrations: results };
}

export function createMaintenanceWorker() {
  return new Worker<MaintenanceJob>(
    'maintenance',
    async (job) => {
      const execute = async () => {
        const executionId = await scheduledJobRepository.start(
          job.data.type,
          new Date(job.data.scheduledAt),
        );
        try {
          const details =
            job.data.type === 'cleanup'
              ? await cleanup()
              : job.data.type === 'daily-report'
                ? await dailyReport(job.data.scheduledAt)
                : job.data.type === 'autonomous-support'
                  ? await processGovernedSupportChats()
                  : job.data.type === 'maya-autopilot'
                    ? await runMayaAutopilotCycle().then(() => ({ processed: true }))
                    : job.data.type === 'maya-ops-sweep'
                      ? await runMayaOpsSweep()
                      : job.data.type === 'travel-automation'
                        ? await runTravelAutomationBatch()
                        : job.data.type === 'vendor-inbox-sync'
                          ? await reprocessVendorInbox(3)
                          : await dataSync();
          await scheduledJobRepository.complete(executionId, details);
          return details;
        } catch (error) {
          await scheduledJobRepository.fail(
            executionId,
            error instanceof Error ? error.message : 'Unknown error',
          );
          throw error;
        }
      };
      if (!job.data.tenantId) return execute();
      return runWithTenant(await resolveTenantRuntime(job.data.tenantId), execute);
    },
    { connection: bullConnection, concurrency: 2 },
  );
}
