import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { MayaDeps } from '../maya/types.js';
import {
  classifyDisruption,
  evaluateWatch,
  type FlightWatch,
} from '../maya/disruption/disruptionService.js';
import type { FlightStatus } from '../maya/disruption/flightStatusProvider.js';
import {
  computeRefundSla,
  reviewRefunds,
  type RefundRow,
} from '../maya/refunds/refundSlaService.js';

function makeDeps(seed?: { contingencies?: any[]; refunds?: RefundRow[]; activity?: any[] }) {
  const contingencies: any[] = seed?.contingencies ?? [];
  const refunds: RefundRow[] = seed?.refunds ?? [];
  const activity: any[] = seed?.activity ?? [];
  let cSeq = 900;

  const prisma = {
    booking_contingencies: {
      findFirst: vi.fn(
        async ({ where }: any) =>
          contingencies.find(
            (c) =>
              c.booking_id === where.booking_id &&
              c.issue_type === where.issue_type &&
              c.resolved_at == null,
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: ++cSeq, resolved_at: null, ...data };
        contingencies.push(row);
        return row;
      }),
    },
    user_refunds: {
      findMany: vi.fn(async () => refunds.filter((r) => r.status !== 'settled')),
    },
    maya_activity_log: {
      findFirst: vi.fn(
        async ({ where }: any) =>
          activity.find(
            (a) => a.area === where.area && a.action === where.action && a.ref_id === where.ref_id,
          ) ?? null,
      ),
    },
  };

  const sendWhatsApp = vi.fn(async (_to: string, _msg: string) => ({
    ok: true,
    channel: 'whatsapp' as const,
    provider: 'whatsapp_cloud',
  }));
  const logActivity = vi.fn(async (area: string, action: string, refId: number | null) => {
    activity.push({ area, action, ref_id: refId });
  });

  const deps: MayaDeps = {
    prisma: prisma as unknown as PrismaClient,
    sendWhatsApp,
    logActivity,
    now: () => new Date('2026-07-22T00:00:00Z'),
  };
  return { deps, prisma, sendWhatsApp, logActivity, contingencies };
}

const status = (over: Partial<FlightStatus>): FlightStatus => ({
  flightNumber: 'AI101',
  state: 'on_time',
  delayMinutes: 0,
  scheduledDeparture: new Date('2026-08-01T06:00:00Z'),
  ...over,
});

describe('disruption classification and passenger-rights routing', () => {
  it('treats cancellation as high severity without inventing refund eligibility', () => {
    expect(classifyDisruption(status({ state: 'cancelled' }), false)).toEqual({
      severity: 'high',
      autoRefundEligible: false,
    });
  });

  it('uses delay thresholds for operational severity, never legal eligibility', () => {
    expect(
      classifyDisruption(status({ state: 'delayed', delayMinutes: 185 }), false).autoRefundEligible,
    ).toBe(false);
    expect(
      classifyDisruption(status({ state: 'delayed', delayMinutes: 185 }), true).autoRefundEligible,
    ).toBe(false);
    expect(
      classifyDisruption(status({ state: 'delayed', delayMinutes: 370 }), true).autoRefundEligible,
    ).toBe(false);
  });

  it('short delays are medium/low, not auto-refund', () => {
    expect(classifyDisruption(status({ state: 'delayed', delayMinutes: 90 }), false).severity).toBe(
      'medium',
    );
    expect(classifyDisruption(status({ state: 'delayed', delayMinutes: 20 }), false).severity).toBe(
      'low',
    );
  });
});

describe('disruption shield — evaluateWatch', () => {
  const watch: FlightWatch = {
    bookingId: 42,
    flightNumber: 'AI101',
    scheduledDeparture: new Date('2026-08-01T06:00:00Z'),
    international: false,
    travellerPhone: '+919812345678',
    travellerName: 'Meera',
  };

  it('opens a contingency case and alerts the traveller on cancellation', async () => {
    const { deps, sendWhatsApp, contingencies } = makeDeps();
    const outcome = await evaluateWatch(watch, status({ state: 'cancelled' }), deps);
    expect(outcome.action).toBe('opened_case');
    expect(outcome.autoRefundEligible).toBe(false);
    expect(outcome.passengerRights.confirmationRequired).toBe(true);
    expect(outcome.alerted).toBe(true);
    expect(contingencies).toHaveLength(1);
    expect(sendWhatsApp).toHaveBeenCalledOnce();
    expect(sendWhatsApp.mock.calls[0]![1]).toContain('cancelled');
  });

  it('does not double-open when an unresolved case already exists', async () => {
    const { deps, sendWhatsApp } = makeDeps({
      contingencies: [
        { id: 1, booking_id: 42, issue_type: 'flight_disruption', resolved_at: null },
      ],
    });
    const outcome = await evaluateWatch(watch, status({ state: 'cancelled' }), deps);
    expect(outcome.action).toBe('none');
    expect(outcome.contingencyId).toBe(1);
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('stays silent for on-time flights', async () => {
    const { deps, contingencies } = makeDeps();
    const outcome = await evaluateWatch(watch, status({ state: 'on_time' }), deps);
    expect(outcome.action).toBe('none');
    expect(contingencies).toHaveLength(0);
  });
});

describe('refund SLA engine', () => {
  const daysAgo = (n: number) =>
    new Date(new Date('2026-07-22T00:00:00Z').getTime() - n * 86_400_000);

  it('flags a refund past its SLA', () => {
    const sla = computeRefundSla(
      {
        id: 1,
        user_id: 5,
        booking_reference: 'BK1',
        item_type: 'package',
        amount: 50000,
        status: 'initiated',
        created_at: daysAgo(10),
        settled_at: null,
      },
      new Date('2026-07-22T00:00:00Z'),
    );
    expect(sla.breached).toBe(true);
    expect(sla.overdueDays).toBe(3); // 10 days old, 7-day SLA
  });

  it('keeps a fresh refund within SLA', () => {
    const sla = computeRefundSla(
      {
        id: 2,
        user_id: 5,
        booking_reference: 'BK2',
        item_type: 'package',
        amount: 50000,
        status: 'initiated',
        created_at: daysAgo(2),
        settled_at: null,
      },
      new Date('2026-07-22T00:00:00Z'),
    );
    expect(sla.breached).toBe(false);
  });

  it('reviews open refunds and raises one breach alert', async () => {
    const { deps, logActivity } = makeDeps({
      refunds: [
        {
          id: 10,
          user_id: 1,
          booking_reference: 'BK10',
          item_type: 'package',
          amount: 30000,
          status: 'initiated',
          created_at: daysAgo(20),
          settled_at: null,
        },
        {
          id: 11,
          user_id: 2,
          booking_reference: 'BK11',
          item_type: 'stay',
          amount: 10000,
          status: 'initiated',
          created_at: daysAgo(1),
          settled_at: null,
        },
      ],
    });
    const review = await reviewRefunds(deps);
    expect(review.total).toBe(2);
    expect(review.breached).toBe(1);
    expect(review.breaches[0]!.refundId).toBe(10);
    expect(logActivity).toHaveBeenCalledWith(
      'refunds',
      'sla_breach',
      10,
      expect.stringContaining('past its'),
      'attention',
    );
  });
});
