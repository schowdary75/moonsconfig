import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { getCurrentTenantDb } from './tenantContext.js';

const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const defaultPrisma =
  globalPrisma.prisma ??
  new PrismaClient({ log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'] });
if (env.nodeEnv !== 'production') globalPrisma.prisma = defaultPrisma;

// Compatibility boundary for the migrated legacy repositories. Every property
// access resolves against the authenticated tenant client when a tenant context
// is active, otherwise local/single-tenant development keeps using DATABASE_URL.
export const prisma = new Proxy(defaultPrisma, {
  get(_target, property) {
    const tenant = getCurrentTenantDb();
    if (!tenant && !env.legacyRoutingEnabled) {
      throw new Error('Tenant database context is required; legacy database routing is disabled');
    }
    const target = tenant ?? defaultPrisma;
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as PrismaClient;
