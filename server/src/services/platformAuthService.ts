import { v4 as uuid } from 'uuid';
import { platformPrisma } from '../config/platformPrisma.js';
import { COMMERCIAL_PLANS, type PlanCode } from '../constants/commercialPlans.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { createOpaqueToken, sha256 } from '../utils/crypto.js';
import { verifyPassword } from '../utils/password.js';
import { createAccessToken } from './tokenService.js';
import { resolveTenantRuntime } from '../config/tenantContext.js';
import { mfaService } from './mfaService.js';

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

const membershipInclude = {
  user: true,
  tenant: {
    include: {
      trial: true,
      subscriptions: { orderBy: { createdAt: 'desc' as const }, take: 10 },
      ssoConfig: true,
      domains: { orderBy: { createdAt: 'asc' as const } },
    },
  },
} as const;

function effectivePlan(membership: any): {
  planCode: PlanCode;
  status: string;
  locked: boolean;
  currentPeriodEnd: Date | null;
  seats: number;
  features: string[];
  storageBytes: string;
} {
  const now = new Date();
  const trialActive = Boolean(
    membership.tenant.trial &&
    !membership.tenant.trial.endedAt &&
    membership.tenant.trial.endsAt > now,
  );
  const subscription =
    membership.tenant.subscriptions.find(
      (item: any) =>
        item.status === 'active' && (!item.currentPeriodEnd || item.currentPeriodEnd > now),
    ) ?? membership.tenant.subscriptions[0];
  const paidActive =
    subscription?.status === 'active' &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now);
  const planCode = (trialActive ? 'enterprise' : (subscription?.planCode ?? 'starter')) as PlanCode;
  const storedSnapshot = (
    trialActive ? membership.tenant.trial?.entitlementSnapshot : subscription?.entitlementSnapshot
  ) as { features?: string[]; storageBytes?: string } | null;
  return {
    planCode,
    status: trialActive ? 'trialing' : (subscription?.status ?? 'expired'),
    locked: membership.tenant.status !== 'active' || (!trialActive && !paidActive),
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    seats: trialActive ? 10 : (subscription?.seats ?? COMMERCIAL_PLANS[planCode].includedSeats),
    features: storedSnapshot?.features ?? [...COMMERCIAL_PLANS[planCode].features],
    storageBytes: storedSnapshot?.storageBytes ?? String(COMMERCIAL_PLANS[planCode].storageBytes),
  };
}

function present(membership: any, legacySessionToken?: string) {
  const access = effectivePlan(membership);
  const role = membership.role === 'owner' ? 'admin' : membership.role;
  return {
    id: membership.tenantUserId,
    platformUserId: membership.user.id,
    membershipId: membership.id,
    tenantId: membership.tenant.id,
    email: membership.user.email,
    name: membership.user.name,
    mobile: membership.user.mobile,
    role,
    roles: [role],
    createdAt: membership.user.createdAt,
    updatedAt: membership.user.updatedAt,
    session_token: legacySessionToken,
    permissions: access.features,
    mfa: {
      enabled: Boolean(membership.user.mfaEnabled),
      enrollmentRequired:
        ['owner', 'admin'].includes(membership.role) && !membership.user.mfaEnabled,
    },
    tenant: {
      id: membership.tenant.id,
      name: membership.tenant.name,
      slug: membership.tenant.slug,
      status: membership.tenant.status,
      onboardingStep: membership.tenant.onboardingStep,
      onboardingCompletedAt: membership.tenant.onboardingCompletedAt,
      domains:
        membership.tenant.domains?.map((domain: any) => ({
          hostname: domain.hostname,
          kind: domain.kind,
          status: domain.status,
        })) ?? [],
    },
    sso: { policy: membership.tenant.ssoConfig?.policy ?? 'disabled' },
    subscription: {
      planCode: access.planCode,
      status: access.status,
      locked: access.locked,
      trialEndsAt: membership.tenant.trial?.endsAt ?? null,
      currentPeriodEnd: access.currentPeriodEnd,
      storageLimitBytes: String(access.status === 'trialing' ? 5 * 1024 ** 3 : access.storageBytes),
      seats: access.seats,
    },
  };
}

async function issue(
  membership: any,
  meta: RequestMeta,
  familyId = uuid(),
  authentication: { method?: string; mfaVerifiedAt?: Date | null } = {},
) {
  if (!membership.tenantUserId) {
    throw new AppError(409, 'Company provisioning is not complete', 'TENANT_PROVISIONING');
  }
  if (membership.status !== 'active' || membership.user.status !== 'active') {
    throw new AppError(403, 'Account is not active', 'ACCOUNT_INACTIVE');
  }
  const role = membership.role === 'owner' ? 'admin' : membership.role;
  const legacySessionToken = createOpaqueToken();
  const tenantRuntime = await resolveTenantRuntime(membership.tenantId, true);
  await tenantRuntime.db.crmAuthSession.create({
    data: {
      userId: membership.tenantUserId,
      tokenHash: sha256(legacySessionToken),
      expiresAt: new Date(Date.now() + env.refreshTokenDays * 86_400_000),
    },
  });
  const access = createAccessToken({
    userId: membership.tenantUserId,
    principalType: 'crm_user',
    role,
    sid: uuid(),
    platformUserId: membership.userId,
    tenantId: membership.tenantId,
    membershipId: membership.id,
    authMethod: authentication.method ?? 'password',
    mfaVerifiedAt: authentication.mfaVerifiedAt?.toISOString(),
    mfaEnrolled: Boolean(membership.user.mfaEnabled),
  });
  const opaque = `pt_${createOpaqueToken()}`;
  await platformPrisma.platformRefreshToken.create({
    data: {
      id: uuid(),
      userId: membership.userId,
      membershipId: membership.id,
      familyId,
      tokenHash: sha256(opaque),
      jwtId: access.jwtId,
      expiresAt: new Date(Date.now() + env.refreshTokenDays * 86_400_000),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent?.slice(0, 512),
      authMethod: authentication.method ?? 'password',
      mfaVerifiedAt: authentication.mfaVerifiedAt ?? null,
    },
  });
  return {
    refreshToken: opaque,
    session: {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      user: present(membership, legacySessionToken),
    },
  };
}

async function membershipById(id: string) {
  return platformPrisma.membership.findUnique({ where: { id }, include: membershipInclude });
}

export const platformAuthService = {
  async login(email: string, password: string, workspace: string | undefined, meta: RequestMeta) {
    const user = await platformPrisma.platformUser.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        memberships: {
          where: { status: 'active', ...(workspace ? { tenant: { slug: workspace } } : {}) },
          include: {
            tenant: {
              include: { trial: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 10 } },
            },
          },
        },
      },
    });
    if (!user || !(await verifyPassword(user.passwordHash, password)).valid) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (!user.emailVerifiedAt)
      throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
    if (user.memberships.length !== 1) {
      throw new AppError(
        409,
        workspace ? 'Workspace not found' : 'Select a workspace',
        'WORKSPACE_REQUIRED',
      );
    }
    const membership = await membershipById(user.memberships[0]!.id);
    if (!membership)
      throw new AppError(403, 'Workspace membership is inactive', 'INVALID_MEMBERSHIP');
    if (membership.tenant.ssoConfig?.policy === 'required' && membership.role !== 'owner') {
      throw new AppError(403, 'Use your company SSO to sign in', 'SSO_REQUIRED');
    }
    if (membership.tenant.ssoConfig?.policy === 'required' && membership.role === 'owner') {
      if (!user.mfaEnabled)
        throw new AppError(403, 'Owner break-glass access requires MFA', 'MFA_ENROLLMENT_REQUIRED');
      await platformPrisma.platformAuditEvent.create({
        data: {
          tenantId: membership.tenantId,
          actorId: user.id,
          action: 'auth.sso.break_glass_started',
          target: membership.id,
          ipAddress: meta.ipAddress,
        },
      });
    }
    if (user.mfaEnabled) {
      return {
        mfaRequired: true as const,
        ...(await mfaService.createChallenge(user.id, membership.id, 'login')),
      };
    }
    return issue(membership, meta);
  },

  async refresh(rawToken: string, meta: RequestMeta) {
    const current = await platformPrisma.platformRefreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!current || current.expiresAt <= new Date()) {
      throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }
    if (current.revokedAt) {
      await platformPrisma.platformRefreshToken.updateMany({
        where: { familyId: current.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppError(401, 'Refresh token reuse detected', 'TOKEN_REUSE_DETECTED');
    }
    const membership = await membershipById(current.membershipId);
    if (!membership)
      throw new AppError(401, 'Membership is no longer active', 'INVALID_REFRESH_TOKEN');
    await platformPrisma.platformRefreshToken.update({
      where: { id: current.id },
      data: { revokedAt: new Date() },
    });
    return issue(membership, meta, current.familyId, {
      method: current.authMethod,
      mfaVerifiedAt: current.mfaVerifiedAt,
    });
  },

  async logout(rawToken?: string) {
    if (rawToken) {
      await platformPrisma.platformRefreshToken.updateMany({
        where: { tokenHash: sha256(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  },

  async getUser(platformUserId: string, membershipId: string) {
    const membership = await membershipById(membershipId);
    if (!membership || membership.userId !== platformUserId) {
      throw new AppError(401, 'Membership is no longer active', 'INVALID_MEMBERSHIP');
    }
    if (!membership.tenantUserId) {
      throw new AppError(409, 'Company provisioning is not complete', 'TENANT_PROVISIONING');
    }
    const [staff, invitations, storage, exportsUsed] = await Promise.all([
      platformPrisma.membership.count({
        where: { tenantId: membership.tenantId, status: 'active' },
      }),
      platformPrisma.invitation.count({
        where: { tenantId: membership.tenantId, status: 'invited', expiresAt: { gt: new Date() } },
      }),
      platformPrisma.uploadObject.aggregate({
        where: {
          tenantId: membership.tenantId,
          status: { in: ['pending', 'processing', 'active'] },
        },
        _sum: { sizeBytes: true },
      }),
      platformPrisma.accountExport.count({ where: { tenantId: membership.tenantId } }),
    ]);
    const result = present(membership) as any;
    const trialActive = result.subscription.status === 'trialing';
    result.quotas = {
      staff: { used: staff + invitations, limit: result.subscription.seats },
      storageBytes: {
        used: String(storage._sum.sizeBytes ?? 0n),
        limit: String(trialActive ? 5 * 1024 ** 3 : result.subscription.storageLimitBytes),
      },
      accountExports: { used: exportsUsed, limit: trialActive ? 1 : null },
    };
    return result;
  },

  async switchTenant(platformUserId: string, tenantId: string, meta: RequestMeta) {
    const membership = await platformPrisma.membership.findFirst({
      where: { userId: platformUserId, tenantId, status: 'active' },
      include: membershipInclude,
    });
    if (!membership) throw new AppError(403, 'You are not a member of that workspace', 'FORBIDDEN');
    if (membership.user.mfaEnabled) {
      return {
        mfaRequired: true as const,
        ...(await mfaService.createChallenge(platformUserId, membership.id, 'login')),
      };
    }
    return issue(membership, meta);
  },

  async completeMfaLogin(
    challengeToken: string,
    code: string,
    recovery: boolean,
    meta: RequestMeta,
  ) {
    const verified = await mfaService.consumeChallenge(challengeToken, code, recovery);
    const membership = await membershipById(verified.membershipId);
    if (!membership || membership.userId !== verified.userId) {
      throw new AppError(401, 'Membership is no longer active', 'INVALID_MEMBERSHIP');
    }
    return issue(membership, meta, uuid(), {
      method: recovery ? 'recovery_code' : 'password_totp',
      mfaVerifiedAt: verified.verifiedAt,
    });
  },

  async completeSsoLogin(membershipId: string, meta: RequestMeta) {
    const membership = await membershipById(membershipId);
    if (!membership)
      throw new AppError(401, 'Membership is no longer active', 'INVALID_MEMBERSHIP');
    return issue(membership, meta, uuid(), { method: 'workos_sso', mfaVerifiedAt: null });
  },

  async stepUp(platformUserId: string, membershipId: string, code: string, recovery: boolean) {
    const membership = await membershipById(membershipId);
    if (!membership || membership.userId !== platformUserId) {
      throw new AppError(401, 'Membership is no longer active', 'INVALID_MEMBERSHIP');
    }
    if (!membership.tenantUserId) {
      throw new AppError(409, 'Company provisioning is not complete', 'TENANT_PROVISIONING');
    }
    const verifiedAt = await mfaService.verifyUser(platformUserId, code, recovery);
    const role = membership.role === 'owner' ? 'admin' : membership.role;
    const access = createAccessToken({
      userId: membership.tenantUserId,
      principalType: 'crm_user',
      role,
      sid: uuid(),
      platformUserId,
      tenantId: membership.tenantId,
      membershipId,
      authMethod: recovery ? 'recovery_code' : 'totp',
      mfaVerifiedAt: verifiedAt.toISOString(),
      mfaEnrolled: Boolean(membership.user.mfaEnabled),
    });
    return { accessToken: access.token, expiresIn: access.expiresIn, mfaVerifiedAt: verifiedAt };
  },
};
