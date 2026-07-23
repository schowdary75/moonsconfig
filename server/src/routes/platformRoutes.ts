import { Router } from 'express';
import { platformController } from '../controllers/platformController.js';
import { authRateLimit } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  invitationAcceptanceSchema,
  provisioningStatusSchema,
  registrationSchema,
  verificationSchema,
  ownerActivationSchema,
} from '../validators/platformValidator.js';
import { invitationController } from '../controllers/invitationController.js';
import { infrastructureWebhookController } from '../controllers/infrastructureWebhookController.js';
import { malwareEventSchema } from '../validators/platformValidator.js';

export const platformRoutes = Router();
platformRoutes.post(
  '/registrations',
  authRateLimit,
  validate(registrationSchema),
  platformController.register,
);
platformRoutes.post(
  '/email-verifications',
  authRateLimit,
  validate(verificationSchema),
  platformController.verifyEmail,
);
platformRoutes.post(
  '/owner-activations',
  authRateLimit,
  validate(ownerActivationSchema),
  platformController.activateOwner,
);
platformRoutes.get(
  '/provisioning/:jobId',
  validate(provisioningStatusSchema),
  platformController.provisioningStatus,
);
platformRoutes.post(
  '/invitations/accept',
  authRateLimit,
  validate(invitationAcceptanceSchema),
  invitationController.accept,
);
platformRoutes.post(
  '/webhooks/malware',
  validate(malwareEventSchema),
  infrastructureWebhookController.malware,
);
