import { logger } from '../../logger/index.js';

/**
 * Travel-insurance attach — a high-margin add-on and a genuine traveller
 * protection that was entirely absent. `estimatePremium` gives an indicative
 * price for display; `InsuranceProvider` is the seam for live, bindable quotes.
 *
 * Env for a live provider:
 *   INSURANCE_PROVIDER
 *   INSURANCE_API_BASE_URL
 *   INSURANCE_API_KEY
 */

export type CoverageTier = 'basic' | 'standard' | 'premium';

export interface PremiumEstimate {
  tier: CoverageTier;
  premiumInr: number;
  coverageInr: number;
  indicative: true;
}

const TIER = {
  basic: { ratePerDay: 40, coverageInr: 500_000 },
  standard: { ratePerDay: 75, coverageInr: 2_000_000 },
  premium: { ratePerDay: 130, coverageInr: 5_000_000 },
} as const;

// Older travellers cost more to cover; a simple, transparent loading factor.
function ageLoading(ageBand: 'under60' | '60to70' | 'over70'): number {
  return ageBand === 'over70' ? 2.0 : ageBand === '60to70' ? 1.5 : 1.0;
}

/** Indicative premium for display — never presented as a bound, final quote. */
export function estimatePremium(params: {
  tier: CoverageTier;
  days: number;
  travelers: number;
  ageBand?: 'under60' | '60to70' | 'over70';
}): PremiumEstimate {
  const { tier, days, travelers } = params;
  if (days <= 0 || travelers <= 0) throw new Error('Days and travellers must be positive.');
  const cfg = TIER[tier];
  const premium = Math.round(
    cfg.ratePerDay * days * travelers * ageLoading(params.ageBand ?? 'under60'),
  );
  return { tier, premiumInr: premium, coverageInr: cfg.coverageInr, indicative: true };
}

export function estimateAllTiers(params: {
  days: number;
  travelers: number;
  ageBand?: 'under60' | '60to70' | 'over70';
}): PremiumEstimate[] {
  return (['basic', 'standard', 'premium'] as CoverageTier[]).map((tier) =>
    estimatePremium({ tier, ...params }),
  );
}

export interface InsuranceQuote {
  ok: boolean;
  provider: string;
  quoteId?: string;
  premiumInr?: number;
  error?: string;
}

export interface InsuranceProvider {
  readonly configured: boolean;
  quote(params: { tier: CoverageTier; days: number; travelers: number }): Promise<InsuranceQuote>;
}

class ConfigurableInsuranceProvider implements InsuranceProvider {
  get configured(): boolean {
    return Boolean(
      (process.env.INSURANCE_PROVIDER ?? '').trim() &&
      (process.env.INSURANCE_API_BASE_URL ?? '').trim() &&
      (process.env.INSURANCE_API_KEY ?? '').trim(),
    );
  }

  async quote(params: {
    tier: CoverageTier;
    days: number;
    travelers: number;
  }): Promise<InsuranceQuote> {
    const provider = (process.env.INSURANCE_PROVIDER ?? 'none').trim();
    if (!this.configured) {
      // Fall back to an indicative estimate flagged as non-bindable.
      const est = estimatePremium(params);
      return {
        ok: false,
        provider: 'fallback',
        premiumInr: est.premiumInr,
        error: 'No live insurance provider configured (indicative only).',
      };
    }
    logger.info('Requesting live insurance quote', { provider, ...params });
    return { ok: false, provider, error: 'Live insurance quote not yet enabled.' };
  }
}

export const insuranceProvider: InsuranceProvider = new ConfigurableInsuranceProvider();
