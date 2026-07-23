import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';
import { getTenantRuntime } from '../config/tenantContext.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { objectStorageService } from './objectStorageService.js';
import { resolveTenantRuntime, runWithTenant } from '../config/tenantContext.js';
import { prisma } from '../config/prisma.js';

const allowedMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
]);
const allowedExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.pdf',
  '.xlsx',
  '.xls',
  '.doc',
  '.docx',
  '.txt',
  '.csv',
]);

export const secureUploadService = {
  async create(
    uploadedById: string,
    input: { filename: string; mimeType: string; sizeBytes: number; checksumSha256?: string },
  ) {
    const tenant = getTenantRuntime();
    if (!tenant) throw new AppError(401, 'A company workspace is required', 'TENANT_REQUIRED');
    if (!env.aws.uploadBucket)
      throw new AppError(
        503,
        'Secure object storage is not configured',
        'OBJECT_STORAGE_NOT_CONFIGURED',
      );
    const originalName = path.basename(input.filename).slice(0, 255);
    const extension = path.extname(originalName).toLowerCase();
    if (!allowedMimes.has(input.mimeType) || !allowedExtensions.has(extension)) {
      throw new AppError(400, 'Unsupported upload type', 'INVALID_FILE_TYPE');
    }
    if (input.sizeBytes < 1 || input.sizeBytes > env.maxUploadBytes) {
      throw new AppError(400, 'Upload size is outside the allowed range', 'INVALID_UPLOAD_SIZE');
    }
    const aggregate = await platformPrisma.uploadObject.aggregate({
      where: { tenantId: tenant.tenantId, status: { in: ['pending', 'processing', 'active'] } },
      _sum: { sizeBytes: true },
    });
    const used = aggregate._sum.sizeBytes ?? 0n;
    if (used + BigInt(input.sizeBytes) > BigInt(tenant.storageLimitBytes)) {
      throw new AppError(409, 'Company storage quota has been reached', 'STORAGE_QUOTA_EXCEEDED');
    }
    const id = uuid();
    const objectKey = `tenants/${tenant.tenantId}/quarantine/${id}${extension}`;
    const record = await platformPrisma.uploadObject.create({
      data: {
        id,
        tenantId: tenant.tenantId,
        objectKey,
        originalName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        checksum: input.checksumSha256,
        uploadedById,
      },
    });
    const uploadUrl = await objectStorageService.presignUpload(
      env.aws.uploadBucket,
      objectKey,
      input.mimeType,
      input.checksumSha256,
    );
    return {
      id: record.id,
      uploadUrl,
      expiresIn: 900,
      status: record.status,
      requiredHeaders: {
        'Content-Type': input.mimeType,
        ...(input.checksumSha256 ? { 'x-amz-checksum-sha256': input.checksumSha256 } : {}),
      },
    };
  },

  async malwareResult(objectKey: string, result: string) {
    const record = await platformPrisma.uploadObject.findUnique({ where: { objectKey } });
    if (!record) return { ignored: true };
    if (record.malwareStatus === result && ['active', 'failed'].includes(record.status))
      return { duplicate: true };
    if (result === 'NO_THREATS_FOUND') {
      const cleanObjectKey = objectKey.replace('/quarantine/', '/clean/');
      await objectStorageService.promote(env.aws.uploadBucket, objectKey, cleanObjectKey);
      await platformPrisma.uploadObject.update({
        where: { id: record.id },
        data: { status: 'active', malwareStatus: result, cleanObjectKey },
      });
      await runWithTenant(await resolveTenantRuntime(record.tenantId), async () => {
        await prisma.secureTravelDocument.updateMany({
          where: { storageKey: `upload-object:${record.id}` },
          data: { scanStatus: 'clean' },
        });
        const { onIncidentReceiptScan } = await import('./incidentRecoveryService.js');
        await onIncidentReceiptScan(record.id, true);
      });
      return { promoted: true };
    }
    await platformPrisma.uploadObject.update({
      where: { id: record.id },
      data: { status: 'failed', malwareStatus: result },
    });
    await platformPrisma.securityEvent.create({
      data: {
        tenantId: record.tenantId,
        eventType: result === 'THREATS_FOUND' ? 'upload.malware_detected' : 'upload.scan_failed',
        severity: result === 'THREATS_FOUND' ? 'high' : 'medium',
        source: 'guardduty_s3',
        metadata: { uploadId: record.id, result },
      },
    });
    await runWithTenant(await resolveTenantRuntime(record.tenantId), async () => {
      await prisma.secureTravelDocument.updateMany({
        where: { storageKey: `upload-object:${record.id}` },
        data: { scanStatus: result === 'THREATS_FOUND' ? 'infected' : 'failed' },
      });
      const { onIncidentReceiptScan } = await import('./incidentRecoveryService.js');
      await onIncidentReceiptScan(record.id, false);
    });
    return { quarantined: true };
  },

  async download(tenantId: string, id: string) {
    const record = await platformPrisma.uploadObject.findFirst({ where: { id, tenantId } });
    if (
      !record?.cleanObjectKey ||
      record.status !== 'active' ||
      record.malwareStatus !== 'NO_THREATS_FOUND'
    ) {
      throw new AppError(404, 'Clean upload not found', 'UPLOAD_NOT_AVAILABLE');
    }
    const url = await objectStorageService.downloadUrl(
      env.aws.uploadBucket,
      record.cleanObjectKey,
      5 * 60,
    );
    if (!url)
      throw new AppError(503, 'Object storage is unavailable', 'OBJECT_STORAGE_NOT_CONFIGURED');
    return { url, filename: record.originalName };
  },
};
