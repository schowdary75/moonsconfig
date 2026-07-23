import type { NextFunction, Request, Response } from 'express';
import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger/index.js';
import {
  prepareScreenExport,
  streamScreenExport,
  verifyScreenExportCode,
} from '../services/screenExportService.js';

async function audit(
  request: Request,
  action: 'screen.source_export.completed' | 'screen.source_export.denied',
  target: string | null,
  metadata: Record<string, unknown>,
) {
  logger.info(action, {
    requestId: request.requestId,
    tenantId: request.auth?.tenantId,
    userId: request.auth?.userId,
    target,
    ...metadata,
  });
  if (!request.auth?.tenantId || !request.auth.platformUserId) return;
  try {
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId: request.auth.tenantId,
        actorId: request.auth.platformUserId,
        action,
        target,
        ipAddress: request.ip,
        metadata: metadata as any,
      },
    });
  } catch (error) {
    logger.warn('Screen export audit persistence failed', {
      requestId: request.requestId,
      action,
      error,
    });
  }
}

export const screenExportController = {
  create: async (request: Request, response: Response, next: NextFunction) => {
    const pathname = String(request.body.pathname);
    try {
      await verifyScreenExportCode(String(request.body.accessCode));
      const prepared = await prepareScreenExport(pathname);
      await streamScreenExport(response, prepared);
      await audit(request, 'screen.source_export.completed', prepared.definition.slug, {
        routePattern: prepared.definition.routePattern,
        fileCount: prepared.files.length + 2,
        uncompressedSourceBytes: prepared.totalBytes,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'SCREEN_EXPORT_CODE_INVALID') {
        await audit(request, 'screen.source_export.denied', null, { reason: 'invalid_code' });
      }
      if (response.headersSent) {
        logger.error('Screen export stream failed after response headers were sent', {
          requestId: request.requestId,
          pathname,
          error,
        });
        if (!response.destroyed) response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      next(error);
    }
  },
};
