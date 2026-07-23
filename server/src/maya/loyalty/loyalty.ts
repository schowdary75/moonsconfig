/**
 * Loyalty & referral engine — built on the existing `points_balance`,
 * `promo_codes` and `user_welcome_offers` so repeat travellers and referrers are
 * actually rewarded, lifting retention and word-of-mouth.
 */

export type LoyaltyTier = 'Explorer' | 'Silver' | 'Gold' | 'Platinum';

// Points earned per ₹100 spent, and redemption value per point (in ₹).
const EARN_PER_100_INR = 2;
const REDEEM_VALUE_INR = 0.25;
const REFERRAL_REWARD_POINTS = 500;

const TIER_THRESHOLDS: { tier: LoyaltyTier; minLifetimeInr: number; earnMultiplier: number }[] = [
  { tier: 'Platinum', minLifetimeInr: 1_000_000, earnMultiplier: 2 },
  { tier: 'Gold', minLifetimeInr: 400_000, earnMultiplier: 1.5 },
  { tier: 'Silver', minLifetimeInr: 100_000, earnMultiplier: 1.25 },
  { tier: 'Explorer', minLifetimeInr: 0, earnMultiplier: 1 },
];

export function tierFor(lifetimeInr: number): LoyaltyTier {
  return (TIER_THRESHOLDS.find((t) => lifetimeInr >= t.minLifetimeInr) ?? TIER_THRESHOLDS.at(-1)!)
    .tier;
}

function multiplierFor(lifetimeInr: number): number {
  return (TIER_THRESHOLDS.find((t) => lifetimeInr >= t.minLifetimeInr) ?? TIER_THRESHOLDS.at(-1)!)
    .earnMultiplier;
}

/** Points earned on a booking, boosted by the traveller's tier multiplier. */
export function pointsForSpend(spendInr: number, lifetimeInr = 0): number {
  if (spendInr < 0) throw new Error('Spend cannot be negative.');
  return Math.floor((spendInr / 100) * EARN_PER_100_INR * multiplierFor(lifetimeInr));
}

/** Cash value (₹) of a points balance when redeemed. */
export function redemptionValueInr(points: number): number {
  if (points < 0) throw new Error('Points cannot be negative.');
  return Math.floor(points * REDEEM_VALUE_INR);
}

export interface RedeemResult {
  ok: boolean;
  pointsUsed: number;
  discountInr: number;
  remainingPoints: number;
  error?: string;
}

/**
 * Redeem points against an order, capped so the discount never exceeds the
 * order value and never spends more points than the balance holds.
 */
export function redeemPoints(
  balance: number,
  requestedPoints: number,
  orderValueInr: number,
): RedeemResult {
  if (requestedPoints <= 0) {
    return {
      ok: false,
      pointsUsed: 0,
      discountInr: 0,
      remainingPoints: balance,
      error: 'Nothing to redeem.',
    };
  }
  const usablePoints = Math.min(
    requestedPoints,
    balance,
    Math.floor(orderValueInr / REDEEM_VALUE_INR),
  );
  const discountInr = redemptionValueInr(usablePoints);
  return {
    ok: usablePoints > 0,
    pointsUsed: usablePoints,
    discountInr,
    remainingPoints: balance - usablePoints,
    error: usablePoints > 0 ? undefined : 'Points could not be applied to this order.',
  };
}

export interface ReferralOutcome {
  referrerPoints: number;
  refereeWelcomePoints: number;
}

/** Reward both sides when a referred traveller completes their first booking. */
export function referralReward(): ReferralOutcome {
  return { referrerPoints: REFERRAL_REWARD_POINTS, refereeWelcomePoints: REFERRAL_REWARD_POINTS };
}
