import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGunzip, createGzip } from 'node:zlib';
import { finished, pipeline } from 'node:stream/promises';
import { createConnection } from 'mysql2/promise';
import { env } from '../config/env.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { objectStorageService } from './objectStorageService.js';
import { getTenantDatabasePassword } from './tenantProvisioningService.js';

async function hashFile(file: string) {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', (chunk) => hash.update(chunk));
  await finished(stream);
  return hash.digest('hex');
}

function connectionArgs(database: string, username: string) {
  const url = new URL(env.tenantDatabaseBaseUrl);
  return [
    '--host',
    url.hostname,
    '--port',
    url.port || '3306',
    '--user',
    username,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--set-gtid-purged=OFF',
    database,
  ];
}

export const tenantBackupService = {
  async create(tenantId: string) {
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || ['deleted', 'deleting'].includes(tenant.status)) return;
    const artifact = await platformPrisma.backupArtifact.create({
      data: {
        tenantId,
        kind: 'logical_mysql',
        status: 'processing',
        schemaVersion: tenant.schemaVersion,
      },
    });
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'moonsconfig-backup-'));
    const file = path.join(temporary, `${artifact.id}.sql.gz`);
    try {
      const password = await getTenantDatabasePassword(tenant);
      if (!password) throw new Error('Tenant database password is unavailable');
      const child = spawn(
        env.mysqlTools.dump,
        connectionArgs(tenant.databaseName, tenant.databaseUsername),
        { env: { ...process.env, MYSQL_PWD: password }, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', (chunk) => (stderr += String(chunk)));
      const exit = new Promise<void>((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`mysqldump failed (${code}): ${stderr.slice(-2000)}`)),
        );
      });
      await Promise.all([
        pipeline(child.stdout, createGzip({ level: 6 }), createWriteStream(file, { mode: 0o600 })),
        exit,
      ]);
      const stats = await fs.stat(file);
      const checksum = await hashFile(file);
      const key = `tenants/${tenant.id}/backups/${artifact.id}.sql.gz`;
      const storageKey = await objectStorageService.putFile(
        env.aws.backupBucket,
        key,
        file,
        'application/gzip',
      );
      await platformPrisma.backupArtifact.update({
        where: { id: artifact.id },
        data: {
          status: 'active',
          storageKey,
          checksum,
          sizeBytes: BigInt(stats.size),
          capturedAt: new Date(),
          expiresAt: new Date(Date.now() + 35 * 86_400_000),
        },
      });
    } catch (error) {
      await platformPrisma.backupArtifact.update({
        where: { id: artifact.id },
        data: {
          status: 'failed',
          lastError: error instanceof Error ? error.message.slice(0, 4000) : 'Backup failed',
        },
      });
      throw error;
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  },

  async restoreDrill(artifactId?: string) {
    const artifact = artifactId
      ? await platformPrisma.backupArtifact.findUnique({
          where: { id: artifactId },
          include: { tenant: true },
        })
      : await platformPrisma.backupArtifact.findFirst({
          where: { status: 'active', storageKey: { not: null }, tenantId: { not: null } },
          orderBy: { capturedAt: 'asc' },
          include: { tenant: true },
        });
    if (!artifact?.tenant || !artifact.storageKey)
      throw new Error('No tenant backup is available for a restore drill');
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'moonsconfig-restore-'));
    const file = path.join(temporary, `${artifact.id}.sql.gz`);
    const database = `moonsconfig_restore_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const adminUrl = new URL(env.tenantProvisioningDatabaseUrl);
    const admin = await createConnection(env.tenantProvisioningDatabaseUrl);
    try {
      await objectStorageService.downloadToFile(env.aws.backupBucket, artifact.storageKey, file);
      if ((await hashFile(file)) !== artifact.checksum)
        throw new Error('Backup checksum verification failed');
      await admin.query(
        `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      const args = [
        '--host',
        adminUrl.hostname,
        '--port',
        adminUrl.port || '3306',
        '--user',
        decodeURIComponent(adminUrl.username),
        database,
      ];
      const child = spawn(env.mysqlTools.client, args, {
        env: { ...process.env, MYSQL_PWD: decodeURIComponent(adminUrl.password) },
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => (stderr += String(chunk)));
      const exit = new Promise<void>((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`mysql restore failed (${code}): ${stderr.slice(-2000)}`)),
        );
      });
      await Promise.all([pipeline(createReadStream(file), createGunzip(), child.stdin), exit]);
      await platformPrisma.backupArtifact.update({
        where: { id: artifact.id },
        data: { restoredAt: new Date() },
      });
      return { artifactId: artifact.id, tenantId: artifact.tenantId, restoredAt: new Date() };
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => undefined);
      await admin.end();
      await fs.rm(temporary, { recursive: true, force: true });
    }
  },
};
