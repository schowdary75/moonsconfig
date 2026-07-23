import type { Response } from 'express';

export function sendSuccess<T>(response: Response, data: T, statusCode = 200) {
  return response.status(statusCode).json({ success: true, data });
}
