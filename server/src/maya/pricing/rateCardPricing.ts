/**
 * Safe pricing engine — the guardrail that keeps a hallucinated or estimated
 * number from ever going out as a firm price.
 *
 * A quote is only ever `confirmed` (firm, bindable) when EVERY line is priced
 * from an active, in-validity, real `catalog_rate_cards` entry in a single
 * currency. Any missing/expired/out-of-policy rate makes the whole quote
 * `indicative` — a starting estimate the team must confirm. AI-estimated and
 * "GDS-simulator" figures are stamped non-bindable and can never be confirmed.
 */

export type QuoteConfidence = 'indicative' | 'confirmed';

export type RateUnitType =
  'per_person' | 'per_room_per_night' | 'per_vehicle' | 'per_group' | 'fixed';

export type CatalogType = 'stay' | 'room' | 'activity' | 'car';

/** A real rate-card row, normalised (Prisma Decimals converted to numbers). */
export interface RateCardInput {
  id: number;
  vendorId: number | null;
  unitType: RateUnitType;
  netCost: number;
  marginPercent: number;
  sellingPrice: number;
  currency: string;
  validFrom: Date | null;
  validTo: Date | null;
  minPax: number | null;
  occupancy: number | null;
  isActive: boolean;
}

export interface LineRequest {
  catalogType: CatalogType;
  catalogId: number;
  quantity: number;
  label?: string;
}

export interface PricedLine {
  catalogType: CatalogType;
  catalogId: number;
  label: string;
  unitType: RateUnitType | null;
  quantity: number;
  rateCardId: number | null;
  vendorId: number | null;
  unitSelling: number;
  totalNet: number;
  totalSelling: number;
  currency: string | null;
  /** True only when backed by a usable rate card. Firm quotes require all true. */
  bindable: boolean;
  /** Why the line is not bindable (drives the RFQ / human-confirm path). */
  gapReason?: string;
}

/** Whether a rate card may be used for this party size and travel date. */
export function assessRateCard(
  rc: RateCardInput,
  pax: number,
  travelDate: Date,
): { usable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!rc.isActive) reasons.push('rate card inactive');
  if (rc.validFrom && travelDate.getTime() < rc.validFrom.getTime())
    reasons.push('rate not yet valid');
  if (rc.validTo && travelDate.getTime() > rc.validTo.getTime()) reasons.push('rate expired');
  if (rc.minPax != null && pax < rc.minPax) reasons.push(`below minimum ${rc.minPax} pax`);
  return { usable: reasons.length === 0, reasons };
}

/** Units to charge for, given the rate's unit type. */
export function quantityMultiplier(unitType: RateUnitType, quantity: number, pax: number): number {
  return unitType === 'per_person' ? quantity * pax : quantity;
}

/** Effective selling price: explicit selling price, else net cost + margin. */
export function effectiveSelling(rc: RateCardInput): number {
  if (rc.sellingPrice > 0) return rc.sellingPrice;
  return Math.round(rc.netCost * (1 + rc.marginPercent / 100));
}

/** Price one requested line against a candidate rate card (or a gap if none). */
export function priceLine(
  req: LineRequest,
  rc: RateCardInput | null,
  pax: number,
  travelDate: Date,
): PricedLine {
  const base: PricedLine = {
    catalogType: req.catalogType,
    catalogId: req.catalogId,
    label: req.label ?? `${req.catalogType} #${req.catalogId}`,
    unitType: rc?.unitType ?? null,
    quantity: req.quantity,
    rateCardId: null,
    vendorId: rc?.vendorId ?? null,
    unitSelling: 0,
    totalNet: 0,
    totalSelling: 0,
    currency: rc?.currency ?? null,
    bindable: false,
  };

  if (!rc) return { ...base, gapReason: 'no rate card on file' };

  const { usable, reasons } = assessRateCard(rc, pax, travelDate);
  if (!usable) return { ...base, gapReason: reasons.join('; ') };

  const mult = quantityMultiplier(rc.unitType, req.quantity, pax);
  const unitSelling = effectiveSelling(rc);
  return {
    ...base,
    rateCardId: rc.id,
    unitSelling,
    totalNet: Math.round(rc.netCost * mult),
    totalSelling: Math.round(unitSelling * mult),
    currency: rc.currency,
    bindable: true,
  };
}

export interface QuoteTotals {
  totalNet: number;
  totalSelling: number;
  currency: string | null;
  mixedCurrency: boolean;
}

/** Sum bindable lines; flags a currency mix (which blocks a firm quote). */
export function quoteTotals(lines: PricedLine[]): QuoteTotals {
  const bindable = lines.filter((l) => l.bindable);
  const currencies = [...new Set(bindable.map((l) => l.currency).filter(Boolean))];
  return {
    totalNet: bindable.reduce((s, l) => s + l.totalNet, 0),
    totalSelling: bindable.reduce((s, l) => s + l.totalSelling, 0),
    currency: currencies[0] ?? null,
    mixedCurrency: currencies.length > 1,
  };
}

/**
 * A quote is firm ONLY when there is at least one line, every line is bindable,
 * and everything is in a single currency. Anything else is indicative.
 */
export function rollupConfidence(lines: PricedLine[]): QuoteConfidence {
  if (lines.length === 0) return 'indicative';
  const allBindable = lines.every((l) => l.bindable);
  const { mixedCurrency } = quoteTotals(lines);
  return allBindable && !mixedCurrency ? 'confirmed' : 'indicative';
}

export interface CustomQuote {
  confidence: QuoteConfidence;
  currency: string | null;
  travelers: number;
  travelDate: Date;
  totalNet: number;
  totalSelling: number;
  lines: PricedLine[];
  gaps: PricedLine[];
}

/** The hard block: refuse to treat a non-firm quote as a bindable price. */
export function assertBindableForSend(quote: Pick<CustomQuote, 'confidence' | 'gaps'>): void {
  if (quote.confidence !== 'confirmed') {
    const gapCount = quote.gaps.length;
    throw new Error(
      `Refusing to send a firm quote: ${gapCount} component(s) are not backed by a live rate card. ` +
        'Source fresh rates (RFQ) and have an agent confirm before quoting a binding price.',
    );
  }
}

/** Stamp an AI-estimated / simulated figure so it can never be sent as firm. */
export function nonBindable<T>(value: T): { value: T; bindable: false; note: string } {
  return { value, bindable: false, note: 'AI-estimated — indicative only, not a firm price' };
}
