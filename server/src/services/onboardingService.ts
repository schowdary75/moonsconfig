import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';

const steps = [
  'company_profile',
  'branding',
  'communication',
  'staff',
  'import',
  'domain',
  'complete',
] as const;

export const onboardingService = {
  async advance(tenantId: string, actorId: string, completedStep: string) {
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, 'Company not found', 'TENANT_NOT_FOUND');
    if (tenant.onboardingCompletedAt)
      return { step: 'complete', completedAt: tenant.onboardingCompletedAt };
    if (completedStep !== tenant.onboardingStep) {
      throw new AppError(
        409,
        `Complete the ${tenant.onboardingStep} onboarding step first`,
        'ONBOARDING_STEP_MISMATCH',
      );
    }
    const index = steps.indexOf(completedStep as (typeof steps)[number]);
    if (index < 0) throw new AppError(400, 'Unknown onboarding step', 'INVALID_ONBOARDING_STEP');
    const next = steps[Math.min(index + 1, steps.length - 1)]!;
    const completedAt = next === 'complete' ? new Date() : null;
    const updated = await platformPrisma.tenant.update({
      where: { id: tenantId },
      data: { onboardingStep: next, onboardingCompletedAt: completedAt },
    });
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        actorId,
        action: 'onboarding.step.completed',
        target: completedStep,
        metadata: { next },
      },
    });
    return { step: updated.onboardingStep, completedAt: updated.onboardingCompletedAt };
  },
};
