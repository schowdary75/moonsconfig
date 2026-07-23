import { Router } from 'express';
import { travelGovernanceController } from '../controllers/travelGovernanceController.js';
import { authorize } from '../middlewares/authenticate.js';
import { requireRecentMfa } from '../middlewares/tenantScope.js';
import { validate } from '../middlewares/validate.js';
import {
  mayaKillSwitchSchema,
  reviewMayaActionSchema,
} from '../validators/travelGovernanceValidator.js';

export const travelGovernanceRoutes = Router();
travelGovernanceRoutes.get(
  '/kill-switches',
  authorize('admin', 'editor', 'approver'),
  travelGovernanceController.killSwitches,
);
travelGovernanceRoutes.put(
  '/kill-switches',
  authorize('admin'),
  requireRecentMfa(),
  validate(mayaKillSwitchSchema),
  travelGovernanceController.setKillSwitch,
);
travelGovernanceRoutes.post(
  '/actions/:proposalId/review',
  authorize('admin', 'editor', 'approver'),
  requireRecentMfa(),
  validate(reviewMayaActionSchema),
  travelGovernanceController.review,
);
travelGovernanceRoutes.get(
  '/actions/:proposalId/incident-receipt',
  authorize('admin', 'editor', 'approver'),
  travelGovernanceController.incidentReceipt,
);
