import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { appendTravelEvent } from './travelEventService.js';
import {
  MAYA_GOVERNED_TOOLS,
  PERMANENTLY_APPROVAL_BOUND_ACTIONS,
} from '../maya/governance/policy.js';
import { getTenantRuntime } from '../config/tenantContext.js';
import { secureUploadService } from './secureUploadService.js';

export async function reviewMayaAction(input: {
  proposalId: string;
  decision: 'approve' | 'reject';
  reason: string;
  reviewerId: number;
  recentMfa: boolean;
}) {
  const proposal = await prisma.mayaActionProposal.findUnique({ where: { id: input.proposalId } });
  if (!proposal) throw new AppError(404, 'Maya action proposal not found', 'ACTION_NOT_FOUND');
  if (proposal.status !== 'pending') {
    throw new AppError(409, 'Maya action proposal is no longer pending', 'ACTION_NOT_PENDING');
  }
  if (proposal.expiresAt <= new Date()) {
    await prisma.mayaActionProposal.update({
      where: { id: proposal.id },
      data: { status: 'expired' },
    });
    throw new AppError(409, 'Maya action proposal has expired', 'ACTION_EXPIRED');
  }
  if (proposal.riskClass === 'high_risk' && !input.recentMfa) {
    throw new AppError(
      428,
      'Use the MFA-protected review endpoint for this high-risk action',
      'MFA_STEP_UP_REQUIRED',
    );
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.mayaActionProposal.update({
      where: { id: proposal.id },
      data: {
        status: input.decision === 'approve' ? 'approved' : 'rejected',
        approvedBy: input.decision === 'approve' ? input.reviewerId : null,
        approvalReason: input.reason,
        reviewedAt: new Date(),
      },
    });
    if (input.decision === 'approve') {
      await appendTravelEvent(tx, {
        eventType: 'MayaActionApproved',
        aggregateType: 'MayaActionProposal',
        aggregateId: proposal.id,
        payload: { proposalId: proposal.id, actionType: proposal.actionType },
      });
    }
    return updated;
  });
}

export async function listMayaKillSwitches() {
  const settings = await prisma.maya_settings.findMany({
    where: {
      OR: [
        { setting_key: 'autopilot_master' },
        { setting_key: { startsWith: 'maya_channel_' } },
        { setting_key: { startsWith: 'maya_tool_' } },
      ],
    },
    orderBy: { setting_key: 'asc' },
  });
  const persisted = new Map(settings.map((setting) => [setting.setting_key, setting]));
  const keys = [
    'autopilot_master',
    ...['voice', 'whatsapp', 'chat', 'sms', 'email'].map((name) => `maya_channel_${name}`),
    ...[...new Set([...MAYA_GOVERNED_TOOLS, ...PERMANENTLY_APPROVAL_BOUND_ACTIONS])].map(
      (name) => `maya_tool_${name}`,
    ),
  ];
  return keys.map((key) => {
    const setting = persisted.get(key);
    return {
      key,
      enabled: setting?.setting_value.toLowerCase() !== 'off',
      updatedAt: setting?.updated_at ?? null,
    };
  });
}

export async function incidentReceiptForReview(proposalId: string) {
  const proposal = await prisma.mayaActionProposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.actionType !== 'approve_incident_reimbursement') {
    throw new AppError(404, 'Incident receipt proposal not found', 'RECEIPT_NOT_FOUND');
  }
  const receipt = await prisma.incidentReceipt.findFirst({
    where: { proposalId: proposal.id },
  });
  const document = receipt
    ? await prisma.secureTravelDocument.findFirst({
        where: { id: receipt.secureDocumentId, scanStatus: 'clean', deletedAt: null },
      })
    : null;
  if (!receipt || !document) {
    throw new AppError(404, 'Clean incident receipt is unavailable', 'RECEIPT_NOT_AVAILABLE');
  }
  const tenantId = getTenantRuntime()?.tenantId;
  if (!tenantId) throw new AppError(401, 'A company workspace is required', 'TENANT_REQUIRED');
  const download = await secureUploadService.download(
    tenantId,
    document.storageKey.replace(/^upload-object:/, ''),
  );
  return {
    ...download,
    amount: receipt.amount,
    currency: receipt.currency,
    merchant: receipt.merchant,
  };
}

export async function setMayaKillSwitch(input: {
  scope: 'master' | 'channel' | 'tool';
  key?: string;
  enabled: boolean;
  actorId: number;
}) {
  const settingKey =
    input.scope === 'master'
      ? 'autopilot_master'
      : input.scope === 'channel'
        ? `maya_channel_${input.key}`
        : `maya_tool_${input.key}`;
  const setting = await prisma.maya_settings.upsert({
    where: { setting_key: settingKey },
    update: { setting_value: input.enabled ? 'on' : 'off', updated_at: new Date() },
    create: { setting_key: settingKey, setting_value: input.enabled ? 'on' : 'off' },
  });
  await prisma.maya_activity_log.create({
    data: {
      area: 'governance',
      action: 'kill_switch_changed',
      ref_id: input.actorId,
      summary: `${settingKey} was turned ${input.enabled ? 'on' : 'off'} by staff user ${input.actorId}.`,
      status: 'attention',
    },
  });
  return { key: setting.setting_key, enabled: input.enabled, updatedAt: setting.updated_at };
}
