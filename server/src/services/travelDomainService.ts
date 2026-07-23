import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { appendTravelEvent } from './travelEventService.js';
import { secureUploadService } from './secureUploadService.js';
import { getTenantRuntime } from '../config/tenantContext.js';

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function normalizePhone(value: string | null | undefined) {
  if (!value) return null;
  const compact = value.replace(/[^\d+]/g, '');
  if (!compact) return null;
  return compact.startsWith('+') ? compact : compact.replace(/^00/, '+');
}

type Contact = {
  name: string;
  email?: string | null;
  phone?: string | null;
  customerUserId?: number | null;
  crmClientId?: number | null;
  leadId?: number | null;
};

async function ensureTravellerInTransaction(tx: Prisma.TransactionClient, contact: Contact) {
  if (contact.customerUserId != null) {
    const linked = await tx.traveller.findUnique({
      where: { customerUserId: contact.customerUserId },
    });
    if (linked) return linked;
  }

  const email = normalizeEmail(contact.email);
  const phone = normalizePhone(contact.phone);
  const identityCandidates = [
    ...(email ? [{ type: 'email' as const, normalizedValue: email }] : []),
    ...(phone ? [{ type: 'phone' as const, normalizedValue: phone }] : []),
  ];
  const matches = identityCandidates.length
    ? await tx.travellerIdentity.findMany({
        where: { OR: identityCandidates },
        select: { travellerId: true },
      })
    : [];
  const travellerIds = [...new Set(matches.map((row) => row.travellerId))];
  if (travellerIds.length > 1) {
    throw new AppError(
      409,
      'Traveller identities require a staff merge review',
      'TRAVELLER_MERGE_REQUIRED',
    );
  }

  const traveller = travellerIds.length
    ? await tx.traveller.update({
        where: { id: travellerIds[0] },
        data: {
          displayName: contact.name,
          email,
          phone,
          customerUserId: contact.customerUserId ?? undefined,
          crmClientId: contact.crmClientId ?? undefined,
          primaryLeadId: contact.leadId ?? undefined,
        },
      })
    : await tx.traveller.create({
        data: {
          displayName: contact.name,
          email,
          phone,
          customerUserId: contact.customerUserId ?? null,
          crmClientId: contact.crmClientId ?? null,
          primaryLeadId: contact.leadId ?? null,
        },
      });

  const identities = [
    ...(email
      ? [{ type: 'email' as const, value: email, display: contact.email ?? email, primary: true }]
      : []),
    ...(phone
      ? [{ type: 'phone' as const, value: phone, display: contact.phone ?? phone, primary: !email }]
      : []),
    ...(contact.customerUserId != null
      ? [
          {
            type: 'customer_account' as const,
            value: String(contact.customerUserId),
            display: null,
            primary: false,
          },
        ]
      : []),
    ...(contact.crmClientId != null
      ? [
          {
            type: 'crm_client' as const,
            value: String(contact.crmClientId),
            display: null,
            primary: false,
          },
        ]
      : []),
    ...(contact.leadId != null
      ? [{ type: 'lead' as const, value: String(contact.leadId), display: null, primary: false }]
      : []),
  ];
  for (const identity of identities) {
    await tx.travellerIdentity.upsert({
      where: { type_normalizedValue: { type: identity.type, normalizedValue: identity.value } },
      update: {
        travellerId: traveller.id,
        displayValue: identity.display,
        isPrimary: identity.primary,
      },
      create: {
        travellerId: traveller.id,
        type: identity.type,
        normalizedValue: identity.value,
        displayValue: identity.display,
        isPrimary: identity.primary,
        verifiedAt:
          identity.type === 'email' || identity.type === 'customer_account' ? new Date() : null,
      },
    });
  }
  return traveller;
}

export async function ensureTravellerForContact(contact: Contact) {
  return prisma.$transaction((tx) => ensureTravellerInTransaction(tx, contact));
}

export async function ensureTravellerForCustomer(customerUserId: number) {
  const customer = await prisma.customerUser.findUnique({ where: { id: customerUserId } });
  if (!customer) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  return prisma.$transaction((tx) =>
    ensureTravellerInTransaction(tx, {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      customerUserId: customer.id,
    }),
  );
}

function mappedTripStatus(status: string | null) {
  if (status === 'confirmed') return 'booked' as const;
  if (status === 'cancelled') return 'cancelled' as const;
  return 'planning' as const;
}

export async function ensureCanonicalTripForBooking(bookingId: number) {
  const booking = await prisma.bookings.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
  if (booking.canonical_trip_id) {
    const existing = await prisma.travelTrip.findUnique({
      where: { id: booking.canonical_trip_id },
    });
    if (existing) return existing;
  }

  const traveller = await ensureTravellerForCustomer(booking.user_id);
  const pkg = booking.package_id
    ? await prisma.packages.findUnique({
        where: { id: booking.package_id },
        select: { id: true, name: true, destination: true, country: true, days: true },
      })
    : null;
  const endDate = new Date(booking.travel_date);
  endDate.setUTCDate(endDate.getUTCDate() + Math.max(0, (pkg?.days ?? 1) - 1));

  try {
    return await prisma.$transaction(async (tx) => {
      const trip = await tx.travelTrip.create({
        data: {
          bookingId: booking.id,
          travellerId: traveller.id,
          reference: booking.booking_reference,
          name: booking.item_name,
          direction: pkg?.country?.trim().toLowerCase() === 'india' ? 'domestic' : 'outbound',
          status: mappedTripStatus(booking.status ?? null),
          destination: pkg?.destination ?? null,
          startDate: booking.travel_date,
          endDate,
          quoteVersionId: booking.quote_version_id,
          sourceSnapshot: {
            legacyBookingId: booking.id,
            itemType: booking.item_type,
            itemName: booking.item_name,
            packageId: pkg?.id ?? null,
            amount: booking.amount,
          },
        },
      });
      await tx.travelPartyMember.create({
        data: {
          tripId: trip.id,
          travellerId: traveller.id,
          displayName: traveller.displayName,
          role: 'organiser',
          formStatus: 'in_progress',
        },
      });
      await tx.tripService.create({
        data: {
          tripId: trip.id,
          serviceType: 'other',
          title: booking.item_name,
          status: booking.status === 'confirmed' ? 'confirmed' : 'draft',
          sourceCatalogType: pkg ? 'package' : 'legacy_booking',
          sourceCatalogId: pkg?.id ?? booking.id,
          destination: pkg?.destination ?? null,
          startsAt: booking.travel_date,
          endsAt: endDate,
          sellAmount: booking.amount,
          serviceData: { immutableBookingReference: booking.booking_reference },
        },
      });
      await tx.bookings.update({
        where: { id: booking.id },
        data: {
          canonical_trip_id: trip.id,
          traveller_id: traveller.id,
          package_id: pkg?.id ?? booking.package_id,
        },
      });
      if (booking.status === 'confirmed') {
        await appendTravelEvent(tx, {
          eventType: 'BookingConfirmed',
          aggregateType: 'TravelTrip',
          aggregateId: trip.id,
          payload: { tripId: trip.id, bookingId: booking.id },
        });
      }
      return trip;
    });
  } catch (error) {
    const existing = await prisma.travelTrip.findUnique({ where: { bookingId: booking.id } });
    if (existing) return existing;
    throw error;
  }
}

export async function traveller360(travellerId: string) {
  const traveller = await prisma.traveller.findUnique({ where: { id: travellerId } });
  if (!traveller) throw new AppError(404, 'Traveller not found', 'TRAVELLER_NOT_FOUND');
  const [identities, preferences, consents, trips, documents, actions] = await Promise.all([
    prisma.travellerIdentity.findMany({ where: { travellerId }, orderBy: { createdAt: 'asc' } }),
    prisma.travellerPreference.findMany({ where: { travellerId }, orderBy: { key: 'asc' } }),
    prisma.travellerConsent.findMany({ where: { travellerId }, orderBy: { capturedAt: 'desc' } }),
    prisma.travelTrip.findMany({ where: { travellerId }, orderBy: { startDate: 'desc' } }),
    prisma.secureTravelDocument.findMany({
      where: { travellerId, deletedAt: null },
      select: {
        id: true,
        tripId: true,
        documentType: true,
        originalName: true,
        scanStatus: true,
        expiresOn: true,
        verifiedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.mayaActionProposal.findMany({
      where: {
        subjectType: 'traveller',
        subjectRef: travellerId,
        status: { in: ['pending', 'approved', 'failed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);
  return { traveller, identities, preferences, consents, trips, documents, openActions: actions };
}

export async function tripWorkspace(tripId: string) {
  const trip = await prisma.travelTrip.findUnique({ where: { id: tripId } });
  if (!trip) throw new AppError(404, 'Trip not found', 'TRIP_NOT_FOUND');
  const [
    traveller,
    party,
    services,
    reservations,
    schedules,
    transactions,
    payables,
    documents,
    refunds,
  ] = await Promise.all([
    prisma.traveller.findUnique({ where: { id: trip.travellerId } }),
    prisma.travelPartyMember.findMany({ where: { tripId }, orderBy: { createdAt: 'asc' } }),
    prisma.tripService.findMany({ where: { tripId }, orderBy: { startsAt: 'asc' } }),
    prisma.supplierReservation.findMany({
      where: {
        tripServiceId: {
          in: (await prisma.tripService.findMany({ where: { tripId }, select: { id: true } })).map(
            (row) => row.id,
          ),
        },
      },
      orderBy: { confirmationDueAt: 'asc' },
    }),
    prisma.paymentSchedule.findMany({ where: { tripId }, orderBy: { dueAt: 'asc' } }),
    prisma.paymentTransaction.findMany({ where: { tripId }, orderBy: { occurredAt: 'desc' } }),
    prisma.supplierPayable.findMany({
      where: {
        tripServiceId: {
          in: (await prisma.tripService.findMany({ where: { tripId }, select: { id: true } })).map(
            (row) => row.id,
          ),
        },
      },
      orderBy: { dueAt: 'asc' },
    }),
    prisma.secureTravelDocument.findMany({
      where: { tripId, deletedAt: null },
      select: {
        id: true,
        travellerId: true,
        documentType: true,
        originalName: true,
        scanStatus: true,
        expiresOn: true,
        verifiedAt: true,
      },
    }),
    prisma.canonicalRefundCase.findMany({ where: { tripId }, orderBy: { requestedAt: 'desc' } }),
  ]);
  return {
    trip,
    traveller,
    party,
    services,
    supplierReservations: reservations,
    paymentSchedules: schedules,
    transactions,
    supplierPayables: payables,
    documents,
    refunds,
  };
}

export async function customerTravellerHub(customerUserId: number) {
  const traveller = await ensureTravellerForCustomer(customerUserId);
  const bookings = await prisma.bookings.findMany({
    where: { user_id: customerUserId },
    orderBy: { travel_date: 'desc' },
  });
  for (const booking of bookings) await ensureCanonicalTripForBooking(booking.id);

  const trips = await prisma.travelTrip.findMany({
    where: { travellerId: traveller.id },
    orderBy: { startDate: 'desc' },
  });
  const tripIds = trips.map((trip) => trip.id);
  const [
    services,
    party,
    schedules,
    documents,
    quotes,
    acceptances,
    views,
    comments,
    payments,
    refunds,
    invoices,
    recoveries,
  ] = await Promise.all([
    prisma.tripService.findMany({
      where: { tripId: { in: tripIds } },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.travelPartyMember.findMany({
      where: { tripId: { in: tripIds } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.paymentSchedule.findMany({
      where: { tripId: { in: tripIds } },
      orderBy: { dueAt: 'asc' },
    }),
    prisma.secureTravelDocument.findMany({
      where: { travellerId: traveller.id, deletedAt: null },
      select: {
        id: true,
        tripId: true,
        partyMemberId: true,
        documentType: true,
        originalName: true,
        scanStatus: true,
        expiresOn: true,
        verifiedAt: true,
      },
    }),
    prisma.quoteVersion.findMany({
      where: {
        travellerId: traveller.id,
        status: { in: ['sent', 'viewed', 'accepted', 'expired'] },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.proposalAcceptance.findMany({ where: { travellerId: traveller.id } }),
    prisma.proposalView.findMany({
      where: { travellerId: traveller.id },
      orderBy: { viewedAt: 'desc' },
    }),
    prisma.quoteComment.findMany({
      where: { travellerId: traveller.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.payment_orders.findMany({
      where: { user_id: customerUserId },
      orderBy: { created_at: 'desc' },
    }),
    prisma.user_refunds.findMany({
      where: { user_id: customerUserId },
      orderBy: { created_at: 'desc' },
    }),
    prisma.invoices.findMany({
      where: { user_id: customerUserId },
      orderBy: { created_at: 'desc' },
    }),
    prisma.incidentRecovery.findMany({
      where: { customerUserId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const recoveryIds = recoveries.map((recovery) => recovery.id);
  const [recoveryUpdates, recoveryAlternatives, recoveryReceipts] = await Promise.all([
    prisma.incidentCustomerUpdate.findMany({
      where: { recoveryId: { in: recoveryIds }, channel: 'website' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.incidentAlternative.findMany({
      where: { recoveryId: { in: recoveryIds } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.incidentReceipt.findMany({
      where: { recoveryId: { in: recoveryIds }, customerUserId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const now = new Date();
  return {
    traveller: {
      id: traveller.id,
      displayName: traveller.displayName,
      email: traveller.email,
      phone: traveller.phone,
      locale: traveller.locale,
    },
    trips: trips.map((trip) => {
      const tripServices = services.filter((service) => service.tripId === trip.id);
      const tripParty = party.filter((member) => member.tripId === trip.id);
      const tripSchedules = schedules.filter((schedule) => schedule.tripId === trip.id);
      const tripDocuments = documents.filter(
        (document) => document.tripId === trip.id || document.tripId == null,
      );
      return {
        ...trip,
        services: tripServices,
        party: tripParty,
        paymentSchedule: tripSchedules,
        documents: tripDocuments,
        recoveries: recoveries
          .filter((recovery) => recovery.tripId === trip.id)
          .map((recovery) => ({
            id: recovery.id,
            incidentId: recovery.incidentId,
            bookingId: recovery.bookingId,
            issueType: recovery.issueType,
            status: recovery.status,
            destination: recovery.destination,
            responseDueAt: recovery.responseDueAt,
            resolvedAt: recovery.resolvedAt,
            createdAt: recovery.createdAt,
            updates: recoveryUpdates
              .filter((update) => update.recoveryId === recovery.id)
              .map((update) => ({
                id: update.id,
                message: update.message,
                createdAt: update.createdAt,
              })),
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
                createdAt: receipt.createdAt,
              })),
          })),
        readiness: {
          participantFormsComplete:
            tripParty.length > 0 &&
            tripParty.every((member) => ['complete', 'verified'].includes(member.formStatus)),
          servicesConfirmed:
            tripServices.length > 0 &&
            tripServices.every((service) => ['confirmed', 'completed'].includes(service.status)),
          documentsClean: tripDocuments.every(
            (document) =>
              document.scanStatus === 'clean' && (!document.expiresOn || document.expiresOn > now),
          ),
          paymentsCurrent: tripSchedules.every(
            (schedule) => !['overdue'].includes(schedule.status),
          ),
        },
      };
    }),
    quotes: quotes.map((quote) => ({
      ...quote,
      acceptance: acceptances.find((acceptance) => acceptance.quoteVersionId === quote.id) ?? null,
      views: views.filter((view) => view.quoteVersionId === quote.id),
      comments: comments.filter((comment) => comment.quoteVersionId === quote.id),
    })),
    wallet: { documents, payments, refunds, invoices },
  };
}

async function ownedQuote(customerUserId: number, quoteVersionId: string) {
  const traveller = await ensureTravellerForCustomer(customerUserId);
  const quote = await prisma.quoteVersion.findFirst({
    where: { id: quoteVersionId, travellerId: traveller.id },
  });
  if (!quote) throw new AppError(404, 'Quote not found', 'QUOTE_NOT_FOUND');
  return { traveller, quote };
}

export async function recordProposalView(
  customerUserId: number,
  quoteVersionId: string,
  evidence: { ipAddress?: string | null; userAgent?: string | null },
) {
  const { traveller, quote } = await ownedQuote(customerUserId, quoteVersionId);
  if (!['sent', 'viewed', 'accepted'].includes(quote.status)) {
    throw new AppError(409, 'This quote is not available to view', 'QUOTE_NOT_SENT');
  }
  return prisma.$transaction(async (tx) => {
    const view = await tx.proposalView.create({
      data: {
        quoteVersionId,
        travellerId: traveller.id,
        ipAddress: evidence.ipAddress?.slice(0, 45) || null,
        userAgent: evidence.userAgent?.slice(0, 512) || null,
      },
    });
    if (quote.status === 'sent') {
      await tx.quoteVersion.update({ where: { id: quote.id }, data: { status: 'viewed' } });
    }
    return view;
  });
}

export async function addQuoteComment(
  customerUserId: number,
  quoteVersionId: string,
  body: string,
) {
  const { traveller, quote } = await ownedQuote(customerUserId, quoteVersionId);
  if (!['sent', 'viewed', 'accepted'].includes(quote.status)) {
    throw new AppError(409, 'This quote is not open for comments', 'QUOTE_NOT_SENT');
  }
  return prisma.quoteComment.create({
    data: {
      quoteVersionId,
      travellerId: traveller.id,
      authorType: 'traveller',
      body: body.trim(),
    },
  });
}

export async function acceptQuote(
  customerUserId: number,
  quoteVersionId: string,
  input: { signerName: string; termsVersion: string },
  evidence: { ipAddress?: string | null; userAgent?: string | null },
) {
  const { traveller, quote } = await ownedQuote(customerUserId, quoteVersionId);
  const lines = await prisma.quoteLineSnapshot.findMany({ where: { quoteVersionId } });
  if (quote.confidence !== 'confirmed' || !lines.length || lines.some((line) => !line.bindable)) {
    throw new AppError(
      409,
      'This quote is indicative and cannot be accepted until every price is confirmed',
      'QUOTE_NOT_BINDABLE',
    );
  }
  if (!['sent', 'viewed'].includes(quote.status)) {
    throw new AppError(
      409,
      'This quote cannot be accepted in its current state',
      'QUOTE_NOT_ACCEPTABLE',
    );
  }
  if (quote.validUntil && quote.validUntil < new Date()) {
    await prisma.quoteVersion.update({ where: { id: quote.id }, data: { status: 'expired' } });
    throw new AppError(409, 'This quote has expired', 'QUOTE_EXPIRED');
  }
  if (input.termsVersion !== quote.termsVersion) {
    throw new AppError(
      409,
      'The quote terms have changed; review the current terms',
      'TERMS_VERSION_MISMATCH',
    );
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.proposalAcceptance.findUnique({ where: { quoteVersionId } });
    if (existing) return existing;
    let tripId = quote.tripId;
    if (!tripId) {
      const trip = await tx.travelTrip.create({
        data: {
          travellerId: traveller.id,
          reference: `Q-${quote.id.slice(0, 8).toUpperCase()}`,
          name: quote.title,
          direction: 'outbound',
          status: 'accepted',
          quoteVersionId: quote.id,
          sourceSnapshot: { quoteVersionId: quote.id, acceptedWithoutBooking: true },
        },
      });
      tripId = trip.id;
      await tx.travelPartyMember.create({
        data: {
          tripId,
          travellerId: traveller.id,
          displayName: traveller.displayName,
          role: 'organiser',
          formStatus: 'in_progress',
        },
      });
      const deposit = Number(quote.totalSell) * 0.3;
      await tx.paymentSchedule.createMany({
        data: [
          {
            tripId,
            label: 'Deposit',
            amount: deposit,
            currency: quote.currency,
            dueAt: new Date(),
          },
          {
            tripId,
            label: 'Balance',
            amount: Number(quote.totalSell) - deposit,
            currency: quote.currency,
            dueAt: new Date(Date.now() + 14 * 86_400_000),
          },
        ],
      });
      for (const line of lines) {
        const sourceEvidence =
          line.evidence && typeof line.evidence === 'object' && !Array.isArray(line.evidence)
            ? (line.evidence as Record<string, unknown>)
            : {};
        const vendorId = Number(sourceEvidence.vendorId);
        const serviceType =
          line.serviceType === 'stay' || line.serviceType === 'room'
            ? 'stay'
            : line.serviceType === 'activity'
              ? 'activity'
              : line.serviceType === 'car'
                ? 'transfer'
                : 'other';
        const service = await tx.tripService.create({
          data: {
            tripId,
            serviceType,
            title: line.label,
            status: 'requested',
            supplierId: Number.isInteger(vendorId) && vendorId > 0 ? vendorId : null,
            sourceCatalogType: line.sourceCatalogType,
            sourceCatalogId: line.sourceCatalogId,
            netAmount: line.totalNet,
            sellAmount: line.totalSell,
            currency: line.currency,
            sourceAsOf: quote.sourceAsOf,
            cancellationPolicy:
              line.cancellationPolicy == null
                ? undefined
                : (line.cancellationPolicy as Prisma.InputJsonValue),
            serviceData: { quoteLineSnapshotId: line.id, immutable: true },
          },
        });
        await tx.supplierReservation.create({
          data: {
            tripServiceId: service.id,
            supplierId: Number.isInteger(vendorId) && vendorId > 0 ? vendorId : null,
            status: 'requested',
            confirmationDueAt: new Date(Date.now() + 24 * 60 * 60_000),
            termsSnapshot:
              line.cancellationPolicy == null
                ? undefined
                : (line.cancellationPolicy as Prisma.InputJsonValue),
          },
        });
      }
    }
    const acceptance = await tx.proposalAcceptance.create({
      data: {
        quoteVersionId,
        travellerId: traveller.id,
        signerName: input.signerName.trim(),
        signerEmail: traveller.email,
        termsVersion: input.termsVersion,
        ipAddress: evidence.ipAddress?.slice(0, 45) || null,
        userAgent: evidence.userAgent?.slice(0, 512) || null,
        evidence: {
          authentication: 'customer_access_token',
          quoteSourceAsOf: quote.sourceAsOf.toISOString(),
        },
      },
    });
    await tx.quoteVersion.update({ where: { id: quote.id }, data: { status: 'accepted', tripId } });
    await tx.travelTrip.update({
      where: { id: tripId },
      data: { status: 'accepted', quoteVersionId: quote.id },
    });
    await appendTravelEvent(tx, {
      eventType: 'QuoteAccepted',
      aggregateType: 'QuoteVersion',
      aggregateId: quote.id,
      payload: { quoteVersionId: quote.id, travellerId: traveller.id, tripId },
    });
    return acceptance;
  });
}

export async function createCustomerTravelDocumentUpload(
  customerUserId: number,
  input: {
    tripId?: string;
    partyMemberId?: string;
    documentType:
      'passport' | 'visa' | 'id' | 'insurance' | 'ticket' | 'voucher' | 'medical' | 'other';
    filename: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256?: string;
    expiresOn?: string;
    issuingCountry?: string;
  },
) {
  const traveller = await ensureTravellerForCustomer(customerUserId);
  if (input.tripId) {
    const trip = await prisma.travelTrip.findFirst({
      where: { id: input.tripId, travellerId: traveller.id },
    });
    if (!trip) throw new AppError(404, 'Trip not found', 'TRIP_NOT_FOUND');
  }
  if (input.partyMemberId) {
    const member = await prisma.travelPartyMember.findFirst({
      where: { id: input.partyMemberId, ...(input.tripId ? { tripId: input.tripId } : {}) },
    });
    if (!member) throw new AppError(404, 'Trip participant not found', 'PARTY_MEMBER_NOT_FOUND');
  }
  const upload = await secureUploadService.create(`customer:${customerUserId}`, input);
  const expiresOn = input.expiresOn ? new Date(input.expiresOn) : null;
  const document = await prisma.secureTravelDocument.create({
    data: {
      travellerId: traveller.id,
      tripId: input.tripId ?? null,
      partyMemberId: input.partyMemberId ?? null,
      documentType: input.documentType,
      storageKey: `upload-object:${upload.id}`,
      originalName: input.filename,
      mimeType: input.mimeType,
      expiresOn,
      issuingCountry: input.issuingCountry?.toUpperCase() ?? null,
      metadata: { uploadObjectId: upload.id, quarantine: true },
    },
  });
  return { ...upload, documentId: document.id, scanStatus: document.scanStatus };
}

export async function customerTravelDocumentDownload(customerUserId: number, documentId: string) {
  const traveller = await ensureTravellerForCustomer(customerUserId);
  const document = await prisma.secureTravelDocument.findFirst({
    where: { id: documentId, travellerId: traveller.id, deletedAt: null, scanStatus: 'clean' },
  });
  if (!document)
    throw new AppError(404, 'Clean travel document not found', 'DOCUMENT_NOT_AVAILABLE');
  const tenantId = getTenantRuntime()?.tenantId;
  if (!tenantId) throw new AppError(401, 'A company workspace is required', 'TENANT_REQUIRED');
  const uploadId = document.storageKey.replace(/^upload-object:/, '');
  return secureUploadService.download(tenantId, uploadId);
}
