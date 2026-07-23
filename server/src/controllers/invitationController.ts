import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { invitationService } from '../services/invitationService.js';

export const invitationController = {
  invite: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.auth?.tenantId || !request.auth.platformUserId)
        throw new AppError(401, 'Company membership required', 'TENANT_REQUIRED');
      sendSuccess(
        response,
        await invitationService.invite(
          request.auth.tenantId,
          request.auth.platformUserId,
          request.body,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  accept: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await invitationService.accept(request.body.token, request.body));
    } catch (error) {
      next(error);
    }
  },
};
