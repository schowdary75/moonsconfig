import { Router } from 'express';
import { operationController } from '../controllers/operationController.js';
import { operationRateLimit, realtimeRateLimit } from '../middlewares/rateLimit.js';
import { requireAdmin } from '../legacy/api/db.functions.server.js';
import { AppError } from '../errors/AppError.js';
import { getTenantRuntime } from '../config/tenantContext.js';
import type { FeatureKey } from '../constants/commercialPlans.js';
import { env } from '../config/env.js';

export const operationRoutes = Router();

// Legacy operations are grouped by capability until they are replaced by typed REST endpoints.
// Ordering matters: AI operations remain Enterprise-only even when they mention another module.
const featurePatterns: Array<[RegExp, FeatureKey]> = [
  [/ai|maya|visualscrapbook|ocr/i, 'visual_ai'],
  [/security|allowlist|blockip|unblockip|session|permission|role/i, 'security_center'],
  [/export/i, 'data_export'],
  [/emailtemplate/i, 'email_templates'],
  [/journey|tripmanager/i, 'journey_manager'],
  [/incident/i, 'incident_desk'],
  [/campaign/i, 'campaigns'],
  [/automation/i, 'automations'],
  [/audience/i, 'audiences'],
  [/promotion/i, 'promotions'],
  [/promocode|coupon/i, 'promo_codes'],
  [/banner/i, 'banners'],
  [/travelhub|blog|article/i, 'travelhub_cms'],
  [/visa/i, 'visa_cms'],
  [/seo|sitemap/i, 'seo'],
  [/vendor|supplier/i, 'vendors'],
  [/approval|listingrevision|inventorydraft/i, 'approvals'],
  [/escrow/i, 'escrow'],
  [/refund/i, 'refunds'],
  [/invoice/i, 'invoices'],
  [/quote|proposal/i, 'quotes'],
  [/booking/i, 'bookings'],
  [/followup/i, 'followups'],
  [/lead/i, 'leads'],
  [/client/i, 'clients'],
  [/pipeline|deal/i, 'sales_pipeline'],
  [/package/i, 'packages'],
  [/theme/i, 'themes'],
  [/career|jobopening/i, 'careers'],
  [/accommodation|stay|hotel/i, 'stays'],
  [/(?:^|create|get|update|delete|search|save|listing)car(?:s|listing|allotment)?/i, 'cars'],
  [/flight/i, 'flights'],
  [/cruise/i, 'cruises'],
  [/destination/i, 'destinations'],
  [/experience/i, 'experiences'],
  [/routemap/i, 'route_map'],
  [/asset|media/i, 'assets'],
  [/catalog/i, 'catalog'],
  [/analytics|report/i, 'analytics'],
  [/user|staff|employee/i, 'users'],
];

export function requiredFeatureForOperation(operationName: string) {
  return featurePatterns.find(([pattern]) => pattern.test(operationName))?.[1] ?? 'dashboard';
}

operationRoutes.use('/:operationName', (request, _response, next) => {
  const tenant = getTenantRuntime();
  if (!tenant) return next();
  const operationName = String(request.params.operationName || '');
  const required = requiredFeatureForOperation(operationName);
  if (required && !tenant.features.has(required)) {
    return next(
      new AppError(
        403,
        `The ${required} capability is not included in this plan`,
        'PLAN_UPGRADE_REQUIRED',
      ),
    );
  }
  if (
    request.auth?.platformUserId &&
    operationName === 'upsertCrmEmployee' &&
    !request.body?.data?.id
  ) {
    return next(
      new AppError(
        409,
        'Commercial staff must be added through a seat-controlled invitation',
        'INVITATION_REQUIRED',
      ),
    );
  }
  next();
});

// Middleware to secure admin operations dynamically
operationRoutes.use('/:operationName', async (req, res, next) => {
  const operationName = Array.isArray(req.params.operationName)
    ? req.params.operationName[0]
    : req.params.operationName;

  if (operationName && operationName.startsWith('admin')) {
    try {
      if (req.auth?.role === 'admin') return next();
      if (!env.legacyRoutingEnabled) {
        return next(new AppError(403, 'Administrator role is required', 'FORBIDDEN'));
      }
      let auth = req.body?.data?.auth || req.body?.auth;
      if (!auth && req.body?.data?.adminEmail && req.body?.data?.sessionToken) {
        auth = { email: req.body.data.adminEmail, sessionToken: req.body.data.sessionToken };
      }
      if (!auth) {
        return next(
          new AppError(401, 'Authentication required for admin operations', 'UNAUTHORIZED'),
        );
      }
      await requireAdmin(auth);
    } catch (error: any) {
      return next(new AppError(403, error.message || 'Forbidden', 'FORBIDDEN'));
    }
  }
  next();
});

operationRoutes.all('/:operationName', operationRateLimit, realtimeRateLimit, operationController);
