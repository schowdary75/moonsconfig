import type { MayaDeps } from '../types.js';
import {
  advanceVisaCase,
  isAtRisk,
  visaGuidance,
  type VisaCase,
  type VisaStatus,
} from './visaCase.js';

/**
 * Persistence for visa cases on top of the additive `visa_cases` table. The
 * lifecycle rules live in visaCase.ts; this layer just loads/saves and surfaces
 * the at-risk view the ops team needs.
 */

export interface VisaCaseRow {
  id: number;
  destination: string;
  travelDate: Date;
  status: VisaStatus;
  guidance: string;
  atRisk: boolean;
  updatedAt: Date;
}

function toRow(
  r: { id: number; destination: string; travel_date: Date; status: string; updated_at: Date },
  now: Date,
): VisaCaseRow {
  const status = r.status as VisaStatus;
  const model: VisaCase = {
    status,
    destination: r.destination,
    travelDate: r.travel_date,
    updatedAt: r.updated_at,
  };
  return {
    id: r.id,
    destination: r.destination,
    travelDate: r.travel_date,
    status,
    guidance: visaGuidance(status),
    atRisk: isAtRisk(model, now),
    updatedAt: r.updated_at,
  };
}

export async function createVisaCase(
  deps: MayaDeps,
  input: {
    destination: string;
    travelDate: Date;
    leadId?: number | null;
    customerId?: number | null;
  },
): Promise<VisaCaseRow> {
  const row = await deps.prisma.visa_cases.create({
    data: {
      destination: input.destination,
      travel_date: input.travelDate,
      lead_id: input.leadId ?? null,
      customer_id: input.customerId ?? null,
      status: 'not_started',
    },
  });
  return toRow(row, deps.now());
}

export async function listVisaCases(deps: MayaDeps): Promise<VisaCaseRow[]> {
  const rows = await deps.prisma.visa_cases.findMany({
    orderBy: { travel_date: 'asc' },
    take: 500,
  });
  const now = deps.now();
  return rows.map((r) => toRow(r, now));
}

/** Move a case forward, enforcing the lifecycle, and persist the new status. */
export async function advanceCase(
  deps: MayaDeps,
  caseId: number,
  to: VisaStatus,
): Promise<{ ok: boolean; status: VisaStatus; guidance: string; error?: string }> {
  const existing = await deps.prisma.visa_cases.findUnique({ where: { id: caseId } });
  if (!existing)
    return { ok: false, status: 'not_started', guidance: '', error: 'Visa case not found.' };

  const model: VisaCase = {
    status: existing.status as VisaStatus,
    destination: existing.destination,
    travelDate: existing.travel_date,
    updatedAt: existing.updated_at,
  };
  const result = advanceVisaCase(model, to, deps.now());
  if (!result.ok) return result;

  await deps.prisma.visa_cases.update({
    where: { id: caseId },
    data: { status: result.status, updated_at: deps.now() },
  });
  await deps.logActivity(
    'visa',
    'status_change',
    caseId,
    `Visa case #${caseId} → ${result.status}.`,
  );
  return result;
}
