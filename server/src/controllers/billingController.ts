import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { billingService } from '../services/billingService.js';
import { billingInvoiceService } from '../services/billingInvoiceService.js';

function tenantId(request: Request) {
  if (!request.auth?.tenantId)
    throw new AppError(401, 'A company workspace is required', 'TENANT_REQUIRED');
  return request.auth.tenantId;
}

export const billingController = {
  invoices: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await billingInvoiceService.list(tenantId(request)));
    } catch (error) {
      next(error);
    }
  },
  plans: (_request: Request, response: Response) => sendSuccess(response, billingService.plans()),
  current: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await billingService.current(tenantId(request)));
    } catch (error) {
      next(error);
    }
  },
  checkout: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await billingService.checkout(tenantId(request), request.body), 201);
    } catch (error) {
      next(error);
    }
  },
  change: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await billingService.change(tenantId(request), request.body));
    } catch (error) {
      next(error);
    }
  },
  cancel: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await billingService.cancel(tenantId(request), request.body.atPeriodEnd),
      );
    } catch (error) {
      next(error);
    }
  },
  webhook: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const raw = request.rawBody;
      if (!raw) throw new AppError(400, 'Webhook body is unavailable', 'INVALID_WEBHOOK');
      billingService.verifyWebhook(raw, request.header('x-razorpay-signature'));
      sendSuccess(
        response,
        await billingService.processWebhook(raw, request.header('x-razorpay-event-id')),
      );
    } catch (error) {
      next(error);
    }
  },
};
