import type { NextFunction, Request, Response } from 'express';
import type Joi from 'joi';
import { AppError } from '../errors/AppError.js';

export function validate(schema: Joi.ObjectSchema) {
  return (request: Request, _response: Response, next: NextFunction) => {
    const { value, error } = schema.validate(
      { body: request.body, params: request.params, query: request.query },
      { abortEarly: false, stripUnknown: true },
    );
    if (error)
      return next(
        new AppError(
          400,
          'Validation failed',
          'VALIDATION_ERROR',
          error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
        ),
      );
    request.body = value.body;
    request.params = value.params;
    for (const key of Object.keys(request.query)) delete request.query[key];
    Object.assign(request.query, value.query);
    next();
  };
}
