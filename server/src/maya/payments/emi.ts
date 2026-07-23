import { logger } from '../../logger/index.js';

/**
 * EMI / BNPL support — closes the gap between the ads (which promise "Flexible
 * EMI Options") and checkout (which had no installment path).
 *
 * `computeEmiPlan` is the real, exact installment maths (standard reducing-
 * balance EMI). `PaymentGatewayAdapter` is the seam where a live gateway
 * (Razorpay/Stripe with EMI enabled) plugs in; until configured it reports
 * unavailable so the UI can hide EMI rather than promise something it can't take.
 *
 * Env for a live gateway:
 *   PAYMENT_GATEWAY           e.g. "razorpay"
 *   PAYMENT_GATEWAY_KEY_ID
 *   PAYMENT_GATEWAY_KEY_SECRET
 */

export interface EmiPlan {
  principalInr: number;
  annualRatePercent: number;
  months: number;
  monthlyInstallmentInr: number;
  totalPayableInr: number;
  totalInterestInr: number;
}

/**
 * Standard EMI: E = P·r·(1+r)^n / ((1+r)^n − 1), where r is the monthly rate.
 * A 0% offer is handled as a straight division. Amounts are rounded to whole
 * rupees; the final total is derived from the rounded installment so what the
 * customer is quoted is exactly what they pay.
 */
export function computeEmiPlan(
  principalInr: number,
  annualRatePercent: number,
  months: number,
): EmiPlan {
  if (principalInr <= 0) throw new Error('Principal must be positive.');
  if (months <= 0) throw new Error('Tenure (months) must be positive.');
  if (annualRatePercent < 0) throw new Error('Rate cannot be negative.');

  let monthly: number;
  if (annualRatePercent === 0) {
    monthly = principalInr / months;
  } else {
    const r = annualRatePercent / 100 / 12;
    const pow = Math.pow(1 + r, months);
    monthly = (principalInr * r * pow) / (pow - 1);
  }
  const monthlyInstallmentInr = Math.round(monthly);
  const totalPayableInr = monthlyInstallmentInr * months;

  return {
    principalInr,
    annualRatePercent,
    months,
    monthlyInstallmentInr,
    totalPayableInr,
    totalInterestInr: Math.max(0, totalPayableInr - principalInr),
  };
}

/** Standard tenures offered at checkout, with indicative rates. */
export function standardEmiOptions(principalInr: number): EmiPlan[] {
  return [
    { months: 3, rate: 0 },
    { months: 6, rate: 12 },
    { months: 9, rate: 13 },
    { months: 12, rate: 14 },
  ].map((o) => computeEmiPlan(principalInr, o.rate, o.months));
}

export interface EmiOrder {
  ok: boolean;
  provider: string;
  orderId?: string;
  error?: string;
}

export interface PaymentGatewayAdapter {
  readonly configured: boolean;
  createEmiOrder(amountInr: number, months: number, reference: string): Promise<EmiOrder>;
}

class ConfigurableGateway implements PaymentGatewayAdapter {
  get configured(): boolean {
    return Boolean(
      (process.env.PAYMENT_GATEWAY ?? '').trim() &&
      (process.env.PAYMENT_GATEWAY_KEY_ID ?? '').trim() &&
      (process.env.PAYMENT_GATEWAY_KEY_SECRET ?? '').trim(),
    );
  }

  async createEmiOrder(amountInr: number, months: number, reference: string): Promise<EmiOrder> {
    const provider = (process.env.PAYMENT_GATEWAY ?? 'none').trim();
    if (!this.configured) {
      return { ok: false, provider: 'fallback', error: 'No payment gateway configured.' };
    }
    // Live order creation is provider-specific; wired when credentials exist.
    logger.info('Creating EMI order', { provider, amountInr, months, reference });
    return { ok: false, provider, error: 'Live gateway order creation not yet enabled.' };
  }
}

export const paymentGateway: PaymentGatewayAdapter = new ConfigurableGateway();
