import { prisma } from '../config/prisma.js';

const DEFAULT_MILESTONES = ['Arrival & Check-in', 'On Tour', 'Departure'];

export interface TripPlanProvisionResult {
  provisioned: boolean;
  reason?: string;
  scheduleCount?: number;
}

/**
 * Snapshot a package's template itinerary into per-booking operational tables
 * (trip_daily_schedules + trip_live_milestones) so the Journey Manager and the
 * customer's live-trip view have a schedule ops can edit for this traveler
 * without touching the shared package template.
 *
 * Idempotent: a booking that already has schedule rows is left untouched.
 */
export async function provisionTripPlanForBooking(
  bookingId: number,
): Promise<TripPlanProvisionResult> {
  const booking = await prisma.bookings.findUnique({ where: { id: bookingId } });
  if (!booking) return { provisioned: false, reason: 'booking_not_found' };
  if (booking.item_type !== 'package') return { provisioned: false, reason: 'not_a_package' };
  if (booking.status !== 'confirmed') return { provisioned: false, reason: 'not_confirmed' };

  const existing = await prisma.trip_daily_schedules.count({ where: { booking_id: bookingId } });
  if (existing > 0) return { provisioned: false, reason: 'already_provisioned' };

  const packageRecord = await prisma.packages.findFirst({
    where: { name: booking.item_name },
    select: { id: true },
  });
  if (!packageRecord) return { provisioned: false, reason: 'package_not_found' };

  const itinerary = await prisma.package_itinerary.findMany({
    where: { package_id: packageRecord.id },
    orderBy: { day_number: 'asc' },
  });
  if (itinerary.length === 0) return { provisioned: false, reason: 'no_template_itinerary' };

  const scheduleRows: Array<{
    booking_id: number;
    day_number: number;
    time_slot: string;
    activity_title: string;
    inclusions_text: string | null;
  }> = [];
  for (const day of itinerary) {
    const slots: Array<[string, string | null]> = [
      ['Morning', day.slot_morning],
      ['Afternoon', day.slot_afternoon],
      ['Evening', day.slot_evening],
    ];
    const filled = slots.filter(([, activity]) => activity && activity.trim().length > 0);
    if (filled.length === 0) {
      scheduleRows.push({
        booking_id: bookingId,
        day_number: day.day_number,
        time_slot: 'Full Day',
        activity_title: day.title,
        inclusions_text: day.description || null,
      });
      continue;
    }
    filled.forEach(([slotLabel, activity], index) => {
      scheduleRows.push({
        booking_id: bookingId,
        day_number: day.day_number,
        time_slot: slotLabel,
        activity_title: (activity as string).trim(),
        // Keep the day's narrative on the first entry so the customer view can show it once.
        inclusions_text: index === 0 ? day.description || null : null,
      });
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.trip_daily_schedules.createMany({ data: scheduleRows });
    const milestoneCount = await tx.trip_live_milestones.count({
      where: { booking_id: bookingId },
    });
    if (milestoneCount === 0) {
      await tx.trip_live_milestones.createMany({
        data: DEFAULT_MILESTONES.map((phase) => ({
          booking_id: bookingId,
          phase_name: phase,
          status: 'pending',
        })),
      });
    }
  });

  return { provisioned: true, scheduleCount: scheduleRows.length };
}

/**
 * Best-effort wrapper for use inside payment verification flows: provisioning
 * problems must never fail or roll back a payment confirmation.
 */
export async function provisionTripPlanSafely(bookingId: number): Promise<void> {
  try {
    await provisionTripPlanForBooking(bookingId);
  } catch (error) {
    console.warn(
      `Trip plan provisioning skipped for booking ${bookingId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}
