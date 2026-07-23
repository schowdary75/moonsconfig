import { COMMERCIAL_PLANS, FEATURE_KEYS, type PlanCode } from '../constants/commercialPlans.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { validateCatalogHierarchy } from './platformBusinessPolicy.js';

const quotaKeys = ['staff_seats', 'storage_bytes', 'domains', 'exports', 'communications'] as const;

function snapshot(plan: any) {
  return {
    planVersionId: plan.id,
    code: plan.code,
    name: plan.name,
    includedSeats: plan.includedSeats,
    maxSeats: plan.maxSeats,
    storageBytes: String(plan.storageBytes),
    monthlyPricePaise: plan.monthlyPricePaise,
    annualPricePaise: plan.annualPricePaise,
    extraSeatPricePaise: plan.extraSeatPricePaise,
    features: plan.entitlements
      .filter((item: any) => item.enabled && FEATURE_KEYS.includes(item.featureKey))
      .map((item: any) => item.featureKey),
    quotas: Object.fromEntries(
      plan.entitlements
        .filter((item: any) => item.enabled && quotaKeys.includes(item.featureKey))
        .map((item: any) => [
          item.featureKey,
          item.limitValue === null ? null : String(item.limitValue),
        ]),
    ),
    catalogVersion: plan.catalog.version,
  };
}

function validatePlans(plans: Array<any>) {
  const result = validateCatalogHierarchy(plans);
  if (!result.valid)
    throw new AppError(400, `Catalog validation failed: ${result.error}`, 'CATALOG_INVALID');
}

export const planCatalogService = {
  async ensureVersionOne(operatorId: string) {
    const existing = await platformPrisma.planCatalogVersion.findFirst({
      where: { status: 'published' },
      include: { plans: { include: { entitlements: true, catalog: true } } },
      orderBy: { version: 'desc' },
    });
    if (existing) return existing;
    return platformPrisma.$transaction(async (tx) => {
      const concurrent = await tx.planCatalogVersion.findFirst({
        where: { status: 'published' },
        include: { plans: { include: { entitlements: true, catalog: true } } },
      });
      if (concurrent) return concurrent;
      const catalog = await tx.planCatalogVersion.create({
        data: {
          version: 1,
          status: 'published',
          notes: 'Initial catalog seeded from the launch commercial plan definitions.',
          createdById: operatorId,
          publishedById: operatorId,
          publishedAt: new Date(),
        },
      });
      for (const code of ['starter', 'business', 'enterprise'] as const) {
        const plan = COMMERCIAL_PLANS[code];
        await tx.planVersion.create({
          data: {
            catalogVersionId: catalog.id,
            code,
            name: plan.name,
            description: plan.description,
            includedSeats: plan.includedSeats,
            maxSeats: plan.maxSeats,
            storageBytes: BigInt(plan.storageBytes),
            monthlyPricePaise: plan.monthlyPricePaise,
            annualPricePaise: plan.annualPricePaise,
            extraSeatPricePaise: plan.extraSeatPricePaise,
            entitlements: {
              create: [
                ...plan.features.map((featureKey) => ({ featureKey, enabled: true })),
                {
                  featureKey: 'staff_seats',
                  enabled: true,
                  limitValue: BigInt(plan.maxSeats ?? 0),
                },
                {
                  featureKey: 'storage_bytes',
                  enabled: true,
                  limitValue: BigInt(plan.storageBytes),
                },
              ],
            },
          },
        });
      }
      const result = await tx.planCatalogVersion.findUniqueOrThrow({
        where: { id: catalog.id },
        include: { plans: { include: { entitlements: true, catalog: true } } },
      });
      const enterprise = result.plans.find((plan) => plan.code === 'enterprise')!;
      await tx.trial.updateMany({
        where: { planVersionId: null },
        data: { planVersionId: enterprise.id, entitlementSnapshot: snapshot(enterprise) },
      });
      for (const plan of result.plans) {
        await tx.subscription.updateMany({
          where: { planCode: plan.code, planVersionId: null },
          data: {
            planVersionId: plan.id,
            entitlementSnapshot: snapshot(plan),
            pricingSnapshot: snapshot(plan),
          },
        });
      }
      return result;
    });
  },

  async list(operatorId: string) {
    await this.ensureVersionOne(operatorId);
    return platformPrisma.planCatalogVersion.findMany({
      include: { plans: { include: { entitlements: true }, orderBy: { code: 'asc' } } },
      orderBy: { version: 'desc' },
    });
  },

  async publishedPlan(code: PlanCode) {
    const plan = await platformPrisma.planVersion.findFirst({
      where: { code, catalog: { status: 'published' } },
      include: { entitlements: true, catalog: true },
      orderBy: { catalog: { version: 'desc' } },
    });
    return plan ? snapshot(plan) : null;
  },

  validatePlans,
  snapshot,
};
