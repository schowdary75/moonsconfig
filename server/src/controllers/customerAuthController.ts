import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { CUSTOMER_REFRESH_COOKIE } from '../constants/auth.js';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { customerAuthService } from '../services/customerAuthService.js';

const customerCookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.customerCookieSameSite,
  path: `${env.apiPrefix}/customer-auth`,
  maxAge: env.refreshTokenDays * 86_400_000,
} as const;

const meta = (request: Request) => ({
  ipAddress: request.ip,
  userAgent: request.header('user-agent'),
});

function sessionResponse(
  response: Response,
  result: { refreshToken: string; session: unknown },
  status = 200,
) {
  response.cookie(CUSTOMER_REFRESH_COOKIE, result.refreshToken, customerCookieOptions);
  return sendSuccess(response, result.session, status);
}

export const customerAuthController = {
  register: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sessionResponse(
        response,
        await customerAuthService.register(request.body, meta(request)),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  login: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sessionResponse(
        response,
        await customerAuthService.login(request.body.email, request.body.password, meta(request)),
      );
    } catch (error) {
      next(error);
    }
  },
  google: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sessionResponse(
        response,
        await customerAuthService.google(request.body.accessToken, meta(request)),
      );
    } catch (error) {
      next(error);
    }
  },
  requestOtp: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await customerAuthService.requestOtp(request.body.phone, request.body.email),
      );
    } catch (error) {
      next(error);
    }
  },
  verifyOtp: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sessionResponse(
        response,
        await customerAuthService.verifyOtpAndRegister(request.body, meta(request)),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  refresh: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const token = request.cookies?.[CUSTOMER_REFRESH_COOKIE];
      // A missing refresh cookie is the normal state for a signed-out visitor.
      // Keep invalid and expired cookies on the authenticated error path below.
      if (!token) {
        sendSuccess(response, null);
        return;
      }
      sessionResponse(response, await customerAuthService.refresh(token, meta(request)));
    } catch (error) {
      next(error);
    }
  },
  exchangeLegacy: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sessionResponse(
        response,
        await customerAuthService.exchangeLegacy(request.body.sessionToken, meta(request)),
      );
    } catch (error) {
      next(error);
    }
  },
  logout: async (request: Request, response: Response, next: NextFunction) => {
    try {
      await customerAuthService.logout(request.cookies?.[CUSTOMER_REFRESH_COOKIE]);
      response.clearCookie(CUSTOMER_REFRESH_COOKIE, {
        ...customerCookieOptions,
        maxAge: undefined,
      });
      sendSuccess(response, null);
    } catch (error) {
      next(error);
    }
  },
  logoutAll: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (request.auth?.principalType !== 'customer_user')
        throw new AppError(403, 'Customer authentication required', 'FORBIDDEN');
      await customerAuthService.logoutAll(request.auth.userId);
      response.clearCookie(CUSTOMER_REFRESH_COOKIE, {
        ...customerCookieOptions,
        maxAge: undefined,
      });
      sendSuccess(response, null);
    } catch (error) {
      next(error);
    }
  },
  me: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (request.auth?.principalType !== 'customer_user')
        throw new AppError(403, 'Customer authentication required', 'FORBIDDEN');
      sendSuccess(response, await customerAuthService.getCustomer(request.auth.userId));
    } catch (error) {
      next(error);
    }
  },
};
