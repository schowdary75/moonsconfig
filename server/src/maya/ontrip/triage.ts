import { dispatchTool } from '../tools.js';
import type { MayaDeps } from '../types.js';

/**
 * 24×7 on-trip support desk — Maya as first responder. During a trip, a
 * traveller message is triaged: anything urgent (safety, a broken booking) is
 * immediately escalated to a human via the shared tool layer; routine questions
 * get an instant acknowledgement so nobody is left stranded in silence.
 */

export type TripIssueCategory = 'emergency' | 'booking_issue' | 'question' | 'feedback';
export type Urgency = 'critical' | 'high' | 'normal' | 'low';

const EMERGENCY = [
  'emergency',
  'hospital',
  'accident',
  'stranded',
  'robbed',
  'stolen passport',
  'lost passport',
  'missed flight',
  'help me',
  'unsafe',
  'police',
  'ambulance',
];
const BOOKING_ISSUE = [
  'no show',
  "didn't show",
  'driver',
  'hotel',
  'room',
  'overcharged',
  'cancelled',
  'not working',
  'no booking',
  'double charged',
  'refund',
  'wrong',
  'delayed transfer',
];
const FEEDBACK = ['thank', 'amazing', 'great', 'loved', 'wonderful', 'excellent'];

export interface Triage {
  category: TripIssueCategory;
  urgency: Urgency;
  autoReplyable: boolean;
}

function matches(text: string, needles: string[]): boolean {
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n));
}

export function triageMessage(text: string): Triage {
  if (matches(text, EMERGENCY)) {
    return { category: 'emergency', urgency: 'critical', autoReplyable: false };
  }
  if (matches(text, BOOKING_ISSUE)) {
    return { category: 'booking_issue', urgency: 'high', autoReplyable: false };
  }
  if (matches(text, FEEDBACK)) {
    return { category: 'feedback', urgency: 'low', autoReplyable: true };
  }
  return { category: 'question', urgency: 'normal', autoReplyable: true };
}

export interface OnTripResult {
  category: TripIssueCategory;
  urgency: Urgency;
  escalated: boolean;
  reply: string;
}

const ACK: Record<TripIssueCategory, string> = {
  emergency:
    "I'm getting a member of our team to call you right now — please stay where you are and keep your phone handy.",
  booking_issue:
    "I'm sorry about that. I've flagged this to our on-trip team and someone will call you back very shortly to fix it.",
  feedback: "That's wonderful to hear — thank you! I'll pass it on to your trip team.",
  question: "Thanks for reaching out — here to help. I'll get you an answer right away.",
};

/**
 * Handle one on-trip message end to end: triage it, escalate urgent cases to a
 * human through the tool registry, and return the acknowledgement to send back.
 */
export async function handleOnTripMessage(
  deps: MayaDeps,
  msg: { phone: string | null; name?: string | null; text: string; sessionId?: string },
): Promise<OnTripResult> {
  const triage = triageMessage(msg.text);
  let escalated = false;

  if (!triage.autoReplyable) {
    const ctx = {
      channel: 'chat' as const,
      callerPhone: msg.phone,
      callerName: msg.name ?? null,
      sessionId: msg.sessionId ?? `ontrip_${Date.now()}`,
      deps,
    };
    const result = await dispatchTool(
      'escalate_to_human',
      {
        reason: `On-trip ${triage.category} (${triage.urgency}): ${msg.text}`,
        name: msg.name ?? undefined,
        phone: msg.phone ?? undefined,
      },
      ctx,
    );
    escalated = result.ok;
  }

  return {
    category: triage.category,
    urgency: triage.urgency,
    escalated,
    reply: ACK[triage.category],
  };
}
