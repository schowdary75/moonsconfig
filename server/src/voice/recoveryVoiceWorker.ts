import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { resolveTenantRuntime, runWithTenant } from '../config/tenantContext.js';
import type { VoiceRecoveryJob } from '../jobs/types.js';
import type { AriService } from './ariService.js';

export function createRecoveryVoiceWorker(ari: AriService) {
  return new Worker<VoiceRecoveryJob>(
    'voice-recovery',
    async (job) => {
      const context = await resolveTenantRuntime(job.data.tenantId);
      return runWithTenant(context, async () => {
        const started = await ari.dialRecoveryVendor(job.data);
        if (!started) throw new Error('Asterisk ARI is not connected');
        return { started: true, attemptId: job.data.attemptId };
      });
    },
    { connection: bullConnection, concurrency: 2 },
  );
}
