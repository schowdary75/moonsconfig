import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../helpers/response.js';
import { executeOperation } from '../services/operationService.js';

export async function operationController(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  try {
    const operationName = Array.isArray(request.params.operationName)
      ? (request.params.operationName[0] ?? '')
      : (request.params.operationName ?? '');
    const result = await executeOperation(operationName, request.body);
    sendSuccess(response, result);
  } catch (error) {
    next(error);
  }
}
