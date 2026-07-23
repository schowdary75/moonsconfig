export const PLAN_CODES = ['starter', 'business', 'enterprise'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const BILLING_INTERVALS = ['monthly', 'annual'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const FEATURE_KEYS = [
  'dashboard',
  'mission_control',
  'command_center',
  'analytics',
  'sales_pipeline',
  'clients',
  'leads',
  'followups',
  'quotes',
  'bookings',
  'escrow',
  'refunds',
  'invoices',
  'journey_manager',
  'incident_desk',
  'trending',
  'packages',
  'themes',
  'catalog',
  'stays',
  'cars',
  'flights',
  'cruises',
  'destinations',
  'experiences',
  'route_map',
  'assets',
  'visual_ai',
  'vendors',
  'approvals',
  'promotions',
  'banners',
  'promo_codes',
  'travelhub_cms',
  'visa_cms',
  'campaigns',
  'automations',
  'audiences',
  'seo',
  'careers',
  'email_templates',
  'users',
  'security_center',
  'customer_portal',
  'custom_domain',
  'white_label',
  'custom_roles',
  'data_export',
  'api_access',
  'webhooks',
  'sso',
  'ip_allowlist',
  'telephony',
  'sms',
  'call_recordings',
  'multi_brand',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type QuotaKey = 'staff_seats' | 'storage_bytes';

const STARTER_FEATURES: FeatureKey[] = [
  'dashboard',
  'sales_pipeline',
  'clients',
  'leads',
  'followups',
  'quotes',
  'bookings',
  'packages',
  'themes',
  'destinations',
  'route_map',
  'email_templates',
  'customer_portal',
  'data_export',
  'users',
  'security_center',
];

const BUSINESS_ADDITIONS: FeatureKey[] = [
  'command_center',
  'analytics',
  'escrow',
  'refunds',
  'invoices',
  'trending',
  'catalog',
  'stays',
  'cars',
  'flights',
  'cruises',
  'experiences',
  'assets',
  'vendors',
  'approvals',
  'promotions',
  'banners',
  'promo_codes',
  'campaigns',
  'automations',
  'audiences',
  'custom_domain',
  'white_label',
  'custom_roles',
  'webhooks',
];

export interface CommercialPlan {
  code: PlanCode;
  name: string;
  description: string;
  monthlyPricePaise: number | null;
  annualPricePaise: number | null;
  includedSeats: number;
  maxSeats: number | null;
  extraSeatPricePaise: number | null;
  storageBytes: number;
  features: readonly FeatureKey[];
  support: string;
}

export const COMMERCIAL_PLANS: Record<PlanCode, CommercialPlan> = {
  starter: {
    code: 'starter',
    name: 'Starter',
    description: 'Core CRM, proposals and bookings for small travel teams.',
    monthlyPricePaise: 149_900,
    annualPricePaise: 1_499_000,
    includedSeats: 2,
    maxSeats: 5,
    extraSeatPricePaise: 49_900,
    storageBytes: 5 * 1024 ** 3,
    features: STARTER_FEATURES,
    support: 'Email support with a two-business-day target',
  },
  business: {
    code: 'business',
    name: 'Business',
    description: 'The complete operating suite for growing agencies.',
    monthlyPricePaise: 499_900,
    annualPricePaise: 4_999_000,
    includedSeats: 10,
    maxSeats: 50,
    extraSeatPricePaise: 39_900,
    storageBytes: 50 * 1024 ** 3,
    features: Array.from(new Set([...STARTER_FEATURES, ...BUSINESS_ADDITIONS])),
    support: 'Priority support with a one-business-day target',
  },
  enterprise: {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Advanced security, AI, communications and tailored operations.',
    monthlyPricePaise: 1_499_900,
    annualPricePaise: null,
    includedSeats: 25,
    maxSeats: null,
    extraSeatPricePaise: null,
    storageBytes: 250 * 1024 ** 3,
    features: FEATURE_KEYS,
    support: 'Dedicated onboarding, account management and contractual SLA',
  },
};

export function calculatePlanAmount(
  planCode: Exclude<PlanCode, 'enterprise'>,
  interval: BillingInterval,
  seats: number,
) {
  const plan = COMMERCIAL_PLANS[planCode];
  if (seats < 1 || (plan.maxSeats !== null && seats > plan.maxSeats)) {
    throw new RangeError(`Seat count is outside the ${plan.name} plan limits`);
  }
  const base = interval === 'annual' ? plan.annualPricePaise! : plan.monthlyPricePaise!;
  const extraSeats = Math.max(0, seats - plan.includedSeats);
  const multiplier = interval === 'annual' ? 10 : 1;
  return base + extraSeats * plan.extraSeatPricePaise! * multiplier;
}

export function publicPlanCatalog() {
  return PLAN_CODES.map((code) => {
    const plan = COMMERCIAL_PLANS[code];
    return {
      ...plan,
      features: [...plan.features],
      storageBytes: String(plan.storageBytes),
      trialDays: 7,
      gstExclusive: true,
    };
  });
}
