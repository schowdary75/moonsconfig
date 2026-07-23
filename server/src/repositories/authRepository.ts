import { Prisma, type PrincipalType } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface RefreshRecordInput {
  id: string;
  principalType: PrincipalType;
  userId: number;
  familyId: string;
  tokenHash: string;
  jwtId: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

function refreshData(input: RefreshRecordInput): Prisma.AuthRefreshTokenUncheckedCreateInput {
  return {
    id: input.id,
    principalType: input.principalType,
    crmUserId: input.principalType === 'crm_user' ? input.userId : null,
    customerUserId: input.principalType === 'customer_user' ? input.userId : null,
    familyId: input.familyId,
    tokenHash: input.tokenHash,
    jwtId: input.jwtId,
    expiresAt: input.expiresAt,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  };
}

export const authRepository = {
  createRefreshToken: (input: RefreshRecordInput) =>
    prisma.authRefreshToken.create({ data: refreshData(input) }),
  findRefreshToken: (tokenHash: string) =>
    prisma.authRefreshToken.findUnique({
      where: { tokenHash },
      include: { crmUser: { include: { roles: true } }, customerUser: true },
    }),
  rotateRefreshToken: (currentId: string, next: RefreshRecordInput) =>
    prisma.$transaction(async (tx) => {
      const revoked = await tx.authRefreshToken.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: next.id },
      });
      if (revoked.count !== 1) throw new Error('Refresh token already rotated');
      return tx.authRefreshToken.create({ data: refreshData(next) });
    }),
  revokeByHash: (tokenHash: string) =>
    prisma.authRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  revokeFamily: (familyId: string) =>
    prisma.authRefreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  revokeUser: (principalType: PrincipalType, userId: number) =>
    prisma.authRefreshToken.updateMany({
      where:
        principalType === 'crm_user'
          ? { crmUserId: userId, revokedAt: null }
          : { customerUserId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  findLegacySession: (tokenHash: string) =>
    prisma.crmAuthSession.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      include: { user: { include: { roles: true } } },
    }),
  findLegacyCustomerSession: async (tokenHash: string) => {
    const session = await prisma.auth_sessions.findFirst({
      where: { token_hash: tokenHash, expires_at: { gt: new Date() }, revoked_at: null },
    });
    if (!session) return null;
    const user = await prisma.customerUser.findUnique({ where: { id: session.user_id } });
    return user ? { session, user } : null;
  },
  deleteExpired: () =>
    prisma.authRefreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
};
