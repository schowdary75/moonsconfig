import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import {
  DeleteObjectsCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

const s3 = new S3Client({ region: env.aws.region });

function localRoot() {
  return path.resolve(process.cwd(), env.uploadDirectory, 'platform-objects');
}

function safeLocalPath(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) throw new Error('Unsafe object key');
  const root = localRoot();
  const target = path.resolve(root, key);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Unsafe object key');
  return target;
}

export const objectStorageService = {
  async presignUpload(bucket: string, key: string, contentType: string, checksumSha256?: string) {
    if (!bucket) return null;
    return getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ChecksumSHA256: checksumSha256,
        ServerSideEncryption: 'aws:kms',
      }),
      { expiresIn: 15 * 60 },
    );
  },

  async promote(bucket: string, sourceKey: string, destinationKey: string) {
    if (!bucket) return;
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, '/')}`,
        Key: destinationKey,
        ServerSideEncryption: 'aws:kms',
      }),
    );
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: sourceKey }));
  },

  async deleteObject(bucket: string, storageKey: string) {
    if (storageKey.startsWith('local:')) {
      await fs.rm(safeLocalPath(storageKey.slice('local:'.length)), { force: true });
      return;
    }
    if (bucket) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
  },
  async putFile(bucket: string, key: string, filePath: string, contentType: string) {
    if (!bucket) {
      const target = safeLocalPath(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(filePath, target);
      return `local:${key}`;
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
        ServerSideEncryption: 'aws:kms',
        Metadata: { immutable: 'true' },
      }),
    );
    return key;
  },

  async downloadUrl(bucket: string, storageKey: string, expiresIn = 3600) {
    if (storageKey.startsWith('local:')) return null;
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: storageKey }), {
      expiresIn,
    });
  },

  async downloadToFile(bucket: string, storageKey: string, target: string) {
    if (storageKey.startsWith('local:')) {
      await fs.copyFile(safeLocalPath(storageKey.slice('local:'.length)), target);
      return;
    }
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
    if (!response.Body) throw new Error('Stored object body is unavailable');
    await pipeline(
      response.Body as NodeJS.ReadableStream,
      createWriteStream(target, { mode: 0o600 }),
    );
  },

  localPath(storageKey: string) {
    if (!storageKey.startsWith('local:')) return null;
    return safeLocalPath(storageKey.slice('local:'.length));
  },

  async deletePrefix(bucket: string, prefix: string) {
    if (!bucket) {
      const target = safeLocalPath(`${prefix}/placeholder`).replace(/[\\/]placeholder$/, '');
      await fs.rm(target, { recursive: true, force: true });
      return;
    }
    let token: string | undefined;
    do {
      const listed = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      if (listed.Contents?.length) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: listed.Contents.flatMap((item) => (item.Key ? [{ Key: item.Key }] : [])),
              Quiet: true,
            },
          }),
        );
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
  },
};
