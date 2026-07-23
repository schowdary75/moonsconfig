import type { user_wishlists_item_type } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { customerService } from '../services/customerService.js';

function customerId(request: Request) {
  if (request.auth?.principalType !== 'customer_user')
    throw new AppError(403, 'Customer authentication required', 'FORBIDDEN');
  return request.auth.userId;
}

const action =
  (handler: (request: Request) => Promise<unknown>) =>
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await handler(request));
    } catch (error) {
      next(error);
    }
  };

export const customerController = {
  travellerHub: action((request) => customerService.travellerHub(customerId(request))),
  recordProposalView: action((request) =>
    customerService.recordProposalView(
      customerId(request),
      request.params.quoteVersionId as string,
      {
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
      },
    ),
  ),
  addQuoteComment: action((request) =>
    customerService.addQuoteComment(
      customerId(request),
      request.params.quoteVersionId as string,
      request.body.body,
    ),
  ),
  acceptQuote: action((request) =>
    customerService.acceptQuote(
      customerId(request),
      request.params.quoteVersionId as string,
      request.body,
      { ipAddress: request.ip, userAgent: request.get('user-agent') },
    ),
  ),
  createTravelDocumentUpload: action((request) =>
    customerService.createTravelDocumentUpload(customerId(request), request.body),
  ),
  travelDocumentDownload: action((request) =>
    customerService.travelDocumentDownload(
      customerId(request),
      request.params.documentId as string,
    ),
  ),
  registerDevice: action((request) =>
    customerService.registerDevice(customerId(request), request.body),
  ),
  removeDevice: action((request) =>
    customerService.removeDevice(customerId(request), request.params.token as string),
  ),
  wishlist: action((request) => customerService.wishlist(customerId(request))),
  addWishlist: action((request) => customerService.addWishlist(customerId(request), request.body)),
  replaceWishlist: action((request) =>
    customerService.replaceWishlist(customerId(request), request.body.items),
  ),
  removeWishlist: action((request) =>
    customerService.removeWishlist(
      customerId(request),
      request.params.itemType as user_wishlists_item_type,
      request.params.itemId as string,
    ),
  ),
  bookings: action((request) => customerService.bookings(customerId(request))),
  cancelBooking: action((request) =>
    customerService.cancelBooking(customerId(request), Number(request.params.bookingId)),
  ),
  liveTrip: action((request) =>
    customerService.liveTrip(customerId(request), Number(request.params.bookingId)),
  ),
  createTripIncident: action((request) =>
    customerService.createTripIncident(
      customerId(request),
      Number(request.params.bookingId),
      request.body,
    ),
  ),
  createIncidentReceiptUpload: action((request) =>
    customerService.createIncidentReceiptUpload(
      customerId(request),
      Number(request.params.bookingId),
      Number(request.params.incidentId),
      request.body,
    ),
  ),
  confirmIncidentResolved: action((request) =>
    customerService.confirmIncidentResolved(
      customerId(request),
      Number(request.params.bookingId),
      Number(request.params.incidentId),
    ),
  ),
  payments: action((request) => customerService.payments(customerId(request))),
  refunds: action((request) => customerService.refunds(customerId(request))),
  escrow: action((request) => customerService.escrow(customerId(request))),
  invoices: action((request) => customerService.invoices(customerId(request))),
  invoiceByReference: action((request) =>
    customerService.invoiceByReference(
      customerId(request),
      request.params.bookingReference as string,
    ),
  ),
};
