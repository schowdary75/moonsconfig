import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { createMayaDeps } from '../deps.js';
import { executeApprovedTool } from '../tools.js';
import type { MayaChannel } from '../types.js';
import type { MayaToolResult } from '../types.js';
import { appendTravelEvent } from '../../services/travelEventService.js';
import { env } from '../../config/env.js';

function channelFromRequester(requestedBy: string): MayaChannel {
  const channel = requestedBy.split(':')[1];
  return typeof channel === 'string' && ['voice', 'whatsapp', 'chat', 'sms'].includes(channel)
    ? (channel as MayaChannel)
    : 'chat';
}

export async function executeApprovedMayaProposal(proposalId: string) {
  if (!env.maya.enabled || !env.maya.externalWritesEnabled) {
    return { executed: false, reason: 'kill_switch' as const };
  }
  const proposal = await prisma.mayaActionProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) return { executed: false, reason: 'not_found' as const };
  const channel = channelFromRequester(proposal.requestedBy);
  const killSwitches = await prisma.maya_settings.findMany({
    where: {
      setting_key: {
        in: ['autopilot_master', `maya_channel_${channel}`, `maya_tool_${proposal.actionType}`],
      },
      setting_value: 'off',
    },
    select: { setting_key: true },
  });
  if (killSwitches.length) return { executed: false, reason: 'tenant_kill_switch' as const };
  if (proposal.status === 'completed')
    return { executed: false, reason: 'already_completed' as const };
  if (proposal.status !== 'approved') return { executed: false, reason: 'not_approved' as const };
  const now = new Date();
  if (proposal.expiresAt <= now) {
    await prisma.mayaActionProposal.update({
      where: { id: proposal.id },
      data: { status: 'expired' },
    });
    return { executed: false, reason: 'expired' as const };
  }

  const claimed = await prisma.mayaActionProposal.updateMany({
    where: { id: proposal.id, status: 'approved' },
    data: { status: 'executing' },
  });
  if (!claimed.count) return { executed: false, reason: 'already_claimed' as const };

  const priorAttempts = await prisma.mayaActionExecution.count({ where: { proposalId } });
  const execution = await prisma.mayaActionExecution.create({
    data: { proposalId, attempt: priorAttempts + 1, status: 'running' },
  });
  const deps = createMayaDeps();
  let result: MayaToolResult;
  if (proposal.actionType === 'cancel_booking') {
    const input = proposal.input as { bookingId?: unknown; customerUserId?: unknown };
    const bookingId = Number(input.bookingId);
    const customerUserId = Number(input.customerUserId);
    if (!Number.isInteger(bookingId) || !Number.isInteger(customerUserId)) {
      result = { ok: false, message: 'Approved cancellation contains invalid booking data.' };
    } else {
      result = await prisma.$transaction(async (tx) => {
        const booking = await tx.bookings.findFirst({
          where: { id: bookingId, user_id: customerUserId },
        });
        if (!booking) return { ok: false, message: 'Booking no longer exists.' };
        if (booking.status !== 'cancelled') {
          await tx.bookings.update({ where: { id: booking.id }, data: { status: 'cancelled' } });
          if (booking.canonical_trip_id) {
            await tx.travelTrip.updateMany({
              where: { id: booking.canonical_trip_id },
              data: { status: 'cancelled' },
            });
          }
        }
        let legacyRefund = await tx.user_refunds.findFirst({
          where: { user_id: customerUserId, booking_reference: booking.booking_reference },
          orderBy: { id: 'desc' },
        });
        legacyRefund ??= await tx.user_refunds.create({
          data: {
            user_id: customerUserId,
            booking_reference: booking.booking_reference,
            item_type: booking.item_name,
            amount: booking.amount,
            status: 'admin_review',
          },
        });
        await tx.canonicalRefundCase.upsert({
          where: { legacyRefundId: legacyRefund.id },
          update: { status: 'admin_review' },
          create: {
            legacyRefundId: legacyRefund.id,
            tripId: booking.canonical_trip_id,
            travellerId: booking.traveller_id,
            status: 'admin_review',
            amount: booking.amount,
            reason: 'Booking cancellation approved; refund settlement requires separate review.',
          },
        });
        await appendTravelEvent(tx, {
          eventType: 'RefundRequested',
          aggregateType: 'CanonicalRefundCase',
          aggregateId: String(legacyRefund.id),
          payload: { bookingId: booking.id, legacyRefundId: legacyRefund.id },
        });
        return {
          ok: true,
          message:
            'Booking cancelled. The refund is in admin review; no money or escrow was released.',
          data: { bookingId: booking.id, refundId: legacyRefund.id },
        };
      });
    }
  } else if (proposal.actionType === 'approve_incident_reimbursement') {
    const input = proposal.input as { receiptId?: unknown };
    const receiptId = String(input.receiptId ?? '');
    if (!receiptId) {
      result = { ok: false, message: 'Approved reimbursement contains invalid receipt data.' };
    } else {
      result = await prisma.$transaction(async (tx) => {
        const receipt = await tx.incidentReceipt.findUnique({ where: { id: receiptId } });
        if (!receipt || receipt.status !== 'awaiting_staff_review') {
          return { ok: false, message: 'Receipt is no longer awaiting staff review.' };
        }
        const recovery = await tx.incidentRecovery.findUnique({
          where: { id: receipt.recoveryId },
        });
        const booking = recovery
          ? await tx.bookings.findFirst({
              where: { id: recovery.bookingId, user_id: receipt.customerUserId },
            })
          : null;
        if (!recovery || !booking) {
          return { ok: false, message: 'The incident booking could not be verified.' };
        }
        let refundCase = await tx.canonicalRefundCase.findFirst({
          where: { providerReference: `incident-receipt:${receipt.id}` },
        });
        if (!refundCase) {
          const legacyRefund = await tx.user_refunds.create({
            data: {
              user_id: receipt.customerUserId,
              booking_reference: booking.booking_reference,
              item_type: `${receipt.expenseType} incident expense`,
              amount: Math.round(Number(receipt.amount)),
              status: 'admin_review',
            },
          });
          refundCase = await tx.canonicalRefundCase.create({
            data: {
              legacyRefundId: legacyRefund.id,
              tripId: recovery.tripId,
              travellerId: booking.traveller_id,
              status: 'admin_review',
              amount: receipt.amount,
              currency: receipt.currency,
              reason: `Customer replacement ${receipt.expenseType} expense after incident ${recovery.incidentId}.`,
              policyVersion: proposal.policyVersion,
              eligibility: {
                receiptId: receipt.id,
                secureDocumentId: receipt.secureDocumentId,
                malwareScan: 'clean',
                staffProposalId: proposal.id,
                settlementAuthorized: false,
              },
              providerReference: `incident-receipt:${receipt.id}`,
            },
          });
          await appendTravelEvent(tx, {
            eventType: 'RefundRequested',
            aggregateType: 'CanonicalRefundCase',
            aggregateId: refundCase.id,
            payload: {
              refundCaseId: refundCase.id,
              receiptId: receipt.id,
              recoveryId: recovery.id,
              bookingId: booking.id,
            },
          });
        }
        await tx.incidentReceipt.update({
          where: { id: receipt.id },
          data: { status: 'admin_review' },
        });
        await tx.incidentRecovery.update({
          where: { id: recovery.id },
          data: { status: 'reimbursement_under_review' },
        });
        return {
          ok: true,
          message:
            'Receipt verified and reimbursement case opened for finance review. No money or escrow was released.',
          data: { receiptId: receipt.id, refundCaseId: refundCase.id },
        };
      });
    }
  } else {
    result = await executeApprovedTool(proposal.actionType, proposal.input, {
      channel: channelFromRequester(proposal.requestedBy),
      sessionId: proposal.subjectRef,
      deps,
    });
  }

  await prisma.$transaction([
    prisma.mayaActionExecution.update({
      where: { id: execution.id },
      data: {
        status: result.ok ? 'succeeded' : 'failed',
        result: result as unknown as Prisma.InputJsonValue,
        errorMessage: result.ok ? null : result.message.slice(0, 600),
        completedAt: new Date(),
      },
    }),
    prisma.mayaActionProposal.update({
      where: { id: proposal.id },
      data: { status: result.ok ? 'completed' : 'failed' },
    }),
  ]);
  return { executed: true, ok: result.ok, result };
}
