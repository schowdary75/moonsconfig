import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { getTenantRuntime } from '../config/tenantContext.js';
import { emailQueue, voiceRecoveryQueue } from '../jobs/queues.js';
import { normalizeForSms } from './customerMessagingService.js';
import { smsService } from './smsService.js';
import { localRecoveryOptions } from '../maya/ontrip/localRecoveryOptions.js';
import { logger } from '../logger/index.js';
import { AppError } from '../errors/AppError.js';
import { secureUploadService } from './secureUploadService.js';
import { ensureTravellerForCustomer } from './travelDomainService.js';

const VENDOR_RESPONSE_MINUTES = 10;
const ACTIVE_ATTEMPT_STATUSES = ['queued', 'dialing', 'connected', 'awaiting_response'];

type RecoveryContact = {
  vendorId?: number;
  operatorId?: number;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type VendorDecision = 'available' | 'unavailable' | 'human';

function objectValue(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function issueName(issueType: string) {
  return /hotel/i.test(issueType) ? 'hotel emergency' : 'transport no-show';
}

function vendorServiceTypes(issueType: string): Array<'stay' | 'room' | 'car'> {
  return /hotel/i.test(issueType) ? ['stay', 'room'] : ['car'];
}

function customerSafetyMessage(issueType: string) {
  return /hotel/i.test(issueType)
    ? 'Please remain in the hotel lobby or another safe public place while we contact the property and verified alternatives.'
    : 'Please remain at a safe, well-lit pickup point while we contact the assigned driver and verified alternatives.';
}

async function recordCustomerUpdate(
  recoveryId: string,
  customer: { email: string; phone: string | null },
  key: string,
  message: string,
) {
  const tenantId = getTenantRuntime()?.tenantId;
  const websiteKey = `${recoveryId}:${key}:website`;
  const existingWebsite = await prisma.incidentCustomerUpdate.findUnique({
    where: { idempotencyKey: websiteKey },
  });
  if (!existingWebsite) {
    await prisma.incidentCustomerUpdate.create({
      data: {
        recoveryId,
        channel: 'website',
        deliveryStatus: 'delivered',
        message,
        idempotencyKey: websiteKey,
      },
    });
    if (key !== 'opened') {
      const recovery = await prisma.incidentRecovery.findUnique({
        where: { id: recoveryId },
        select: { customerUserId: true },
      });
      const chat = recovery
        ? await prisma.support_chats
            .findFirst({
              where: { customer_id: recovery.customerUserId, status: 'open' },
              orderBy: { updated_at: 'desc' },
            })
            .catch(() => null)
        : null;
      if (chat) {
        await prisma.support_messages
          .create({
            data: { chat_id: chat.id, sender_id: 0, content: message },
          })
          .then(async () => {
            const { publishChatEvent } = await import('./chatEventService.js');
            void publishChatEvent({
              staffBroadcast: true,
              event: 'chat:support-message',
              payload: { chatId: chat.id },
            });
          })
          .catch((error) =>
            logger.warn('Could not mirror incident update into support chat', {
              recoveryId,
              error,
            }),
          );
      }
    }
  }

  const emailKey = `${recoveryId}:${key}:email`;
  const existingEmail = await prisma.incidentCustomerUpdate.findUnique({
    where: { idempotencyKey: emailKey },
  });
  if (!existingEmail) {
    const row = await prisma.incidentCustomerUpdate.create({
      data: {
        recoveryId,
        channel: 'email',
        deliveryStatus: 'queued',
        message,
        idempotencyKey: emailKey,
      },
    });
    try {
      await emailQueue.add(
        'incident-customer-update',
        {
          tenantId,
          to: customer.email,
          subject: `MooNs Travel SOS update: ${issueName(
            (await prisma.incidentRecovery.findUniqueOrThrow({ where: { id: recoveryId } }))
              .issueType,
          )}`,
          text: message,
          idempotencyKey: emailKey,
        },
        { jobId: `incident-email-${row.id}` },
      );
    } catch (error) {
      await prisma.incidentCustomerUpdate.update({
        where: { id: row.id },
        data: { deliveryStatus: 'failed' },
      });
      logger.error('Could not queue incident customer email', { recoveryId, error });
    }
  }

  const to = customer.phone ? normalizeForSms(customer.phone) : '';
  const smsKey = `${recoveryId}:${key}:sms`;
  const existingSms = await prisma.incidentCustomerUpdate.findUnique({
    where: { idempotencyKey: smsKey },
  });
  if (to && !existingSms) {
    const sent = await smsService.sendSMS(to, message);
    await prisma.incidentCustomerUpdate.create({
      data: {
        recoveryId,
        channel: 'sms',
        deliveryStatus: sent ? 'sent' : 'failed',
        message,
        idempotencyKey: smsKey,
      },
    });
  }
}

async function recoveryContext(recoveryId: string) {
  const recovery = await prisma.incidentRecovery.findUniqueOrThrow({ where: { id: recoveryId } });
  const [incident, booking, customer, trip] = await Promise.all([
    prisma.booking_contingencies.findUnique({ where: { id: recovery.incidentId } }),
    prisma.bookings.findUnique({ where: { id: recovery.bookingId } }),
    prisma.customerUser.findUnique({ where: { id: recovery.customerUserId } }),
    recovery.tripId ? prisma.travelTrip.findUnique({ where: { id: recovery.tripId } }) : null,
  ]);
  if (!incident || !booking || !customer)
    throw new Error('Incident recovery context is incomplete');
  return { recovery, incident, booking, customer, trip };
}

async function resolveAssignedContact(recoveryId: string): Promise<RecoveryContact | null> {
  const { recovery, booking } = await recoveryContext(recoveryId);
  let service = recovery.assignedServiceId
    ? await prisma.tripService.findUnique({ where: { id: recovery.assignedServiceId } })
    : null;
  if (!service && recovery.tripId) {
    service = await prisma.tripService.findFirst({
      where: {
        tripId: recovery.tripId,
        serviceType: /hotel/i.test(recovery.issueType) ? 'stay' : 'transfer',
        status: { in: ['optioned', 'confirmed'] },
      },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
    });
  }
  if (service?.supplierId) {
    const vendor = await prisma.vendors.findUnique({ where: { id: service.supplierId } });
    if (vendor) {
      await prisma.incidentRecovery.update({
        where: { id: recoveryId },
        data: { assignedServiceId: service.id, assignedVendorId: vendor.id },
      });
      return {
        vendorId: vendor.id,
        name: vendor.company_name,
        contactName: vendor.contact_name,
        phone: vendor.phone ?? vendor.whatsapp,
        email: vendor.email,
      };
    }
  }

  if (!/hotel/i.test(recovery.issueType)) {
    const schedule = await prisma.trip_daily_schedules
      .findFirst({
        where: { booking_id: booking.id, driver_id: { not: null } },
        orderBy: [{ day_number: 'asc' }, { id: 'asc' }],
      })
      .catch(() => null);
    const operatorId = recovery.assignedOperatorId ?? schedule?.driver_id ?? booking.operator_id;
    if (operatorId) {
      const operator = await prisma.operators.findUnique({ where: { id: operatorId } });
      if (operator) {
        await prisma.incidentRecovery.update({
          where: { id: recoveryId },
          data: { assignedOperatorId: operator.id },
        });
        return {
          operatorId: operator.id,
          name: operator.company_name,
          contactName: operator.contact_name,
          phone: operator.phone,
          email: operator.email,
        };
      }
    }
  }
  return null;
}

async function contactVendor(
  recoveryId: string,
  role: 'assigned' | 'alternative',
  contact: RecoveryContact,
) {
  const existing = await prisma.incidentVendorAttempt.findFirst({
    where: {
      recoveryId,
      role,
      vendorId: contact.vendorId ?? null,
      operatorId: contact.operatorId ?? null,
    },
  });
  if (existing) return existing;

  const responseDueAt = new Date(Date.now() + VENDOR_RESPONSE_MINUTES * 60_000);
  const responseCode = randomBytes(6).toString('hex').toUpperCase();
  const attempt = await prisma.incidentVendorAttempt.create({
    data: {
      recoveryId,
      vendorId: contact.vendorId,
      operatorId: contact.operatorId,
      role,
      channel: contact.phone ? 'voice' : 'email',
      responseCode,
      responseDueAt,
      contactSnapshot: contact as Prisma.InputJsonValue,
    },
  });
  const { recovery, booking } = await recoveryContext(recoveryId);
  await prisma.incidentRecovery.update({
    where: { id: recoveryId },
    data: {
      status: role === 'assigned' ? 'contacting_assigned' : 'contacting_alternatives',
      responseDueAt,
    },
  });

  const tenantId = getTenantRuntime()?.tenantId;
  const responseBase = `${env.appPublicUrl}/api/v1/public/incident-vendor-response`;
  const responseQuery = tenantId ? `tenant=${encodeURIComponent(tenantId)}&` : '';
  const message = [
    `URGENT MooNs Travel ${issueName(recovery.issueType)} for booking ${booking.booking_reference}.`,
    'Can you provide the booked service now?',
    `Available: ${responseBase}?${responseQuery}code=${responseCode}&decision=available`,
    `Unavailable: ${responseBase}?${responseQuery}code=${responseCode}&decision=unavailable`,
    `Response requested within ${VENDOR_RESPONSE_MINUTES} minutes.`,
  ].join('\n');
  if (contact.email) {
    await emailQueue
      .add(
        'incident-vendor-contact',
        {
          tenantId,
          to: contact.email,
          subject: `URGENT service recovery: ${booking.booking_reference}`,
          text: message,
          idempotencyKey: `incident-vendor:${attempt.id}:email`,
        },
        { jobId: `incident-vendor-email-${attempt.id}` },
      )
      .catch((error) =>
        logger.error('Could not queue incident vendor email', { attemptId: attempt.id, error }),
      );
  }
  if (contact.phone) {
    const phone = normalizeForSms(contact.phone);
    if (phone) await smsService.sendSMS(phone, message);
    if (tenantId) {
      await voiceRecoveryQueue
        .add(
          'call-recovery-vendor',
          { tenantId, attemptId: attempt.id, phone },
          { jobId: `incident-voice-${attempt.id}` },
        )
        .catch((error) =>
          logger.error('Could not queue incident vendor call', { attemptId: attempt.id, error }),
        );
    }
  }
  return attempt;
}

async function activateSelfBooking(recoveryId: string) {
  const { recovery, customer } = await recoveryContext(recoveryId);
  const options = localRecoveryOptions(recovery.issueType, recovery.destination);
  const existing = await prisma.incidentAlternative.findMany({ where: { recoveryId } });
  const existingNames = new Set(existing.map((item) => item.name));
  for (const option of options) {
    if (existingNames.has(option.name)) continue;
    await prisma.incidentAlternative.create({
      data: {
        recoveryId,
        serviceType: option.kind,
        name: option.name,
        bookingUrl: option.bookingUrl,
        availabilityStatus: 'self_booking_option',
        source: 'official_provider_directory',
        sourceAsOf: new Date(),
      },
    });
  }
  await prisma.incidentRecovery.update({
    where: { id: recoveryId },
    data: { status: 'self_booking_advised', fallbackActivatedAt: new Date() },
  });
  const lines = options.map((option) => `${option.name}: ${option.bookingUrl}`).join('\n');
  const message = [
    'Maya SOS update: the assigned provider and our verified alternatives have not confirmed in time.',
    'You may arrange a reasonable replacement using one of these official services:',
    lines,
    'Keep an itemized receipt and upload it in your trip incident. Reimbursement is subject to staff review and approval; it is not automatic.',
  ].join('\n');
  await recordCustomerUpdate(recoveryId, customer, 'self-booking-advised', message);
  return { status: 'self_booking_advised', options };
}

async function sourceAlternatives(recoveryId: string) {
  const { recovery, customer } = await recoveryContext(recoveryId);
  const already = await prisma.incidentVendorAttempt.count({
    where: { recoveryId, role: 'alternative' },
  });
  if (already) return { status: 'already_contacting_alternatives' };

  await prisma.incidentRecovery.update({
    where: { id: recoveryId },
    data: { status: 'sourcing_alternatives', fallbackActivatedAt: new Date() },
  });
  const coverage = await prisma.vendor_service_coverage.findMany({
    where: { service_type: { in: vendorServiceTypes(recovery.issueType) }, is_active: true },
    orderBy: { updated_at: 'desc' },
    take: 100,
  });
  const destination = (recovery.destination ?? '').trim().toLowerCase();
  const relevant = coverage.filter((row) => {
    if (!destination) return true;
    const place = `${row.destination} ${row.country ?? ''}`.toLowerCase();
    return destination.includes(row.destination.toLowerCase()) || place.includes(destination);
  });
  const vendorIds = [...new Set(relevant.map((row) => row.vendor_id))]
    .filter((id) => id !== recovery.assignedVendorId)
    .slice(0, 12);
  const vendors = await prisma.vendors.findMany({
    where: {
      id: { in: vendorIds },
      status: 'approved',
      is_verified: true,
      OR: [{ phone: { not: null } }, { whatsapp: { not: null } }, { email: { not: null } }],
    },
    orderBy: [{ last_checked_at: 'desc' }, { updated_at: 'desc' }],
    take: 3,
  });
  if (!vendors.length) return activateSelfBooking(recoveryId);

  for (const vendor of vendors) {
    await prisma.incidentAlternative.create({
      data: {
        recoveryId,
        vendorId: vendor.id,
        serviceType: /hotel/i.test(recovery.issueType) ? 'hotel' : 'transport',
        name: vendor.company_name,
        contactName: vendor.contact_name,
        phone: vendor.phone ?? vendor.whatsapp,
        email: vendor.email,
        availabilityStatus: 'contacting',
        source: 'verified_vendor_directory',
        sourceAsOf: vendor.last_checked_at ?? new Date(),
      },
    });
    await contactVendor(recoveryId, 'alternative', {
      vendorId: vendor.id,
      name: vendor.company_name,
      contactName: vendor.contact_name,
      phone: vendor.phone ?? vendor.whatsapp,
      email: vendor.email,
    });
  }
  await recordCustomerUpdate(
    recoveryId,
    customer,
    'alternatives-contacted',
    `Maya SOS update: the assigned provider has not confirmed. We are contacting ${vendors.length} verified alternative provider${vendors.length === 1 ? '' : 's'} now. We will only send you an alternative after it confirms availability.`,
  );
  return { status: 'contacting_alternatives', count: vendors.length };
}

export async function startIncidentRecovery(recoveryId: string) {
  const { recovery, customer } = await recoveryContext(recoveryId);
  if (!['reported', 'failed_to_start'].includes(recovery.status)) {
    return { status: recovery.status, deduplicated: true };
  }
  await recordCustomerUpdate(
    recoveryId,
    customer,
    'opened',
    `Maya SOS is active for your ${issueName(recovery.issueType)}. ${customerSafetyMessage(
      recovery.issueType,
    )} We will update you here, by email, and by SMS when available.`,
  );
  const assigned = await resolveAssignedContact(recoveryId);
  if (!assigned || (!assigned.phone && !assigned.email)) {
    return sourceAlternatives(recoveryId);
  }
  await contactVendor(recoveryId, 'assigned', assigned);
  return { status: 'contacting_assigned', responseMinutes: VENDOR_RESPONSE_MINUTES };
}

export async function vendorCallPrompt(attemptId: string) {
  const attempt = await prisma.incidentVendorAttempt.findUniqueOrThrow({
    where: { id: attemptId },
  });
  const { recovery, booking } = await recoveryContext(attempt.recoveryId);
  const prompt = `Urgent service recovery call from MooNs Travel for booking ${booking.booking_reference}. We have a ${issueName(
    recovery.issueType,
  )}. Press 1 if you can provide the service immediately. Press 2 if unavailable. Press 3 to request a human operations callback.`;
  return { prompt, recoveryId: recovery.id };
}

export async function markVendorCallStatus(
  attemptId: string,
  status: 'dialing' | 'connected' | 'awaiting_response' | 'failed',
  providerReference?: string,
) {
  return prisma.incidentVendorAttempt.update({
    where: { id: attemptId },
    data: { status, providerReference: providerReference ?? undefined },
  });
}

export async function recordVendorResponse(
  attemptId: string,
  decision: VendorDecision,
  metadata: Record<string, unknown> = {},
) {
  const attempt = await prisma.incidentVendorAttempt.findUniqueOrThrow({
    where: { id: attemptId },
  });
  if (attempt.respondedAt) return { status: attempt.status, deduplicated: true };
  const status =
    decision === 'available'
      ? 'responded_available'
      : decision === 'unavailable'
        ? 'responded_unavailable'
        : 'human_requested';
  await prisma.incidentVendorAttempt.update({
    where: { id: attemptId },
    data: { status, respondedAt: new Date(), response: { decision, ...metadata } },
  });
  const { recovery, customer } = await recoveryContext(attempt.recoveryId);

  if (decision === 'available') {
    if (attempt.role === 'alternative' && attempt.vendorId) {
      const alternative = await prisma.incidentAlternative.findFirst({
        where: { recoveryId: recovery.id, vendorId: attempt.vendorId },
      });
      if (alternative) {
        await prisma.incidentAlternative.update({
          where: { id: alternative.id },
          data: { availabilityStatus: 'available', selectedAt: new Date() },
        });
        await prisma.incidentRecovery.update({
          where: { id: recovery.id },
          data: { status: 'alternative_confirmed', responseDueAt: null },
        });
        const contact = [alternative.contactName, alternative.phone, alternative.email]
          .filter(Boolean)
          .join(', ');
        await recordCustomerUpdate(
          recovery.id,
          customer,
          `alternative-confirmed-${alternative.id}`,
          `Maya SOS update: ${alternative.name} confirmed availability for your replacement ${alternative.serviceType}. Contact: ${contact || 'MooNs operations will coordinate the handoff'}. Confirm the final price before accepting.`,
        );
      }
    } else {
      const contact = objectValue(attempt.contactSnapshot);
      await prisma.incidentRecovery.update({
        where: { id: recovery.id },
        data: { status: 'assigned_provider_confirmed', responseDueAt: null },
      });
      await recordCustomerUpdate(
        recovery.id,
        customer,
        'assigned-confirmed',
        `Maya SOS update: the assigned provider ${String(contact.name ?? '')} confirmed it can respond now. Contact: ${String(contact.phone ?? contact.email ?? 'MooNs operations will coordinate')}.`,
      );
    }
    return { status: 'available' };
  }

  if (decision === 'human') {
    await prisma.incidentRecovery.update({
      where: { id: recovery.id },
      data: { status: 'human_callback_requested' },
    });
    await recordCustomerUpdate(
      recovery.id,
      customer,
      `human-requested-${attempt.id}`,
      'Maya SOS update: the provider requested an operations callback. The recovery case remains open and we are continuing to track it.',
    );
    return { status: 'human_callback_requested' };
  }

  if (attempt.role === 'assigned') return sourceAlternatives(recovery.id);
  if (attempt.vendorId) {
    await prisma.incidentAlternative.updateMany({
      where: { recoveryId: recovery.id, vendorId: attempt.vendorId },
      data: { availabilityStatus: 'unavailable' },
    });
  }
  const remaining = await prisma.incidentVendorAttempt.count({
    where: {
      recoveryId: recovery.id,
      role: 'alternative',
      status: { in: ACTIVE_ATTEMPT_STATUSES },
    },
  });
  if (!remaining) return activateSelfBooking(recovery.id);
  return { status: 'awaiting_other_alternatives' };
}

export async function recordVendorResponseByCode(code: string, decision: VendorDecision) {
  const attempt = await prisma.incidentVendorAttempt.findUnique({
    where: { responseCode: code.trim().toUpperCase() },
  });
  if (!attempt) {
    throw new AppError(404, 'Invalid incident response code', 'INCIDENT_RESPONSE_NOT_FOUND');
  }
  if (attempt.respondedAt && attempt.status === 'timed_out') {
    throw new AppError(410, 'This incident response link has expired', 'INCIDENT_RESPONSE_EXPIRED');
  }
  return recordVendorResponse(attempt.id, decision, { channel: 'response_link' });
}

export async function runIncidentRecoverySweep() {
  const now = new Date();
  const due = await prisma.incidentVendorAttempt.findMany({
    where: { status: { in: ACTIVE_ATTEMPT_STATUSES }, responseDueAt: { lte: now } },
    orderBy: { responseDueAt: 'asc' },
    take: 100,
  });
  const recoveries = new Set<string>();
  for (const attempt of due) {
    const updated = await prisma.incidentVendorAttempt.updateMany({
      where: { id: attempt.id, status: { in: ACTIVE_ATTEMPT_STATUSES } },
      data: { status: 'timed_out', respondedAt: now, response: { decision: 'timeout' } },
    });
    if (updated.count) recoveries.add(attempt.recoveryId);
    if (updated.count && attempt.role === 'alternative' && attempt.vendorId) {
      await prisma.incidentAlternative.updateMany({
        where: { recoveryId: attempt.recoveryId, vendorId: attempt.vendorId },
        data: { availabilityStatus: 'timed_out' },
      });
    }
  }
  for (const recoveryId of recoveries) {
    const assignedPending = await prisma.incidentVendorAttempt.count({
      where: { recoveryId, role: 'assigned', status: { in: ACTIVE_ATTEMPT_STATUSES } },
    });
    const alternatives = await prisma.incidentVendorAttempt.findMany({
      where: { recoveryId, role: 'alternative' },
      select: { status: true },
    });
    if (!alternatives.length && !assignedPending) await sourceAlternatives(recoveryId);
    else if (
      alternatives.length &&
      alternatives.every((attempt) => !ACTIVE_ATTEMPT_STATUSES.includes(attempt.status)) &&
      alternatives.every((attempt) => attempt.status !== 'responded_available')
    ) {
      await activateSelfBooking(recoveryId);
    }
  }
  return { timedOut: due.length, recoveriesAdvanced: recoveries.size };
}

export async function createIncidentReceiptUpload(
  customerUserId: number,
  bookingId: number,
  incidentId: number,
  input: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256?: string;
    expenseType: 'transport' | 'hotel';
    amount: number;
    currency: string;
    merchant?: string;
  },
) {
  const recovery = await prisma.incidentRecovery.findFirst({
    where: { incidentId, bookingId, customerUserId },
  });
  if (!recovery) throw new AppError(404, 'Trip incident not found', 'INCIDENT_NOT_FOUND');
  if (recovery.status !== 'self_booking_advised') {
    throw new AppError(
      409,
      'Receipt reimbursement is available after Maya activates self-booking fallback',
      'SELF_BOOKING_NOT_AUTHORIZED',
    );
  }
  const traveller = await ensureTravellerForCustomer(customerUserId);
  const upload = await secureUploadService.create(`customer:${customerUserId}`, input);
  const created = await prisma.$transaction(async (tx) => {
    const document = await tx.secureTravelDocument.create({
      data: {
        travellerId: traveller.id,
        tripId: recovery.tripId,
        documentType: 'receipt',
        storageKey: `upload-object:${upload.id}`,
        originalName: input.filename,
        mimeType: input.mimeType,
        metadata: {
          uploadObjectId: upload.id,
          quarantine: true,
          incidentId,
          recoveryId: recovery.id,
          expenseType: input.expenseType,
        },
      },
    });
    const receipt = await tx.incidentReceipt.create({
      data: {
        recoveryId: recovery.id,
        customerUserId,
        secureDocumentId: document.id,
        expenseType: input.expenseType,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        merchant: input.merchant?.trim() || null,
      },
    });
    return { document, receipt };
  });
  return {
    ...upload,
    documentId: created.document.id,
    receiptId: created.receipt.id,
    receiptStatus: created.receipt.status,
  };
}

export async function onIncidentReceiptScan(uploadObjectId: string, clean: boolean) {
  const document = await prisma.secureTravelDocument.findUnique({
    where: { storageKey: `upload-object:${uploadObjectId}` },
  });
  if (!document || document.documentType !== 'receipt') return { ignored: true };
  const receipt = await prisma.incidentReceipt.findUnique({
    where: { secureDocumentId: document.id },
  });
  if (!receipt) return { ignored: true };
  if (!clean) {
    await prisma.incidentReceipt.update({
      where: { id: receipt.id },
      data: { status: 'scan_failed' },
    });
    return { rejected: true };
  }
  if (receipt.proposalId) return { duplicate: true, proposalId: receipt.proposalId };
  const proposal = await prisma.mayaActionProposal.upsert({
    where: { idempotencyKey: `incident-reimbursement:${receipt.id}` },
    update: {},
    create: {
      actionType: 'approve_incident_reimbursement',
      riskClass: 'high_risk',
      subjectType: 'incident_receipt',
      subjectRef: receipt.id,
      input: { receiptId: receipt.id },
      evidence: {
        source: 'authenticated_traveller_receipt',
        malwareScan: 'clean',
        secureDocumentId: document.id,
        recoveryId: receipt.recoveryId,
        expenseType: receipt.expenseType,
        amount: receipt.amount.toString(),
        currency: receipt.currency,
        merchant: receipt.merchant,
      },
      policyVersion: 'maya-autonomy-2026-07-22',
      idempotencyKey: `incident-reimbursement:${receipt.id}`,
      requestedBy: `traveller:${receipt.customerUserId}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    },
  });
  await prisma.incidentReceipt.update({
    where: { id: receipt.id },
    data: { status: 'awaiting_staff_review', proposalId: proposal.id },
  });
  return { proposalId: proposal.id, status: proposal.status };
}

export async function confirmIncidentResolved(
  customerUserId: number,
  bookingId: number,
  incidentId: number,
) {
  const context = await recoveryContext(
    (
      await prisma.incidentRecovery.findFirst({
        where: { incidentId, bookingId, customerUserId },
        select: { id: true },
      })
    )?.id ?? '',
  ).catch(() => null);
  if (!context) throw new AppError(404, 'Trip incident not found', 'INCIDENT_NOT_FOUND');
  if (context.recovery.resolvedAt) return { status: 'resolved', deduplicated: true };
  const usedFallback = [
    'alternative_confirmed',
    'self_booking_advised',
    'reimbursement_under_review',
  ].includes(context.recovery.status);
  await prisma.$transaction([
    prisma.incidentRecovery.update({
      where: { id: context.recovery.id },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        responseDueAt: null,
        resolutionSummary: 'Traveller confirmed that replacement or assigned service was received.',
      },
    }),
    prisma.booking_contingencies.update({
      where: { id: context.incident.id },
      data: {
        plan_a_status: 'resolved',
        plan_b_authorized: usedFallback,
        resolved_at: new Date(),
      },
    }),
  ]);
  await recordCustomerUpdate(
    context.recovery.id,
    context.customer,
    'resolved',
    'Maya SOS case closed: you confirmed that service was received. Any submitted receipt remains in its separate staff reimbursement review.',
  );
  return { status: 'resolved', deduplicated: false };
}
