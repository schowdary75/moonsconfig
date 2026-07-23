import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { billingInvoiceService } from '../services/billingInvoiceService.js';

export function createBillingInvoiceWorker() {
  return new Worker(
    'billing-invoice',
    async (job) => billingInvoiceService.sync(String(job.data.invoiceId)),
    { connection: bullConnection, concurrency: 2 },
  );
}
