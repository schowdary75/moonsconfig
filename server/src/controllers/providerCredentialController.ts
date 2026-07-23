import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { providerCredentialService } from '../services/providerCredentialService.js';

function identity(request: Request) {
  if (!request.auth?.tenantId || !request.auth.platformUserId) {
    throw new AppError(401, 'A company identity is required', 'PLATFORM_IDENTITY_REQUIRED');
  }
  return { tenantId: request.auth.tenantId, actorId: request.auth.platformUserId };
}

export const providerCredentialController = {
  list: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await providerCredentialService.list(identity(request).tenantId));
    } catch (error) {
      next(error);
    }
  },
  put: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const current = identity(request);
      sendSuccess(
        response,
        await providerCredentialService.put(
          current.tenantId,
          current.actorId,
          request.body.provider,
          request.body.credentials,
          request.body.metadata,
        ),
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
        await providerCredentialService.remove(
          current.tenantId,
          current.actorId,
          String(request.params.provider),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
};
