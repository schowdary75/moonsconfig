import type { MayaDeps } from '../types.js';

/**
 * Refund SLA engine — attacks the second-biggest complaint category: refunds
 * that quietly take months. It measures every open refund against an internal
 * SLA and flags breaches for the ops team. Legal eligibility is assessed
 * separately from operational age and never inferred from this timer.
 */

export type RefundStatus = 'initiated' | 'admin_review' | 'escrow_hold' | 'settled';

export interface RefundRow {
  id: number;
  user_id: number;
  booking_reference: string;
  item_type: string;
  amount: number;
  status: RefundStatus | null;
  created_at: Date;
  settled_at: Date | null;
}

// Days a refund may sit in each pre-settled state before it breaches SLA.
const SLA_DAYS: Record<RefundStatus, number> = {
  initiated: 7,
  admin_review: 7,
  escrow_hold: 14,
  settled: 0,
};

export interface RefundSla {
  refundId: number;
  bookingReference: string;
  status: RefundStatus;
  ageDays: number;
  slaDays: number;
  breached: boolean;
  /** Days past the SLA target (0 when within SLA). */
  overdueDays: number;
}

const DAY_MS = 86_400_000;

/** Pure SLA computation for a single refund row. */
export function computeRefundSla(row: RefundRow, now: Date): RefundSla {
  const status = (row.status ?? 'initiated') as RefundStatus;
  const ageDays = Math.floor((now.getTime() - row.created_at.getTime()) / DAY_MS);
  const slaDays = SLA_DAYS[status];
  const settled = status === 'settled';
  const breached = !settled && ageDays > slaDays;
  return {
    refundId: row.id,
    bookingReference: row.booking_reference,
    status,
    ageDays,
    slaDays,
    breached,
    overdueDays: breached ? ageDays - slaDays : 0,
  };
}

export interface RefundReview {
  total: number;
  breached: number;
  breaches: RefundSla[];
}

/**
 * Review every open refund, flag SLA breaches into the activity log for Mission
 * Control, and return a summary. De-duplicates alerts within a 24h window so a
 * stuck refund raises one alert per day, not one per sweep.
 */
export async function reviewRefunds(deps: MayaDeps, now: Date = deps.now()): Promise<RefundReview> {
  const rows = (await deps.prisma.user_refunds.findMany({
    where: { status: { not: 'settled' } },
    select: {
      id: true,
      user_id: true,
      booking_reference: true,
      item_type: true,
      amount: true,
      status: true,
      created_at: true,
      settled_at: true,
    },
  })) as unknown as RefundRow[];

  const slas = rows.map((r) => computeRefundSla(r, now));
  const breaches = slas.filter((s) => s.breached).sort((a, b) => b.overdueDays - a.overdueDays);

  for (const breach of breaches) {
    const alreadyFlagged = await deps.prisma.maya_activity_log.findFirst({
      where: {
        area: 'refunds',
        action: 'sla_breach',
        ref_id: breach.refundId,
        created_at: { gt: new Date(now.getTime() - DAY_MS) },
      },
      select: { id: true },
    });
    if (alreadyFlagged) continue;

    await deps.logActivity(
      'refunds',
      'sla_breach',
      breach.refundId,
      `Refund #${breach.refundId} (${breach.bookingReference}) is ${breach.overdueDays} day(s) past its ${breach.slaDays}-day SLA in "${breach.status}".`,
      'attention',
    );
  }

  return { total: slas.length, breached: breaches.length, breaches };
}
