import { Router } from 'express';
import { invitationController } from '../controllers/invitationController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { requireFeature, tenantScope } from '../middlewares/tenantScope.js';
import { validate } from '../middlewares/validate.js';
import { invitationSchema } from '../validators/platformValidator.js';
import { ssoConfigurationSchema } from '../validators/platformValidator.js';
import { ssoController } from '../controllers/ssoController.js';
import { requireRecentMfa } from '../middlewares/tenantScope.js';
import { domainController } from '../controllers/domainController.js';
import { providerCredentialController } from '../controllers/providerCredentialController.js';
import { platformController } from '../controllers/platformController.js';
import {
  domainIdSchema,
  domainRequestSchema,
  onboardingSchema,
  providerCredentialSchema,
  providerIdSchema,
} from '../validators/platformValidator.js';

export const tenantRoutes = Router();
tenantRoutes.post(
  '/invitations',
  authenticate,
  tenantScope,
  requireFeature('users'),
  authorize('admin'),
  validate(invitationSchema),
  invitationController.invite,
);
tenantRoutes.get(
  '/sso',
  authenticate,
  tenantScope,
  requireFeature('sso'),
  authorize('admin'),
  ssoController.get,
);
tenantRoutes.put(
  '/sso',
  authenticate,
  tenantScope,
  requireFeature('sso'),
  authorize('admin'),
  requireRecentMfa(),
  validate(ssoConfigurationSchema),
  ssoController.configure,
);
tenantRoutes.get(
  '/domains',
  authenticate,
  tenantScope,
  requireFeature('custom_domain'),
  authorize('admin'),
  domainController.list,
);
tenantRoutes.post(
  '/domains',
  authenticate,
  tenantScope,
  requireFeature('custom_domain'),
  authorize('admin'),
  requireRecentMfa(),
  validate(domainRequestSchema),
  domainController.request,
);
tenantRoutes.post(
  '/domains/:id/verify',
  authenticate,
  tenantScope,
  requireFeature('custom_domain'),
  authorize('admin'),
  requireRecentMfa(),
  validate(domainIdSchema),
  domainController.verify,
);
tenantRoutes.delete(
  '/domains/:id',
  authenticate,
  tenantScope,
  requireFeature('custom_domain'),
  authorize('admin'),
  requireRecentMfa(),
  validate(domainIdSchema),
  domainController.remove,
);
tenantRoutes.get(
  '/provider-credentials',
  authenticate,
  tenantScope,
  authorize('admin'),
  providerCredentialController.list,
);
tenantRoutes.post(
  '/provider-credentials',
  authenticate,
  tenantScope,
  authorize('admin'),
  requireRecentMfa(),
  validate(providerCredentialSchema),
  providerCredentialController.put,
);
tenantRoutes.delete(
  '/provider-credentials/:provider',
  authenticate,
  tenantScope,
  authorize('admin'),
  requireRecentMfa(),
  validate(providerIdSchema),
  providerCredentialController.remove,
);
tenantRoutes.get(
  '/support-access',
  authenticate,
  authorize('admin'),
  platformController.pendingSupportAccess,
);
tenantRoutes.post(
  '/support-access/:id/approve',
  authenticate,
  authorize('admin'),
  requireRecentMfa(),
  validate(domainIdSchema),
  platformController.approveSupportAccess,
);
tenantRoutes.post(
  '/onboarding',
  authenticate,
  authorize('admin'),
  validate(onboardingSchema),
  platformController.advanceOnboarding,
);
