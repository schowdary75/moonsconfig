import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { MayaDeps } from '../maya/types.js';
import {
  assertBindableForSend,
  assessRateCard,
  effectiveSelling,
  nonBindable,
  priceLine,
  quantityMultiplier,
  rollupConfidence,
  type RateCardInput,
} from '../maya/pricing/rateCardPricing.js';
import {
  buildCustomQuote,
  persistCustomQuote,
  raiseRfqForGaps,
} from '../maya/pricing/customQuoteService.js';

const TRAVEL = new Date('2026-12-10T00:00:00Z');

function rc(over: Partial<RateCardInput> & { catalogId?: number }): RateCardInput {
  return {
    id: 1,
    vendorId: 7,
    unitType: 'per_room_per_night',
    netCost: 4000,
    marginPercent: 25,
    sellingPrice: 5000,
    currency: 'INR',
    validFrom: null,
    validTo: null,
    minPax: null,
    occupancy: null,
    isActive: true,
    ...over,
  };
}

describe('rate-card validity', () => {
  it('accepts an active, in-validity, min-pax-satisfied card', () => {
    expect(assessRateCard(rc({}), 2, TRAVEL).usable).toBe(true);
  });
  it('rejects expired, inactive or below-min-pax cards', () => {
    expect(assessRateCard(rc({ validTo: new Date('2026-01-01') }), 2, TRAVEL).reasons).toContain(
      'rate expired',
    );
    expect(assessRateCard(rc({ isActive: false }), 2, TRAVEL).usable).toBe(false);
    expect(assessRateCard(rc({ minPax: 4 }), 2, TRAVEL).reasons[0]).toContain('minimum');
  });
});

describe('pricing maths', () => {
  it('multiplies per_person by pax, others by quantity', () => {
    expect(quantityMultiplier('per_person', 3, 2)).toBe(6);
    expect(quantityMultiplier('per_room_per_night', 3, 2)).toBe(3);
  });
  it('derives selling from net + margin when no explicit price', () => {
    expect(effectiveSelling(rc({ sellingPrice: 0, netCost: 4000, marginPercent: 25 }))).toBe(5000);
  });
  it('prices a bindable line and flags a gap when no card', () => {
    const line = priceLine({ catalogType: 'stay', catalogId: 1, quantity: 3 }, rc({}), 2, TRAVEL);
    expect(line.bindable).toBe(true);
    expect(line.totalSelling).toBe(15000); // 5000 * 3 nights
    const gap = priceLine({ catalogType: 'stay', catalogId: 9, quantity: 3 }, null, 2, TRAVEL);
    expect(gap.bindable).toBe(false);
    expect(gap.gapReason).toContain('no rate card');
  });
});

describe('quote confidence rollup', () => {
  const bindableLine = priceLine(
    { catalogType: 'stay', catalogId: 1, quantity: 1 },
    rc({}),
    2,
    TRAVEL,
  );
  const gapLine = priceLine({ catalogType: 'car', catalogId: 2, quantity: 1 }, null, 2, TRAVEL);
  const usdLine = priceLine(
    { catalogType: 'activity', catalogId: 3, quantity: 1 },
    rc({ currency: 'USD' }),
    2,
    TRAVEL,
  );

  it('confirms only when every line is bindable and single-currency', () => {
    expect(rollupConfidence([bindableLine])).toBe('confirmed');
    expect(rollupConfidence([bindableLine, gapLine])).toBe('indicative');
    expect(rollupConfidence([bindableLine, usdLine])).toBe('indicative'); // mixed currency
    expect(rollupConfidence([])).toBe('indicative');
  });
});

describe('the hard firm-quote block', () => {
  it('throws when a quote is not fully confirmed', () => {
    expect(() => assertBindableForSend({ confidence: 'indicative', gaps: [{} as any] })).toThrow(
      /Refusing to send a firm quote/,
    );
    expect(() => assertBindableForSend({ confidence: 'confirmed', gaps: [] })).not.toThrow();
  });
  it('stamps AI-estimated figures as non-bindable', () => {
    const stamped = nonBindable(123456);
    expect(stamped.bindable).toBe(false);
    expect(stamped.value).toBe(123456);
  });
});

// ---------- service (fake Prisma) ----------

function makeDeps(rateCards: any[]) {
  const outreach: any[] = [];
  const quotes: any[] = [];
  const prisma = {
    catalog_rate_cards: {
      findFirst: vi.fn(async ({ where, select }: any) => {
        let rows = rateCards.filter(
          (r) => r.catalog_type === where.catalog_type && r.catalog_id === where.catalog_id,
        );
        if (where.is_active !== undefined)
          rows = rows.filter((r) => r.is_active === where.is_active);
        rows = [...rows].sort((a, b) => Number(a.selling_price) - Number(b.selling_price));
        const row = rows[0] ?? null;
        if (!row) return null;
        return select?.vendor_id ? { vendor_id: row.vendor_id } : row;
      }),
    },
    vendor_outreach_queue: {
      create: vi.fn(async ({ data }: any) => {
        outreach.push(data);
        return { id: outreach.length };
      }),
    },
    crm_quotes: {
      create: vi.fn(async ({ data }: any) => {
        quotes.push(data);
        return { id: quotes.length };
      }),
    },
  };
  const deps: MayaDeps = {
    prisma: prisma as unknown as PrismaClient,
    sendWhatsApp: vi.fn(async () => ({ ok: true, channel: 'whatsapp' as const, provider: 'x' })),
    logActivity: vi.fn(async () => {}),
    now: () => new Date('2026-07-22T00:00:00Z'),
  };
  return { deps, outreach, quotes };
}

const card = (over: any) => ({
  id: over.id ?? 1,
  catalog_type: over.catalog_type,
  catalog_id: over.catalog_id,
  vendor_id: over.vendor_id ?? 7,
  unit_type: over.unit_type ?? 'per_room_per_night',
  net_cost: over.net_cost ?? 4000,
  margin_percent: 25,
  selling_price: over.selling_price ?? 5000,
  currency: over.currency ?? 'INR',
  valid_from: over.valid_from ?? null,
  valid_to: over.valid_to ?? null,
  min_pax: over.min_pax ?? null,
  occupancy: null,
  is_active: over.is_active ?? true,
});

describe('buildCustomQuote (service)', () => {
  it('confirms when every component is rate-card-backed', async () => {
    const { deps } = makeDeps([
      card({
        catalog_type: 'stay',
        catalog_id: 1,
        selling_price: 5000,
        unit_type: 'per_room_per_night',
      }),
      card({
        catalog_type: 'activity',
        catalog_id: 2,
        selling_price: 1000,
        unit_type: 'per_person',
      }),
    ]);
    const quote = await buildCustomQuote(deps, {
      travelers: 2,
      travelDate: TRAVEL,
      items: [
        { catalogType: 'stay', catalogId: 1, quantity: 3 },
        { catalogType: 'activity', catalogId: 2, quantity: 1 },
      ],
    });
    expect(quote.confidence).toBe('confirmed');
    expect(quote.totalSelling).toBe(15000 + 2000); // stay 5000*3, activity 1000*1*2pax
    expect(quote.gaps).toHaveLength(0);
  });

  it('stays indicative and lists gaps when a rate is missing', async () => {
    const { deps } = makeDeps([
      card({ catalog_type: 'stay', catalog_id: 1, selling_price: 5000 }),
      // an INACTIVE car card exists (has a vendor to RFQ) but no active one
      card({ catalog_type: 'car', catalog_id: 2, is_active: false, vendor_id: 42 }),
    ]);
    const quote = await buildCustomQuote(deps, {
      travelers: 2,
      travelDate: TRAVEL,
      items: [
        { catalogType: 'stay', catalogId: 1, quantity: 2, label: 'Hotel' },
        { catalogType: 'car', catalogId: 2, quantity: 1, label: 'Airport transfer' },
      ],
    });
    expect(quote.confidence).toBe('indicative');
    expect(quote.gaps.map((g) => g.label)).toEqual(['Airport transfer']);
    expect(quote.totalSelling).toBe(10000); // only the bindable stay counts

    const rfq = await raiseRfqForGaps(deps, quote.gaps);
    expect(rfq.enqueued).toBe(1); // sourced the vendor from the inactive card
    expect(rfq.unsourced).toHaveLength(0);
  });

  it('marks an expired rate as a gap', async () => {
    const { deps } = makeDeps([
      card({
        catalog_type: 'stay',
        catalog_id: 1,
        valid_to: new Date('2026-01-01'),
        is_active: true,
      }),
    ]);
    const quote = await buildCustomQuote(deps, {
      travelers: 2,
      travelDate: TRAVEL,
      items: [{ catalogType: 'stay', catalogId: 1, quantity: 2 }],
    });
    expect(quote.confidence).toBe('indicative');
    expect(quote.gaps[0]!.gapReason).toContain('expired');
  });

  it('persists the quote with its confidence in quote_data', async () => {
    const { deps, quotes } = makeDeps([card({ catalog_type: 'stay', catalog_id: 1 })]);
    const quote = await buildCustomQuote(deps, {
      travelers: 2,
      travelDate: TRAVEL,
      items: [{ catalogType: 'stay', catalogId: 1, quantity: 2 }],
    });
    const id = await persistCustomQuote(deps, 555, quote);
    expect(id).toBe(1);
    expect(quotes[0].deal_id).toBe(555);
    expect(JSON.parse(quotes[0].quote_data).confidence).toBe('confirmed');
  });
});
