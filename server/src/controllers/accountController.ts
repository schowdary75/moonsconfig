import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { accountExportService } from '../services/accountExportService.js';
import { accountLifecycleService } from '../services/accountLifecycleService.js';

function identity(request: Request) {
  if (!request.auth?.tenantId || !request.auth.platformUserId) {
    throw new AppError(401, 'A company identity is required', 'PLATFORM_IDENTITY_REQUIRED');
  }
  return { tenantId: request.auth.tenantId, userId: request.auth.platformUserId };
}

export const accountController = {
  requestExport: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const current = identity(request);
      sendSuccess(
        response,
        await accountExportService.request(current.tenantId, current.userId),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
  getExport: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await accountExportService.get(identity(request).tenantId, String(request.params.id)),
      );
    } catch (error) {
      next(error);
    }
  },
  downloadExport: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const file = await accountExportService.download(
        identity(request).tenantId,
        String(request.params.id),
      );
      if (file.localPath) return response.download(file.localPath, file.filename);
      if (file.url) return response.redirect(302, file.url);
      throw new AppError(404, 'Export file not found', 'EXPORT_UNAVAILABLE');
    } catch (error) {
      next(error);
    }
  },
  requestDeletion: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const current = identity(request);
      sendSuccess(
        response,
        await accountLifecycleService.requestDeletion(
          current.tenantId,
          current.userId,
          request.body.reason,
        ),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
  cancelDeletion: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const current = identity(request);
      sendSuccess(
        response,
        await accountLifecycleService.cancelDeletion(current.tenantId, current.userId),
      );
    } catch (error) {
      next(error);
    }
  },
};
