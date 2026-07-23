import { Router } from 'express';
import { screenExportController } from '../controllers/screenExportController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { screenExportRateLimit } from '../middlewares/rateLimit.js';
import { tenantScope } from '../middlewares/tenantScope.js';
import { validate } from '../middlewares/validate.js';
import { screenExportSchema } from '../validators/platformValidator.js';

export const screenExportRoutes = Router();

screenExportRoutes.post(
  '/',
  authenticate,
  tenantScope,
  authorize('admin'),
  screenExportRateLimit,
  validate(screenExportSchema),
  screenExportController.create,
);
