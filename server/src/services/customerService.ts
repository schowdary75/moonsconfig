import type { user_wishlists_item_type } from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import {
  customerRepository,
  type CustomerDeviceInput,
  type WishlistInput,
} from '../repositories/customerRepository.js';
import { provisionTripPlanSafely } from './tripPlanService.js';
import { getTenantRuntime } from '../config/tenantContext.js';
import { publishTripInvalidation } from './tripEventService.js';
import { tripDayNumber, tripPhase } from '../utils/tripTime.js';
import {
  acceptQuote,
  addQuoteComment,
  customerTravellerHub,
  recordProposalView,
  createCustomerTravelDocumentUpload,
  customerTravelDocumentDownload,
} from './travelDomainService.js';
import { prisma } from '../config/prisma.js';
import { appendTravelEvent } from './travelEventService.js';
import {
  createIncidentReceiptUpload,
  startIncidentRecovery,
  confirmIncidentResolved,
} from './incidentRecoveryService.js';

type CustomerIncidentInput = {
  issueType: 'transport_no_show' | 'hotel_issue';
  details?: string;
};

const INCIDENT_LABELS: Record<CustomerIncidentInput['issueType'], string> = {
  transport_no_show: 'Transport No-Show',
  hotel_issue: 'Hotel Issue / Overbooked',
};

function incidentStatus(incident: { plan_a_status: string; plan_b_authorized: boolean }) {
  if (incident.plan_b_authorized || incident.plan_a_status === 'resolved') return 'resolved';
  if (incident.plan_a_status === 'in_progress') return 'in_progress';
  return 'awaiting_authorization';
}

function mapIncident(incident: {
  id: number;
  issue_type: string;
  severity: string;
  plan_a_status: string;
  plan_b_authorized: boolean;
  created_at: Date;
}) {
  return {
    id: incident.id,
    issueType: incident.issue_type,
    severity: incident.severity,
    status: incidentStatus(incident),
    createdAt: incident.created_at,
  };
}

export const customerService = {
  travellerHub: customerTravellerHub,
  recordProposalView,
  addQuoteComment,
  acceptQuote,
  createTravelDocumentUpload: createCustomerTravelDocumentUpload,
  createIncidentReceiptUpload,
  confirmIncidentResolved,
  travelDocumentDownload: customerTravelDocumentDownload,
  async registerDevice(userId: number, input: CustomerDeviceInput) {
    await customerRepository.registerDevice(userId, input);
    return { registered: true };
  },
  async removeDevice(userId: number, token: string) {
    await customerRepository.removeDevice(userId, token);
    return null;
  },
  wishlist: customerRepository.listWishlist,
  addWishlist: customerRepository.addWishlist,
  replaceWishlist: customerRepository.replaceWishlist,
  removeWishlist: async (userId: number, itemType: user_wishlists_item_type, itemId: string) => {
    await customerRepository.removeWishlist(userId, itemType, itemId);
    return null;
  },
  bookings: customerRepository.listBookings,
  async cancelBooking(userId: number, bookingId: number) {
    const booking = await customerRepository.findBooking(userId, bookingId);
    if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    if (booking.status === 'cancelled') return { status: 'already_cancelled', booking };
    const idempotencyKey = `customer-cancel:${booking.id}`;
    const existing = await (
      await import('../config/prisma.js')
    ).prisma.mayaActionProposal.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return { status: existing.status, proposalId: existing.id };
    const proposal = await (
      await import('../config/prisma.js')
    ).prisma.mayaActionProposal.create({
      data: {
        actionType: 'cancel_booking',
        riskClass: 'high_risk',
        subjectType: 'booking',
        subjectRef: String(booking.id),
        input: { bookingId: booking.id, customerUserId: userId },
        evidence: {
          source: 'authenticated_traveller_request',
          bookingReference: booking.booking_reference,
        },
        policyVersion: 'maya-autonomy-2026-07-22',
        idempotencyKey,
        requestedBy: `traveller:${userId}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
    return {
      status: 'approval_required',
      proposalId: proposal.id,
      message: 'Cancellation has been requested. No booking, payment or refund was changed.',
    };
  },
  async liveTrip(userId: number, bookingId: number) {
    const booking = await customerRepository.findBooking(userId, bookingId);
    if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');

    // Backfill: bookings confirmed before auto-provisioning existed get their
    // schedule snapshot on first view. No-op when rows already exist.
    if (booking.status === 'confirmed' && booking.item_type === 'package') {
      await provisionTripPlanSafely(booking.id);
    }

    const [schedules, milestones, incidents, recoveries] = await Promise.all([
      customerRepository.tripSchedules(booking.id),
      customerRepository.tripMilestones(booking.id),
      customerRepository.openTripIncidents(booking.id),
      prisma.incidentRecovery.findMany({
        where: { bookingId: booking.id, customerUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const recoveryIds = recoveries.map((item) => item.id);
    const [recoveryUpdates, recoveryAlternatives, recoveryReceipts] = await Promise.all([
      prisma.incidentCustomerUpdate.findMany({
        where: { recoveryId: { in: recoveryIds } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.incidentAlternative.findMany({
        where: { recoveryId: { in: recoveryIds } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.incidentReceipt.findMany({
        where: { recoveryId: { in: recoveryIds }, customerUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const driverIds = [
      ...new Set(schedules.map((row) => row.driver_id).filter((id): id is number => id != null)),
    ];
    const drivers = await customerRepository.operatorsByIds(driverIds);
    const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));

    const timeZone = getTenantRuntime()?.timezone ?? 'Asia/Kolkata';
    const dayNumber = tripDayNumber(booking.travel_date, timeZone);
    const totalDays = schedules.length ? Math.max(...schedules.map((row) => row.day_number)) : null;
    const phase = tripPhase(booking.status, dayNumber, totalDays);
    const todaysSchedules = schedules.filter((row) => row.day_number === dayNumber);
    const currentRow = todaysSchedules.find((row) => row.status === 'in_progress') ?? null;
    const currentIndex = currentRow ? schedules.findIndex((row) => row.id === currentRow.id) : -1;
    const remainingRows = schedules.filter(
      (row, index) =>
        !['completed', 'cancelled'].includes(row.status) &&
        (!currentRow || row.id !== currentRow.id) &&
        (phase === 'upcoming' || (currentRow ? index > currentIndex : row.day_number >= dayNumber)),
    );
    const nextRow = remainingRows[0] ?? null;

    const mapActivity = (row: (typeof schedules)[number] | null) => {
      if (!row) return null;
      const driver = row.driver_id == null ? null : driverMap.get(row.driver_id);
      return {
        id: row.id,
        dayNumber: row.day_number,
        timeSlot: row.time_slot,
        title: row.activity_title,
        status: row.status,
        description: row.inclusions_text,
        outOfPocket: row.exclusions_text,
        estSpending: row.est_spending,
        driver: driver
          ? { name: driver.company_name, contact: driver.contact_name, phone: driver.phone }
          : null,
      };
    };

    return {
      booking: {
        id: booking.id,
        reference: booking.booking_reference,
        itemName: booking.item_name,
        itemType: booking.item_type,
        travelDate: booking.travel_date,
        status: booking.status,
        amount: booking.amount,
      },
      dayNumber,
      totalDays,
      phase,
      serverTime: new Date().toISOString(),
      timeZone,
      currentActivity: mapActivity(currentRow),
      nextActivity: mapActivity(nextRow),
      readiness: {
        bookingConfirmed: booking.status === 'confirmed',
        itineraryPrepared: schedules.length > 0,
        transportAssigned: schedules.some((row) => row.driver_id != null),
      },
      schedules: schedules.map((row) => mapActivity(row)),
      milestones: milestones.map((row) => ({
        id: row.id,
        phaseName: row.phase_name,
        status: row.status,
        timestamp: row.timestamp,
      })),
      incidents: incidents.map(mapIncident),
      recoveries: recoveries.map((recovery) => ({
        id: recovery.id,
        incidentId: recovery.incidentId,
        issueType: recovery.issueType,
        status: recovery.status,
        destination: recovery.destination,
        responseDueAt: recovery.responseDueAt,
        resolvedAt: recovery.resolvedAt,
        resolutionSummary: recovery.resolutionSummary,
        createdAt: recovery.createdAt,
        updates: recoveryUpdates
          .filter((update) => update.recoveryId === recovery.id && update.channel === 'website')
          .map((update) => ({ message: update.message, createdAt: update.createdAt })),
        alternatives: recoveryAlternatives
          .filter((alternative) => alternative.recoveryId === recovery.id)
          .map((alternative) => ({
            id: alternative.id,
            name: alternative.name,
            serviceType: alternative.serviceType,
            contactName:
              alternative.availabilityStatus === 'available' ? alternative.contactName : null,
            phone: alternative.availabilityStatus === 'available' ? alternative.phone : null,
            email: alternative.availabilityStatus === 'available' ? alternative.email : null,
            bookingUrl:
              alternative.availabilityStatus === 'self_booking_option'
                ? alternative.bookingUrl
                : null,
            availabilityStatus: alternative.availabilityStatus,
            estimatedAmount: alternative.estimatedAmount,
            currency: alternative.currency,
          })),
        receipts: recoveryReceipts
          .filter((receipt) => receipt.recoveryId === recovery.id)
          .map((receipt) => ({
            id: receipt.id,
            expenseType: receipt.expenseType,
            amount: receipt.amount,
            currency: receipt.currency,
            merchant: receipt.merchant,
            status: receipt.status,
            proposalId: receipt.proposalId,
            createdAt: receipt.createdAt,
          })),
      })),
    };
  },
  async createTripIncident(userId: number, bookingId: number, input: CustomerIncidentInput) {
    const booking = await customerRepository.findBooking(userId, bookingId);
    if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');

    const schedules = await customerRepository.tripSchedules(booking.id);
    const totalDays = schedules.length ? Math.max(...schedules.map((row) => row.day_number)) : null;
    const timeZone = getTenantRuntime()?.timezone ?? 'Asia/Kolkata';
    const phase = tripPhase(
      booking.status,
      tripDayNumber(booking.travel_date, timeZone),
      totalDays,
    );
    if (phase !== 'active') {
      throw new AppError(
        409,
        'Plan B incidents can only be raised while the trip is active',
        'TRIP_NOT_ACTIVE',
      );
    }

    const issueType = INCIDENT_LABELS[input.issueType];
    const recent = await customerRepository.recentOpenTripIncident(
      booking.id,
      issueType,
      new Date(Date.now() - 5 * 60_000),
    );
    if (recent) {
      const recovery = await prisma.incidentRecovery.findUnique({
        where: { incidentId: recent.id },
      });
      return { incident: mapIncident(recent), recovery, deduplicated: true };
    }

    const trip = booking.canonical_trip_id
      ? await prisma.travelTrip.findUnique({ where: { id: booking.canonical_trip_id } })
      : await prisma.travelTrip.findUnique({ where: { bookingId: booking.id } });
    const created = await prisma.$transaction(async (tx) => {
      const incident = await tx.booking_contingencies.create({
        data: {
          booking_id: booking.id,
          issue_type: issueType,
          severity: 'high',
          details: input.details?.trim() || null,
          plan_a_status: 'in_progress',
        },
      });
      const recovery = await tx.incidentRecovery.create({
        data: {
          incidentId: incident.id,
          bookingId: booking.id,
          customerUserId: userId,
          tripId: trip?.id,
          issueType: input.issueType,
          destination: trip?.destination ?? booking.item_name,
        },
      });
      await appendTravelEvent(tx, {
        eventType: 'IncidentOpened',
        aggregateType: 'incident_recovery',
        aggregateId: recovery.id,
        payload: {
          recoveryId: recovery.id,
          incidentId: incident.id,
          bookingId: booking.id,
          customerUserId: userId,
          issueType: input.issueType,
        },
      });
      return { incident, recovery };
    });
    await publishTripInvalidation(userId, booking.id, 'incident_created');
    await startIncidentRecovery(created.recovery.id).catch(async () => {
      await prisma.incidentRecovery.update({
        where: { id: created.recovery.id },
        data: { status: 'failed_to_start' },
      });
    });
    return {
      incident: mapIncident(created.incident),
      recovery: created.recovery,
      deduplicated: false,
    };
  },
  payments: customerRepository.listPayments,
  refunds: customerRepository.listRefunds,
  escrow: customerRepository.listEscrow,
  invoices: customerRepository.listInvoices,
  async invoiceByReference(userId: number, bookingReference: string) {
    const invoice = await customerRepository.invoiceByReference(userId, bookingReference);
    if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    return invoice;
  },
};

export type { WishlistInput };
