import { Router } from 'express';
import { customerController } from '../controllers/customerController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import {
  addWishlistSchema,
  bookingIdSchema,
  createTripIncidentSchema,
  invoiceReferenceSchema,
  registerDeviceSchema,
  removeDeviceSchema,
  removeWishlistSchema,
  replaceWishlistSchema,
  proposalViewSchema,
  quoteAcceptanceSchema,
  quoteCommentSchema,
  travelDocumentIdSchema,
  travelDocumentUploadSchema,
  incidentReceiptUploadSchema,
  incidentReceiptResolutionSchema,
} from '../validators/customerValidator.js';

export const customerRoutes = Router();
customerRoutes.use(authenticate);
customerRoutes.get('/hub', customerController.travellerHub);
customerRoutes.post(
  '/quotes/:quoteVersionId/view',
  validate(proposalViewSchema),
  customerController.recordProposalView,
);
customerRoutes.post(
  '/documents/presign',
  validate(travelDocumentUploadSchema),
  customerController.createTravelDocumentUpload,
);
customerRoutes.get(
  '/documents/:documentId',
  validate(travelDocumentIdSchema),
  customerController.travelDocumentDownload,
);
customerRoutes.post(
  '/quotes/:quoteVersionId/comments',
  validate(quoteCommentSchema),
  customerController.addQuoteComment,
);
customerRoutes.post(
  '/quotes/:quoteVersionId/accept',
  validate(quoteAcceptanceSchema),
  customerController.acceptQuote,
);
customerRoutes.post('/devices', validate(registerDeviceSchema), customerController.registerDevice);
customerRoutes.delete(
  '/devices/:token',
  validate(removeDeviceSchema),
  customerController.removeDevice,
);
customerRoutes.get('/wishlist', customerController.wishlist);
customerRoutes.post('/wishlist', validate(addWishlistSchema), customerController.addWishlist);
customerRoutes.put(
  '/wishlist',
  validate(replaceWishlistSchema),
  customerController.replaceWishlist,
);
customerRoutes.delete(
  '/wishlist/:itemType/:itemId',
  validate(removeWishlistSchema),
  customerController.removeWishlist,
);
customerRoutes.get('/bookings', customerController.bookings);
customerRoutes.post(
  '/bookings/:bookingId/cancel',
  validate(bookingIdSchema),
  customerController.cancelBooking,
);
customerRoutes.get(
  '/bookings/:bookingId/live',
  validate(bookingIdSchema),
  customerController.liveTrip,
);
customerRoutes.post(
  '/bookings/:bookingId/incidents',
  validate(createTripIncidentSchema),
  customerController.createTripIncident,
);
customerRoutes.post(
  '/bookings/:bookingId/incidents/:incidentId/receipts/presign',
  validate(incidentReceiptUploadSchema),
  customerController.createIncidentReceiptUpload,
);
customerRoutes.post(
  '/bookings/:bookingId/incidents/:incidentId/resolve',
  validate(incidentReceiptResolutionSchema),
  customerController.confirmIncidentResolved,
);
customerRoutes.get('/payments', customerController.payments);
customerRoutes.get('/refunds', customerController.refunds);
customerRoutes.get('/escrow', customerController.escrow);
customerRoutes.get('/invoices', customerController.invoices);
customerRoutes.get(
  '/invoices/:bookingReference',
  validate(invoiceReferenceSchema),
  customerController.invoiceByReference,
);
