import type { NextFunction, Request, Response } from 'express';
import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { operatorAuthService } from '../services/operatorAuthService.js';
import { operatorMfaIsFresh } from '../services/platformOperatorSessionPolicy.js';

export async function authenticateOperator(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  try {
    const [scheme, token] = request.header('authorization')?.split(' ') || [];
    if (scheme !== 'Bearer' || !token)
      throw new AppError(401, 'Operator authentication required', 'OPERATOR_AUTH_REQUIRED');
    const claims = operatorAuthService.verify(token);
    if (claims.principalType !== 'platform_operator')
      throw new AppError(401, 'Invalid operator token', 'INVALID_OPERATOR_TOKEN');
    const operator = await platformPrisma.platformOperator.findUnique({
      where: { id: claims.sub },
    });
    if (!operator || operator.status !== 'active' || operator.role !== claims.role)
      throw new AppError(401, 'Operator account is inactive', 'INVALID_OPERATOR_TOKEN');
    const session = await operatorAuthService.touchSession(operator.id, claims.sid);
    request.operator = {
      id: operator.id,
      email: operator.email,
      role: operator.role,
      sessionId: claims.sid,
      mfaVerifiedAt: session.mfaVerifiedAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireFreshOperatorMfa(request: Request, _response: Response, next: NextFunction) {
  if (!operatorMfaIsFresh(request.operator?.mfaVerifiedAt)) {
    return next(
      new AppError(
        403,
        'A fresh operator MFA code is required for this action',
        'OPERATOR_MFA_REQUIRED',
      ),
    );
  }
  next();
}

export function authorizeOperator(
  ...roles: Array<'support' | 'billing' | 'security' | 'platform_admin'>
) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (
      !request.operator ||
      (!roles.includes(request.operator.role) && request.operator.role !== 'platform_admin')
    ) {
      return next(new AppError(403, 'Operator permission is required', 'OPERATOR_FORBIDDEN'));
    }
    next();
  };
}
