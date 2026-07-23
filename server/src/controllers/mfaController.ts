import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { REFRESH_COOKIE } from '../constants/auth.js';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { mfaService } from '../services/mfaService.js';
import { platformAuthService } from '../services/platformAuthService.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax' as const,
  path: `${env.apiPrefix}/auth`,
  maxAge: env.refreshTokenDays * 86_400_000,
};

function platformIdentity(request: Request) {
  if (!request.auth?.platformUserId || !request.auth.membershipId) {
    throw new AppError(401, 'A company identity is required', 'PLATFORM_IDENTITY_REQUIRED');
  }
  return { userId: request.auth.platformUserId, membershipId: request.auth.membershipId };
}

export const mfaController = {
  setup: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await mfaService.beginEnrollment(platformIdentity(request).userId));
    } catch (error) {
      next(error);
    }
  },
  verify: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await mfaService.confirmEnrollment(platformIdentity(request).userId, request.body.code),
      );
    } catch (error) {
      next(error);
    }
  },
  challenge: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await platformAuthService.completeMfaLogin(
        request.body.challengeToken,
        request.body.code,
        Boolean(request.body.recovery),
        { ipAddress: request.ip, userAgent: request.header('user-agent') },
      );
      response.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
      sendSuccess(response, result.session);
    } catch (error) {
      next(error);
    }
  },
  stepUp: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const identity = platformIdentity(request);
      sendSuccess(
        response,
        await platformAuthService.stepUp(
          identity.userId,
          identity.membershipId,
          request.body.code,
          Boolean(request.body.recovery),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  recoveryCodes: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await mfaService.regenerateRecoveryCodes(platformIdentity(request).userId),
      );
    } catch (error) {
      next(error);
    }
  },
};
