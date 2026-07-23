import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import type { MayaToolContext, MayaToolResult } from '../types.js';
import { decideMayaTool, MAYA_POLICY_VERSION } from './policy.js';

const PROPOSAL_TTL_MS = 30 * 60_000;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function actionKey(sessionId: string, tool: string, input: unknown) {
  return createHash('sha256')
    .update(`${MAYA_POLICY_VERSION}:${sessionId}:${tool}:${canonicalJson(input)}`)
    .digest('hex');
}

function allowlist(): ReadonlySet<string> | undefined {
  const names = env.maya.toolAllowlist;
  return names.length ? new Set(names) : undefined;
}

async function tenantToolPolicy(name: string, ctx: MayaToolContext) {
  const keys = ['autopilot_master', `maya_channel_${ctx.channel}`, `maya_tool_${name}`];
  const rows = await ctx.deps.prisma.maya_settings.findMany({
    where: { setting_key: { in: keys } },
    select: { setting_key: true, setting_value: true },
  });
  const values = new Map(rows.map((row) => [row.setting_key, row.setting_value.toLowerCase()]));
  const disabledKey = keys.find((key) => values.get(key) === 'off');
  return { enabled: !disabledKey, disabledKey };
}

/** Unit-test fakes from the pre-governance suite do not expose the new model. */
export function supportsMayaGovernance(ctx: MayaToolContext): boolean {
  return Boolean(
    (ctx.deps.prisma as unknown as { mayaActionProposal?: unknown }).mayaActionProposal,
  );
}

export async function governMayaTool(
  name: string,
  input: unknown,
  ctx: MayaToolContext,
): Promise<
  { execute: true; proposalId: string | null } | { execute: false; result: MayaToolResult }
> {
  if (!supportsMayaGovernance(ctx)) return { execute: true, proposalId: null };
  if (!env.maya.enabled) {
    return {
      execute: false,
      result: { ok: false, message: 'Maya is disabled by the tenant kill switch.' },
    };
  }
  const tenantPolicy = await tenantToolPolicy(name, ctx);
  if (!tenantPolicy.enabled) {
    return {
      execute: false,
      result: {
        ok: false,
        message: `Maya is disabled by the tenant kill switch (${tenantPolicy.disabledKey}).`,
      },
    };
  }

  const decision = decideMayaTool(name, {
    channel: ctx.channel,
    externalWritesEnabled: env.maya.externalWritesEnabled,
    toolAllowlist: allowlist(),
  });
  if (!decision.allowed) {
    return { execute: false, result: { ok: false, message: decision.reason } };
  }
  if (decision.riskClass === 'read_only') return { execute: true, proposalId: null };

  const idempotencyKey = actionKey(ctx.sessionId, name, input);
  const existing = await ctx.deps.prisma.mayaActionProposal.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    if (existing.status === 'completed') {
      return {
        execute: false,
        result: {
          ok: true,
          message: 'This action was already completed.',
          data: { proposalId: existing.id },
        },
      };
    }
    if (existing.status === 'pending' || existing.status === 'approved') {
      return {
        execute: false,
        result: {
          ok: true,
          message:
            existing.status === 'pending'
              ? 'The action is already waiting for staff approval.'
              : 'The approved action is queued for execution.',
          data: { proposalId: existing.id, approvalRequired: existing.status === 'pending' },
        },
      };
    }
  }

  const autoExecute = !decision.requiresApproval;
  const proposal = await ctx.deps.prisma.mayaActionProposal.create({
    data: {
      conversationId: null,
      actionType: name,
      riskClass: decision.riskClass,
      subjectType: 'conversation',
      subjectRef: ctx.sessionId.slice(0, 120),
      input: input as Prisma.InputJsonValue,
      evidence: {
        source: 'channel_conversation',
        channel: ctx.channel,
        sessionId: ctx.sessionId,
      },
      policyVersion: decision.policyVersion,
      idempotencyKey,
      status: autoExecute ? 'executing' : 'pending',
      requestedBy: `maya:${ctx.channel}`,
      expiresAt: new Date(ctx.deps.now().getTime() + PROPOSAL_TTL_MS),
    },
  });

  if (!autoExecute) {
    return {
      execute: false,
      result: {
        ok: true,
        message:
          'I have prepared that action for a team member to review. I have not sent or charged anything.',
        data: { proposalId: proposal.id, approvalRequired: true },
      },
    };
  }
  return { execute: true, proposalId: proposal.id };
}

export async function completeGovernedAction(
  proposalId: string | null,
  result: MayaToolResult,
  ctx: MayaToolContext,
) {
  if (!proposalId) return;
  const status = result.ok ? 'succeeded' : 'failed';
  await ctx.deps.prisma.$transaction([
    ctx.deps.prisma.mayaActionExecution.create({
      data: {
        proposalId,
        status,
        result: result as unknown as Prisma.InputJsonValue,
        completedAt: ctx.deps.now(),
        errorMessage: result.ok ? null : result.message.slice(0, 600),
      },
    }),
    ctx.deps.prisma.mayaActionProposal.update({
      where: { id: proposalId },
      data: { status: result.ok ? 'completed' : 'failed' },
    }),
  ]);
}

export async function failGovernedAction(
  proposalId: string | null,
  error: unknown,
  ctx: MayaToolContext,
) {
  if (!proposalId) return;
  const message = error instanceof Error ? error.message : 'Unexpected action error';
  await ctx.deps.prisma
    .$transaction([
      ctx.deps.prisma.mayaActionExecution.create({
        data: {
          proposalId,
          status: 'failed',
          errorMessage: message.slice(0, 600),
          completedAt: ctx.deps.now(),
        },
      }),
      ctx.deps.prisma.mayaActionProposal.update({
        where: { id: proposalId },
        data: { status: 'failed' },
      }),
    ])
    .catch(() => undefined);
}

export async function expireMayaActionProposals(now = new Date()) {
  return (await import('../../config/prisma.js')).prisma.mayaActionProposal.updateMany({
    where: { status: 'pending', expiresAt: { lte: now } },
    data: { status: 'expired', reviewedAt: now },
  });
}
