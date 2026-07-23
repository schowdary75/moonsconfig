import { PrismaClient as PlatformPrismaClient } from '@moonsconfig/platform-client';
import { env } from './env.js';
import { createHash, randomUUID } from 'node:crypto';

const platformGlobal = globalThis as unknown as { platformPrisma?: PlatformPrismaClient };

const platformBase =
  platformGlobal.platformPrisma ??
  new PlatformPrismaClient({
    datasourceUrl: env.platformDatabaseUrl,
    log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.nodeEnv !== 'production') platformGlobal.platformPrisma = platformBase;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

export const platformPrisma = platformBase.$extends({
  query: {
    platformAuditEvent: {
      async create({ args, query }) {
        const data = args.data as any;
        if (data.eventHash) return query(args);
        const previous = await platformBase.platformAuditEvent.findFirst({
          where: { tenantId: data.tenantId ?? null, eventHash: { not: null } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { eventHash: true },
        });
        const id = data.id ?? randomUUID();
        const createdAt = data.createdAt ?? new Date();
        const previousHash = previous?.eventHash ?? null;
        const eventHash = createHash('sha256')
          .update(
            stableJson({
              id,
              tenantId: data.tenantId ?? null,
              actorId: data.actorId ?? null,
              operatorId: data.operatorId ?? null,
              action: data.action,
              target: data.target ?? null,
              metadata: data.metadata ?? null,
              ipAddress: data.ipAddress ?? null,
              createdAt: createdAt.toISOString(),
              previousHash,
            }),
          )
          .digest('hex');
        return query({ ...args, data: { ...data, id, createdAt, previousHash, eventHash } });
      },
    },
  },
});
