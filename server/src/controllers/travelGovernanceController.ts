import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import {
  listMayaKillSwitches,
  reviewMayaAction,
  setMayaKillSwitch,
  incidentReceiptForReview,
} from '../services/mayaActionReviewService.js';

function staffId(request: Request) {
  if (!request.auth || request.auth.principalType !== 'crm_user') {
    throw new AppError(403, 'Staff authentication required', 'FORBIDDEN');
  }
  return request.auth.userId;
}

export const travelGovernanceController = {
  incidentReceipt: async (request: Request, response: Response, next: NextFunction) => {
    try {
      staffId(request);
      sendSuccess(response, await incidentReceiptForReview(String(request.params.proposalId)));
    } catch (error) {
      next(error);
    }
  },
  review: async (request: Request, response: Response, next: NextFunction) => {
    try {
      const reviewerId = staffId(request);
      sendSuccess(
        response,
        await reviewMayaAction({
          proposalId: String(request.params.proposalId),
          decision: request.body.decision,
          reason: request.body.reason,
          reviewerId,
          recentMfa: true,
        }),
      );
    } catch (error) {
      next(error);
    }
  },
  killSwitches: async (request: Request, response: Response, next: NextFunction) => {
    try {
      staffId(request);
      sendSuccess(response, await listMayaKillSwitches());
    } catch (error) {
      next(error);
    }
  },
  setKillSwitch: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await setMayaKillSwitch({ ...request.body, actorId: staffId(request) }),
      );
    } catch (error) {
      next(error);
    }
  },
};
