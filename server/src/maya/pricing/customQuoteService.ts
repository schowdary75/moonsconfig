import type { MayaDeps } from '../types.js';
import {
  priceLine,
  quoteTotals,
  rollupConfidence,
  type CatalogType,
  type CustomQuote,
  type LineRequest,
  type PricedLine,
  type RateCardInput,
} from './rateCardPricing.js';

/**
 * Orchestrates a custom quote against real `catalog_rate_cards`: prices every
 * requested component from an active, in-validity rate card, marks the rest as
 * gaps, raises supplier RFQs for those gaps, and can persist the quote with its
 * confidence so a firm price is never sent without rate-card backing.
 */

export interface CustomQuoteRequest {
  travelers: number;
  travelDate: Date;
  items: LineRequest[];
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** Find the cheapest active rate card that covers this catalog item + date. */
async function findRateCard(
  deps: MayaDeps,
  catalogType: CatalogType,
  catalogId: number,
  travelDate: Date,
): Promise<RateCardInput | null> {
  const rc = await deps.prisma.catalog_rate_cards.findFirst({
    where: {
      catalog_type: catalogType,
      catalog_id: catalogId,
      is_active: true,
      AND: [
        { OR: [{ valid_from: null }, { valid_from: { lte: travelDate } }] },
        { OR: [{ valid_to: null }, { valid_to: { gte: travelDate } }] },
      ],
    },
    orderBy: { selling_price: 'asc' },
  });
  if (!rc) return null;
  return {
    id: rc.id,
    vendorId: rc.vendor_id,
    unitType: rc.unit_type,
    netCost: num(rc.net_cost),
    marginPercent: num(rc.margin_percent),
    sellingPrice: num(rc.selling_price),
    currency: rc.currency,
    validFrom: rc.valid_from,
    validTo: rc.valid_to,
    minPax: rc.min_pax,
    occupancy: rc.occupancy,
    isActive: rc.is_active,
  };
}

/** Build a custom quote from real rate cards; gaps are flagged, never invented. */
export async function buildCustomQuote(
  deps: MayaDeps,
  req: CustomQuoteRequest,
): Promise<CustomQuote> {
  const lines: PricedLine[] = [];
  for (const item of req.items) {
    const rc = await findRateCard(deps, item.catalogType, item.catalogId, req.travelDate);
    lines.push(priceLine(item, rc, req.travelers, req.travelDate));
  }
  const totals = quoteTotals(lines);
  return {
    confidence: rollupConfidence(lines),
    currency: totals.currency,
    travelers: req.travelers,
    travelDate: req.travelDate,
    totalNet: totals.totalNet,
    totalSelling: totals.totalSelling,
    lines,
    gaps: lines.filter((l) => !l.bindable),
  };
}

/**
 * Raise supplier RFQs for the components that lack a live rate. Enqueues one
 * `vendor_outreach_queue` row per gap that has a resolvable vendor (from any
 * existing rate card for that item); returns what could and couldn't be sourced.
 */
export async function raiseRfqForGaps(
  deps: MayaDeps,
  gaps: PricedLine[],
): Promise<{ enqueued: number; unsourced: PricedLine[] }> {
  if (gaps.length === 0) return { enqueued: 0, unsourced: [] };
  const batch = `rfq_quote_${deps.now().getTime()}`;
  let enqueued = 0;
  const unsourced: PricedLine[] = [];

  for (const gap of gaps) {
    let vendorId = gap.vendorId;
    if (vendorId == null) {
      const anyCard = await deps.prisma.catalog_rate_cards.findFirst({
        where: { catalog_type: gap.catalogType, catalog_id: gap.catalogId },
        select: { vendor_id: true },
      });
      vendorId = anyCard?.vendor_id ?? null;
    }
    if (vendorId == null) {
      unsourced.push(gap);
      continue;
    }
    await deps.prisma.vendor_outreach_queue.create({
      data: { vendor_id: vendorId, status: 'pending', batch_group: batch },
    });
    enqueued += 1;
  }

  await deps.logActivity(
    'quotes',
    'rfq_raised',
    null,
    `Maya raised ${enqueued} supplier RFQ(s) for missing rates (${unsourced.length} need manual sourcing).`,
    unsourced.length > 0 ? 'attention' : 'done',
  );
  return { enqueued, unsourced };
}

/**
 * Persist a quote against a CRM deal, storing the confidence and full line
 * breakdown in `quote_data` so the send path can enforce the firm-quote gate.
 */
export async function persistCustomQuote(
  deps: MayaDeps,
  dealId: number,
  quote: CustomQuote,
): Promise<number> {
  const validUntil = new Date(deps.now().getTime() + 14 * 86_400_000);
  const row = await deps.prisma.crm_quotes.create({
    data: {
      deal_id: dealId,
      total_amount: quote.totalSelling,
      valid_until: validUntil,
      status: 'draft',
      quote_data: JSON.stringify({
        confidence: quote.confidence,
        currency: quote.currency,
        travelers: quote.travelers,
        travelDate: quote.travelDate.toISOString(),
        totalNet: quote.totalNet,
        totalSelling: quote.totalSelling,
        lines: quote.lines,
        gaps: quote.gaps.map((g) => ({
          label: g.label,
          catalogType: g.catalogType,
          catalogId: g.catalogId,
          reason: g.gapReason,
        })),
      }),
    },
    select: { id: true },
  });
  return row.id;
}
