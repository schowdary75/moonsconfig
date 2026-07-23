// @ts-nocheck
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { defineOperation } from './defineOperation.js';
import { requireAdmin } from '../legacy/api/db.functions.server.js';
import {
  publishTripInvalidation,
  type TripInvalidationReason,
} from '../services/tripEventService.js';
import { getTenantRuntime } from '../config/tenantContext.js';
import { tripDayNumber as calculateTripDayNumber } from '../utils/tripTime.js';

const adminAuthSchema = z.object({
  email: z.string().email(),
  sessionToken: z.string().min(20),
});

const ACTIVITY_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'delayed',
  'cancelled',
] as const;
const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed', 'delayed'] as const;

type IncidentRow = Awaited<ReturnType<typeof prisma.booking_contingencies.findMany>>[number];

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function tripDayNumber(travelDate: Date): number {
  return calculateTripDayNumber(travelDate, getTenantRuntime()?.timezone ?? 'Asia/Kolkata');
}

function incidentIsOpen(incident: IncidentRow): boolean {
  return !incident.plan_b_authorized && incident.plan_a_status !== 'resolved';
}

function incidentStatus(
  incident: IncidentRow,
): 'awaiting_authorization' | 'in_progress' | 'resolved' {
  if (incident.plan_b_authorized || incident.plan_a_status === 'resolved') return 'resolved';
  if (incident.plan_a_status === 'in_progress') return 'in_progress';
  return 'awaiting_authorization';
}

async function logJourneyAdminAction(
  adminEmail: string,
  action: string,
  targetType: string,
  targetId: string | number | null,
  afterValue: unknown,
) {
  await prisma.admin_audit_logs.create({
    data: {
      admin_email: adminEmail,
      action,
      target_type: targetType,
      target_id: targetId == null ? null : String(targetId),
      before_json: null,
      after_json: afterValue == null ? null : JSON.stringify(afterValue),
    },
  });
}

async function loadGuests(userIds: number[]) {
  const guests = userIds.length
    ? await prisma.customerUser.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, phone: true },
      })
    : [];
  return new Map(guests.map((guest) => [guest.id, guest]));
}

async function publishBookingInvalidation(bookingId: number, reason: TripInvalidationReason) {
  const booking = await prisma.bookings.findUnique({
    where: { id: bookingId },
    select: { user_id: true },
  });
  if (booking) await publishTripInvalidation(booking.user_id, bookingId, reason);
}

export const adminGetJourneyBoard = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema }))
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const bookings = await prisma.bookings.findMany({
      where: { status: 'confirmed' },
      orderBy: { travel_date: 'asc' },
    });
    const bookingIds = bookings.map((booking) => booking.id);
    const guestMap = await loadGuests([...new Set(bookings.map((booking) => booking.user_id))]);

    const [schedules, milestones, contingencies] = bookingIds.length
      ? await Promise.all([
          prisma.trip_daily_schedules.findMany({
            where: { booking_id: { in: bookingIds } },
            orderBy: [{ day_number: 'asc' }, { id: 'asc' }],
          }),
          prisma.trip_live_milestones.findMany({
            where: { booking_id: { in: bookingIds } },
            orderBy: { id: 'asc' },
          }),
          prisma.booking_contingencies.findMany({
            where: { booking_id: { in: bookingIds } },
          }),
        ])
      : [[], [], []];

    const driverIds = [
      ...new Set(schedules.map((item) => item.driver_id).filter((id): id is number => id != null)),
    ];
    const drivers = driverIds.length
      ? await prisma.operators.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, company_name: true, contact_name: true, phone: true },
        })
      : [];
    const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));

    const activeDriverIds = new Set<number>();
    let activeTrips = 0;
    let atRisk = 0;

    const trips = bookings.map((booking) => {
      const guest = guestMap.get(booking.user_id) ?? null;
      const bookingSchedules = schedules.filter((item) => item.booking_id === booking.id);
      const bookingMilestones = milestones.filter((item) => item.booking_id === booking.id);
      const openIncidents = contingencies.filter(
        (incident) => incident.booking_id === booking.id && incidentIsOpen(incident),
      );

      const dayNumber = tripDayNumber(booking.travel_date);
      const totalDays = bookingSchedules.length
        ? Math.max(...bookingSchedules.map((item) => item.day_number))
        : null;
      const phase: 'upcoming' | 'active' | 'completed' =
        dayNumber < 1
          ? 'upcoming'
          : totalDays != null && dayNumber > totalDays
            ? 'completed'
            : 'active';

      const todaysItems = bookingSchedules.filter((item) => item.day_number === dayNumber);
      const currentActivity =
        todaysItems.find((item) => item.status === 'in_progress') ??
        todaysItems.find((item) => !['completed', 'cancelled'].includes(item.status)) ??
        todaysItems[todaysItems.length - 1] ??
        null;

      const delayed =
        todaysItems.some((item) => item.status === 'delayed') ||
        bookingMilestones.some((item) => item.status === 'delayed');

      const status =
        openIncidents.length > 0
          ? 'at_risk'
          : delayed
            ? 'delayed'
            : phase === 'active'
              ? 'on_schedule'
              : phase;

      if (phase === 'active') {
        activeTrips += 1;
        if (status === 'at_risk' || status === 'delayed') atRisk += 1;
        for (const item of todaysItems) {
          if (item.driver_id != null) activeDriverIds.add(item.driver_id);
        }
      }

      const driver =
        currentActivity?.driver_id != null
          ? (driverMap.get(currentActivity.driver_id) ?? null)
          : null;

      return {
        bookingId: booking.id,
        reference: booking.booking_reference,
        guestName: guest?.name ?? 'Unknown guest',
        guestEmail: guest?.email ?? null,
        guestPhone: guest?.phone ?? null,
        destination: booking.item_name,
        itemType: booking.item_type,
        travelDate: booking.travel_date,
        dayNumber,
        totalDays,
        phase,
        status,
        currentActivity: currentActivity
          ? {
              id: currentActivity.id,
              title: currentActivity.activity_title,
              timeSlot: currentActivity.time_slot,
              status: currentActivity.status,
            }
          : null,
        driver: driver
          ? { name: driver.company_name, contact: driver.contact_name, phone: driver.phone }
          : null,
        openIncidents: openIncidents.length,
      };
    });

    const sosAlerts = contingencies.filter(
      (incident) => incidentIsOpen(incident) && incident.severity === 'critical',
    ).length;

    return {
      trips,
      stats: {
        activeTrips,
        atRisk,
        activeDrivers: activeDriverIds.size,
        sosAlerts,
      },
    };
  });

export const adminGetTripDetail = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema, bookingId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const booking = await prisma.bookings.findUnique({ where: { id: data.bookingId } });
    if (!booking) throw new Error(`Booking ${data.bookingId} not found`);

    const [guest, schedules, milestones, incidents] = await Promise.all([
      prisma.customerUser.findUnique({
        where: { id: booking.user_id },
        select: { id: true, name: true, email: true, phone: true },
      }),
      prisma.trip_daily_schedules.findMany({
        where: { booking_id: booking.id },
        orderBy: [{ day_number: 'asc' }, { id: 'asc' }],
      }),
      prisma.trip_live_milestones.findMany({
        where: { booking_id: booking.id },
        orderBy: { id: 'asc' },
      }),
      prisma.booking_contingencies.findMany({
        where: { booking_id: booking.id },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const driverIds = [
      ...new Set(schedules.map((item) => item.driver_id).filter((id): id is number => id != null)),
    ];
    const drivers = driverIds.length
      ? await prisma.operators.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, company_name: true, contact_name: true, phone: true },
        })
      : [];
    const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));

    return {
      booking: {
        id: booking.id,
        reference: booking.booking_reference,
        destination: booking.item_name,
        itemType: booking.item_type,
        travelDate: booking.travel_date,
        status: booking.status,
        amount: booking.amount,
        dayNumber: tripDayNumber(booking.travel_date),
      },
      guest,
      schedules: schedules.map((item) => ({
        id: item.id,
        dayNumber: item.day_number,
        timeSlot: item.time_slot,
        title: item.activity_title,
        status: item.status,
        driver: item.driver_id != null ? (driverMap.get(item.driver_id) ?? null) : null,
        inclusions: item.inclusions_text,
        exclusions: item.exclusions_text,
        estSpending: item.est_spending,
      })),
      milestones: milestones.map((item) => ({
        id: item.id,
        phaseName: item.phase_name,
        status: item.status,
        timestamp: item.timestamp,
      })),
      incidents: incidents.map((incident) => ({
        id: incident.id,
        issueType: incident.issue_type,
        severity: incident.severity,
        status: incidentStatus(incident),
        createdAt: incident.created_at,
      })),
    };
  });

export const adminUpdateTripActivityStatus = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      activityId: z.number().int().positive(),
      status: z.enum(ACTIVITY_STATUSES),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.auth);
    const activity = await prisma.trip_daily_schedules.update({
      where: { id: data.activityId },
      data: { status: data.status },
    });
    await logJourneyAdminAction(
      admin.email,
      'journey.activity_status',
      'trip_daily_schedule',
      activity.id,
      {
        status: data.status,
      },
    );
    await publishBookingInvalidation(activity.booking_id, 'activity_status');
    return { success: true, activity: { id: activity.id, status: activity.status } };
  });

export const adminUpdateTripMilestoneStatus = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      milestoneId: z.number().int().positive(),
      status: z.enum(MILESTONE_STATUSES),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.auth);
    const milestone = await prisma.trip_live_milestones.update({
      where: { id: data.milestoneId },
      data: {
        status: data.status,
        timestamp: data.status === 'completed' ? new Date() : null,
      },
    });
    await logJourneyAdminAction(
      admin.email,
      'journey.milestone_status',
      'trip_live_milestone',
      milestone.id,
      { status: data.status },
    );
    await publishBookingInvalidation(milestone.booking_id, 'milestone_status');
    return { success: true, milestone: { id: milestone.id, status: milestone.status } };
  });

export const adminGetIncidentDesk = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema }))
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const incidents = await prisma.booking_contingencies.findMany({
      orderBy: { created_at: 'desc' },
    });
    const bookingIds = [...new Set(incidents.map((incident) => incident.booking_id))];
    const bookings = bookingIds.length
      ? await prisma.bookings.findMany({ where: { id: { in: bookingIds } } })
      : [];
    const bookingMap = new Map(bookings.map((booking) => [booking.id, booking]));
    const guestMap = await loadGuests([...new Set(bookings.map((booking) => booking.user_id))]);

    const todayStart = startOfToday();
    let activeEscalations = 0;
    let awaitingAuthorization = 0;
    let resolvedToday = 0;

    const rows = incidents.map((incident) => {
      const status = incidentStatus(incident);
      if (status !== 'resolved') activeEscalations += 1;
      if (status === 'awaiting_authorization') awaitingAuthorization += 1;
      if (status === 'resolved' && incident.resolved_at && incident.resolved_at >= todayStart) {
        resolvedToday += 1;
      }

      const booking = bookingMap.get(incident.booking_id) ?? null;
      const guest = booking ? (guestMap.get(booking.user_id) ?? null) : null;

      return {
        id: incident.id,
        bookingId: incident.booking_id,
        reference: booking?.booking_reference ?? `Booking #${incident.booking_id}`,
        destination: booking?.item_name ?? null,
        guestName: guest?.name ?? 'Unknown guest',
        guestPhone: guest?.phone ?? null,
        guestEmail: guest?.email ?? null,
        issueType: incident.issue_type,
        severity: incident.severity,
        details: incident.details,
        status,
        planAStatus: incident.plan_a_status,
        planBAuthorized: incident.plan_b_authorized,
        requestedAmount: incident.refund_amount == null ? null : Number(incident.refund_amount),
        resolvedAt: incident.resolved_at,
        createdAt: incident.created_at,
      };
    });

    return {
      incidents: rows,
      stats: { activeEscalations, awaitingAuthorization, resolvedToday },
    };
  });

export const adminCreateIncident = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      bookingId: z.number().int().positive(),
      issueType: z.string().trim().min(1).max(100),
      severity: z.enum(INCIDENT_SEVERITIES).default('medium'),
      details: z.string().trim().max(5000).optional(),
      requestedAmount: z.number().min(0).max(99_999_999).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.auth);
    const booking = await prisma.bookings.findUnique({ where: { id: data.bookingId } });
    if (!booking) throw new Error(`Booking ${data.bookingId} not found`);

    const incident = await prisma.booking_contingencies.create({
      data: {
        booking_id: data.bookingId,
        issue_type: data.issueType,
        severity: data.severity,
        details: data.details || null,
        plan_a_status: 'failed',
        refund_amount: data.requestedAmount ?? null,
      },
    });
    await logJourneyAdminAction(
      admin.email,
      'incident.create',
      'booking_contingency',
      incident.id,
      {
        bookingId: data.bookingId,
        issueType: data.issueType,
        severity: data.severity,
      },
    );
    await publishBookingInvalidation(incident.booking_id, 'incident_created');
    return { success: true, incidentId: incident.id };
  });

export const adminUpdateIncidentStatus = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      incidentId: z.number().int().positive(),
      action: z.enum(['start_progress', 'authorize_plan_b', 'resolve', 'reopen']),
      refundAmount: z.number().min(0).max(99_999_999).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.auth);
    const incident = await prisma.booking_contingencies.findUnique({
      where: { id: data.incidentId },
    });
    if (!incident) throw new Error(`Incident ${data.incidentId} not found`);

    const resolver = await prisma.crmUser.findFirst({
      where: { email: admin.email },
      select: { id: true },
    });

    const updates: Record<string, unknown> = {};
    if (data.action === 'start_progress') {
      updates.plan_a_status = 'in_progress';
      updates.plan_b_authorized = false;
      updates.resolved_at = null;
      updates.resolved_by = null;
    } else if (data.action === 'authorize_plan_b') {
      updates.plan_b_authorized = true;
      updates.plan_a_status = 'resolved';
      updates.resolved_at = new Date();
      updates.resolved_by = resolver?.id ?? null;
      if (data.refundAmount != null) updates.refund_amount = data.refundAmount;
    } else if (data.action === 'resolve') {
      updates.plan_a_status = 'resolved';
      updates.resolved_at = new Date();
      updates.resolved_by = resolver?.id ?? null;
    } else {
      updates.plan_a_status = 'in_progress';
      updates.plan_b_authorized = false;
      updates.resolved_at = null;
      updates.resolved_by = null;
    }

    const updated = await prisma.booking_contingencies.update({
      where: { id: data.incidentId },
      data: updates,
    });
    await logJourneyAdminAction(
      admin.email,
      `incident.${data.action}`,
      'booking_contingency',
      updated.id,
      {
        action: data.action,
        refundAmount: data.refundAmount ?? null,
      },
    );
    await publishBookingInvalidation(updated.booking_id, 'incident_updated');
    return {
      success: true,
      incident: {
        id: updated.id,
        status: incidentStatus(updated),
        planBAuthorized: updated.plan_b_authorized,
        requestedAmount: updated.refund_amount == null ? null : Number(updated.refund_amount),
      },
    };
  });
