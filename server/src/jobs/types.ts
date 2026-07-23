import type { EmailMessage } from '../integrations/email/emailAdapter.js';

export type EmailJob = EmailMessage & { idempotencyKey: string; tenantId?: string };
export interface NotificationJob {
  tenantId?: string;
  userId: number;
  type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
}
export interface VoiceRecoveryJob {
  tenantId: string;
  attemptId: string;
  phone: string;
}
export type MaintenanceJob = {
  tenantId?: string;
  type:
    | 'daily-report'
    | 'cleanup'
    | 'data-sync'
    | 'autonomous-support'
    | 'maya-autopilot'
    | 'maya-ops-sweep'
    | 'travel-automation'
    | 'vendor-inbox-sync';
  scheduledAt: string;
};
export interface ProvisioningJob {
  jobId: string;
  tenantId: string;
}
