import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { REFRESH_COOKIE } from '../constants/auth.js';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { authService } from '../services/authService.js';
import { platformAuthService } from '../services/platformAuthService.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax' as const,
  path: `${env.apiPrefix}/auth`,
  maxAge: env.refreshTokenDays * 86_400_000,
};
const meta = (request: Request) => ({
  ipAddress: request.ip,
  userAgent: request.header('user-agent'),
});
const respondWithSession = (
  response: Response,
  result: {
    refreshToken: string;
    session: { accessToken: string; expiresIn: number; user: unknown };
  },
) => {
  response.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
  return sendSuccess(response, result.session);
};

const respondWithAuthResult = (response: Response, result: any) => {
  if (result?.mfaRequired) return sendSuccess(response, result);
  return respondWithSession(response, result);
};

export const authController = {
  login: async (request: Request, response: Response, next: NextFunction) => {
    try {
      respondWithAuthResult(
        response,
        request.body.workspace
          ? await platformAuthService.login(
              request.body.email,
              request.body.password,
              request.body.workspace,
              meta(request),
            )
          : await authService.login(request.body.email, request.body.password, meta(request)),
      );
    } catch (error) {
      next(error);
    }
  },
  refresh: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const token = request.cookies?.[REFRESH_COOKIE];
      if (!token) throw new AppError(401, 'Refresh token required', 'REFRESH_TOKEN_REQUIRED');
      respondWithAuthResult(
        response,
        token.startsWith('pt_')
          ? await platformAuthService.refresh(token, meta(request))
          : await authService.refresh(token, meta(request)),
      );
    } catch (error) {
      next(error);
    }
  },
  exchangeLegacy: async (request: Request, response: Response, next: NextFunction) => {
    try {
      respondWithSession(
        response,
        await authService.exchangeLegacy(request.body.sessionToken, meta(request)),
      );
    } catch (error) {
      next(error);
    }
  },
  logout: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const token = request.cookies?.[REFRESH_COOKIE];
      if (token?.startsWith('pt_')) await platformAuthService.logout(token);
      else await authService.logout(token);
      response.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
      sendSuccess(response, null);
    } catch (error) {
      next(error);
    }
  },
  me: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        request.auth!.platformUserId && request.auth!.membershipId
          ? await platformAuthService.getUser(
              request.auth!.platformUserId,
              request.auth!.membershipId,
            )
          : await authService.getUser(request.auth!.userId),
      );
    } catch (error) {
      next(error);
    }
  },
  switchTenant: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.auth?.platformUserId) {
        throw new AppError(
          400,
          'This session does not support workspaces',
          'WORKSPACE_UNAVAILABLE',
        );
      }
      respondWithAuthResult(
        response,
        await platformAuthService.switchTenant(
          request.auth.platformUserId,
          request.body.tenantId,
          meta(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
};
