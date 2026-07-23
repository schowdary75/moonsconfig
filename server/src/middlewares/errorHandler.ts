import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger/index.js';

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const appError =
    error instanceof AppError
      ? error
      : error instanceof multer.MulterError
        ? new AppError(400, error.message, 'UPLOAD_ERROR')
        : new AppError(500, 'Internal server error', 'INTERNAL_ERROR');
  const level = appError.statusCode >= 500 ? 'error' : 'warn';
  logger.log(level, appError.message, {
    requestId: request.requestId,
    code: appError.code,
    method: request.method,
    path: request.path,
    error: appError.statusCode >= 500 ? error : undefined,
  });
  response.status(appError.statusCode).json({
    success: false,
    message: appError.message,
    // Stable machine code lets public forms turn conflicts into actionable UI.
    code: appError.code,
    ...(appError.details ? { errors: appError.details } : {}),
    requestId: request.requestId,
  });
};
