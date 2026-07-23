import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

export const TRAVEL_EVENT_TYPES = [
  'LeadCaptured',
  'LeadQualified',
  'QuoteDrafted',
  'QuoteAccepted',
  'PaymentDue',
  'PaymentReceived',
  'BookingConfirmed',
  'SupplierConfirmationOverdue',
  'DocumentExpiring',
  'TripStarting',
  'DisruptionDetected',
  'IncidentOpened',
  'RefundRequested',
  'RefundSettled',
  'TripCompleted',
  'MayaActionApproved',
] as const;

export type TravelEventType = (typeof TRAVEL_EVENT_TYPES)[number];

type OutboxClient = Pick<PrismaClient, 'domainOutboxEvent'> | Prisma.TransactionClient;

export function travelEventKey(
  eventType: TravelEventType,
  aggregateType: string,
  aggregateId: string,
  discriminator = '1',
) {
  return createHash('sha256')
    .update(`${eventType}:${aggregateType}:${aggregateId}:${discriminator}`)
    .digest('hex');
}

export async function appendTravelEvent(
  db: OutboxClient,
  input: {
    eventType: TravelEventType;
    aggregateType: string;
    aggregateId: string;
    payload: Prisma.InputJsonValue;
    idempotencyKey?: string;
    discriminator?: string;
  },
) {
  const idempotencyKey =
    input.idempotencyKey ??
    travelEventKey(input.eventType, input.aggregateType, input.aggregateId, input.discriminator);
  return db.domainOutboxEvent.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload,
      idempotencyKey,
    },
  });
}
