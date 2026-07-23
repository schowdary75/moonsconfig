import type { NextFunction, Request, Response } from 'express';
import { validate as isUuid, v4 as uuid } from 'uuid';

export function requestContext(request: Request, response: Response, next: NextFunction) {
  const incoming = request.header('x-request-id');
  request.requestId = incoming && isUuid(incoming) ? incoming : uuid();
  response.setHeader('x-request-id', request.requestId);
  next();
}
