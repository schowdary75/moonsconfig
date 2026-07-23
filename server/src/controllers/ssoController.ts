import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { REFRESH_COOKIE } from '../constants/auth.js';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { ssoService } from '../services/ssoService.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax' as const,
  path: `${env.apiPrefix}/auth`,
  maxAge: env.refreshTokenDays * 86_400_000,
};

function tenantIdentity(request: Request) {
  if (!request.auth?.tenantId || !request.auth.platformUserId) {
    throw new AppError(401, 'A company identity is required', 'PLATFORM_IDENTITY_REQUIRED');
  }
  return { tenantId: request.auth.tenantId, userId: request.auth.platformUserId };
}

export const ssoController = {
  start: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await ssoService.start(request.body.workspace, request.body.email));
    } catch (error) {
      next(error);
    }
  },
  callback: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await ssoService.callback(request.body.code, request.body.state, {
        ipAddress: request.ip,
        userAgent: request.header('user-agent'),
      });
      response.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
      sendSuccess(response, result.session);
    } catch (error) {
      next(error);
    }
  },
  get: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await ssoService.get(tenantIdentity(request).tenantId));
    } catch (error) {
      next(error);
    }
  },
  configure: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const identity = tenantIdentity(request);
      sendSuccess(
        response,
        await ssoService.configure(identity.tenantId, identity.userId, request.body),
      );
    } catch (error) {
      next(error);
    }
  },
};
