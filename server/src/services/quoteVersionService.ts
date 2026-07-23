import type { CustomQuote } from '../maya/pricing/rateCardPricing.js';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { ensureTravellerForContact } from './travelDomainService.js';
import { appendTravelEvent } from './travelEventService.js';

export async function persistCanonicalQuoteVersion(input: {
  legacyQuoteId: number;
  dealId: number;
  quote: CustomQuote;
  createdBy?: number | null;
}) {
  const deal = await prisma.crm_deals.findUnique({ where: { id: input.dealId } });
  if (!deal) throw new AppError(404, 'CRM deal not found', 'DEAL_NOT_FOUND');
  const traveller = await ensureTravellerForContact({
    name: deal.customer_name ?? 'Traveller',
    email: deal.customer_email,
    phone: deal.customer_phone,
  });
  const latest = await prisma.quoteVersion.aggregate({
    where: { legacyQuoteId: input.legacyQuoteId },
    _max: { version: true },
  });
  const version = (latest._max.version ?? 0) + 1;
  const sourceAsOf = new Date();
  const validUntil = new Date(sourceAsOf.getTime() + 14 * 86_400_000);
  return prisma.$transaction(async (tx) => {
    const quoteVersion = await tx.quoteVersion.create({
      data: {
        legacyQuoteId: input.legacyQuoteId,
        dealId: input.dealId,
        travellerId: traveller.id,
        version,
        confidence: input.quote.confidence,
        title: deal.title,
        currency: input.quote.currency ?? 'INR',
        totalNet: input.quote.totalNet,
        totalSell: input.quote.totalSelling,
        termsVersion: 'travel-terms-2026-07',
        validUntil,
        sourceAsOf,
        createdBy: input.createdBy ?? null,
        fxSnapshot: {
          base: input.quote.currency ?? 'INR',
          rate: 1,
          capturedAt: sourceAsOf.toISOString(),
        },
      },
    });
    if (input.quote.lines.length) {
      await tx.quoteLineSnapshot.createMany({
        data: input.quote.lines.map((line, position) => ({
          quoteVersionId: quoteVersion.id,
          position: position + 1,
          serviceType: line.catalogType,
          sourceCatalogType: line.catalogType,
          sourceCatalogId: line.catalogId,
          label: line.label,
          quantity: line.quantity,
          unitType: line.unitType ?? 'unpriced',
          unitNet: line.bindable && line.quantity ? line.totalNet / line.quantity : null,
          unitSell: line.bindable ? line.unitSelling : null,
          totalNet: line.totalNet,
          totalSell: line.totalSelling,
          currency: line.currency ?? input.quote.currency ?? 'INR',
          bindable: line.bindable,
          evidence: line.bindable
            ? {
                sourceType: 'catalog_rate_card',
                rateCardId: line.rateCardId,
                vendorId: line.vendorId,
                sourceAsOf: sourceAsOf.toISOString(),
              }
            : { sourceType: 'missing_rate', reason: line.gapReason ?? 'confirmation required' },
        })),
      });
    }
    await appendTravelEvent(tx, {
      eventType: 'QuoteDrafted',
      aggregateType: 'QuoteVersion',
      aggregateId: quoteVersion.id,
      payload: {
        quoteVersionId: quoteVersion.id,
        confidence: quoteVersion.confidence,
        travellerId: traveller.id,
      },
    });
    return quoteVersion;
  });
}

export async function releaseQuoteToTraveller(quoteVersionId: string, approvedBy: number) {
  const quote = await prisma.quoteVersion.findUnique({ where: { id: quoteVersionId } });
  if (!quote) throw new AppError(404, 'Quote not found', 'QUOTE_NOT_FOUND');
  const lines = await prisma.quoteLineSnapshot.findMany({ where: { quoteVersionId } });
  if (quote.confidence !== 'confirmed' || !lines.length || lines.some((line) => !line.bindable)) {
    throw new AppError(
      409,
      'Firm quote blocked: one or more lines lack current structured pricing evidence',
      'QUOTE_NOT_BINDABLE',
    );
  }
  if (quote.validUntil && quote.validUntil <= new Date()) {
    await prisma.quoteVersion.update({ where: { id: quote.id }, data: { status: 'expired' } });
    throw new AppError(409, 'Quote has expired', 'QUOTE_EXPIRED');
  }
  return prisma.quoteVersion.update({
    where: { id: quote.id },
    data: { status: 'sent', approvedBy, approvedAt: new Date() },
  });
}
