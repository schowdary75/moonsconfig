import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { healthRepository } from '../repositories/healthRepository.js';

export async function getHealth() {
  const services: Record<string, 'up' | 'down' | 'disabled'> = {
    database: 'down',
    redis: 'down',
    socket: env.socketEnabled ? 'up' : 'disabled',
  };
  await healthRepository
    .ping()
    .then(() => {
      services.database = 'up';
    })
    .catch(() => undefined);
  await redis
    .ping()
    .then(() => {
      services.redis = 'up';
    })
    .catch(() => undefined);
  return {
    status: services.database === 'up' && services.redis === 'up' ? 'ok' : 'degraded',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    services,
  };
}
