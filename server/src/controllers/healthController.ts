import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../helpers/response.js';
import { getHealth } from '../services/healthService.js';

export async function healthController(_request: Request, response: Response, next: NextFunction) {
  try {
    const health = await getHealth();
    sendSuccess(response, health, health.status === 'ok' ? 200 : 503);
  } catch (error) {
    next(error);
  }
}
