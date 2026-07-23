import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';

const store = (prefix: string) =>
  env.nodeEnv === 'production'
    ? new RedisStore({
        prefix,
        sendCommand: (...args: string[]) =>
          (redis.call as (...commandArgs: string[]) => Promise<number | string>)(...args),
      })
    : undefined;

export const realtimeOperationNames = new Set([
  'getAdminSupportChatMessages',
  'getAllSupportChats',
  'getGlobalChatHistory',
  'getGlobalChatRoster',
  'getGlobalChatSignals',
  'getGlobalChatUpdates',
  'heartbeatPresence',
  'markGlobalChatsAsDelivered',
]);

export function getOperationName(request: Pick<Request, 'path' | 'params'>) {
  const parameter = request.params?.operationName;
  if (typeof parameter === 'string') return parameter;
  const match = request.path.match(/\/operations\/([^/?]+)$/);
  return match?.[1] ?? '';
}

export function isRealtimeOperation(request: Pick<Request, 'path' | 'params'>) {
  return realtimeOperationNames.has(getOperationName(request));
}

function getRealtimeActor(request: Request) {
  const body = request.body as { data?: Record<string, unknown> } | undefined;
  const data = body?.data;
  if (!data) return '';
  const auth = data.auth as { sessionToken?: unknown } | undefined;
  const identity =
    auth?.sessionToken ??
    data.sessionToken ??
    data.entityId ??
    data.receiverId ??
    data.requestingEntityId ??
    data.entity1Id;
  return typeof identity === 'string' || typeof identity === 'number' ? String(identity) : '';
}

export function operationRateLimitKey(request: Request) {
  const ip = ipKeyGenerator(request.ip ?? '0.0.0.0');
  const tenant = request.auth?.tenantId ? `tenant:${request.auth.tenantId}` : 'legacy';
  const actor = getRealtimeActor(request);
  if (!actor) return `${tenant}:${ip}`;
  const actorHash = createHash('sha256').update(actor).digest('hex').slice(0, 24);
  return `${tenant}:${ip}:${actorHash}`;
}

export const realtimeRateLimitKey = operationRateLimitKey;

export const apiRateLimit = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.api,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
  store: store('rate:api:v2:'),
  // Operation traffic has its own actor-aware buckets below. Keeping it in this
  // IP-wide bucket makes all employees/tabs behind one office connection share
  // the same small allowance and causes normal CRM polling to lock out the app.
  skip: (request) => request.path === '/health' || request.path.startsWith('/operations/'),
});

export const operationRateLimit = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.operations,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
  store: store('rate:operations:v1:'),
  keyGenerator: operationRateLimitKey,
  skip: (request) => isRealtimeOperation(request),
});

export const realtimeRateLimit = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.realtime,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many realtime requests' },
  store: store('rate:realtime:v1:'),
  keyGenerator: operationRateLimitKey,
  skip: (request) => !isRealtimeOperation(request),
});

export const authRateLimit = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many authentication attempts' },
  store: store('rate:auth:'),
});

export function screenExportRateLimitKey(request: Request) {
  const ip = ipKeyGenerator(request.ip ?? '0.0.0.0');
  const tenant = request.auth?.tenantId ?? 'legacy';
  const user = request.auth?.platformUserId ?? request.auth?.userId ?? 'anonymous';
  return `${tenant}:${user}:${ip}`;
}

export const screenExportRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many failed screen export attempts. Please try again later.',
  },
  store: store('rate:screen-export:v1:'),
  keyGenerator: screenExportRateLimitKey,
});
