import { AppError } from '../errors/AppError.js';
import { operationRepository } from '../repositories/operationRepository.js';
import { ZodError } from 'zod';

export async function executeOperation(name: string, payload: unknown) {
  const operation = operationRepository.findByName(name);
  if (!operation) throw new AppError(404, `Unknown operation: ${name}`, 'OPERATION_NOT_FOUND');
  const options =
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data?: unknown })
      : { data: payload };
  try {
    return await operation.handler(options);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ZodError) {
      throw new AppError(
        400,
        'Validation failed',
        'VALIDATION_ERROR',
        error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    // The legacy operations use plain Errors for access-control outcomes.
    // Return their real HTTP status instead of presenting an authorization
    // failure as a server outage (and triggering repeated polling retries).
    const message = error instanceof Error ? error.message : '';
    if (/^(admin access denied|unauthorized)$/i.test(message)) {
      throw new AppError(
        401,
        'Your session is no longer valid. Please sign in again.',
        'UNAUTHORIZED',
      );
    }
    if (/forbidden|requires admin|requires .* role|insufficient role/i.test(message)) {
      throw new AppError(403, 'You do not have permission to perform this action.', 'FORBIDDEN');
    }
    throw error;
  }
}
