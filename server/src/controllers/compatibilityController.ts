import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from 'express';

type CompatibilityHandler = (request: Request) => Promise<Response | null>;

function webRequest(request: ExpressRequest) {
  const protocol = request.get('x-forwarded-proto') ?? request.protocol;
  const host = request.get('host') ?? 'localhost';
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? JSON.stringify(request.body ?? {}) : undefined;
  if (hasBody && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Request(`${protocol}://${host}${request.originalUrl}`, {
    method: request.method,
    headers,
    body,
  });
}

export function compatibilityController(handler: CompatibilityHandler) {
  return async (request: ExpressRequest, response: ExpressResponse, next: NextFunction) => {
    try {
      const result = await handler(webRequest(request));
      if (!result) return next();
      result.headers.forEach((value, key) => response.setHeader(key, value));
      const bytes = Buffer.from(await result.arrayBuffer());
      return response.status(result.status).send(bytes);
    } catch (error) {
      return next(error);
    }
  };
}
