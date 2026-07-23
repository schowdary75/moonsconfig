import fs from 'node:fs/promises';
import path from 'node:path';
import { createConnection } from 'mysql2/promise';
import { env } from '../config/env.js';
import { evictTenantClient } from '../config/tenantContext.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { emailQueue } from '../jobs/queues.js';
import { sha256 } from '../utils/crypto.js';
import { redis } from '../config/redis.js';
import { objectStorageService } from './objectStorageService.js';
import { secretStore } from './secretStore.js';
import { domainService } from './domainService.js';

function assertIdentifier(value: string) {
  if (!/^[a-z0-9_]{1,64}$/.test(value)) throw new Error('Unsafe tenant database identifier');
  return value;
}

async function ownerEmail(tenantId: string) {
  const owner = await platformPrisma.membership.findFirst({
    where: { tenantId, role: 'owner', status: 'active' },
    include: { user: true },
  });
  return owner?.user.email;
}

async function notice(tenantId: string, action: string, subject: string, text: string) {
  const existing = await platformPrisma.platformAuditEvent.findFirst({
    where: { tenantId, action },
  });
  if (existing) return false;
  const email = await ownerEmail(tenantId);
  if (!email) return false;
  await emailQueue.add(
    action,
    {
      to: email,
      subject,
      text,
      idempotencyKey: `${action}:${tenantId}`,
      tenantId,
    },
    { jobId: `lifecycle-${sha256(`${action}:${tenantId}`).slice(0, 32)}` },
  );
  await platformPrisma.platformAuditEvent.create({ data: { tenantId, action, target: tenantId } });
  return true;
}

async function destroyExpiredTenant(tenant: {
  id: string;
  databaseName: string;
  databaseUsername: string;
  databaseSecretArn?: string | null;
}) {
  const suffix = tenant.id.replace(/-/g, '').slice(0, 8).toLowerCase();
  const databaseName = assertIdentifier(tenant.databaseName);
  const databaseUsername = assertIdentifier(tenant.databaseUsername);
  if (
    !databaseName.startsWith('moonsconfig_') ||
    !databaseName.endsWith(`_${suffix}`) ||
    databaseUsername !== `moon_${suffix}`
  ) {
    throw new Error('Tenant deletion target failed identity validation');
  }
  await evictTenantClient(tenant.id);
  const admin = await createConnection(env.tenantProvisioningDatabaseUrl);
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.query(`DROP USER IF EXISTS '${databaseUsername}'@'%'`);
  } finally {
    await admin.end();
  }
  const tenantRoot = path.resolve(env.uploadDirectory, 'tenants');
  const uploadTarget = path.resolve(tenantRoot, tenant.id);
  const relative = path.relative(tenantRoot, uploadTarget);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Unsafe tenant upload deletion target');
  await fs.rm(uploadTarget, { recursive: true, force: true });
  const providerCredentials = await platformPrisma.providerCredential.findMany({
    where: { tenantId: tenant.id },
  });
  await Promise.allSettled(
    providerCredentials.map((credential) => secretStore.remove(credential.secretArn)),
  );
  if (tenant.databaseSecretArn) await secretStore.remove(tenant.databaseSecretArn);
  await Promise.allSettled([
    objectStorageService.deletePrefix(env.aws.uploadBucket, `tenants/${tenant.id}`),
    objectStorageService.deletePrefix(env.aws.exportBucket, `tenants/${tenant.id}`),
  ]);
  for (const pattern of [
    `moonsconfig:${tenant.id}:*`,
    `tenant:${tenant.id}:*`,
    `*:${tenant.id}:*`,
  ]) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 250);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  }
  const providerDomains = await platformPrisma.domain.findMany({
    where: { tenantId: tenant.id, providerTenantId: { not: null } },
    select: { providerTenantId: true },
  });
  for (const domain of providerDomains) {
    if (domain.providerTenantId) await domainService.purgeProviderTenant(domain.providerTenantId);
  }
  await platformPrisma.$transaction([
    platformPrisma.domain.deleteMany({ where: { tenantId: tenant.id } }),
    platformPrisma.providerCredential.deleteMany({ where: { tenantId: tenant.id } }),
    platformPrisma.membership.updateMany({
      where: { tenantId: tenant.id },
      data: { status: 'suspended' },
    }),
    platformPrisma.deletionRequest.updateMany({
      where: { tenantId: tenant.id, completedAt: null },
      data: { status: 'completed', completedAt: new Date() },
    }),
    platformPrisma.backupArtifact.updateMany({
      where: { tenantId: tenant.id },
      data: { expiresAt: new Date(Date.now() + 30 * 86_400_000) },
    }),
    platformPrisma.tenant.update({ where: { id: tenant.id }, data: { status: 'deleted' } }),
    platformPrisma.platformAuditEvent.create({
      data: { tenantId: tenant.id, action: 'tenant.retention.deleted', target: tenant.id },
    }),
  ]);
}

export const platformLifecycleService = {
  async run(now = new Date()) {
    let notifications = 0;
    for (const [hours, action] of [
      [72, 'trial.72_hours_remaining'],
      [24, 'trial.24_hours_remaining'],
    ] as const) {
      const from = new Date(now.getTime() + (hours - 1) * 3_600_000);
      const to = new Date(now.getTime() + hours * 3_600_000);
      const trials = await platformPrisma.trial.findMany({
        where: { endedAt: null, endsAt: { gt: from, lte: to } },
      });
      for (const trial of trials) {
        if (
          await notice(
            trial.tenantId,
            action,
            `Your MooNsConfig trial ends in ${hours} hours`,
            `Choose Starter or Business before ${trial.endsAt.toISOString()} to keep your workspace active: ${env.appPublicUrl}/settings/billing`,
          )
        )
          notifications += 1;
      }
    }

    const expiredTrials = await platformPrisma.trial.findMany({
      where: { endedAt: null, endsAt: { lte: now } },
      include: { tenant: { include: { subscriptions: { where: { status: 'active' } } } } },
    });
    let suspended = 0;
    for (const trial of expiredTrials) {
      const paid = trial.tenant.subscriptions.some(
        (subscription) => !subscription.currentPeriodEnd || subscription.currentPeriodEnd > now,
      );
      await platformPrisma.trial.update({ where: { id: trial.id }, data: { endedAt: now } });
      await platformPrisma.subscription.updateMany({
        where: { tenantId: trial.tenantId, status: 'trialing' },
        data: { status: 'expired' },
      });
      if (!paid) {
        await platformPrisma.tenant.update({
          where: { id: trial.tenantId },
          data: {
            status: 'suspended',
            suspendedAt: now,
            retentionEndsAt: new Date(now.getTime() + 90 * 86_400_000),
          },
        });
        await notice(
          trial.tenantId,
          'trial.expired',
          'Your MooNsConfig trial has ended',
          `Your data is retained for 90 days. Subscribe or export your data from ${env.appPublicUrl}/settings/billing.`,
        );
        suspended += 1;
      }
    }

    const retained = await platformPrisma.tenant.findMany({
      where: { status: 'suspended', retentionEndsAt: { not: null } },
    });
    for (const tenant of retained) {
      const days = Math.ceil((tenant.retentionEndsAt!.getTime() - now.getTime()) / 86_400_000);
      if ([30, 7, 1].includes(days)) {
        if (
          await notice(
            tenant.id,
            `retention.${days}_days_remaining`,
            `MooNsConfig data deletion in ${days} day${days === 1 ? '' : 's'}`,
            `Restore service or export data before ${tenant.retentionEndsAt!.toISOString()}.`,
          )
        )
          notifications += 1;
      }
    }

    const expiredRetention = await platformPrisma.tenant.findMany({
      where: { status: 'suspended', retentionEndsAt: { lte: now } },
    });
    let deleted = 0;
    for (const tenant of expiredRetention) {
      const deletion = await platformPrisma.deletionRequest.findFirst({
        where: { tenantId: tenant.id, status: { in: ['requested', 'scheduled', 'processing'] } },
      });
      if (deletion && deletion.executeAt > now) continue;
      if (deletion) {
        await platformPrisma.deletionRequest.update({
          where: { id: deletion.id },
          data: { status: 'processing', attemptCount: { increment: 1 }, lastError: null },
        });
      }
      await platformPrisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'deleting' },
      });
      try {
        await destroyExpiredTenant(tenant);
        deleted += 1;
      } catch (error) {
        if (deletion) {
          await platformPrisma.deletionRequest.update({
            where: { id: deletion.id },
            data: {
              status: 'failed',
              lastError: error instanceof Error ? error.message.slice(0, 4000) : 'Deletion failed',
            },
          });
        }
        await platformPrisma.tenant.update({
          where: { id: tenant.id },
          data: { status: 'suspended' },
        });
        throw error;
      }
    }
    const pendingDomains = await platformPrisma.domain.findMany({
      where: { status: 'certificate_pending' },
      select: { id: true },
    });
    await Promise.allSettled(pendingDomains.map((domain) => domainService.refresh(domain.id)));

    const expiredExports = await platformPrisma.accountExport.findMany({
      where: { status: 'completed', expiresAt: { lte: now }, storageKey: { not: null } },
    });
    for (const accountExport of expiredExports) {
      await objectStorageService.deleteObject(env.aws.exportBucket, accountExport.storageKey!);
      await platformPrisma.accountExport.update({
        where: { id: accountExport.id },
        data: { status: 'expired', storageKey: null },
      });
    }
    const expiredBackups = await platformPrisma.backupArtifact.findMany({
      where: { expiresAt: { lte: now }, storageKey: { not: null }, status: { not: 'deleted' } },
    });
    for (const backup of expiredBackups) {
      await objectStorageService.deleteObject(env.aws.backupBucket, backup.storageKey!);
      await platformPrisma.backupArtifact.update({
        where: { id: backup.id },
        data: { status: 'deleted', storageKey: null },
      });
    }
    await Promise.all([
      platformPrisma.mfaChallenge.deleteMany({
        where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } },
      }),
      platformPrisma.ssoLoginState.deleteMany({
        where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } },
      }),
      platformPrisma.platformRefreshToken.deleteMany({
        where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
      }),
    ]);
    return {
      notifications,
      suspended,
      deleted,
      domainsChecked: pendingDomains.length,
      exportsExpired: expiredExports.length,
      backupsExpired: expiredBackups.length,
    };
  },
};
