import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { defaultPrisma } from './config/prisma.js';
import { redis } from './config/redis.js';
import { startScheduler, stopScheduler } from './cron/scheduler.js';
import { logger } from './logger/index.js';
import { initializeSocket } from './socket/socketServer.js';
import { ariService } from './voice/ariService.js';
import './services/smsService.js';
import { startRecordingReconciler } from './voice/voiceRecordingService.js';
import { platformPrisma } from './config/platformPrisma.js';
import { disconnectTenantClients } from './config/tenantContext.js';
import { createRecoveryVoiceWorker } from './voice/recoveryVoiceWorker.js';
import { ensureLocalAsteriskRuntime } from './voice/localAsteriskRuntime.js';

const server = http.createServer(createApp());
initializeSocket(server);
startScheduler();
startRecordingReconciler();
ensureLocalAsteriskRuntime();
void ariService.init();
const recoveryVoiceWorker = createRecoveryVoiceWorker(ariService);
recoveryVoiceWorker.on('failed', (job, error) =>
  logger.error('Recovery voice job failed', { jobId: job?.id, error }),
);
server.listen(env.port, () =>
  logger.info('Enterprise API listening', { port: env.port, environment: env.nodeEnv }),
);

async function shutdown(signal: string) {
  logger.info('API shutdown requested', { signal });
  stopScheduler();
  ariService.stop();
  server.close(async () => {
    const shutdownTasks: Array<Promise<unknown>> = [
      defaultPrisma.$disconnect(),
      platformPrisma.$disconnect(),
      disconnectTenantClients(),
      redis.quit(),
      recoveryVoiceWorker.close(),
    ];
    if (env.cron.enabled) {
      shutdownTasks.push(import('./jobs/queues.js').then(({ closeQueues }) => closeQueues()));
    }
    await Promise.allSettled(shutdownTasks);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
