import { createHash, randomBytes } from 'node:crypto';
import { DomainDataState, WorkOS } from '@workos-inc/node';
import { env } from '../config/env.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { COMMERCIAL_PLANS } from '../constants/commercialPlans.js';
import { AppError } from '../errors/AppError.js';
import { sha256 } from '../utils/crypto.js';
import { decryptTenantCredential, encryptTenantCredential } from '../utils/tenantCredentials.js';
import { platformAuthService } from './platformAuthService.js';
import { planCatalogService } from './planCatalogService.js';

const workos = env.workos.apiKey ? new WorkOS(env.workos.apiKey) : null;

function configuredWorkos() {
  if (!workos || !env.workos.clientId) {
    throw new AppError(503, 'Enterprise SSO is not configured', 'SSO_NOT_CONFIGURED');
  }
  return workos;
}

async function assertEnterprise(tenantId: string) {
  const tenant = await platformPrisma.tenant.findUnique({
    where: { id: tenantId },
    include: { trial: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });
  if (!tenant) throw new AppError(404, 'Company not found', 'TENANT_NOT_FOUND');
  const now = new Date();
  const trial = tenant.trial && !tenant.trial.endedAt && tenant.trial.endsAt > now;
  const paid = tenant.subscriptions.find((item) => item.status === 'active');
  const planCode = trial ? 'enterprise' : (paid?.planCode ?? 'starter');
  const stored = (trial ? tenant.trial?.entitlementSnapshot : paid?.entitlementSnapshot) as {
    features?: string[];
  } | null;
  const published = stored ? null : await planCatalogService.publishedPlan(planCode);
  const features = stored?.features ?? published?.features ?? COMMERCIAL_PLANS[planCode].features;
  if (!features.includes('sso')) {
    throw new AppError(403, 'Enterprise plan is required for SSO', 'PLAN_UPGRADE_REQUIRED');
  }
  return tenant;
}

export const ssoService = {
  async get(tenantId: string) {
    await assertEnterprise(tenantId);
    const config = await platformPrisma.enterpriseSsoConfig.findUnique({ where: { tenantId } });
    return config
      ? {
          policy: config.policy,
          organizationId: config.workosOrganizationId,
          connectionId: config.workosConnectionId,
          verifiedDomains: config.verifiedDomains,
        }
      : { policy: 'disabled', organizationId: null, connectionId: null, verifiedDomains: [] };
  },

  async configure(
    tenantId: string,
    actor: string | { operatorId: string },
    input: {
      policy: 'disabled' | 'optional' | 'required';
      connectionId?: string;
      domains: string[];
    },
  ) {
    const tenant = await assertEnterprise(tenantId);
    const domains = [...new Set(input.domains.map((domain) => domain.trim().toLowerCase()))];
    if (domains.some((domain) => !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(domain))) {
      throw new AppError(400, 'One or more SSO domains are invalid', 'INVALID_SSO_DOMAIN');
    }
    let existing = await platformPrisma.enterpriseSsoConfig.findUnique({ where: { tenantId } });
    let organizationId = existing?.workosOrganizationId ?? null;
    if (input.policy !== 'disabled' && !organizationId) {
      const organization = await configuredWorkos().organizations.createOrganization(
        {
          name: tenant.name,
          domainData: domains.map((domain) => ({ domain, state: DomainDataState.Pending })),
          externalId: tenant.id,
          metadata: { tenantId },
        },
        { idempotencyKey: `tenant-${tenant.id}` },
      );
      organizationId = organization.id;
    }
    existing = await platformPrisma.enterpriseSsoConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        policy: input.policy,
        workosOrganizationId: organizationId,
        workosConnectionId: input.connectionId || null,
        verifiedDomains: domains,
      },
      update: {
        policy: input.policy,
        workosOrganizationId: organizationId,
        workosConnectionId: input.connectionId || null,
        verifiedDomains: domains,
      },
    });
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        ...(typeof actor === 'string' ? { actorId: actor } : { operatorId: actor.operatorId }),
        action: 'auth.sso.configuration_changed',
        target: existing.id,
        metadata: { policy: input.policy, domains, connectionId: input.connectionId || null },
      },
    });
    return this.get(tenantId);
  },

  async start(workspace: string, loginHint?: string) {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { slug: workspace.toLowerCase() },
      include: { ssoConfig: true },
    });
    if (
      !tenant?.ssoConfig ||
      tenant.ssoConfig.policy === 'disabled' ||
      !tenant.ssoConfig.workosOrganizationId
    ) {
      throw new AppError(404, 'SSO is not enabled for this workspace', 'SSO_NOT_AVAILABLE');
    }
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    await platformPrisma.ssoLoginState.create({
      data: {
        tenantId: tenant.id,
        stateHash: sha256(state),
        encryptedCodeVerifier: encryptTenantCredential(verifier),
        nonce: randomBytes(24).toString('base64url'),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const authorizationUrl = configuredWorkos().userManagement.getAuthorizationUrl({
      clientId: env.workos.clientId,
      organizationId: tenant.ssoConfig.workosOrganizationId,
      connectionId: tenant.ssoConfig.workosConnectionId || undefined,
      redirectUri: env.workos.redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state,
      loginHint,
      screenHint: 'sign-in',
    });
    return { authorizationUrl };
  },

  async callback(code: string, state: string, meta: { ipAddress?: string; userAgent?: string }) {
    const loginState = await platformPrisma.ssoLoginState.findUnique({
      where: { stateHash: sha256(state) },
      include: { tenant: { include: { ssoConfig: true } } },
    });
    if (!loginState || loginState.usedAt || loginState.expiresAt <= new Date()) {
      throw new AppError(401, 'SSO state is invalid or expired', 'INVALID_SSO_STATE');
    }
    const config = loginState.tenant.ssoConfig;
    if (!config?.workosOrganizationId)
      throw new AppError(401, 'SSO configuration changed', 'INVALID_SSO_STATE');
    const authentication = await configuredWorkos().userManagement.authenticateWithCodeAndVerifier({
      clientId: env.workos.clientId,
      code,
      codeVerifier: decryptTenantCredential(loginState.encryptedCodeVerifier),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    if (
      authentication.organizationId !== config.workosOrganizationId ||
      !authentication.user.emailVerified
    ) {
      throw new AppError(
        403,
        'The SSO identity is not verified for this company',
        'SSO_IDENTITY_REJECTED',
      );
    }
    const membership = await platformPrisma.membership.findFirst({
      where: {
        tenantId: loginState.tenantId,
        status: 'active',
        user: { email: authentication.user.email.toLowerCase(), status: 'active' },
      },
      include: { user: true },
    });
    if (!membership)
      throw new AppError(403, 'An accepted invitation is required', 'SSO_INVITATION_REQUIRED');
    await platformPrisma.ssoLoginState.update({
      where: { id: loginState.id },
      data: { usedAt: new Date() },
    });
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId: loginState.tenantId,
        actorId: membership.userId,
        action: 'auth.sso.login',
        target: membership.id,
        ipAddress: meta.ipAddress,
        metadata: {
          workosUserId: authentication.user.id,
          method: authentication.authenticationMethod,
        },
      },
    });
    return platformAuthService.completeSsoLogin(membership.id, meta);
  },
};
