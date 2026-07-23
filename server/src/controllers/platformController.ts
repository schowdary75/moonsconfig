import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../helpers/response.js';
import { platformRegistrationService } from '../services/platformRegistrationService.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { env } from '../config/env.js';
import { timingSafeEqual } from 'node:crypto';
import { platformOpsService } from '../services/platformOpsService.js';
import { onboardingService } from '../services/onboardingService.js';

function safeSecretMatch(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const platformController = {
  register: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (env.nodeEnv === 'production' && !env.publicRegistrationEnabled) {
        throw new AppError(503, 'Public registration is not enabled yet', 'REGISTRATION_NOT_READY');
      }
      sendSuccess(
        response,
        await platformRegistrationService.register(
          request.body,
          request.ip,
          request.header('user-agent'),
        ),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
  verifyEmail: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformRegistrationService.verifyEmail(request.body.token));
    } catch (error) {
      next(error);
    }
  },
  activateOwner: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(
        response,
        await platformRegistrationService.activateOwner(request.body.token, request.body.password, {
          acceptedTerms: request.body.acceptedTerms,
          acceptedPrivacy: request.body.acceptedPrivacy,
          acceptedDpa: request.body.acceptedDpa,
          ipAddress: request.ip,
          userAgent: request.header('user-agent'),
        }),
        202,
      );
    } catch (error) {
      next(error);
    }
  },
  provisioningStatus: async (request: Request, response: Response, next: NextFunction) => {
    try {
      sendSuccess(response, await platformRegistrationService.status(String(request.params.jobId)));
    } catch (error) {
      next(error);
    }
  },
  publicTenantConfig: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (env.nodeEnv === 'production') {
        const originSecret = request.header('x-moons-origin-secret') || '';
        if (
          !env.aws.originSharedSecret ||
          !safeSecretMatch(env.aws.originSharedSecret, originSecret)
        ) {
          throw new AppError(403, 'Public origin authentication failed', 'ORIGIN_AUTH_FAILED');
        }
      }
      const host = String(
        request.headers['x-moons-original-host'] ||
          request.headers['x-forwarded-host'] ||
          request.headers.host ||
          '',
      )
        .split(',')[0]!
        .trim()
        .toLowerCase()
        .replace(/:\d+$/, '');
      if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)) {
        throw new AppError(400, 'Invalid public hostname', 'INVALID_HOST');
      }
      const domain = await platformPrisma.domain.findFirst({
        where: { hostname: host, status: 'active', tenant: { status: 'active' } },
        include: {
          tenant: {
            include: { trial: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 5 } },
          },
        },
      });
      if (!domain) throw new AppError(404, 'Company site not found', 'TENANT_DOMAIN_NOT_FOUND');
      const distributionTenant = request.header('x-moons-distribution-tenant');
      if (
        env.nodeEnv === 'production' &&
        domain.providerTenantId &&
        distributionTenant !== domain.providerTenantId
      ) {
        throw new AppError(403, 'Domain routing identity does not match', 'DOMAIN_ROUTE_MISMATCH');
      }
      const now = new Date();
      const trialActive = Boolean(
        domain.tenant.trial && !domain.tenant.trial.endedAt && domain.tenant.trial.endsAt > now,
      );
      const subscription = domain.tenant.subscriptions.find(
        (item) =>
          item.status === 'active' && (!item.currentPeriodEnd || item.currentPeriodEnd > now),
      );
      sendSuccess(response, {
        company: { id: domain.tenant.id, name: domain.tenant.name, slug: domain.tenant.slug },
        domain: { hostname: domain.hostname, kind: domain.kind },
        currency: domain.tenant.currency,
        timezone: domain.tenant.timezone,
        planCode: trialActive ? 'enterprise' : (subscription?.planCode ?? null),
        noindex: trialActive || !subscription,
        available: trialActive || Boolean(subscription),
      });
    } catch (error) {
      next(error);
    }
  },
  pendingSupportAccess: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.auth?.tenantId)
        throw new AppError(401, 'Company workspace required', 'TENANT_REQUIRED');
      sendSuccess(response, await platformOpsService.pendingAccess(request.auth.tenantId));
    } catch (error) {
      next(error);
    }
  },
  approveSupportAccess: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.auth?.tenantId || !request.auth.platformUserId)
        throw new AppError(401, 'Company identity required', 'TENANT_REQUIRED');
      sendSuccess(
        response,
        await platformOpsService.approveAccess(
          request.auth.tenantId,
          String(request.params.id),
          request.auth.platformUserId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  advanceOnboarding: async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.auth?.tenantId || !request.auth.platformUserId)
        throw new AppError(401, 'Company identity required', 'TENANT_REQUIRED');
      sendSuccess(
        response,
        await onboardingService.advance(
          request.auth.tenantId,
          request.auth.platformUserId,
          request.body.completedStep,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
};
