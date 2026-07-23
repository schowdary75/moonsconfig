import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { uploadService } from '../services/uploadService.js';
import { secureUploadService } from '../services/secureUploadService.js';

export const uploadController = {
  presign: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.auth?.platformUserId)
        throw new AppError(401, 'A company identity is required', 'PLATFORM_IDENTITY_REQUIRED');
      sendSuccess(
        response,
        await secureUploadService.create(request.auth.platformUserId, request.body),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  secureDownload: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.auth?.tenantId)
        throw new AppError(401, 'A company workspace is required', 'TENANT_REQUIRED');
      const file = await secureUploadService.download(
        request.auth.tenantId,
        String(request.params.id),
      );
      response.redirect(302, file.url);
    } catch (error) {
      next(error);
    }
  },
  create: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.file) throw new AppError(400, 'A file is required', 'FILE_REQUIRED');
      sendSuccess(response, await uploadService.validate(request.file), 201);
    } catch (error) {
      next(error);
    }
  },
  download: async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.sendFile(await uploadService.resolve(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  },
};
