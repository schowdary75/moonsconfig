import { randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { createOpaqueToken, sha256 } from '../utils/crypto.js';
import { decryptTenantCredential, encryptTenantCredential } from '../utils/tenantCredentials.js';

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

function totpFor(secret: string, email: string) {
  return new OTPAuth.TOTP({
    issuer: 'MooNsConfig',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

function normalizeCode(code: string) {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

function recoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const raw = randomBytes(8).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
  });
}

async function verifyTotp(userId: string, email: string, code: string) {
  const method = await platformPrisma.mfaMethod.findFirst({
    where: { userId, kind: 'totp', verifiedAt: { not: null }, disabledAt: null },
  });
  if (!method) throw new AppError(409, 'MFA enrollment is required', 'MFA_ENROLLMENT_REQUIRED');
  const secret = decryptTenantCredential(method.encryptedSecret);
  const delta = totpFor(secret, email).validate({ token: normalizeCode(code), window: 1 });
  if (delta === null) return false;
  const step = BigInt(Math.floor(Date.now() / 1000 / 30) + delta);
  if (method.lastUsedStep !== null && step <= method.lastUsedStep) {
    throw new AppError(401, 'This authenticator code was already used', 'MFA_CODE_REPLAYED');
  }
  await platformPrisma.mfaMethod.update({ where: { id: method.id }, data: { lastUsedStep: step } });
  return true;
}

async function verifyRecovery(userId: string, code: string) {
  const codeHash = sha256(normalizeCode(code));
  const recovery = await platformPrisma.recoveryCode.findFirst({
    where: { userId, codeHash, usedAt: null },
  });
  if (!recovery) return false;
  await platformPrisma.recoveryCode.update({
    where: { id: recovery.id },
    data: { usedAt: new Date() },
  });
  return true;
}

export const mfaService = {
  async beginEnrollment(userId: string) {
    const user = await platformPrisma.platformUser.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    if (user.mfaEnabled) throw new AppError(409, 'MFA is already enabled', 'MFA_ALREADY_ENABLED');
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const method = await platformPrisma.mfaMethod.upsert({
      where: { userId_kind: { userId, kind: 'totp' } },
      create: { userId, encryptedSecret: encryptTenantCredential(secret) },
      update: {
        encryptedSecret: encryptTenantCredential(secret),
        verifiedAt: null,
        disabledAt: null,
        lastUsedStep: null,
      },
    });
    const uri = totpFor(secret, user.email).toString();
    return {
      methodId: method.id,
      uri,
      qrCodeDataUrl: await QRCode.toDataURL(uri),
      manualKey: secret,
    };
  },

  async confirmEnrollment(userId: string, code: string) {
    const user = await platformPrisma.platformUser.findUnique({ where: { id: userId } });
    const method = await platformPrisma.mfaMethod.findUnique({
      where: { userId_kind: { userId, kind: 'totp' } },
    });
    if (!user || !method || method.verifiedAt) {
      throw new AppError(409, 'Start MFA enrollment first', 'MFA_SETUP_REQUIRED');
    }
    const secret = decryptTenantCredential(method.encryptedSecret);
    const delta = totpFor(secret, user.email).validate({ token: normalizeCode(code), window: 1 });
    if (delta === null) throw new AppError(401, 'Invalid authenticator code', 'INVALID_MFA_CODE');
    const codes = recoveryCodes();
    await platformPrisma.$transaction([
      platformPrisma.mfaMethod.update({
        where: { id: method.id },
        data: {
          verifiedAt: new Date(),
          lastUsedStep: BigInt(Math.floor(Date.now() / 1000 / 30) + delta),
        },
      }),
      platformPrisma.platformUser.update({ where: { id: userId }, data: { mfaEnabled: true } }),
      platformPrisma.recoveryCode.deleteMany({ where: { userId } }),
      platformPrisma.recoveryCode.createMany({
        data: codes.map((recoveryCode) => ({
          userId,
          codeHash: sha256(normalizeCode(recoveryCode)),
        })),
      }),
      platformPrisma.platformAuditEvent.create({
        data: { actorId: userId, action: 'auth.mfa.enrolled', target: userId },
      }),
    ]);
    return { recoveryCodes: codes };
  },

  async createChallenge(
    userId: string,
    membershipId: string,
    purpose: 'login' | 'step_up' = 'login',
  ) {
    const rawToken = `mfa_${createOpaqueToken()}`;
    await platformPrisma.mfaChallenge.create({
      data: {
        userId,
        membershipId,
        purpose,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    return { challengeToken: rawToken, expiresIn: CHALLENGE_TTL_MS / 1000 };
  },

  async consumeChallenge(challengeToken: string, code: string, recovery = false) {
    const challenge = await platformPrisma.mfaChallenge.findUnique({
      where: { tokenHash: sha256(challengeToken) },
      include: { user: true },
    });
    if (!challenge || challenge.completedAt || challenge.expiresAt <= new Date()) {
      throw new AppError(401, 'MFA challenge is invalid or expired', 'INVALID_MFA_CHALLENGE');
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new AppError(429, 'Too many MFA attempts', 'MFA_ATTEMPTS_EXCEEDED');
    }
    const valid = recovery
      ? await verifyRecovery(challenge.userId, code)
      : await verifyTotp(challenge.userId, challenge.user.email, code);
    if (!valid) {
      await platformPrisma.mfaChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppError(401, 'Invalid MFA code', 'INVALID_MFA_CODE');
    }
    await platformPrisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { completedAt: new Date(), attempts: { increment: 1 } },
    });
    if (!challenge.membershipId)
      throw new AppError(401, 'Challenge has no workspace', 'INVALID_MFA_CHALLENGE');
    return {
      userId: challenge.userId,
      membershipId: challenge.membershipId,
      verifiedAt: new Date(),
    };
  },

  async verifyUser(userId: string, code: string, recovery = false) {
    const user = await platformPrisma.platformUser.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    const valid = recovery
      ? await verifyRecovery(userId, code)
      : await verifyTotp(userId, user.email, code);
    if (!valid) throw new AppError(401, 'Invalid MFA code', 'INVALID_MFA_CODE');
    return new Date();
  },

  async regenerateRecoveryCodes(userId: string) {
    const codes = recoveryCodes();
    await platformPrisma.$transaction([
      platformPrisma.recoveryCode.deleteMany({ where: { userId } }),
      platformPrisma.recoveryCode.createMany({
        data: codes.map((code) => ({ userId, codeHash: sha256(normalizeCode(code)) })),
      }),
      platformPrisma.platformAuditEvent.create({
        data: { actorId: userId, action: 'auth.mfa.recovery_codes_regenerated', target: userId },
      }),
    ]);
    return { recoveryCodes: codes };
  },
};
