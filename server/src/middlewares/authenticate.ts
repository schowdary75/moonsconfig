import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { authRepository } from '../repositories/authRepository.js';
import { sha256 } from '../utils/crypto.js';
import { verifyAccessToken } from '../services/tokenService.js';

export async function authenticate(request: Request, _response: Response, next: NextFunction) {
  try {
    const [scheme, token] = request.header('authorization')?.split(' ') || [];
    if (scheme !== 'Bearer' || !token)
      throw new AppError(401, 'Authentication required', 'AUTHENTICATION_REQUIRED');
    try {
      const claims = verifyAccessToken(token);
      request.auth = {
        userId: Number(claims.sub),
        principalType: claims.principalType,
        role: claims.role,
        sessionId: claims.sid,
        legacy: false,
        platformUserId: claims.platformUserId,
        tenantId: claims.tenantId,
        membershipId: claims.membershipId,
        mfaVerifiedAt: claims.mfaVerifiedAt ? new Date(claims.mfaVerifiedAt) : undefined,
        authMethod: claims.authMethod,
        mfaEnrolled: claims.mfaEnrolled,
      };
    } catch {
      if (!env.legacySessionEnabled)
        throw new AppError(401, 'Invalid access token', 'INVALID_ACCESS_TOKEN');
      const legacy = await authRepository.findLegacySession(sha256(token));
      if (!legacy) throw new AppError(401, 'Invalid access token', 'INVALID_ACCESS_TOKEN');
      request.auth = {
        userId: legacy.user.id,
        principalType: 'crm_user',
        role: legacy.user.role,
        sessionId: `legacy:${legacy.id}`,
        legacy: true,
      };
    }
    next();
  } catch (error) {
    next(error);
  }
}

export async function authenticateOptional(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  if (!request.header('authorization')) return next();
  return authenticate(request, response, next);
}

export function authorize(...roles: string[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth || !roles.includes(request.auth.role))
      return next(new AppError(403, 'Insufficient permissions', 'FORBIDDEN'));
    next();
  };
}
