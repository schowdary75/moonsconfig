import { env } from '../config/env.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { redis } from '../config/redis.js';
import { zohoBooksService } from './zohoBooksService.js';

function recent(value: string, maxDays: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= maxDays * 86_400_000;
}

export const readinessService = {
  async check() {
    const gates: Array<{ key: string; ready: boolean; category: string; message: string }> = [];
    const gate = (key: string, ready: boolean, category: string, message: string) =>
      gates.push({ key, ready, category, message });
    let database = false;
    let cache = false;
    let recentRestore = false;
    try {
      await platformPrisma.tenant.count();
      recentRestore = Boolean(
        await platformPrisma.backupArtifact.findFirst({
          where: { restoredAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
          select: { id: true },
        }),
      );
      database = true;
    } catch {
      database = false;
    }
    try {
      cache = (await redis.ping()) === 'PONG';
    } catch {
      cache = false;
    }
    gate('platform_database', database, 'runtime', 'Platform database is reachable');
    gate('redis', cache, 'runtime', 'Redis is reachable');
    gate(
      'legacy_routing_disabled',
      !env.legacyRoutingEnabled,
      'security',
      'Legacy single-company routing is disabled',
    );
    gate(
      'legacy_sessions_disabled',
      !env.legacySessionEnabled,
      'security',
      'Legacy local-storage sessions are disabled',
    );
    gate('secure_cookies', env.cookieSecure, 'security', 'Secure refresh cookies are enabled');
    gate(
      'aws_secrets',
      env.secretsBackend === 'aws',
      'infrastructure',
      'AWS Secrets Manager is selected',
    );
    gate(
      'object_storage',
      Boolean(env.aws.uploadBucket && env.aws.exportBucket && env.aws.backupBucket),
      'infrastructure',
      'Upload, export, and backup buckets are configured',
    );
    gate(
      'cloudfront_domains',
      Boolean(
        env.aws.cloudFrontDistributionId &&
        env.aws.cloudFrontConnectionGroup &&
        env.aws.cloudFrontRoutingEndpoint &&
        env.aws.originSharedSecret,
      ),
      'infrastructure',
      'CloudFront SaaS domain routing is configured',
    );
    gate(
      'malware_events',
      Boolean(env.aws.malwareWebhookSecret),
      'security',
      'GuardDuty malware event authentication is configured',
    );
    gate(
      'razorpay',
      Boolean(env.razorpay.keyId && env.razorpay.keySecret && env.razorpay.webhookSecret),
      'billing',
      'Razorpay live configuration is present',
    );
    gate(
      'workos',
      Boolean(env.workos.apiKey && env.workos.clientId),
      'identity',
      'WorkOS Enterprise SSO is configured',
    );
    gate(
      'gst_invoicing',
      zohoBooksService.configured(),
      'billing',
      'Zoho Books and reviewed GST seller configuration are complete',
    );
    gate(
      'legal_approval',
      Boolean(env.launchEvidence.legalApprovalDate),
      'compliance',
      'Legal and tax approval evidence is recorded',
    );
    gate(
      'penetration_test',
      recent(env.launchEvidence.penTestApprovedAt, 180),
      'security',
      'A passing penetration test from the last 180 days is recorded',
    );
    gate(
      'restore_drill',
      recentRestore || recent(env.launchEvidence.backupRestoreVerifiedAt, 30),
      'recovery',
      'A successful restore drill from the last 30 days is recorded',
    );
    gate(
      'incident_management',
      Boolean(env.launchEvidence.statusPageUrl && env.launchEvidence.incidentContact),
      'operations',
      'Status page and incident contact are configured',
    );
    gate(
      'public_registration',
      env.publicRegistrationEnabled,
      'launch',
      'Public registration is explicitly enabled',
    );
    return {
      ready: gates.every((item) => item.ready),
      runtimeHealthy: database && cache,
      checkedAt: new Date(),
      gates,
    };
  },
};
