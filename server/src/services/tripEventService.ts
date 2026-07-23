import { ensureRedis, redis } from '../config/redis.js';
import { getTenantRuntime } from '../config/tenantContext.js';
import { logger } from '../logger/index.js';

export const TRIP_EVENTS_CHANNEL = 'moonsconfig:trip-events';

export type TripInvalidationReason =
  | 'activity_status'
  | 'milestone_status'
  | 'incident_created'
  | 'incident_updated'
  | 'driver_updated';

export interface TripInvalidationPayload {
  bookingId: number;
  reason: TripInvalidationReason;
  occurredAt: string;
}

export interface TripEventMessage {
  tenantId?: string;
  userId: number;
  staffBroadcast: boolean;
  event: 'trip:invalidate';
  payload: TripInvalidationPayload;
}

export async function publishTripInvalidation(
  userId: number,
  bookingId: number,
  reason: TripInvalidationReason,
): Promise<void> {
  const message: TripEventMessage = {
    tenantId: getTenantRuntime()?.tenantId,
    userId,
    staffBroadcast: true,
    event: 'trip:invalidate',
    payload: { bookingId, reason, occurredAt: new Date().toISOString() },
  };

  try {
    await ensureRedis();
    await redis.publish(TRIP_EVENTS_CHANNEL, JSON.stringify(message));
  } catch (error) {
    logger.warn('Trip invalidation publish failed', {
      bookingId,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
