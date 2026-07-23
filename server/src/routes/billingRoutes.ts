import { Router } from 'express';
import { billingController } from '../controllers/billingController.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { cancellationSchema, checkoutSchema } from '../validators/platformValidator.js';

export const billingRoutes = Router();
billingRoutes.get('/plans', billingController.plans);
billingRoutes.post('/webhooks/razorpay', billingController.webhook);
billingRoutes.get('/current', authenticate, billingController.current);
billingRoutes.get('/invoices', authenticate, authorize('admin'), billingController.invoices);
billingRoutes.post(
  '/checkout',
  authenticate,
  authorize('admin'),
  validate(checkoutSchema),
  billingController.checkout,
);
billingRoutes.post(
  '/change',
  authenticate,
  authorize('admin'),
  validate(checkoutSchema),
  billingController.change,
);
billingRoutes.post(
  '/cancel',
  authenticate,
  authorize('admin'),
  validate(cancellationSchema),
  billingController.cancel,
);
