import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import archiver from 'archiver';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { resolveTenantRuntime } from '../config/tenantContext.js';
import { AppError } from '../errors/AppError.js';
import { accountExportQueue } from '../jobs/queues.js';
import { objectStorageService } from './objectStorageService.js';

const excludedModels = /(session|token|credential|password|secret)/i;

function json(value: unknown) {
  return JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      if (item instanceof Date) return item.toISOString();
      return item;
    },
    2,
  );
}

async function fileSha256(filePath: string) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  await finished(stream);
  return hash.digest('hex');
}

function delegateName(model: string) {
  return `${model[0]!.toLowerCase()}${model.slice(1)}`;
}

export const accountExportService = {
  async request(tenantId: string, requestedById: string) {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: { trial: true },
    });
    if (!tenant || ['deleted', 'deleting'].includes(tenant.status)) {
      throw new AppError(404, 'Company workspace not found', 'TENANT_NOT_FOUND');
    }
    const active = await platformPrisma.accountExport.findFirst({
      where: { tenantId, status: { in: ['pending', 'processing'] } },
    });
    if (active) return { id: active.id, status: active.status };
    if (tenant.trial && !tenant.trial.endedAt) {
      const trialExports = await platformPrisma.accountExport.count({ where: { tenantId } });
      if (trialExports >= 1)
        throw new AppError(409, 'The trial includes one account export', 'TRIAL_EXPORT_LIMIT');
    }
    const record = await platformPrisma.accountExport.create({ data: { tenantId, requestedById } });
    await accountExportQueue.add(
      'account-export',
      { tenantId, exportId: record.id },
      { jobId: `export-${record.id}` },
    );
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        actorId: requestedById,
        action: 'account.export.requested',
        target: record.id,
      },
    });
    return { id: record.id, status: record.status };
  },

  async get(tenantId: string, exportId: string) {
    const record = await platformPrisma.accountExport.findFirst({
      where: { id: exportId, tenantId },
    });
    if (!record) throw new AppError(404, 'Account export not found', 'EXPORT_NOT_FOUND');
    return {
      id: record.id,
      status: record.status,
      sizeBytes: record.sizeBytes?.toString() ?? null,
      sha256: record.sha256,
      expiresAt: record.expiresAt,
      error: record.status === 'failed' ? record.lastError : undefined,
      downloadUrl:
        record.status === 'completed' ? `/api/v1/account/exports/${record.id}/download` : null,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    };
  },

  async download(tenantId: string, exportId: string) {
    const record = await platformPrisma.accountExport.findFirst({
      where: { id: exportId, tenantId },
    });
    if (
      !record?.storageKey ||
      record.status !== 'completed' ||
      !record.expiresAt ||
      record.expiresAt <= new Date()
    ) {
      throw new AppError(404, 'Account export is unavailable or expired', 'EXPORT_UNAVAILABLE');
    }
    return {
      localPath: objectStorageService.localPath(record.storageKey),
      url: await objectStorageService.downloadUrl(
        env.aws.exportBucket,
        record.storageKey,
        24 * 60 * 60,
      ),
      filename: `moonsconfig-${tenantId.slice(0, 8)}-${record.id.slice(0, 8)}.zip`,
    };
  },

  async process(exportId: string) {
    const record = await platformPrisma.accountExport.findUnique({ where: { id: exportId } });
    if (!record || record.status === 'completed') return;
    await platformPrisma.accountExport.update({
      where: { id: exportId },
      data: { status: 'processing', lastError: null },
    });
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'moonsconfig-export-'));
    const archivePath = path.join(temporary, `${exportId}.zip`);
    try {
      const tenant = await platformPrisma.tenant.findUnique({
        where: { id: record.tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          country: true,
          timezone: true,
          currency: true,
          billingAddress: true,
          gstin: true,
          createdAt: true,
        },
      });
      if (!tenant) throw new Error('Tenant no longer exists');
      const [memberships, auditEvents, uploads] = await Promise.all([
        platformPrisma.membership.findMany({
          where: { tenantId: record.tenantId },
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            user: { select: { id: true, email: true, name: true, mobile: true, createdAt: true } },
          },
        }),
        platformPrisma.platformAuditEvent.findMany({
          where: { tenantId: record.tenantId },
          orderBy: { createdAt: 'asc' },
        }),
        platformPrisma.uploadObject.findMany({
          where: { tenantId: record.tenantId },
          select: {
            id: true,
            objectKey: true,
            cleanObjectKey: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            checksum: true,
            status: true,
            malwareStatus: true,
            createdAt: true,
          },
        }),
      ]);
      const output = createWriteStream(archivePath, { flags: 'wx', mode: 0o600 });
      const outputDone = finished(output);
      const zip = archiver('zip', { zlib: { level: 6 } });
      zip.pipe(output);
      zip.append(json({ exportedAt: new Date(), formatVersion: 1, tenant }), {
        name: 'manifest.json',
      });
      zip.append(json(memberships), { name: 'platform/memberships.json' });
      zip.append(json(auditEvents), { name: 'platform/audit-events.json' });
      zip.append(json(uploads), { name: 'platform/uploads.json' });

      const runtime = await resolveTenantRuntime(record.tenantId, true);
      for (const model of Prisma.dmmf.datamodel.models) {
        if (
          excludedModels.test(model.name) ||
          !model.fields.some((field) => field.isId && field.name === 'id')
        )
          continue;
        const delegate = (runtime.db as any)[delegateName(model.name)];
        if (!delegate?.findMany) continue;
        let cursor: string | number | undefined;
        let page = 0;
        let continuePaging = true;
        while (continuePaging) {
          const rows = await delegate.findMany({
            take: 500,
            orderBy: { id: 'asc' },
            ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          if (!rows.length) {
            continuePaging = false;
            continue;
          }
          zip.append(json(rows), {
            name: `tenant/${model.name}/${String(page).padStart(6, '0')}.json`,
          });
          cursor = rows.at(-1).id;
          page += 1;
          continuePaging = rows.length === 500;
        }
      }
      await zip.finalize();
      await outputDone;
      const stats = await fs.stat(archivePath);
      const checksum = await fileSha256(archivePath);
      const key = `tenants/${record.tenantId}/exports/${record.id}.zip`;
      const storageKey = await objectStorageService.putFile(
        env.aws.exportBucket,
        key,
        archivePath,
        'application/zip',
      );
      await platformPrisma.accountExport.update({
        where: { id: record.id },
        data: {
          status: 'completed',
          storageKey,
          sha256: checksum,
          sizeBytes: BigInt(stats.size),
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      });
      await platformPrisma.platformAuditEvent.create({
        data: {
          tenantId: record.tenantId,
          actorId: record.requestedById,
          action: 'account.export.completed',
          target: record.id,
          metadata: { sha256: checksum, sizeBytes: stats.size },
        },
      });
    } catch (error) {
      await platformPrisma.accountExport.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          lastError: error instanceof Error ? error.message.slice(0, 4000) : 'Export failed',
        },
      });
      throw error;
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  },
};
