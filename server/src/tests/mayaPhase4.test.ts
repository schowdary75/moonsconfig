import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { MayaDeps } from '../maya/types.js';
import {
  advanceVisaCase,
  canTransition,
  isAtRisk,
  isTerminal,
  type VisaCase,
} from '../maya/visa/visaCase.js';
import { allocateRooms, perPaxShares, settlementState } from '../maya/groups/rooming.js';
import {
  pointsForSpend,
  redeemPoints,
  redemptionValueInr,
  referralReward,
  tierFor,
} from '../maya/loyalty/loyalty.js';
import { handleOnTripMessage, triageMessage } from '../maya/ontrip/triage.js';
import { needsTranslation } from '../maya/i18n/localize.js';

describe('visa case state machine', () => {
  it('enforces the allowed lifecycle', () => {
    expect(canTransition('submitted', 'under_review')).toBe(true);
    expect(canTransition('not_started', 'approved')).toBe(false);
    expect(isTerminal('approved')).toBe(true);
    expect(isTerminal('under_review')).toBe(false);
  });

  it('advances a case and rejects illegal jumps', () => {
    const c: VisaCase = {
      status: 'submitted',
      destination: 'Schengen',
      travelDate: new Date('2026-09-01'),
      updatedAt: new Date('2026-07-01'),
    };
    const good = advanceVisaCase(c, 'under_review', new Date('2026-07-22'));
    expect(good.ok).toBe(true);
    expect(c.status).toBe('under_review');

    const bad = advanceVisaCase(c, 'documents_pending');
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('Cannot move');
  });

  it('flags at-risk cases close to travel', () => {
    const near: VisaCase = {
      status: 'under_review',
      destination: 'UK',
      travelDate: new Date('2026-07-30'),
      updatedAt: new Date(),
    };
    const far: VisaCase = {
      status: 'under_review',
      destination: 'UK',
      travelDate: new Date('2026-12-30'),
      updatedAt: new Date(),
    };
    const now = new Date('2026-07-22');
    expect(isAtRisk(near, now)).toBe(true);
    expect(isAtRisk(far, now)).toBe(false);
  });
});

describe('group rooming & payments', () => {
  it('allocates travellers into rooms leaving at most one partial', () => {
    const rooms = allocateRooms(7, 3);
    expect(rooms.map((r) => r.occupants)).toEqual([3, 3, 1]);
  });

  it('splits totals so shares sum back exactly', () => {
    const shares = perPaxShares(100000, 3);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100000);
    expect(shares).toEqual([33334, 33333, 33333]);
  });

  it('tracks partial payments to settlement', () => {
    const state = settlementState(100000, [
      { travelerRef: 'a', amountInr: 40000 },
      { travelerRef: 'b', amountInr: 30000 },
    ]);
    expect(state.paidInr).toBe(70000);
    expect(state.remainingInr).toBe(30000);
    expect(state.settled).toBe(false);
  });
});

describe('loyalty engine', () => {
  it('assigns tiers by lifetime value', () => {
    expect(tierFor(0)).toBe('Explorer');
    expect(tierFor(150000)).toBe('Silver');
    expect(tierFor(500000)).toBe('Gold');
    expect(tierFor(1_200_000)).toBe('Platinum');
  });

  it('earns more points at higher tiers', () => {
    const base = pointsForSpend(100000, 0); // Explorer x1
    const gold = pointsForSpend(100000, 500000); // Gold x1.5
    expect(gold).toBeGreaterThan(base);
  });

  it('caps redemption to balance and order value', () => {
    expect(redemptionValueInr(1000)).toBe(250);
    const res = redeemPoints(1000, 800, 100); // order only ₹100 -> max 400 points
    expect(res.discountInr).toBeLessThanOrEqual(100);
    expect(res.pointsUsed).toBeLessThanOrEqual(1000);
  });

  it('rewards both sides of a referral', () => {
    const r = referralReward();
    expect(r.referrerPoints).toBeGreaterThan(0);
    expect(r.refereeWelcomePoints).toBeGreaterThan(0);
  });
});

describe('on-trip triage', () => {
  it('classifies emergencies as critical and non-auto-replyable', () => {
    expect(triageMessage('I lost passport and I am stranded!')).toMatchObject({
      category: 'emergency',
      urgency: 'critical',
      autoReplyable: false,
    });
  });

  it('classifies booking issues and routine questions', () => {
    expect(triageMessage('the driver did not show up').category).toBe('booking_issue');
    expect(triageMessage('what time is breakfast?').category).toBe('question');
  });

  it('escalates urgent on-trip messages through the tool layer', async () => {
    const escalations: any[] = [];
    const deps: MayaDeps = {
      prisma: {
        callback_requests: { create: vi.fn(async ({ data }: any) => ({ id: 1, ...data })) },
      } as unknown as PrismaClient,
      sendWhatsApp: vi.fn(async () => ({ ok: true, channel: 'whatsapp' as const, provider: 'x' })),
      logActivity: vi.fn(async (area: string, action: string) => {
        escalations.push({ area, action });
      }),
      now: () => new Date(),
    };
    const res = await handleOnTripMessage(deps, {
      phone: '+9199',
      name: 'Sam',
      text: 'My hotel has no booking for me and I am stranded',
    });
    expect(res.escalated).toBe(true);
    expect(escalations.some((e) => e.action === 'escalation')).toBe(true);
  });

  it('auto-replies to feedback without escalating', async () => {
    const deps: MayaDeps = {
      prisma: {} as unknown as PrismaClient,
      sendWhatsApp: vi.fn(),
      logActivity: vi.fn(async () => {}),
      now: () => new Date(),
    };
    const res = await handleOnTripMessage(deps, {
      phone: '+9199',
      text: 'Thank you, amazing trip!',
    });
    expect(res.escalated).toBe(false);
    expect(res.category).toBe('feedback');
  });
});

describe('multi-language helper', () => {
  it('only translates across differing languages', () => {
    expect(needsTranslation('en', 'hi')).toBe(true);
    expect(needsTranslation('en', 'en')).toBe(false);
    expect(needsTranslation('en', '')).toBe(false);
  });
});
