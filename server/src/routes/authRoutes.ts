import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { originGuard } from '../middlewares/originGuard.js';
import { authRateLimit } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  legacyExchangeSchema,
  loginSchema,
  switchTenantSchema,
} from '../validators/authValidator.js';
import {
  mfaChallengeSchema,
  mfaCodeSchema,
  ssoCallbackSchema,
  ssoStartSchema,
} from '../validators/authValidator.js';
import { mfaController } from '../controllers/mfaController.js';
import { requireRecentMfa } from '../middlewares/tenantScope.js';
import { ssoController } from '../controllers/ssoController.js';

export const authRoutes = Router();
authRoutes.post('/login', authRateLimit, validate(loginSchema), authController.login);
authRoutes.post('/refresh', originGuard, authRateLimit, authController.refresh);
authRoutes.post(
  '/legacy/exchange',
  authRateLimit,
  validate(legacyExchangeSchema),
  authController.exchangeLegacy,
);
authRoutes.post('/logout', originGuard, authController.logout);
authRoutes.get('/me', authenticate, authController.me);
authRoutes.post(
  '/switch-tenant',
  authenticate,
  validate(switchTenantSchema),
  authController.switchTenant,
);
authRoutes.post('/mfa/setup', authenticate, mfaController.setup);
authRoutes.post('/mfa/verify', authenticate, validate(mfaCodeSchema), mfaController.verify);
authRoutes.post(
  '/mfa/challenge',
  authRateLimit,
  validate(mfaChallengeSchema),
  mfaController.challenge,
);
authRoutes.post(
  '/mfa/step-up',
  authenticate,
  authRateLimit,
  validate(mfaCodeSchema),
  mfaController.stepUp,
);
authRoutes.post(
  '/mfa/recovery-codes',
  authenticate,
  requireRecentMfa(),
  mfaController.recoveryCodes,
);
authRoutes.post('/sso/start', authRateLimit, validate(ssoStartSchema), ssoController.start);
authRoutes.post(
  '/sso/callback',
  authRateLimit,
  validate(ssoCallbackSchema),
  ssoController.callback,
);
