import type { NextFunction, Request, Response } from 'express';
import type { FeatureKey } from '../constants/commercialPlans.js';
import { AppError } from '../errors/AppError.js';
import { getTenantRuntime, resolveTenantRuntime, runWithTenant } from '../config/tenantContext.js';

export async function tenantScope(request: Request, _response: Response, next: NextFunction) {
  try {
    if (!request.auth?.tenantId) return next();
    if (
      request.auth.platformUserId &&
      request.auth.role === 'admin' &&
      request.auth.mfaEnrolled === false
    ) {
      throw new AppError(
        428,
        'Set up multi-factor authentication to continue',
        'MFA_ENROLLMENT_REQUIRED',
      );
    }
    const context = await resolveTenantRuntime(request.auth.tenantId);
    runWithTenant(context, next);
  } catch (error) {
    next(error);
  }
}

export function requireRecentMfa(maxAgeMs = 10 * 60_000) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth?.platformUserId) {
      return next(
        new AppError(401, 'A company identity is required', 'PLATFORM_IDENTITY_REQUIRED'),
      );
    }
    const verifiedAt = request.auth.mfaVerifiedAt?.getTime() ?? 0;
    if (!verifiedAt || Date.now() - verifiedAt > maxAgeMs) {
      return next(new AppError(428, 'Recent MFA verification is required', 'MFA_STEP_UP_REQUIRED'));
    }
    next();
  };
}

export function requireCommercialTenant(
  _request: Request,
  _response: Response,
  next: NextFunction,
) {
  if (!getTenantRuntime()) {
    return next(new AppError(401, 'A company workspace is required', 'TENANT_REQUIRED'));
  }
  next();
}

export function requireFeature(feature: FeatureKey) {
  return (_request: Request, _response: Response, next: NextFunction) => {
    const tenant = getTenantRuntime();
    if (tenant && !tenant.features.has(feature)) {
      return next(
        new AppError(403, 'Upgrade your plan to use this feature', 'PLAN_UPGRADE_REQUIRED'),
      );
    }
    next();
  };
}
