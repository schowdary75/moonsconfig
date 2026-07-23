import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { sendEmail } from '../integrations/email/emailAdapter.js';
import type { EmailJob } from '../jobs/types.js';

export function createEmailWorker() {
  return new Worker<EmailJob>('email', (job) => sendEmail(job.data), {
    connection: bullConnection,
    concurrency: 5,
  });
}
