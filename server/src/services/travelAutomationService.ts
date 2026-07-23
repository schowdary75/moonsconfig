import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { executeApprovedMayaProposal } from '../maya/governance/executor.js';
import { expireMayaActionProposals } from '../maya/governance/actionService.js';
import { env } from '../config/env.js';
import { runIncidentRecoverySweep, startIncidentRecovery } from './incidentRecoveryService.js';

const MAX_ATTEMPTS = 5;

function payloadObject(payload: Prisma.JsonValue): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

async function createFlightWatches(tripId: string) {
  const trip = await prisma.travelTrip.findUnique({ where: { id: tripId } });
  if (!trip?.bookingId) return { watchesCreated: 0 };
  const flights = await prisma.tripService.findMany({
    where: { tripId, serviceType: 'flight', status: { in: ['optioned', 'confirmed'] } },
  });
  let watchesCreated = 0;
  for (const flight of flights) {
    const data = payloadObject(flight.serviceData);
    const flightNumber = typeof data.flightNumber === 'string' ? data.flightNumber.trim() : '';
    if (!flightNumber || !flight.startsAt) continue;
    const existing = await prisma.maya_flight_watches.findFirst({
      where: {
        booking_id: trip.bookingId,
        flight_number: flightNumber,
        scheduled_departure: flight.startsAt,
      },
      select: { id: true },
    });
    if (existing) continue;
    const traveller = await prisma.traveller.findUnique({ where: { id: trip.travellerId } });
    await prisma.maya_flight_watches.create({
      data: {
        booking_id: trip.bookingId,
        flight_number: flightNumber,
        scheduled_departure: flight.startsAt,
        international: trip.direction !== 'domestic',
        traveller_phone: traveller?.phone ?? null,
        traveller_name: traveller?.displayName ?? null,
        origin_country:
          typeof data.originCountry === 'string'
            ? data.originCountry.slice(0, 2).toUpperCase()
            : null,
        destination_country:
          typeof data.destinationCountry === 'string'
            ? data.destinationCountry.slice(0, 2).toUpperCase()
            : null,
        carrier_country:
          typeof data.carrierCountry === 'string'
            ? data.carrierCountry.slice(0, 2).toUpperCase()
            : null,
        jurisdiction: typeof data.jurisdiction === 'string' ? data.jurisdiction.slice(0, 40) : null,
        policy_version:
          typeof data.policyVersion === 'string' ? data.policyVersion.slice(0, 80) : null,
      },
    });
    watchesCreated += 1;
  }
  return { watchesCreated };
}

async function handleEvent(event: {
  eventType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
}) {
  const payload = payloadObject(event.payload);
  if (event.eventType === 'BookingConfirmed') {
    return createFlightWatches(String(payload.tripId ?? event.aggregateId));
  }
  if (event.eventType === 'MayaActionApproved') {
    return executeApprovedMayaProposal(String(payload.proposalId ?? event.aggregateId));
  }
  if (event.eventType === 'IncidentOpened') {
    return startIncidentRecovery(String(payload.recoveryId ?? event.aggregateId));
  }
  // Playbooks that still require provider certification deliberately become a
  // durable staff-visible run instead of guessing or calling an unconfigured API.
  return { recorded: true, awaitingCertifiedHandler: true };
}

async function processEvent(eventId: string) {
  const claimed = await prisma.domainOutboxEvent.updateMany({
    where: { id: eventId, status: { in: ['pending', 'failed'] }, availableAt: { lte: new Date() } },
    data: { status: 'publishing', attempts: { increment: 1 } },
  });
  if (!claimed.count) return { claimed: false };
  const event = await prisma.domainOutboxEvent.findUniqueOrThrow({ where: { id: eventId } });
  const run = await prisma.automationRun.upsert({
    where: { idempotencyKey: `event:${event.id}` },
    update: { status: 'running', attempts: { increment: 1 }, startedAt: new Date() },
    create: {
      automationKey: event.eventType,
      sourceEventId: event.id,
      idempotencyKey: `event:${event.id}`,
      status: 'running',
      context: (event.payload === null ? {} : event.payload) as Prisma.InputJsonValue,
      attempts: 1,
      startedAt: new Date(),
    },
  });
  try {
    const result = await handleEvent(event);
    await prisma.$transaction([
      prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'succeeded',
          context: { payload: event.payload, result } as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      }),
      prisma.domainOutboxEvent.update({
        where: { id: event.id },
        data: { status: 'published', publishedAt: new Date(), lastError: null },
      }),
    ]);
    return { claimed: true, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown automation error';
    const dead = event.attempts >= MAX_ATTEMPTS;
    const retryAt = new Date(Date.now() + Math.min(30 * 60_000, 2 ** event.attempts * 30_000));
    await prisma.$transaction([
      prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: dead ? 'dead_letter' : 'failed',
          lastError: message.slice(0, 600),
          nextAttemptAt: dead ? null : retryAt,
        },
      }),
      prisma.domainOutboxEvent.update({
        where: { id: event.id },
        data: {
          status: dead ? 'dead_letter' : 'failed',
          lastError: message.slice(0, 600),
          availableAt: retryAt,
        },
      }),
    ]);
    return { claimed: true, ok: false, deadLetter: dead };
  }
}

export async function runTravelAutomationBatch(limit = 50) {
  const capabilities = [
    ['flight_status', 'aerodatabox', env.travelProviders.flightStatus.configured],
    ['transactional_messaging', 'meta_whatsapp', env.travelProviders.whatsapp.configured],
    [
      'travel_rules',
      env.travelProviders.travelRules.provider,
      env.travelProviders.travelRules.configured,
    ],
    [
      'insurance',
      env.travelProviders.insurance.provider || 'none',
      env.travelProviders.insurance.configured,
    ],
    [
      'inventory',
      env.travelProviders.inventory.provider || 'none',
      env.travelProviders.inventory.configured,
    ],
    ['payments', env.travelProviders.payments.provider, env.travelProviders.payments.configured],
    [
      'accounting',
      env.travelProviders.accounting.provider,
      env.travelProviders.accounting.configured,
    ],
  ] as const;
  for (const [capability, provider, configured] of capabilities) {
    await prisma.providerCapabilityHealth.upsert({
      where: { capability_provider: { capability, provider } },
      update: {
        status: configured ? 'degraded' : 'unconfigured',
        checkedAt: new Date(),
        details: configured
          ? { configuration: 'present', liveProbe: 'not_run_in_dispatcher' }
          : { configuration: 'missing', failClosed: true },
      },
      create: {
        capability,
        provider,
        status: configured ? 'degraded' : 'unconfigured',
        checkedAt: new Date(),
        details: configured
          ? { configuration: 'present', liveProbe: 'not_run_in_dispatcher' }
          : { configuration: 'missing', failClosed: true },
      },
    });
  }
  await expireMayaActionProposals();
  const events = await prisma.domainOutboxEvent.findMany({
    where: { status: { in: ['pending', 'failed'] }, availableAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  const results = [];
  for (const event of events) results.push(await processEvent(event.id));
  const incidentRecovery = await runIncidentRecoverySweep();
  return {
    scanned: events.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => result.claimed && !result.ok).length,
    incidentRecovery,
  };
}
