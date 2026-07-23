import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { MayaDeps } from '../maya/types.js';
import { getUnifiedProfile } from '../maya/profile/unifiedProfileService.js';
import { computeEmiPlan, standardEmiOptions } from '../maya/payments/emi.js';
import { assessPassport, InMemoryDocumentVault } from '../maya/documents/passport.js';
import { estimatePremium, estimateAllTiers } from '../maya/insurance/insurance.js';

function makeDeps(seed: { customer?: any; leads?: any[]; crmClient?: any; bookings?: any[] }) {
  const prisma = {
    customerUser: { findFirst: vi.fn(async () => seed.customer ?? null) },
    lead_submissions: { findMany: vi.fn(async () => seed.leads ?? []) },
    crm_clients: { findFirst: vi.fn(async () => seed.crmClient ?? null) },
    bookings: { findMany: vi.fn(async () => seed.bookings ?? []) },
  };
  const deps: MayaDeps = {
    prisma: prisma as unknown as PrismaClient,
    sendWhatsApp: vi.fn(async () => ({ ok: true, channel: 'whatsapp' as const, provider: 'x' })),
    logActivity: vi.fn(async () => {}),
    now: () => new Date('2026-07-22T00:00:00Z'),
  };
  return deps;
}

describe('unified traveller profile', () => {
  it('stitches leads, CRM client and customer account into one view', async () => {
    const deps = makeDeps({
      customer: { id: 7, name: 'Neha', phone: '+9199', email: 'neha@x.com', points_balance: 1200 },
      leads: [
        {
          name: 'Neha',
          destination: 'Goa',
          theme: 'Honeymoon',
          budget_range: '₹1L',
          phone: '+9199',
          email: null,
        },
        {
          name: 'Neha',
          destination: 'Bali',
          theme: 'Honeymoon',
          budget_range: '₹2L',
          phone: '+9199',
          email: null,
        },
      ],
      crmClient: { name: 'Neha', lifetime_value: 350000, phone: '+9199', email: null },
      bookings: [{ amount: 120000 }, { amount: 80000 }],
    });
    const profile = await getUnifiedProfile(deps, { phone: '+9199' });
    expect(profile.found).toBe(true);
    expect(profile.identity.name).toBe('Neha');
    expect(profile.sources).toEqual({ hasCustomerAccount: true, leadCount: 2, isCrmClient: true });
    expect(profile.preferences.destinationsOfInterest.sort()).toEqual(['Bali', 'Goa']);
    expect(profile.preferences.themes).toEqual(['Honeymoon']); // de-duplicated
    expect(profile.value).toMatchObject({
      bookingsCount: 2,
      totalBookedInr: 200000,
      lifetimeValueInr: 350000,
      pointsBalance: 1200,
    });
  });

  it('returns an empty profile when nothing matches', async () => {
    const deps = makeDeps({});
    const profile = await getUnifiedProfile(deps, { phone: '+90000' });
    expect(profile.found).toBe(false);
  });
});

describe('EMI calculator', () => {
  it('computes a correct interest-bearing EMI', () => {
    // ₹100000 at 14% for 12 months ≈ ₹8979/month.
    const plan = computeEmiPlan(100000, 14, 12);
    expect(plan.monthlyInstallmentInr).toBe(8979);
    expect(plan.totalPayableInr).toBe(8979 * 12);
    expect(plan.totalInterestInr).toBeGreaterThan(0);
  });

  it('handles a 0% offer as a straight split with no interest', () => {
    const plan = computeEmiPlan(30000, 0, 3);
    expect(plan.monthlyInstallmentInr).toBe(10000);
    expect(plan.totalInterestInr).toBe(0);
  });

  it('offers standard tenures', () => {
    const options = standardEmiOptions(60000);
    expect(options.map((o) => o.months)).toEqual([3, 6, 9, 12]);
    expect(options[0]!.totalInterestInr).toBe(0); // 3-month is 0%
  });

  it('rejects invalid inputs', () => {
    expect(() => computeEmiPlan(0, 12, 6)).toThrow();
    expect(() => computeEmiPlan(1000, 12, 0)).toThrow();
  });
});

describe('passport six-month rule', () => {
  const now = new Date('2026-07-22T00:00:00Z');
  const travel = new Date('2026-12-10T00:00:00Z');

  it('passes when 6+ months valid beyond travel', () => {
    const a = assessPassport(new Date('2027-08-01T00:00:00Z'), travel, now);
    expect(a.valid).toBe(true);
    expect(a.alert).toBeNull();
  });

  it('flags when under six months validity at travel', () => {
    const a = assessPassport(new Date('2027-02-01T00:00:00Z'), travel, now);
    expect(a.sixMonthRuleOk).toBe(false);
    expect(a.valid).toBe(false);
    expect(a.alert).toContain('6 months');
  });

  it('flags an already-expired passport', () => {
    const a = assessPassport(new Date('2026-01-01T00:00:00Z'), travel, now);
    expect(a.expired).toBe(true);
    expect(a.alert).toContain('expired');
  });
});

describe('document vault (fallback)', () => {
  it('stores and lists documents per traveller', async () => {
    const vault = new InMemoryDocumentVault();
    await vault.put({ travelerRef: 't1', type: 'passport', fileUrl: '/x.pdf', expiresOn: null });
    const docs = await vault.listFor('t1');
    expect(docs).toHaveLength(1);
    expect(docs[0]!.id).toMatch(/^doc_/);
  });
});

describe('insurance estimator', () => {
  it('scales premium by tier, days, travellers and age', () => {
    const base = estimatePremium({ tier: 'standard', days: 10, travelers: 2 });
    expect(base.premiumInr).toBe(75 * 10 * 2);
    const senior = estimatePremium({ tier: 'standard', days: 10, travelers: 2, ageBand: 'over70' });
    expect(senior.premiumInr).toBe(base.premiumInr * 2);
  });

  it('returns all three tiers ordered', () => {
    const tiers = estimateAllTiers({ days: 5, travelers: 1 });
    expect(tiers.map((t) => t.tier)).toEqual(['basic', 'standard', 'premium']);
    expect(tiers[0]!.premiumInr).toBeLessThan(tiers[2]!.premiumInr);
  });
});
