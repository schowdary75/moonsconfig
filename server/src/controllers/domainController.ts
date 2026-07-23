import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { domainService } from '../services/domainService.js';

function identity(request: Request) {
  if (!request.auth?.tenantId || !request.auth.platformUserId) {
    throw new AppError(401, 'A company identity is required', 'PLATFORM_IDENTITY_REQUIRED');
  }
  return { tenantId: request.auth.tenantId, actorId: request.auth.platformUserId };
}

export const domainController = {
  list: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await domainService.list(identity(request).tenantId));
    } catch (error) {
      next(error);
    }
  },
  request: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const current = identity(request);
      sendSuccess(
        response,
        await domainService.request(current.tenantId, current.actorId, request.body.hostname),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  verify: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const current = identity(request);
      sendSuccess(
        response,
        await domainService.verify(current.tenantId, current.actorId, String(request.params.id)),
      );
    } catch (error) {
      next(error);
    }
  },
  remove: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const current = identity(request);
      sendSuccess(
        response,
        await domainService.revoke(current.tenantId, current.actorId, String(request.params.id)),
      );
    } catch (error) {
      next(error);
    }
  },
};
