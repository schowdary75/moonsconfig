/**
 * Visa application case tracking — turns the existing visa *content* CMS into
 * an actual case tracker so travellers stop asking "will my visa come in time?".
 * This is the pure state machine + guidance; a persistent `visa_cases` table
 * (additive migration) backs it in production.
 */

export type VisaStatus =
  | 'not_started'
  | 'documents_pending'
  | 'submitted'
  | 'under_review'
  | 'additional_docs_required'
  | 'approved'
  | 'rejected';

const TRANSITIONS: Record<VisaStatus, VisaStatus[]> = {
  not_started: ['documents_pending'],
  documents_pending: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected', 'additional_docs_required'],
  additional_docs_required: ['submitted'],
  approved: [],
  rejected: [],
};

const GUIDANCE: Record<VisaStatus, string> = {
  not_started: 'Share the destination and travel dates so we can open the visa file.',
  documents_pending: 'Upload passport, photo and supporting documents to proceed.',
  submitted: 'Application lodged — awaiting the consulate to begin review.',
  under_review: 'Under consular review. We are tracking it and will update you.',
  additional_docs_required: 'The consulate asked for more documents — action needed now.',
  approved: 'Visa approved. Download the e-visa / collect the passport.',
  rejected: 'Application rejected — our team will advise on re-application or refund.',
};

export function isTerminal(status: VisaStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function canTransition(from: VisaStatus, to: VisaStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface VisaCase {
  status: VisaStatus;
  destination: string;
  travelDate: Date;
  updatedAt: Date;
}

export interface VisaTransitionResult {
  ok: boolean;
  status: VisaStatus;
  guidance: string;
  error?: string;
}

/** Attempt a status change, enforcing the allowed lifecycle. */
export function advanceVisaCase(
  current: VisaCase,
  to: VisaStatus,
  now: Date = new Date(),
): VisaTransitionResult {
  if (!canTransition(current.status, to)) {
    return {
      ok: false,
      status: current.status,
      guidance: GUIDANCE[current.status],
      error: `Cannot move a visa case from "${current.status}" to "${to}".`,
    };
  }
  current.status = to;
  current.updatedAt = now;
  return { ok: true, status: to, guidance: GUIDANCE[to] };
}

/**
 * Flag cases at risk: still not approved with the travel date approaching.
 * Consulates typically need lead time, so anything inside `bufferDays` that is
 * not yet approved is a risk worth surfacing.
 */
export function isAtRisk(current: VisaCase, now: Date = new Date(), bufferDays = 14): boolean {
  if (current.status === 'approved') return false;
  const daysToTravel = Math.floor((current.travelDate.getTime() - now.getTime()) / 86_400_000);
  return daysToTravel <= bufferDays;
}

export function visaGuidance(status: VisaStatus): string {
  return GUIDANCE[status];
}
