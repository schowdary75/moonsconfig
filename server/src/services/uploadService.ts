import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { scopedUploadDirectory } from '../config/upload.js';
import { AppError } from '../errors/AppError.js';
import { getTenantRuntime } from '../config/tenantContext.js';
import { platformPrisma } from '../config/platformPrisma.js';

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

export const uploadService = {
  async validate(file: Express.Multer.File) {
    const extension = path.extname(file.originalname).toLowerCase();
    const detected = await fileTypeFromFile(file.path);
    const effectiveMime = detected?.mime || file.mimetype;
    if (
      !allowedExtensions.has(extension) ||
      !allowedMimes.has(file.mimetype) ||
      (detected && !allowedMimes.has(detected.mime))
    ) {
      await fs.rm(file.path, { force: true });
      throw new AppError(400, 'Unsupported or invalid file type', 'INVALID_FILE_TYPE');
    }
    const tenant = getTenantRuntime();
    if (tenant) {
      const entries = await fs.readdir(scopedUploadDirectory(), { withFileTypes: true });
      const sizes = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map((entry) =>
            fs.stat(path.join(scopedUploadDirectory(), entry.name)).then((stats) => stats.size),
          ),
      );
      const usedBytes = sizes.reduce((total, size) => total + size, 0);
      if (usedBytes > tenant.storageLimitBytes) {
        await fs.rm(file.path, { force: true });
        throw new AppError(409, 'Company storage quota has been reached', 'STORAGE_QUOTA_EXCEEDED');
      }
      const periodStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );
      const periodEnd = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
      );
      await platformPrisma.usageCounter.upsert({
        where: {
          tenantId_quotaKey_periodStart: {
            tenantId: tenant.tenantId,
            quotaKey: 'storage_bytes',
            periodStart,
          },
        },
        update: { value: BigInt(usedBytes), periodEnd },
        create: {
          tenantId: tenant.tenantId,
          quotaKey: 'storage_bytes',
          periodStart,
          periodEnd,
          value: BigInt(usedBytes),
        },
      });
    }
    return {
      id: file.filename,
      originalName: path.basename(file.originalname),
      mimeType: effectiveMime,
      size: file.size,
      url: `/api/v1/uploads/${file.filename}`,
    };
  },
  async resolve(id: string) {
    if (path.basename(id) !== id || !/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(id))
      throw new AppError(400, 'Invalid upload identifier', 'INVALID_UPLOAD_ID');
    const filePath = path.join(scopedUploadDirectory(), id);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      throw new AppError(404, 'Upload not found', 'UPLOAD_NOT_FOUND');
    }
  },
};
