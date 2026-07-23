import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { secretStore } from './secretStore.js';

const providers = new Set(['smtp', 'google', 'meta', 'sms', 'telephony', 'ai', 'webhook']);

function present(credential: any) {
  return {
    id: credential.id,
    provider: credential.provider,
    status: credential.status,
    metadata: credential.metadata,
    lastVerifiedAt: credential.lastVerifiedAt,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

function auditActor(actor: string | { operatorId: string }) {
  return typeof actor === 'string' ? { actorId: actor } : { operatorId: actor.operatorId };
}

export const providerCredentialService = {
  async list(tenantId: string) {
    const rows = await platformPrisma.providerCredential.findMany({
      where: { tenantId },
      orderBy: { provider: 'asc' },
    });
    return rows.map(present);
  },

  async put(
    tenantId: string,
    actor: string | { operatorId: string },
    provider: string,
    credentials: Record<string, string>,
    metadata?: Record<string, string>,
  ) {
    provider = provider.toLowerCase();
    if (!providers.has(provider))
      throw new AppError(400, 'Unsupported provider', 'INVALID_PROVIDER');
    const entries = Object.entries(credentials).filter(
      ([, value]) => typeof value === 'string' && value.trim(),
    );
    if (!entries.length || entries.length > 20) {
      throw new AppError(
        400,
        'Provider credentials are incomplete',
        'INVALID_PROVIDER_CREDENTIALS',
      );
    }
    if (entries.some(([key, value]) => key.length > 80 || value.length > 8192)) {
      throw new AppError(
        400,
        'Provider credential field is too large',
        'INVALID_PROVIDER_CREDENTIALS',
      );
    }
    const secretArn = await secretStore.put(tenantId, provider, Object.fromEntries(entries));
    const row = await platformPrisma.providerCredential.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, secretArn, status: 'pending', metadata },
      update: { secretArn, status: 'pending', metadata, lastVerifiedAt: null },
    });
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        ...auditActor(actor),
        action: 'provider.credentials.updated',
        target: row.id,
        metadata: { provider },
      },
    });
    return present(row);
  },

  async remove(tenantId: string, actor: string | { operatorId: string }, provider: string) {
    const row = await platformPrisma.providerCredential.findUnique({
      where: { tenantId_provider: { tenantId, provider: provider.toLowerCase() } },
    });
    if (!row) throw new AppError(404, 'Provider credential not found', 'PROVIDER_NOT_FOUND');
    await secretStore.remove(row.secretArn);
    await platformPrisma.providerCredential.delete({ where: { id: row.id } });
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        ...auditActor(actor),
        action: 'provider.credentials.deleted',
        target: row.id,
        metadata: { provider: row.provider },
      },
    });
    return null;
  },
};
