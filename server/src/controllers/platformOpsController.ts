import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../helpers/response.js';
import { operatorAuthService } from '../services/operatorAuthService.js';
import { platformOpsService } from '../services/platformOpsService.js';
import { platformBusinessService } from '../services/platformBusinessService.js';
import { platformAdminService } from '../services/platformAdminService.js';
import { platformPrisma } from '../config/platformPrisma.js';

function operatorId(request: Request) {
  if (!request.operator)
    throw new AppError(401, 'Operator authentication required', 'OPERATOR_AUTH_REQUIRED');
  return request.operator.id;
}

function operatorActor(request: Request) {
  if (!request.operator)
    throw new AppError(401, 'Operator authentication required', 'OPERATOR_AUTH_REQUIRED');
  return {
    id: request.operator.id,
    role: request.operator.role,
    requestId: request.requestId,
    ipAddress: request.ip,
  };
}

async function governedExisting<T>(
  request: Request,
  action: string,
  target: string,
  work: () => Promise<T>,
) {
  const actor = operatorActor(request);
  const key = request.body?.idempotencyKey as string | undefined;
  if (!key) throw new AppError(400, 'Idempotency key is required', 'IDEMPOTENCY_KEY_REQUIRED');
  const existing = await platformPrisma.governedOperation.findUnique({
    where: { idempotencyKey: key },
  });
  if (existing) {
    if (
      existing.operatorId !== actor.id ||
      existing.action !== action ||
      existing.target !== target
    )
      throw new AppError(
        409,
        'Idempotency key was used for another operation',
        'IDEMPOTENCY_CONFLICT',
      );
    if (existing.result !== null) return existing.result as T;
    throw new AppError(409, 'Operation is already in progress', 'OPERATION_IN_PROGRESS');
  }
  await platformPrisma.governedOperation.create({
    data: { idempotencyKey: key, operatorId: actor.id, action, target },
  });
  try {
    const result = await work();
    const safe = JSON.parse(
      JSON.stringify(result, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );
    await platformPrisma.governedOperation.update({
      where: { idempotencyKey: key },
      data: { result: safe },
    });
    return result;
  } catch (error) {
    await platformPrisma.governedOperation
      .delete({ where: { idempotencyKey: key } })
      .catch(() => undefined);
    throw error;
  }
}

export const platformOpsController = {
  activateOperator: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await operatorAuthService.activateInvitation(request.body.token, request.body.password),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  verifyOperatorActivation: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await operatorAuthService.verifyActivation(request.body.operatorId, request.body.code),
      );
    } catch (error) {
      next(error);
    }
  },
  login: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await operatorAuthService.login(
          request.body.email,
          request.body.password,
          request.body.code,
          {
            ipAddress: request.ip,
            userAgent: request.header('user-agent'),
          },
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  stepUp: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.operator)
        throw new AppError(401, 'Operator authentication required', 'OPERATOR_AUTH_REQUIRED');
      sendSuccess(
        response,
        await operatorAuthService.stepUp(
          request.operator.id,
          request.operator.sessionId,
          request.body.code,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  logout: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.operator)
        throw new AppError(401, 'Operator authentication required', 'OPERATOR_AUTH_REQUIRED');
      sendSuccess(
        response,
        await operatorAuthService.logout(request.operator.id, request.operator.sessionId),
      );
    } catch (error) {
      next(error);
    }
  },
  dashboard: async (_request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformOpsService.dashboard());
    } catch (error) {
      next(error);
    }
  },
  tenants: async (_request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformOpsService.tenants());
    } catch (error) {
      next(error);
    }
  },
  retryProvisioning: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformOpsService.retryProvisioning(String(request.params.id), operatorId(request)),
      );
    } catch (error) {
      next(error);
    }
  },
  requestAccess: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformOpsService.requestAccess(
          operatorId(request),
          String(request.params.id),
          request.body,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  readiness: async (_request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformOpsService.readiness());
    } catch (error) {
      next(error);
    }
  },
  reconcileBilling: async (_request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformOpsService.reconcileBilling());
    } catch (error) {
      next(error);
    }
  },
  migrations: async (_request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformOpsService.migrations());
    } catch (error) {
      next(error);
    }
  },
  createMigration: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformOpsService.createMigration(
          request.body.migrationName,
          request.body.targetVersion,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  advanceMigration: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformOpsService.advanceMigration(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  },
  retryMigration: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformOpsService.retryMigration(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  },
  restoreDrill: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformOpsService.restoreDrill(request.body.artifactId));
    } catch (error) {
      next(error);
    }
  },
  overview: async (_request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.overview());
    } catch (error) {
      next(error);
    }
  },
  workspaces: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformBusinessService.workspaces(request.query, operatorActor(request).role),
      );
    } catch (error) {
      next(error);
    }
  },
  workspace: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformBusinessService.workspace(
          String(request.params.tenantId),
          operatorActor(request).role,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  memberships: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.memberships(request.query));
    } catch (error) {
      next(error);
    }
  },
  subscriptions: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.subscriptions(request.query));
    } catch (error) {
      next(error);
    }
  },
  invoices: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.invoices(request.query));
    } catch (error) {
      next(error);
    }
  },
  paymentEvents: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.paymentEvents(request.query));
    } catch (error) {
      next(error);
    }
  },
  accessGrants: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.accessGrants(request.query));
    } catch (error) {
      next(error);
    }
  },
  auditEvents: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.auditEvents(request.query));
    } catch (error) {
      next(error);
    }
  },
  securityEvents: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.securityEvents(request.query));
    } catch (error) {
      next(error);
    }
  },
  workspaceSecurity: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.workspaceSecurity(request.query));
    } catch (error) {
      next(error);
    }
  },
  provisioningJobs: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.provisioningJobs(request.query));
    } catch (error) {
      next(error);
    }
  },
  migrationRollouts: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.migrationRollouts(request.query));
    } catch (error) {
      next(error);
    }
  },
  backups: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.backups(request.query));
    } catch (error) {
      next(error);
    }
  },
  lifecycle: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformBusinessService.lifecycle(request.query));
    } catch (error) {
      next(error);
    }
  },
  suspendWorkspace: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.workspace.suspend',
          String(request.params.tenantId),
          () =>
            platformBusinessService.suspendWorkspace(
              String(request.params.tenantId),
              request.body,
              operatorActor(request),
            ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  reactivateWorkspace: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.workspace.reactivate',
          String(request.params.tenantId),
          () =>
            platformBusinessService.reactivateWorkspace(
              String(request.params.tenantId),
              request.body,
              operatorActor(request),
            ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  updateMembership: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.membership.update',
          String(request.params.membershipId),
          () =>
            platformBusinessService.updateMembership(
              String(request.params.tenantId),
              String(request.params.membershipId),
              request.body,
              operatorActor(request),
            ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  revokeMemberSessions: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.membership.revoke_sessions',
          String(request.params.membershipId),
          () =>
            platformBusinessService.revokeSessions(
              String(request.params.tenantId),
              String(request.params.membershipId),
              request.body,
              operatorActor(request),
            ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  transferOwnership: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.membership.transfer_ownership',
          String(request.params.tenantId),
          () =>
            platformBusinessService.transferOwnership(
              String(request.params.tenantId),
              request.body,
              operatorActor(request),
            ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  resendInvitation: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.invitation.resend',
          String(request.params.invitationId),
          () =>
            platformBusinessService.resendInvitation(
              String(request.params.tenantId),
              String(request.params.invitationId),
              request.body,
              operatorActor(request),
            ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  revokeInvitation: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.invitation.revoke',
          String(request.params.invitationId),
          () =>
            platformBusinessService.revokeInvitation(
              String(request.params.tenantId),
              String(request.params.invitationId),
              request.body,
              operatorActor(request),
            ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  governedBillingReconcile: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(request, 'ops.billing.reconcile', 'razorpay', () =>
          platformBusinessService.reconcileBilling(request.body, operatorActor(request)),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  retryInvoiceSync: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.invoice.retry_sync',
          String(request.params.invoiceId),
          () =>
            platformBusinessService.retryInvoiceSync(
              String(request.params.invoiceId),
              request.body,
              operatorActor(request),
            ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  invoiceDownload: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformBusinessService.invoiceDownload(String(request.params.invoiceId)),
      );
    } catch (error) {
      next(error);
    }
  },
  requestAccessGrant: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(request, 'ops.access.request', String(request.params.tenantId), () =>
          platformBusinessService.requestAccessGrant(
            String(request.params.tenantId),
            request.body,
            operatorActor(request),
          ),
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  revokeAccessGrant: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(request, 'ops.access.revoke', String(request.params.grantId), () =>
          platformBusinessService.revokeAccessGrant(
            String(request.params.grantId),
            request.body,
            operatorActor(request),
          ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  scheduleDeletion: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.deletion.schedule',
          String(request.params.tenantId),
          () =>
            platformBusinessService.scheduleDeletion(
              String(request.params.tenantId),
              request.body,
              operatorActor(request),
            ),
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  cancelDeletion: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await governedExisting(
          request,
          'ops.deletion.cancel',
          String(request.params.tenantId),
          () =>
            platformBusinessService.cancelDeletion(
              String(request.params.tenantId),
              request.body,
              operatorActor(request),
            ),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  createWorkspace: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.createWorkspace(request.body, operatorActor(request)),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
  updateWorkspace: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.updateWorkspace(
          String(request.params.tenantId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  resetOnboarding: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.resetOnboarding(
          String(request.params.tenantId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  inviteMember: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.inviteMember(
          String(request.params.tenantId),
          request.body,
          operatorActor(request),
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  removeMembership: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.removeMembership(
          String(request.params.tenantId),
          String(request.params.membershipId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  resetMemberMfa: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.resetMemberMfa(
          String(request.params.tenantId),
          String(request.params.membershipId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  manageTrial: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.manageTrial(
          String(request.params.tenantId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  createManualSubscription: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.createManualSubscription(request.body, operatorActor(request)),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  createProviderCheckout: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.createProviderCheckout(request.body, operatorActor(request)),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  changeSubscription: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.changeSubscription(
          String(request.params.subscriptionId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  createInvoice: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.createInvoice(request.body, operatorActor(request)),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  invoiceAction: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.invoiceAction(
          String(request.params.invoiceId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  updateInvoice: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.updateInvoice(
          String(request.params.invoiceId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  operators: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformAdminService.operators(operatorId(request)));
    } catch (error) {
      next(error);
    }
  },
  inviteOperator: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.inviteOperator(request.body, operatorActor(request)),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  updateOperator: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.updateOperator(
          String(request.params.operatorId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  catalogs: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformAdminService.catalogs(operatorActor(request)));
    } catch (error) {
      next(error);
    }
  },
  createCatalog: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.createCatalog(request.body, operatorActor(request)),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  publishCatalog: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.publishCatalog(
          String(request.params.catalogId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  triggerBackup: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.triggerBackup(
          String(request.params.tenantId),
          request.body,
          operatorActor(request),
        ),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
  retryExport: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.retryExport(
          String(request.params.exportId),
          request.body,
          operatorActor(request),
        ),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
  requestDomain: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.requestDomain(
          String(request.params.tenantId),
          request.body,
          operatorActor(request),
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  domainAction: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.domainAction(
          String(request.params.tenantId),
          String(request.params.domainId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  configureSso: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.configureSso(
          String(request.params.tenantId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  putProviderCredential: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.putProviderCredential(
          String(request.params.tenantId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  removeProviderCredential: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.removeProviderCredential(
          String(request.params.tenantId),
          String(request.params.provider),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  createExport: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.createExport(
          String(request.params.tenantId),
          request.body,
          operatorActor(request),
        ),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
  retryDeletion: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.retryDeletion(
          String(request.params.deletionId),
          request.body,
          operatorActor(request),
        ),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
  createMigrationDraft: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.createMigration(request.body, operatorActor(request)),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
  migrationAction: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.migrationAction(
          String(request.params.rolloutId),
          request.body,
          operatorActor(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  provisioningAction: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformAdminService.provisioningAction(
          String(request.params.jobId),
          request.body,
          operatorActor(request),
        ),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
};
