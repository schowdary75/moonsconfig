import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { env } from './env.js';
import { getTenantRuntime } from './tenantContext.js';

const directory = path.resolve(env.uploadDirectory);
fs.mkdirSync(directory, { recursive: true });

export function scopedUploadDirectory() {
  const tenant = getTenantRuntime();
  return tenant ? path.join(directory, 'tenants', tenant.tenantId) : directory;
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      const destination = scopedUploadDirectory();
      fs.mkdirSync(destination, { recursive: true });
      callback(null, destination);
    },
    filename: (_request, file, callback) =>
      callback(null, `${uuid()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
});

export const uploadDirectory = directory;
