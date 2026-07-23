/**
 * Passport & document rule engine — attacks the "will my passport be accepted?"
 * anxiety with the single most common cause of denied boarding: the six-month
 * validity rule. `assessPassport` is pure and exact; the vault interface is the
 * storage seam (an additive `traveller_documents` table enables persistence).
 */

export interface PassportAssessment {
  valid: boolean;
  /** Whole months of validity remaining at the travel date. */
  monthsValidAtTravel: number;
  /** Most destinations require 6 months' validity beyond entry. */
  sixMonthRuleOk: boolean;
  expired: boolean;
  alert: string | null;
}

const MONTH_MS = 30 * 86_400_000;

export function assessPassport(
  passportExpiry: Date,
  travelDate: Date,
  now: Date = new Date(),
): PassportAssessment {
  const expired = passportExpiry.getTime() <= now.getTime();
  const monthsValidAtTravel = Math.floor(
    (passportExpiry.getTime() - travelDate.getTime()) / MONTH_MS,
  );
  const sixMonthRuleOk = monthsValidAtTravel >= 6;

  let alert: string | null = null;
  if (expired) {
    alert = 'Passport has already expired — it must be renewed before any international travel.';
  } else if (passportExpiry.getTime() <= travelDate.getTime()) {
    alert = 'Passport expires on or before the travel date — renew immediately.';
  } else if (!sixMonthRuleOk) {
    alert = `Passport is valid for only ${Math.max(
      0,
      monthsValidAtTravel,
    )} month(s) beyond travel. Most countries require 6 months — advise the traveller to renew.`;
  }

  return {
    valid: !expired && sixMonthRuleOk,
    monthsValidAtTravel,
    sixMonthRuleOk,
    expired,
    alert,
  };
}

export interface StoredDocument {
  id: string;
  travelerRef: string;
  type: 'passport' | 'visa' | 'id' | 'other';
  fileUrl: string;
  expiresOn?: Date | null;
}

/**
 * Document vault storage seam. The in-memory fallback lets the feature run in
 * dev; production swaps in a persistent implementation backed by an additive
 * `traveller_documents` table + the existing secure upload service.
 */
export interface DocumentVault {
  put(doc: Omit<StoredDocument, 'id'>): Promise<StoredDocument>;
  listFor(travelerRef: string): Promise<StoredDocument[]>;
}

export class InMemoryDocumentVault implements DocumentVault {
  private readonly store = new Map<string, StoredDocument[]>();
  private seq = 0;

  async put(doc: Omit<StoredDocument, 'id'>): Promise<StoredDocument> {
    const saved: StoredDocument = { id: `doc_${++this.seq}`, ...doc };
    const list = this.store.get(doc.travelerRef) ?? [];
    list.push(saved);
    this.store.set(doc.travelerRef, list);
    return saved;
  }

  async listFor(travelerRef: string): Promise<StoredDocument[]> {
    return this.store.get(travelerRef) ?? [];
  }
}

export const documentVault: DocumentVault = new InMemoryDocumentVault();
