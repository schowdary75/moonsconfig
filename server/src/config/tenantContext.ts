import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import type { PlanCode, FeatureKey } from '../constants/commercialPlans.js';
import { COMMERCIAL_PLANS } from '../constants/commercialPlans.js';
import { AppError } from '../errors/AppError.js';
import { decryptTenantCredential } from '../utils/tenantCredentials.js';
import { env } from './env.js';
import { platformPrisma } from './platformPrisma.js';
import { secretStore } from '../services/secretStore.js';
import { planCatalogService } from '../services/planCatalogService.js';

export interface TenantRuntimeContext {
  tenantId: string;
  slug: string;
  timezone: string;
  databaseName: string;
  planCode: PlanCode;
  features: ReadonlySet<FeatureKey>;
  storageLimitBytes: number;
  subscriptionStatus: string;
  trial: boolean;
  db: PrismaClient;
}

const storage = new AsyncLocalStorage<TenantRuntimeContext>();
const clients = new Map<string, { client: PrismaClient; lastUsedAt: number }>();
const MAX_CLIENTS = 50;
const IDLE_MS = 10 * 60_000;

function tenantUrl(databaseName: string, username: string, password: string) {
  const url = new URL(env.tenantDatabaseBaseUrl);
  url.username = username;
  url.password = password;
  url.pathname = `/${databaseName}`;
  url.searchParams.set('connection_limit', String(env.tenantDatabaseConnectionLimit));
  return url.toString();
}

async function evictClients() {
  const now = Date.now();
  const entries = [...clients.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
  for (const [tenantId, entry] of entries) {
    if (clients.size <= MAX_CLIENTS && now - entry.lastUsedAt <= IDLE_MS) break;
    clients.delete(tenantId);
    await entry.client.$disconnect().catch(() => undefined);
  }
}

async function clientFor(tenant: {
  id: string;
  databaseName: string;
  databaseUsername: string;
  encryptedDatabasePassword: string;
  databaseSecretArn: string | null;
}) {
  const cached = clients.get(tenant.id);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return cached.client;
  }
  const password = tenant.databaseSecretArn
    ? (await secretStore.get(tenant.databaseSecretArn)).password
    : decryptTenantCredential(tenant.encryptedDatabasePassword);
  if (!password) throw new Error('Tenant database credential is unavailable');
  const client = new PrismaClient({
    datasourceUrl: tenantUrl(tenant.databaseName, tenant.databaseUsername, password),
    log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });
  clients.set(tenant.id, { client, lastUsedAt: Date.now() });
  void evictClients();
  return client;
}

export function getTenantRuntime() {
  return storage.getStore();
}

export function getCurrentTenantDb() {
  return storage.getStore()?.db;
}

export async function resolveTenantRuntime(tenantId: string, allowLocked = false) {
  const tenant = await platformPrisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      trial: true,
      subscriptions: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!tenant || ['deleted', 'deleting', 'failed'].includes(tenant.status)) {
    throw new AppError(404, 'Company workspace not found', 'TENANT_NOT_FOUND');
  }
  const now = new Date();
  const subscription =
    tenant.subscriptions.find(
      (item) => item.status === 'active' && (!item.currentPeriodEnd || item.currentPeriodEnd > now),
    ) ?? tenant.subscriptions[0];
  const trialActive = Boolean(tenant.trial && !tenant.trial.endedAt && tenant.trial.endsAt > now);
  const paidActive =
    subscription?.status === 'active' &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now);
  const accessible = tenant.status === 'active' && (trialActive || paidActive);
  if (!accessible && !allowLocked) {
    throw new AppError(
      402,
      'This workspace requires an active subscription',
      'SUBSCRIPTION_REQUIRED',
    );
  }
  const planCode = (trialActive ? 'enterprise' : (subscription?.planCode ?? 'starter')) as PlanCode;
  const snapshot = (
    trialActive ? tenant.trial?.entitlementSnapshot : subscription?.entitlementSnapshot
  ) as { features?: FeatureKey[]; storageBytes?: string } | null;
  const published = snapshot ? null : await planCatalogService.publishedPlan(planCode);
  const fallback = COMMERCIAL_PLANS[planCode];
  const features = snapshot?.features ?? published?.features ?? fallback.features;
  const storageLimit = Number(
    snapshot?.storageBytes ?? published?.storageBytes ?? fallback.storageBytes,
  );
  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    timezone: tenant.timezone,
    databaseName: tenant.databaseName,
    planCode,
    features: new Set(features),
    storageLimitBytes: trialActive ? 5 * 1024 ** 3 : storageLimit,
    subscriptionStatus: trialActive ? 'trialing' : (subscription?.status ?? 'expired'),
    trial: trialActive,
    db: await clientFor(tenant),
  } satisfies TenantRuntimeContext;
}

export function runWithTenant<T>(context: TenantRuntimeContext, callback: () => T) {
  return storage.run(context, callback);
}

export async function disconnectTenantClients() {
  const active = [...clients.values()];
  clients.clear();
  await Promise.allSettled(active.map(({ client }) => client.$disconnect()));
}

export async function evictTenantClient(tenantId: string) {
  const entry = clients.get(tenantId);
  if (!entry) return;
  clients.delete(tenantId);
  await entry.client.$disconnect().catch(() => undefined);
}
