import type { CrmUser, CrmUserRole, PrincipalType } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { authRepository, type RefreshRecordInput } from '../repositories/authRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { createOpaqueToken, sha256 } from '../utils/crypto.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { createAccessToken } from './tokenService.js';

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}
type UserWithRoles = CrmUser & { roles: Array<{ role: CrmUserRole }> };

function presentUser(user: UserWithRoles) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    mobile: user.mobile,
    role: user.role,
    roles: Array.from(new Set([user.role, ...user.roles.map((item) => item.role)])),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function tokenRecord(input: {
  opaque: string;
  principalType: PrincipalType;
  userId: number;
  familyId: string;
  jwtId: string;
  meta: RequestMeta;
}): RefreshRecordInput {
  return {
    id: uuid(),
    principalType: input.principalType,
    userId: input.userId,
    familyId: input.familyId,
    tokenHash: sha256(input.opaque),
    jwtId: input.jwtId,
    expiresAt: new Date(Date.now() + env.refreshTokenDays * 86_400_000),
    ipAddress: input.meta.ipAddress,
    userAgent: input.meta.userAgent?.slice(0, 512),
  };
}

async function issue(user: UserWithRoles, meta: RequestMeta, familyId = uuid()) {
  const sessionId = uuid();
  const access = createAccessToken({
    userId: user.id,
    principalType: 'crm_user',
    role: user.role,
    sid: sessionId,
  });
  const refreshToken = createOpaqueToken();
  await authRepository.createRefreshToken(
    tokenRecord({
      opaque: refreshToken,
      principalType: 'crm_user',
      userId: user.id,
      familyId,
      jwtId: access.jwtId,
      meta,
    }),
  );
  return {
    refreshToken,
    session: {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      user: presentUser(user),
    },
  };
}

export const authService = {
  async login(email: string, password: string, meta: RequestMeta) {
    const user = await userRepository.findByEmail(email.toLowerCase());
    if (!user) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    const verification = await verifyPassword(user.passwordHash, password);
    if (!verification.valid)
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    if (verification.needsRehash)
      await userRepository.updatePassword(user.id, await hashPassword(password));
    return issue(user, meta);
  },

  async refresh(rawToken: string, meta: RequestMeta) {
    const current = await authRepository.findRefreshToken(sha256(rawToken));
    if (!current) throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    if (current.revokedAt) {
      await authRepository.revokeFamily(current.familyId);
      throw new AppError(401, 'Refresh token reuse detected', 'TOKEN_REUSE_DETECTED');
    }
    if (current.expiresAt <= new Date())
      throw new AppError(401, 'Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
    const user = current.crmUser;
    if (!user) throw new AppError(401, 'Unsupported refresh principal', 'INVALID_REFRESH_TOKEN');
    const access = createAccessToken({
      userId: user.id,
      principalType: 'crm_user',
      role: user.role,
      sid: uuid(),
    });
    const refreshToken = createOpaqueToken();
    const next = tokenRecord({
      opaque: refreshToken,
      principalType: 'crm_user',
      userId: user.id,
      familyId: current.familyId,
      jwtId: access.jwtId,
      meta,
    });
    try {
      await authRepository.rotateRefreshToken(current.id, next);
    } catch {
      throw new AppError(401, 'Refresh token already used', 'TOKEN_REUSE_DETECTED');
    }
    return {
      refreshToken,
      session: {
        accessToken: access.token,
        expiresIn: access.expiresIn,
        user: presentUser(user),
      },
    };
  },

  async exchangeLegacy(rawToken: string, meta: RequestMeta) {
    if (!env.legacySessionEnabled)
      throw new AppError(410, 'Legacy sessions are disabled', 'LEGACY_AUTH_DISABLED');
    const session = await authRepository.findLegacySession(sha256(rawToken));
    if (!session) throw new AppError(401, 'Invalid legacy session', 'INVALID_LEGACY_SESSION');
    return issue(session.user, meta);
  },

  async logout(rawToken?: string) {
    if (rawToken) await authRepository.revokeByHash(sha256(rawToken));
  },

  getUser: async (id: number) => {
    const user = await userRepository.findById(id);
    if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    return presentUser(user);
  },
};
