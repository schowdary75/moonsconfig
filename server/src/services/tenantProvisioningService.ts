import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createConnection } from 'mysql2/promise';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { decryptTenantCredential } from '../utils/tenantCredentials.js';
import { emailQueue } from '../jobs/queues.js';
import { logger } from '../logger/index.js';
import { secretStore } from './secretStore.js';
import { sha256 } from '../utils/crypto.js';
import { domainService } from './domainService.js';

const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');

function assertIdentifier(value: string) {
  if (!/^[a-z0-9_]{1,64}$/.test(value)) throw new Error('Unsafe database identifier');
  return value;
}

function tenantDatabaseUrl(
  tenant: {
    databaseName: string;
    databaseUsername: string;
  },
  password: string,
) {
  const url = new URL(env.tenantDatabaseBaseUrl);
  url.username = tenant.databaseUsername;
  url.password = password;
  url.pathname = `/${tenant.databaseName}`;
  url.searchParams.set('connection_limit', String(env.tenantDatabaseConnectionLimit));
  return url.toString();
}

export async function getTenantDatabasePassword(tenant: {
  databaseSecretArn: string | null;
  encryptedDatabasePassword: string;
}) {
  return tenant.databaseSecretArn
    ? (await secretStore.get(tenant.databaseSecretArn)).password
    : decryptTenantCredential(tenant.encryptedDatabasePassword);
}

function migrate(url: string) {
  const schema = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schema], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let standardOutput = '';
    let errorOutput = '';
    child.stdout.on('data', (chunk) => (standardOutput += String(chunk)));
    child.stderr.on('data', (chunk) => (errorOutput += String(chunk)));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Tenant migration failed (${code}): ${(errorOutput || standardOutput).slice(-2000)}`,
            ),
          ),
    );
  });
}

async function latestTenantMigration() {
  const migrationRoot = path.resolve(process.cwd(), 'prisma', 'migrations');
  const entries = await fs.readdir(migrationRoot, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const latest = names.at(-1);
  if (!latest) throw new Error('No tenant migration was found');
  return latest;
}

export async function deployTenantMigrations(tenantId: string) {
  const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || ['deleted', 'deleting'].includes(tenant.status))
    throw new Error('Tenant cannot be migrated');
  const password = await getTenantDatabasePassword(tenant);
  if (!password) throw new Error('Tenant database password is unavailable');
  await migrate(tenantDatabaseUrl(tenant, password));
  const version = await latestTenantMigration();
  await platformPrisma.tenant.update({ where: { id: tenantId }, data: { schemaVersion: version } });
  return version;
}

export async function provisionTenant(jobId: string, tenantId: string) {
  const job = await platformPrisma.provisioningJob.findUnique({ where: { id: jobId } });
  if (job?.status === 'completed') return { tenantId, alreadyProvisioned: true };
  const tenant = await platformPrisma.tenant.findUnique({
    where: { id: tenantId },
    include: { memberships: { where: { role: 'owner' }, include: { user: true }, take: 1 } },
  });
  if (!tenant) throw new Error('Tenant not found');
  const owner = tenant.memberships[0];
  if (!owner?.user.emailVerifiedAt)
    throw new Error('Owner email must be verified before provisioning');

  await platformPrisma.$transaction([
    platformPrisma.provisioningJob.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: new Date(),
        attemptCount: { increment: 1 },
        lastError: null,
      },
    }),
    platformPrisma.tenant.update({ where: { id: tenantId }, data: { status: 'provisioning' } }),
  ]);

  try {
    const databaseName = assertIdentifier(tenant.databaseName);
    const username = assertIdentifier(tenant.databaseUsername);
    const password = await getTenantDatabasePassword(tenant);
    if (!password) throw new Error('Tenant database password is unavailable');
    const admin = await createConnection(env.tenantProvisioningDatabaseUrl);
    try {
      await admin.query(
        `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      await admin.query(`CREATE USER IF NOT EXISTS '${username}'@'%' IDENTIFIED BY ?`, [password]);
      await admin.query(`ALTER USER '${username}'@'%' IDENTIFIED BY ?`, [password]);
      await admin.query(`GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO '${username}'@'%'`);
    } finally {
      await admin.end();
    }

    const databaseSecretArn =
      tenant.databaseSecretArn ??
      (await secretStore.put(tenantId, 'database', {
        username,
        password,
        database: databaseName,
      }));
    if (!tenant.databaseSecretArn) {
      await platformPrisma.tenant.update({
        where: { id: tenantId },
        data: {
          databaseSecretArn,
          encryptedDatabasePassword: `managed:${sha256(databaseSecretArn)}`,
        },
      });
      tenant.databaseSecretArn = databaseSecretArn;
      tenant.encryptedDatabasePassword = `managed:${sha256(databaseSecretArn)}`;
    }

    const databaseUrl = tenantDatabaseUrl(tenant, password);
    await migrate(databaseUrl);
    const tenantDb = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
      const localOwner = await tenantDb.crmUser.upsert({
        where: { email: owner.user.email },
        update: { name: owner.user.name, mobile: owner.user.mobile, role: 'admin' },
        create: {
          email: owner.user.email,
          passwordHash: owner.user.passwordHash,
          name: owner.user.name,
          mobile: owner.user.mobile,
          role: 'admin',
          roles: { create: { role: 'admin' } },
        },
      });
      await tenantDb.crmUserRoleLink.upsert({
        where: { userId_role: { userId: localOwner.id, role: 'admin' } },
        update: {},
        create: { userId: localOwner.id, role: 'admin' },
      });
      await platformPrisma.membership.update({
        where: { id: owner.id },
        data: { tenantUserId: localOwner.id },
      });
    } finally {
      await tenantDb.$disconnect();
    }

    await fs.mkdir(path.resolve(env.uploadDirectory, 'tenants', tenantId), { recursive: true });
    const platformDomain = await platformPrisma.domain.findFirst({
      where: { tenantId, kind: 'platform_subdomain' },
    });
    if (platformDomain) await domainService.activatePlatformDomain(platformDomain.id);
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 7 * 86_400_000);
    const latestMigration = await latestTenantMigration();
    await platformPrisma.$transaction([
      platformPrisma.trial.upsert({
        where: { tenantId },
        update: {},
        create: { tenantId, startedAt, endsAt },
      }),
      platformPrisma.subscription.create({
        data: {
          tenantId,
          planCode: 'enterprise',
          status: 'trialing',
          seats: 10,
          currentPeriodStart: startedAt,
          currentPeriodEnd: endsAt,
        },
      }),
      platformPrisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'active', schemaVersion: latestMigration },
      }),
      platformPrisma.provisioningJob.update({
        where: { id: jobId },
        data: { status: 'completed', completedAt: new Date(), lastError: null },
      }),
    ]);
    await emailQueue
      .add(
        'trial-welcome',
        {
          to: owner.user.email,
          subject: 'Your MooNsConfig Enterprise trial is ready',
          text: `Your private company workspace is ready at ${env.appPublicUrl}/login?workspace=${encodeURIComponent(tenant.slug)}. Your seven-day trial ends ${endsAt.toISOString()}.`,
          idempotencyKey: `trial-welcome:${tenantId}`,
          tenantId,
        },
        { jobId: `trial-welcome-${tenantId}` },
      )
      .catch((error) => logger.error('Trial welcome email enqueue failed', { tenantId, error }));
    return { tenantId, trialEndsAt: endsAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provisioning failure';
    await platformPrisma.$transaction([
      platformPrisma.provisioningJob.update({
        where: { id: jobId },
        data: { status: 'failed', lastError: message },
      }),
      platformPrisma.tenant.update({ where: { id: tenantId }, data: { status: 'failed' } }),
    ]);
    throw error;
  }
}
