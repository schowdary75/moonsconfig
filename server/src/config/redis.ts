import { Redis } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from './env.js';
import { logger } from '../logger/index.js';

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableReadyCheck: true,
});
redis.on('error', (error: Error) =>
  logger.warn('Redis connection error', { error: error.message }),
);

export async function ensureRedis(): Promise<void> {
  if (redis.status === 'wait') await redis.connect();
}

const redisUrl = new URL(env.redisUrl);
export const bullConnection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
  ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  ...(redisUrl.pathname.length > 1 ? { db: Number(redisUrl.pathname.slice(1)) } : {}),
  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
};
