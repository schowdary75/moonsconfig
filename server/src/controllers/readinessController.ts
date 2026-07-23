import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../helpers/response.js';
import { readinessService } from '../services/readinessService.js';

export async function readinessController(
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  try {
    const result = await readinessService.check();
    sendSuccess(response, result, result.runtimeHealthy ? 200 : 503);
  } catch (error) {
    next(error);
  }
}
