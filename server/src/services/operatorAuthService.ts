import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import type { PlatformOperator } from '@moonsconfig/platform-client';
import { env } from '../config/env.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { decryptTenantCredential, encryptTenantCredential } from '../utils/tenantCredentials.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { sha256 } from '../utils/crypto.js';
import {
  OPERATOR_ABSOLUTE_TIMEOUT_MS,
  OPERATOR_IDLE_TIMEOUT_MS,
  OPERATOR_MFA_FRESH_MS,
} from './platformOperatorSessionPolicy.js';

interface OperatorLoginMeta {
  ipAddress?: string;
  userAgent?: string;
}

async function consumeTotp(operator: PlatformOperator, code: string) {
  if (!operator.mfaSecret || !operator.mfaVerifiedAt)
    throw new AppError(401, 'Invalid operator credentials', 'INVALID_OPERATOR_CREDENTIALS');

  const secret = decryptTenantCredential(operator.mfaSecret);
  const totp = new OTPAuth.TOTP({
    issuer: 'MooNsConfig Operations',
    label: operator.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
  if (delta === null) throw new AppError(401, 'Invalid operator MFA code', 'INVALID_OPERATOR_MFA');

  const step = BigInt(Math.floor(Date.now() / 1000 / 30) + delta);
  const consumed = await platformPrisma.platformOperator.updateMany({
    where: {
      id: operator.id,
      OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
    },
    data: { lastUsedStep: step },
  });
  if (consumed.count !== 1)
    throw new AppError(401, 'Operator MFA code was already used', 'OPERATOR_MFA_REPLAYED');
  return new Date();
}

export const operatorAuthService = {
  async activateInvitation(token: string, password: string) {
    const invitation = await platformPrisma.platformOperatorInvitation.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!invitation || invitation.status !== 'pending' || invitation.expiresAt <= new Date()) {
      throw new AppError(
        400,
        'Operator invitation is invalid or expired',
        'INVALID_OPERATOR_INVITATION',
      );
    }
    const secret = new OTPAuth.Secret({ size: 20 });
    const operator = await platformPrisma.$transaction(async (tx) => {
      const claimed = await tx.platformOperatorInvitation.updateMany({
        where: { id: invitation.id, status: 'pending', expiresAt: { gt: new Date() } },
        data: { status: 'accepted', acceptedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new AppError(409, 'Invitation already used', 'OPERATOR_INVITATION_USED');
      return tx.platformOperator.create({
        data: {
          email: invitation.email,
          name: invitation.name,
          passwordHash: await hashPassword(password),
          role: invitation.role,
          status: 'suspended',
          mfaSecret: encryptTenantCredential(secret.base32),
        },
      });
    });
    const totp = new OTPAuth.TOTP({
      issuer: 'MooNsConfig Operations',
      label: operator.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    return { operatorId: operator.id, enrollmentUri: totp.toString() };
  },

  async verifyActivation(operatorId: string, code: string) {
    const operator = await platformPrisma.platformOperator.findUnique({
      where: { id: operatorId },
    });
    if (
      !operator ||
      operator.status !== 'suspended' ||
      operator.mfaVerifiedAt ||
      !operator.mfaSecret
    ) {
      throw new AppError(400, 'Operator activation is invalid', 'INVALID_OPERATOR_ACTIVATION');
    }
    const mfaVerifiedAt = await consumeTotp({ ...operator, mfaVerifiedAt: new Date() }, code);
    await platformPrisma.platformOperator.update({
      where: { id: operator.id },
      data: { status: 'active', mfaVerifiedAt },
    });
    return { activated: true };
  },

  async login(email: string, password: string, code: string, meta: OperatorLoginMeta = {}) {
    const operator = await platformPrisma.platformOperator.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (
      !operator ||
      operator.status !== 'active' ||
      !(await verifyPassword(operator.passwordHash, password)).valid
    ) {
      throw new AppError(401, 'Invalid operator credentials', 'INVALID_OPERATOR_CREDENTIALS');
    }

    const mfaVerifiedAt = await consumeTotp(operator, code);
    const sessionId = randomUUID();
    const absoluteExpiresAt = new Date(mfaVerifiedAt.getTime() + OPERATOR_ABSOLUTE_TIMEOUT_MS);
    await platformPrisma.platformOperatorSession.create({
      data: {
        id: sessionId,
        operatorId: operator.id,
        mfaVerifiedAt,
        lastSeenAt: mfaVerifiedAt,
        absoluteExpiresAt,
        ipAddress: meta.ipAddress?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 512),
      },
    });

    const accessToken = jwt.sign(
      { principalType: 'platform_operator', role: operator.role, sid: sessionId },
      env.operatorJwtSecret,
      {
        subject: operator.id,
        jwtid: randomUUID(),
        issuer: env.jwtIssuer,
        audience: `${env.jwtAudience}:operations`,
        expiresIn: '8h',
        algorithm: 'HS256',
      },
    );
    return {
      accessToken,
      expiresIn: OPERATOR_ABSOLUTE_TIMEOUT_MS / 1000,
      idleExpiresIn: OPERATOR_IDLE_TIMEOUT_MS / 1000,
      absoluteExpiresAt,
      mfaFreshUntil: new Date(mfaVerifiedAt.getTime() + OPERATOR_MFA_FRESH_MS),
      operator: {
        id: operator.id,
        email: operator.email,
        name: operator.name,
        role: operator.role,
      },
    };
  },

  verify(token: string) {
    return jwt.verify(token, env.operatorJwtSecret, {
      issuer: env.jwtIssuer,
      audience: `${env.jwtAudience}:operations`,
      algorithms: ['HS256'],
    }) as jwt.JwtPayload & {
      sub: string;
      role: 'support' | 'billing' | 'security' | 'platform_admin';
      sid: string;
      principalType: string;
    };
  },

  async touchSession(operatorId: string, sessionId: string) {
    const now = new Date();
    const idleCutoff = new Date(now.getTime() - OPERATOR_IDLE_TIMEOUT_MS);
    const touched = await platformPrisma.platformOperatorSession.updateMany({
      where: {
        id: sessionId,
        operatorId,
        revokedAt: null,
        absoluteExpiresAt: { gt: now },
        lastSeenAt: { gt: idleCutoff },
      },
      data: { lastSeenAt: now },
    });
    if (touched.count !== 1)
      throw new AppError(401, 'Operator session expired', 'OPERATOR_SESSION_EXPIRED');

    const session = await platformPrisma.platformOperatorSession.findUnique({
      where: { id: sessionId },
      select: { mfaVerifiedAt: true, absoluteExpiresAt: true },
    });
    if (!session) throw new AppError(401, 'Operator session expired', 'OPERATOR_SESSION_EXPIRED');
    return session;
  },

  async stepUp(operatorId: string, sessionId: string, code: string) {
    const operator = await platformPrisma.platformOperator.findUnique({
      where: { id: operatorId },
    });
    if (!operator || operator.status !== 'active')
      throw new AppError(401, 'Operator account is inactive', 'INVALID_OPERATOR_TOKEN');
    const mfaVerifiedAt = await consumeTotp(operator, code);
    const updated = await platformPrisma.platformOperatorSession.updateMany({
      where: {
        id: sessionId,
        operatorId,
        revokedAt: null,
        absoluteExpiresAt: { gt: mfaVerifiedAt },
      },
      data: { mfaVerifiedAt, lastSeenAt: mfaVerifiedAt },
    });
    if (updated.count !== 1)
      throw new AppError(401, 'Operator session expired', 'OPERATOR_SESSION_EXPIRED');
    return { mfaFreshUntil: new Date(mfaVerifiedAt.getTime() + OPERATOR_MFA_FRESH_MS) };
  },

  async logout(operatorId: string, sessionId: string) {
    await platformPrisma.platformOperatorSession.updateMany({
      where: { id: sessionId, operatorId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true };
  },
};
