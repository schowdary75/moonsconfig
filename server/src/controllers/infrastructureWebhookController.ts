import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { secureUploadService } from '../services/secureUploadService.js';

function validSecret(actual: string) {
  const expected = Buffer.from(env.aws.malwareWebhookSecret);
  const received = Buffer.from(actual);
  return (
    expected.length > 0 &&
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}

export const infrastructureWebhookController = {
  malware: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!validSecret(request.header('x-moons-malware-secret') || '')) {
        throw new AppError(401, 'Invalid malware event credentials', 'INVALID_MALWARE_WEBHOOK');
      }
      sendSuccess(
        response,
        await secureUploadService.malwareResult(request.body.objectKey, request.body.result),
      );
    } catch (error) {
      next(error);
    }
  },
};
