import type { MayaDeps } from '../types.js';
import type { FlightStatus, FlightStatusProvider } from './flightStatusProvider.js';
import { flightStatusProvider } from './flightStatusProvider.js';
import { assessPassengerRights, type PassengerRightsAssessment } from './passengerRightsPolicy.js';

/**
 * The disruption shield: the piece that attacks the #1 real-world traveller
 * complaint — silence during delays and cancellations. Given the flights on a
 * trip, it watches their status and, the moment one is delayed or cancelled,
 * proactively (a) opens a contingency case for the ops team and (b) messages the
 * traveller with what happened and their rights.
 */

/** One flight the shield is watching, tied back to a booking + traveller. */
export interface FlightWatch {
  /** Row id in maya_flight_watches, when the watch is persisted. */
  watchId?: number;
  bookingId: number;
  flightNumber: string;
  scheduledDeparture: Date;
  /** International itineraries use a higher operational-severity threshold. */
  international: boolean;
  travellerPhone: string | null;
  travellerName?: string | null;
  originCountry?: string | null;
  destinationCountry?: string | null;
  carrierCountry?: string | null;
  jurisdiction?: string | null;
}

export type DisruptionSeverity = 'none' | 'low' | 'medium' | 'high';

export interface DisruptionOutcome {
  bookingId: number;
  flightNumber: string;
  severity: DisruptionSeverity;
  /** Retained for compatibility; legal eligibility is never inferred from status alone. */
  autoRefundEligible: boolean;
  contingencyId: number | null;
  alerted: boolean;
  action: 'none' | 'opened_case';
  passengerRights: PassengerRightsAssessment;
}

export function classifyDisruption(
  status: FlightStatus,
  international: boolean,
): {
  severity: DisruptionSeverity;
  autoRefundEligible: boolean;
} {
  if (status.state === 'cancelled') return { severity: 'high', autoRefundEligible: false };
  if (status.state === 'delayed') {
    const operationalHighThreshold = international ? 360 : 180;
    if (status.delayMinutes >= operationalHighThreshold) {
      return { severity: 'high', autoRefundEligible: false };
    }
    if (status.delayMinutes >= 60) return { severity: 'medium', autoRefundEligible: false };
    if (status.delayMinutes > 0) return { severity: 'low', autoRefundEligible: false };
  }
  return { severity: 'none', autoRefundEligible: false };
}

function travellerMessage(
  watch: FlightWatch,
  status: FlightStatus,
  rightsAssessment: PassengerRightsAssessment,
): string {
  const opening =
    status.state === 'cancelled'
      ? `Your flight ${watch.flightNumber} has been cancelled.`
      : `Heads up: your flight ${watch.flightNumber} is delayed by about ${Math.round(
          status.delayMinutes / 60,
        )}h ${status.delayMinutes % 60}m.`;
  const nextStep = rightsAssessment.confirmationRequired
    ? ' Our team is checking the applicable airline and passenger-rights options. We will not make a change or refund choice without your approval.'
    : ' Our team is confirming the available refund or rerouting choice with you now.';
  return `${opening}${nextStep}\n\n— Maya, MooNs Travel`;
}

/**
 * Evaluate a single watched flight and, if disrupted, open a contingency case
 * and alert the traveller. De-duplicates against an existing unresolved case so
 * a traveller is never spammed for the same disruption.
 */
export async function evaluateWatch(
  watch: FlightWatch,
  status: FlightStatus,
  deps: MayaDeps,
): Promise<DisruptionOutcome> {
  const { severity, autoRefundEligible } = classifyDisruption(status, watch.international);
  const passengerRights = assessPassengerRights(status, {
    jurisdiction: watch.jurisdiction,
    originCountry: watch.originCountry,
    destinationCountry: watch.destinationCountry,
    carrierCountry: watch.carrierCountry,
    international: watch.international,
  });
  const base: DisruptionOutcome = {
    bookingId: watch.bookingId,
    flightNumber: watch.flightNumber,
    severity,
    autoRefundEligible,
    contingencyId: null,
    alerted: false,
    action: 'none',
    passengerRights,
  };
  if (severity === 'none' || severity === 'low') return base;

  // Don't re-open / re-alert for a disruption we already flagged.
  const existing = await deps.prisma.booking_contingencies.findFirst({
    where: { booking_id: watch.bookingId, issue_type: 'flight_disruption', resolved_at: null },
    select: { id: true },
  });
  if (existing) return { ...base, contingencyId: existing.id, action: 'none' };

  const contingency = await deps.prisma.booking_contingencies.create({
    data: {
      booking_id: watch.bookingId,
      issue_type: 'flight_disruption',
      severity,
      details:
        `Flight ${watch.flightNumber} ${status.state}` +
        (status.delayMinutes ? ` (+${status.delayMinutes} min)` : '') +
        ` — ${passengerRights.jurisdiction} assessment: ${passengerRights.reason}`,
      plan_a_status: 'failed',
    },
    select: { id: true },
  });

  let alerted = false;
  if (watch.travellerPhone) {
    const delivery = await deps.sendWhatsApp(
      watch.travellerPhone,
      travellerMessage(watch, status, passengerRights),
    );
    alerted = delivery.ok;
  }

  await deps.logActivity(
    'contingencies',
    'flight_disruption',
    contingency.id,
    `Maya opened a ${severity} contingency for booking #${watch.bookingId} (${watch.flightNumber} ${status.state})` +
      `${alerted ? ' and alerted the traveller' : ''}.`,
    'attention',
  );

  return {
    ...base,
    contingencyId: contingency.id,
    alerted,
    action: 'opened_case',
  };
}

/**
 * Feed of flights due to be checked. Backed by a `maya_flight_watches` table
 * once provisioned (see the additive migration in prisma/migrations); until
 * then it returns nothing, so the shield stays dormant rather than guessing.
 */
export async function scanDueWatches(deps: MayaDeps, horizonHours = 48): Promise<FlightWatch[]> {
  const now = deps.now();
  const horizon = new Date(now.getTime() + horizonHours * 3_600_000);
  const rows = await deps.prisma.maya_flight_watches.findMany({
    where: { active: true, scheduled_departure: { gte: now, lte: horizon } },
    orderBy: { scheduled_departure: 'asc' },
    take: 200,
  });
  return rows.map((r) => ({
    watchId: r.id,
    bookingId: r.booking_id,
    flightNumber: r.flight_number,
    scheduledDeparture: r.scheduled_departure,
    international: r.international,
    travellerPhone: r.traveller_phone,
    travellerName: r.traveller_name,
    originCountry: r.origin_country,
    destinationCountry: r.destination_country,
    carrierCountry: r.carrier_country,
    jurisdiction: r.jurisdiction,
  }));
}

/** Run one disruption sweep over all due watches, stamping each as checked. */
export async function runDisruptionSweep(
  deps: MayaDeps,
  provider: FlightStatusProvider = flightStatusProvider,
  watches?: FlightWatch[],
): Promise<DisruptionOutcome[]> {
  const due = watches ?? (await scanDueWatches(deps));
  const outcomes: DisruptionOutcome[] = [];
  for (const watch of due) {
    const status = await provider.getStatus(watch.flightNumber, watch.scheduledDeparture);
    outcomes.push(await evaluateWatch(watch, status, deps));
    if (watch.watchId != null) {
      await deps.prisma.maya_flight_watches
        .update({ where: { id: watch.watchId }, data: { last_checked_at: deps.now() } })
        .catch(() => {});
    }
  }
  return outcomes;
}
