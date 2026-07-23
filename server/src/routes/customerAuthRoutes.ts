import { Router } from 'express';
import { customerAuthController } from '../controllers/customerAuthController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { originGuard } from '../middlewares/originGuard.js';
import { authRateLimit } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  customerGoogleSchema,
  customerLegacyExchangeSchema,
  customerLoginSchema,
  customerOtpRequestSchema,
  customerOtpVerifySchema,
  customerRegisterSchema,
} from '../validators/customerAuthValidator.js';

export const customerAuthRoutes = Router();
customerAuthRoutes.post(
  '/register',
  authRateLimit,
  validate(customerRegisterSchema),
  customerAuthController.register,
);
customerAuthRoutes.post(
  '/login',
  authRateLimit,
  validate(customerLoginSchema),
  customerAuthController.login,
);
customerAuthRoutes.post(
  '/google',
  authRateLimit,
  validate(customerGoogleSchema),
  customerAuthController.google,
);
customerAuthRoutes.post(
  '/otp/request',
  authRateLimit,
  validate(customerOtpRequestSchema),
  customerAuthController.requestOtp,
);
customerAuthRoutes.post(
  '/otp/verify',
  authRateLimit,
  validate(customerOtpVerifySchema),
  customerAuthController.verifyOtp,
);
customerAuthRoutes.post('/refresh', originGuard, authRateLimit, customerAuthController.refresh);
customerAuthRoutes.post(
  '/legacy/exchange',
  authRateLimit,
  validate(customerLegacyExchangeSchema),
  customerAuthController.exchangeLegacy,
);
customerAuthRoutes.post('/logout', originGuard, customerAuthController.logout);
customerAuthRoutes.post('/logout-all', originGuard, authenticate, customerAuthController.logoutAll);
customerAuthRoutes.get('/me', authenticate, customerAuthController.me);
