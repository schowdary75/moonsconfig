import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { defineOperation } from './defineOperation.js';
import {
  adminAuthSchema,
  requireAdmin,
  requireLeadStaff,
} from '../legacy/api/db.functions.server.js';
import {
  ensureCanonicalTripForBooking,
  ensureTravellerForContact,
  traveller360,
  tripWorkspace,
} from '../services/travelDomainService.js';
import { reviewMayaAction } from '../services/mayaActionReviewService.js';

async function staffId(email: string) {
  const staff = await prisma.crmUser.findUnique({ where: { email }, select: { id: true } });
  if (!staff) throw new Error('Staff account not found');
  return staff.id;
}

export const adminListTravellers = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      search: z.string().trim().max(120).optional(),
      cursor: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }),
  )
  .handler(async ({ data }) => {
    await requireLeadStaff(data.auth);
    const search = data.search?.trim();
    const rows = await prisma.traveller.findMany({
      where: {
        status: 'active',
        ...(search
          ? {
              OR: [
                { displayName: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: data.limit + 1,
      ...(data.cursor ? { cursor: { id: data.cursor }, skip: 1 } : {}),
    });
    return {
      rows: rows.slice(0, data.limit),
      nextCursor: rows.length > data.limit ? (rows[data.limit - 1]?.id ?? null) : null,
    };
  });

export const adminGetTraveller360 = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema, travellerId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireLeadStaff(data.auth);
    return traveller360(data.travellerId);
  });

export const adminGetTraveller360ByCrmClient = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema, crmClientId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await requireLeadStaff(data.auth);
    const client = await prisma.crm_clients.findUnique({ where: { id: data.crmClientId } });
    if (!client) throw new Error('CRM client not found');
    const traveller = await ensureTravellerForContact({
      name: client.name,
      email: client.email,
      phone: client.phone,
      crmClientId: client.id,
    });
    return traveller360(traveller.id);
  });

export const adminGetTripWorkspace = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema, tripId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireLeadStaff(data.auth);
    return tripWorkspace(data.tripId);
  });

export const adminListMayaActionProposals = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      status: z
        .enum([
          'pending',
          'approved',
          'rejected',
          'expired',
          'executing',
          'completed',
          'failed',
          'cancelled',
        ])
        .optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }),
  )
  .handler(async ({ data }) => {
    await requireLeadStaff(data.auth);
    return prisma.mayaActionProposal.findMany({
      where: data.status ? { status: data.status } : {},
      orderBy: { createdAt: 'desc' },
      take: data.limit,
    });
  });

export const adminReviewMayaActionProposal = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      proposalId: z.string().uuid(),
      decision: z.enum(['approve', 'reject']),
      reason: z.string().trim().min(2).max(500),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.auth);
    const reviewerId = await staffId(admin.email);
    return reviewMayaAction({
      proposalId: data.proposalId,
      decision: data.decision,
      reason: data.reason,
      reviewerId,
      // A body flag cannot prove MFA freshness. High-risk approval is forced
      // through the authenticated /travel-governance endpoint.
      recentMfa: false,
    });
  });

export const adminBackfillCanonicalTravelDomain = defineOperation({ method: 'POST' })
  .validator(
    z.object({ auth: adminAuthSchema, limit: z.number().int().min(1).max(200).default(50) }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);
    const bookings = await prisma.bookings.findMany({
      where: { canonical_trip_id: null },
      orderBy: { id: 'asc' },
      take: data.limit,
      select: { id: true },
    });
    const failures: Array<{ bookingId: number; reason: string }> = [];
    let migrated = 0;
    for (const booking of bookings) {
      try {
        await ensureCanonicalTripForBooking(booking.id);
        migrated += 1;
      } catch (error) {
        failures.push({
          bookingId: booking.id,
          reason: error instanceof Error ? error.message : 'Unknown backfill error',
        });
      }
    }

    const legacyRefunds = await prisma.user_refunds.findMany({
      orderBy: { id: 'asc' },
      take: data.limit,
    });
    let refundsMigrated = 0;
    for (const refund of legacyRefunds) {
      const exists = await prisma.canonicalRefundCase.findUnique({
        where: { legacyRefundId: refund.id },
      });
      if (exists) continue;
      const booking = await prisma.bookings.findUnique({
        where: { booking_reference: refund.booking_reference },
      });
      const trip = booking
        ? await ensureCanonicalTripForBooking(booking.id).catch(() => null)
        : null;
      const status =
        refund.status === 'settled'
          ? 'settled'
          : refund.status === 'admin_review'
            ? 'admin_review'
            : refund.status === 'escrow_hold'
              ? 'processing'
              : 'requested';
      await prisma.canonicalRefundCase.create({
        data: {
          legacyRefundId: refund.id,
          tripId: trip?.id ?? null,
          travellerId: trip?.travellerId ?? null,
          status,
          amount: refund.amount,
          reason: `Migrated from legacy refund ${refund.booking_reference}`,
          requestedAt: refund.created_at,
          settledAt: refund.settled_at,
        },
      });
      refundsMigrated += 1;
    }
    return { scanned: bookings.length, migrated, failures, refundsMigrated };
  });

export const adminGetTravelCapabilityReadiness = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema }))
  .handler(async ({ data }) => {
    await requireLeadStaff(data.auth);
    const [health, pendingEvents, deadLetters, pendingActions, unconfirmedServices] =
      await Promise.all([
        prisma.providerCapabilityHealth.findMany({ orderBy: { checkedAt: 'desc' } }),
        prisma.domainOutboxEvent.count({ where: { status: { in: ['pending', 'failed'] } } }),
        prisma.domainOutboxEvent.count({ where: { status: 'dead_letter' } }),
        prisma.mayaActionProposal.count({ where: { status: 'pending' } }),
        prisma.supplierReservation.count({
          where: { status: { in: ['requested', 'optioned', 'waitlisted'] } },
        }),
      ]);
    return {
      maya: {
        enabled: env.maya.enabled,
        externalWritesEnabled: env.maya.externalWritesEnabled,
        policyMode: env.maya.externalWritesEnabled ? 'governed' : 'read_only',
      },
      providers: env.travelProviders,
      observedHealth: health,
      queues: { pendingEvents, deadLetters, pendingActions, unconfirmedServices },
    };
  });

export const adminGetSupplierOperationsBoard = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema }))
  .handler(async ({ data }) => {
    await requireLeadStaff(data.auth);
    const reservations = await prisma.supplierReservation.findMany({
      where: { status: { in: ['requested', 'optioned', 'waitlisted', 'failed'] } },
      orderBy: [{ confirmationDueAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    const services = await prisma.tripService.findMany({
      where: { id: { in: reservations.map((row) => row.tripServiceId) } },
    });
    const trips = await prisma.travelTrip.findMany({
      where: { id: { in: [...new Set(services.map((row) => row.tripId))] } },
      select: { id: true, reference: true, name: true, startDate: true },
    });
    const suppliers = await prisma.vendors.findMany({
      where: {
        id: {
          in: reservations.map((row) => row.supplierId).filter((id): id is number => id != null),
        },
      },
      select: { id: true, company_name: true, email: true, phone: true },
    });
    return reservations.map((reservation) => {
      const service = services.find((row) => row.id === reservation.tripServiceId) ?? null;
      return {
        reservation,
        service,
        trip: trips.find((row) => row.id === service?.tripId) ?? null,
        supplier: suppliers.find((row) => row.id === reservation.supplierId) ?? null,
      };
    });
  });

export const adminGetTravelFinanceQueue = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema }))
  .handler(async ({ data }) => {
    await requireLeadStaff(data.auth);
    const [receivables, payables, refunds, recentTransactions] = await Promise.all([
      prisma.paymentSchedule.findMany({
        where: { status: { in: ['pending', 'partially_paid', 'overdue'] } },
        orderBy: { dueAt: 'asc' },
        take: 200,
      }),
      prisma.supplierPayable.findMany({
        where: { status: { in: ['pending', 'approved', 'disputed'] } },
        orderBy: { dueAt: 'asc' },
        take: 200,
      }),
      prisma.canonicalRefundCase.findMany({
        where: { status: { in: ['requested', 'admin_review', 'approved', 'processing'] } },
        orderBy: { requestedAt: 'asc' },
        take: 200,
      }),
      prisma.paymentTransaction.findMany({ orderBy: { occurredAt: 'desc' }, take: 100 }),
    ]);
    return { receivables, payables, refunds, recentTransactions };
  });
