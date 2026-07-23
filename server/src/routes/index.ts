import { Router } from 'express';
import { healthController } from '../controllers/healthController.js';
import { authRoutes } from './authRoutes.js';
import { userRoutes } from './userRoutes.js';
import { uploadRoutes } from './uploadRoutes.js';
import { operationRoutes } from './operationRoutes.js';
import { customerAuthRoutes } from './customerAuthRoutes.js';
import { customerRoutes } from './customerRoutes.js';
import { smsRoutes } from './smsRoutes.js';
import { voiceRoutes } from './voiceRoutes.js';
import { platformRoutes } from './platformRoutes.js';
import { billingRoutes } from './billingRoutes.js';
import { platformController } from '../controllers/platformController.js';
import { tenantRoutes } from './tenantRoutes.js';
import { authController } from '../controllers/authController.js';
import { requireFeature, tenantScope } from '../middlewares/tenantScope.js';
import { authenticate, authenticateOptional } from '../middlewares/authenticate.js';
import { accountRoutes } from './accountRoutes.js';
import { env } from '../config/env.js';
import { readinessController } from '../controllers/readinessController.js';
import { platformOpsRoutes } from './platformOpsRoutes.js';
import { screenExportRoutes } from './screenExportRoutes.js';
import { travelGovernanceRoutes } from './travelGovernanceRoutes.js';
import { AppError } from '../errors/AppError.js';
import { resolveTenantRuntime, runWithTenant } from '../config/tenantContext.js';
import { recordVendorResponseByCode } from '../services/incidentRecoveryService.js';

export const apiRoutes = Router();
apiRoutes.get('/health', healthController);
apiRoutes.get('/readiness', readinessController);
apiRoutes.get('/me', authenticate, authController.me);
apiRoutes.get('/public/tenant-config', platformController.publicTenantConfig);
apiRoutes.get('/public/incident-vendor-response', async (request, response, next) => {
  try {
    const code = String(request.query.code ?? '').trim();
    const decision = String(request.query.decision ?? '').trim();
    const tenantId = String(request.query.tenant ?? '').trim();
    if (!/^[A-F0-9]{12}$/.test(code) || !['available', 'unavailable'].includes(decision)) {
      throw new AppError(400, 'Invalid incident response link', 'INVALID_INCIDENT_RESPONSE');
    }
    const submit = () => recordVendorResponseByCode(code, decision as 'available' | 'unavailable');
    const result = tenantId
      ? await resolveTenantRuntime(tenantId).then((context) => runWithTenant(context, submit))
      : await submit();
    response
      .status(200)
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>MooNs Travel response</title><main style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:1rem"><h1>Response recorded</h1><p>Thank you. MooNs Travel has recorded that you are <strong>${decision}</strong>.</p><p>You may close this page.</p></main>`,
      );
    void result;
  } catch (error) {
    next(error);
  }
});
apiRoutes.use('/platform', platformRoutes);
apiRoutes.use('/platform-ops', platformOpsRoutes);
apiRoutes.use('/tenants', tenantRoutes);
apiRoutes.use('/billing', billingRoutes);
apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/account', accountRoutes);
apiRoutes.use('/screen-exports', screenExportRoutes);
apiRoutes.use('/travel-governance', authenticate, tenantScope, travelGovernanceRoutes);
apiRoutes.use('/customer-auth', customerAuthRoutes);
apiRoutes.use('/customer', authenticate, tenantScope, customerRoutes);
apiRoutes.use('/users', authenticate, tenantScope, requireFeature('users'), userRoutes);
apiRoutes.use('/uploads', authenticate, tenantScope, requireFeature('assets'), uploadRoutes);
apiRoutes.use(
  '/operations',
  env.legacyRoutingEnabled ? authenticateOptional : authenticate,
  tenantScope,
  operationRoutes,
);
apiRoutes.use(
  '/sms',
  env.legacyRoutingEnabled ? authenticateOptional : authenticate,
  tenantScope,
  requireFeature('sms'),
  smsRoutes,
);
apiRoutes.use('/voice', authenticate, tenantScope, requireFeature('telephony'), voiceRoutes);
