export type PlatformOperatorRole = 'support' | 'billing' | 'security' | 'platform_admin';
export type PlatformCapability =
  'workspace_read' | 'provisioning' | 'billing' | 'identity_security' | 'lifecycle';

const permissions: Record<PlatformOperatorRole, ReadonlySet<PlatformCapability>> = {
  support: new Set(['workspace_read', 'provisioning']),
  billing: new Set(['workspace_read', 'billing']),
  security: new Set(['workspace_read', 'identity_security']),
  platform_admin: new Set([
    'workspace_read',
    'provisioning',
    'billing',
    'identity_security',
    'lifecycle',
  ]),
};

export function operatorCan(role: PlatformOperatorRole, capability: PlatformCapability) {
  return permissions[role].has(capability);
}

export function confirmationMatches(expected: string, actual: string) {
  return actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

export function recordIsFresh(actual: Date, expected: string) {
  const parsed = new Date(expected);
  return Number.isFinite(parsed.getTime()) && actual.getTime() === parsed.getTime();
}

export function billingMayActivateWorkspace(administrativelySuspendedAt: Date | null | undefined) {
  return !administrativelySuspendedAt;
}

export function validateCatalogHierarchy(
  plans: Array<{
    code: string;
    includedSeats: number;
    maxSeats: number | null;
    storageBytes: bigint | number | string;
    monthlyPricePaise: number | null;
    annualPricePaise: number | null;
    entitlements: Array<{ featureKey: string; enabled: boolean }>;
  }>,
) {
  const byCode = new Map(plans.map((plan) => [plan.code, plan]));
  for (const code of ['starter', 'business', 'enterprise']) {
    const plan = byCode.get(code);
    if (!plan) return { valid: false, error: `missing:${code}` } as const;
    if (
      plan.includedSeats < 1 ||
      (plan.maxSeats !== null && plan.maxSeats < plan.includedSeats) ||
      BigInt(plan.storageBytes) < 1n
    )
      return { valid: false, error: `limits:${code}` } as const;
    if (code !== 'enterprise' && (!plan.monthlyPricePaise || !plan.annualPricePaise))
      return { valid: false, error: `prices:${code}` } as const;
  }
  const enabled = (code: string) =>
    new Set(
      byCode
        .get(code)!
        .entitlements.filter((item) => item.enabled)
        .map((item) => item.featureKey),
    );
  const starter = enabled('starter');
  const business = enabled('business');
  const enterprise = enabled('enterprise');
  for (const feature of starter)
    if (!business.has(feature))
      return { valid: false, error: `business_missing:${feature}` } as const;
  for (const feature of business)
    if (!enterprise.has(feature))
      return { valid: false, error: `enterprise_missing:${feature}` } as const;
  return { valid: true } as const;
}
