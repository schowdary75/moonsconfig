import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../logger/index.js';
import { smsService } from './smsService.js';

/**
 * Customer SMS with an opt-out (suppression) layer.
 *
 * TRANSACTIONAL messages (OTP, booking lifecycle, receipts, follow-ups) send via
 * smsService directly and are never suppressed. PROMOTIONAL messages go through
 * here and skip any number on the opt-out list. Inbound "STOP" replies opt a
 * number out automatically.
 *
 * NOTE: bulk promotional SMS from a personal SIM is heavily regulated (e.g. India
 * TRAI/DLT) and can get the SIM banned. broadcastPromotion is intentionally only
 * invoked by an explicit admin action — nothing here fires automatically.
 */

const STOP_WORDS = new Set(['stop', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt-out']);
const START_WORDS = new Set(['start', 'unstop', 'subscribe', 'optin', 'opt-in']);

/** Normalize a stored (country-code-stripped) number to E.164 for the gateway. */
export function normalizeForSms(stored: string): string {
  const digits = String(stored || '').replace(/\D/g, '');
  if (String(stored).startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return digits ? `+${digits}` : '';
}

export async function isOptedOut(phone: string): Promise<boolean> {
  const key = normalizeForSms(phone);
  if (!key) return true; // unusable number — treat as suppressed
  const row = await prisma.sms_opt_outs.findUnique({ where: { phone: key } });
  return Boolean(row);
}

export async function optOut(phone: string, reason = 'sms-stop'): Promise<void> {
  const key = normalizeForSms(phone);
  if (!key) return;
  await prisma.sms_opt_outs.upsert({
    where: { phone: key },
    create: { phone: key, reason },
    update: { reason },
  });
  logger.info('SMS opt-out recorded', { phone: key, reason });
}

export async function optIn(phone: string): Promise<void> {
  const key = normalizeForSms(phone);
  if (!key) return;
  await prisma.sms_opt_outs.deleteMany({ where: { phone: key } });
  logger.info('SMS opt-in (removed from suppression)', { phone: key });
}

/** Send a single promotional SMS, honoring the opt-out list. Returns false if suppressed/failed. */
export async function sendPromotionalSms(phone: string, message: string): Promise<boolean> {
  const to = normalizeForSms(phone);
  if (!to) return false;
  if (await isOptedOut(to)) {
    logger.info('Promotional SMS skipped (opted out)', { phone: to });
    return false;
  }
  const body = message.includes('STOP') ? message : `${message}\nReply STOP to opt out.`;
  return smsService.sendSMS(to, body);
}

export interface BroadcastResult {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Explicitly-triggered promotional broadcast. Suppression-aware, de-duplicated,
 * and throttled to avoid tripping carrier spam limits.
 *
 * @param message  the promo text (a STOP notice is appended automatically)
 * @param phones   explicit recipient list; if omitted, all customers with a phone
 * @param throttleMs  delay between sends (default 1500ms)
 */
export async function broadcastPromotion(
  message: string,
  phones?: string[],
  throttleMs = 1500,
): Promise<BroadcastResult> {
  if (!env.smsGateway.url) throw new Error('SMS gateway not configured');

  let recipients: string[];
  if (phones && phones.length) {
    recipients = phones;
  } else {
    const customers = await prisma.customerUser.findMany({
      where: { phone: { not: null } },
      select: { phone: true },
    });
    recipients = customers.map((c) => c.phone as string);
  }

  // De-duplicate on the normalized number.
  const unique = Array.from(new Set(recipients.map((p) => normalizeForSms(p)).filter(Boolean)));

  const result: BroadcastResult = { total: unique.length, sent: 0, skipped: 0, failed: 0 };
  logger.info('Starting promotional broadcast', { total: result.total });

  for (const to of unique) {
    if (await isOptedOut(to)) {
      result.skipped += 1;
      continue;
    }
    const ok = await smsService.sendSMS(to, `${message}\nReply STOP to opt out.`);
    if (ok) result.sent += 1;
    else result.failed += 1;
    if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs));
  }

  logger.info('Promotional broadcast complete', { ...result });
  return result;
}

/** Process an inbound SMS (from the gateway webhook): honor STOP/START keywords. */
export async function handleInboundSms(from: string, text: string): Promise<{ action: string }> {
  const word = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, '');
  if (STOP_WORDS.has(word)) {
    await optOut(from, 'sms-stop');
    // Confirmation is itself transactional (a reply to their request), so send directly.
    await smsService.sendSMS(
      normalizeForSms(from),
      'You have been unsubscribed from MooN Travel promotions. Reply START to opt back in.',
    );
    return { action: 'opted_out' };
  }
  if (START_WORDS.has(word)) {
    await optIn(from);
    await smsService.sendSMS(
      normalizeForSms(from),
      'You are re-subscribed to MooN Travel updates. Reply STOP to opt out anytime.',
    );
    return { action: 'opted_in' };
  }
  return { action: 'ignored' };
}
