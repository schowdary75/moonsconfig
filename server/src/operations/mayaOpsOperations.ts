import { z } from 'zod';
import { defineOperation } from './defineOperation.js';
import {
  adminAuthSchema,
  requireAdmin,
  requireLeadStaff,
} from '../legacy/api/db.functions.server.js';
import { prisma } from '../config/prisma.js';
import { createMayaDeps } from '../maya/deps.js';
import { computeRefundSla, type RefundRow } from '../maya/refunds/refundSlaService.js';
import { advanceCase, createVisaCase, listVisaCases } from '../maya/visa/visaRepository.js';
import type { VisaStatus } from '../maya/visa/visaCase.js';
import {
  buildCustomQuote,
  persistCustomQuote,
  raiseRfqForGaps,
} from '../maya/pricing/customQuoteService.js';
import { assertBindableForSend } from '../maya/pricing/rateCardPricing.js';
import {
  persistCanonicalQuoteVersion,
  releaseQuoteToTraveller,
} from '../services/quoteVersionService.js';

/**
 * Read + control operations backing the Maya Ops Center admin screen: refund
 * SLA board, open disruption cases, the flight-watch feed, and visa-case
 * tracking. Reads are side-effect free (no activity spam on dashboard loads).
 */

const VISA_STATUSES = [
  'not_started',
  'documents_pending',
  'submitted',
  'under_review',
  'additional_docs_required',
  'approved',
  'rejected',
] as const;

export const adminGetMayaOpsCenter = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema }))
  .handler(async ({ data }) => {
    await requireLeadStaff(data.auth);
    const deps = createMayaDeps();
    const now = deps.now();

    const [
      refundRows,
      contingencies,
      recoveries,
      flightWatches,
      activeWatchCount,
      visaCases,
      activity,
    ] = await Promise.all([
      prisma.user_refunds.findMany({
        where: { status: { not: 'settled' } },
        orderBy: { created_at: 'asc' },
        take: 200,
      }),
      prisma.booking_contingencies.findMany({
        where: { resolved_at: null },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      prisma.incidentRecovery.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.maya_flight_watches.findMany({
        where: { active: true },
        orderBy: { scheduled_departure: 'asc' },
        take: 50,
      }),
      prisma.maya_flight_watches.count({ where: { active: true } }),
      listVisaCases(deps),
      prisma.maya_activity_log.findMany({ orderBy: { id: 'desc' }, take: 20 }),
    ]);
    const recoveryIds = recoveries.map((recovery) => recovery.id);
    const [attempts, alternatives, receipts] = await Promise.all([
      prisma.incidentVendorAttempt.findMany({
        where: { recoveryId: { in: recoveryIds } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.incidentAlternative.findMany({
        where: { recoveryId: { in: recoveryIds } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.incidentReceipt.findMany({
        where: { recoveryId: { in: recoveryIds } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const refundSlas = (refundRows as unknown as RefundRow[])
      .map((r) => computeRefundSla(r, now))
      .sort((a, b) => Number(b.breached) - Number(a.breached) || b.overdueDays - a.overdueDays);

    return {
      generatedAt: now.toISOString(),
      refunds: {
        total: refundSlas.length,
        breached: refundSlas.filter((s) => s.breached).length,
        rows: refundSlas,
      },
      contingencies: contingencies.map((incident) => {
        const recovery = recoveries.find((item) => item.incidentId === incident.id) ?? null;
        return {
          ...incident,
          recovery: recovery
            ? {
                ...recovery,
                attempts: attempts.filter((attempt) => attempt.recoveryId === recovery.id),
                alternatives: alternatives.filter(
                  (alternative) => alternative.recoveryId === recovery.id,
                ),
                receipts: receipts.filter((receipt) => receipt.recoveryId === recovery.id),
              }
            : null,
        };
      }),
      flightWatches: { active: activeWatchCount, upcoming: flightWatches },
      visaCases: {
        total: visaCases.length,
        atRisk: visaCases.filter((c) => c.atRisk).length,
        rows: visaCases,
      },
      activity,
    };
  });

export const adminAdvanceVisaCase = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      caseId: z.number().int().positive(),
      to: z.enum(VISA_STATUSES),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);
    const deps = createMayaDeps();
    return advanceCase(deps, data.caseId, data.to as VisaStatus);
  });

export const adminCreateVisaCase = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      destination: z.string().trim().min(1).max(160),
      travelDate: z.string().min(1),
      leadId: z.number().int().positive().optional(),
      customerId: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);
    const travelDate = new Date(data.travelDate);
    if (Number.isNaN(travelDate.getTime())) throw new Error('Invalid travel date.');
    const deps = createMayaDeps();
    return createVisaCase(deps, {
      destination: data.destination,
      travelDate,
      leadId: data.leadId ?? null,
      customerId: data.customerId ?? null,
    });
  });

export const adminBuildCustomQuote = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      travelers: z.number().int().positive().max(50),
      travelDate: z.string().min(1),
      dealId: z.number().int().positive().optional(),
      // When true, the caller intends to send this as a FIRM price — the engine
      // hard-blocks unless every line is rate-card-backed (confidence=confirmed).
      firm: z.boolean().default(false),
      items: z
        .array(
          z.object({
            catalogType: z.enum(['stay', 'room', 'activity', 'car']),
            catalogId: z.number().int().positive(),
            quantity: z.number().positive().max(1000),
            label: z.string().trim().max(160).optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);
    const travelDate = new Date(data.travelDate);
    if (Number.isNaN(travelDate.getTime())) throw new Error('Invalid travel date.');

    const deps = createMayaDeps();
    const quote = await buildCustomQuote(deps, {
      travelers: data.travelers,
      travelDate,
      items: data.items,
    });

    // Hard block: a firm/bindable quote is refused unless fully rate-card-backed.
    if (data.firm) assertBindableForSend(quote);

    const rfq =
      quote.gaps.length > 0
        ? await raiseRfqForGaps(deps, quote.gaps)
        : { enqueued: 0, unsourced: [] };
    const quoteId = data.dealId ? await persistCustomQuote(deps, data.dealId, quote) : null;
    const canonicalQuote =
      data.dealId && quoteId
        ? await persistCanonicalQuoteVersion({ legacyQuoteId: quoteId, dealId: data.dealId, quote })
        : null;

    return {
      quoteId,
      quoteVersionId: canonicalQuote?.id ?? null,
      confidence: quote.confidence,
      currency: quote.currency,
      totalNet: quote.totalNet,
      totalSelling: quote.totalSelling,
      lines: quote.lines,
      gaps: quote.gaps.map((g) => ({ label: g.label, reason: g.gapReason })),
      rfqEnqueued: rfq.enqueued,
      needsManualSourcing: rfq.unsourced.length,
    };
  });

export const adminReleaseQuoteToTraveller = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      quoteVersionId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.auth);
    const adminUser = await prisma.crmUser.findUnique({
      where: { email: admin.email },
      select: { id: true },
    });
    if (!adminUser) throw new Error('Admin account not found');
    return releaseQuoteToTraveller(data.quoteVersionId, adminUser.id);
  });

export const adminCreateFlightWatch = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      bookingId: z.number().int().positive(),
      flightNumber: z.string().trim().min(2).max(20),
      scheduledDeparture: z.string().min(1),
      international: z.boolean().default(false),
      travellerPhone: z.string().trim().max(50).optional(),
      travellerName: z.string().trim().max(255).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);
    const scheduled = new Date(data.scheduledDeparture);
    if (Number.isNaN(scheduled.getTime())) throw new Error('Invalid departure time.');
    const created = await prisma.maya_flight_watches.create({
      data: {
        booking_id: data.bookingId,
        flight_number: data.flightNumber,
        scheduled_departure: scheduled,
        international: data.international,
        traveller_phone: data.travellerPhone ?? null,
        traveller_name: data.travellerName ?? null,
        active: true,
      },
      select: { id: true },
    });
    return { success: true, watchId: created.id };
  });
