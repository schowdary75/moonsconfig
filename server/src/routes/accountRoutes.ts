import { Router } from 'express';
import { accountController } from '../controllers/accountController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { requireRecentMfa } from '../middlewares/tenantScope.js';
import { validate } from '../middlewares/validate.js';
import { accountDeletionSchema, exportIdSchema } from '../validators/platformValidator.js';

export const accountRoutes = Router();
accountRoutes.use(authenticate, authorize('admin'));
accountRoutes.post('/exports', requireRecentMfa(), accountController.requestExport);
accountRoutes.get('/exports/:id', validate(exportIdSchema), accountController.getExport);
accountRoutes.get(
  '/exports/:id/download',
  requireRecentMfa(),
  validate(exportIdSchema),
  accountController.downloadExport,
);
accountRoutes.post(
  '/deletion',
  requireRecentMfa(),
  validate(accountDeletionSchema),
  accountController.requestDeletion,
);
accountRoutes.delete('/deletion', requireRecentMfa(), accountController.cancelDeletion);
