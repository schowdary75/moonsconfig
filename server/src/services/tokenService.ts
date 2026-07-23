import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';

export interface AccessClaims extends JwtPayload {
  sub: string;
  principalType: 'crm_user' | 'customer_user';
  role: string;
  sid: string;
  jti: string;
  platformUserId?: string;
  tenantId?: string;
  membershipId?: string;
  mfaVerifiedAt?: string;
  authMethod?: string;
  mfaEnrolled?: boolean;
}

export function createAccessToken(
  input: Omit<AccessClaims, 'sub' | 'jti'> & { userId: number | string },
) {
  const jwtId = uuid();
  const token = jwt.sign(
    {
      principalType: input.principalType,
      role: input.role,
      sid: input.sid,
      ...(input.platformUserId ? { platformUserId: input.platformUserId } : {}),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.membershipId ? { membershipId: input.membershipId } : {}),
      ...(input.mfaVerifiedAt ? { mfaVerifiedAt: input.mfaVerifiedAt } : {}),
      ...(input.authMethod ? { authMethod: input.authMethod } : {}),
      ...(input.mfaEnrolled !== undefined ? { mfaEnrolled: input.mfaEnrolled } : {}),
    },
    env.jwtSecret,
    {
      subject: String(input.userId),
      jwtid: jwtId,
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      expiresIn: env.accessTokenTtl as SignOptions['expiresIn'],
      algorithm: 'HS256',
    },
  );
  const decoded = jwt.decode(token) as JwtPayload;
  return {
    token,
    jwtId,
    expiresIn: Math.max(0, (decoded.exp || 0) - Math.floor(Date.now() / 1000)),
  };
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.jwtSecret, {
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    algorithms: ['HS256'],
  }) as AccessClaims;
}
