import type { MayaChannel } from '../types.js';

export const MAYA_POLICY_VERSION = 'maya-autonomy-2026-07-22';

export type MayaToolRisk = 'read_only' | 'low_risk_write' | 'human_approval' | 'high_risk';

export interface MayaPolicyContext {
  channel: MayaChannel;
  externalWritesEnabled: boolean;
  toolAllowlist?: ReadonlySet<string>;
}

export interface MayaPolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  riskClass: MayaToolRisk;
  policyVersion: string;
  reason: string;
}

/**
 * The model never chooses its own authority. Every callable capability has a
 * fixed application-level risk class, shared by voice, chat, WhatsApp and SMS.
 */
const TOOL_RISK: Readonly<Record<string, MayaToolRisk>> = {
  recognize_caller: 'read_only',
  find_packages: 'read_only',
  get_package_quote: 'read_only',
  find_catalog_items: 'read_only',
  capture_lead: 'low_risk_write',
  schedule_callback: 'low_risk_write',
  escalate_to_human: 'low_risk_write',
  build_custom_quote: 'low_risk_write',
  // Sending externally is approval-bound until consent, quiet-hours and
  // template checks have all been proven by structured evidence.
  send_whatsapp_summary: 'human_approval',
};

export const MAYA_GOVERNED_TOOLS = Object.freeze(Object.keys(TOOL_RISK));

export function mayaToolRisk(name: string): MayaToolRisk {
  return TOOL_RISK[name] ?? 'high_risk';
}

export function decideMayaTool(name: string, context: MayaPolicyContext): MayaPolicyDecision {
  const riskClass = mayaToolRisk(name);
  const base = { riskClass, policyVersion: MAYA_POLICY_VERSION };

  if (context.toolAllowlist && !context.toolAllowlist.has(name)) {
    return {
      ...base,
      allowed: false,
      requiresApproval: false,
      reason: 'Tool is disabled by the tenant allowlist.',
    };
  }
  if (riskClass !== 'read_only' && !context.externalWritesEnabled) {
    return {
      ...base,
      allowed: false,
      requiresApproval: false,
      reason: 'Maya external writes are disabled by the tenant kill switch.',
    };
  }
  if (riskClass === 'human_approval' || riskClass === 'high_risk') {
    return {
      ...base,
      allowed: true,
      requiresApproval: true,
      reason: 'This action requires a staff approval before execution.',
    };
  }
  return {
    ...base,
    allowed: true,
    requiresApproval: false,
    reason: riskClass === 'read_only' ? 'Read-only action.' : 'Approved low-risk action.',
  };
}

export const PERMANENTLY_APPROVAL_BOUND_ACTIONS = new Set([
  'send_commercial_quote',
  'apply_discretionary_discount',
  'change_booking',
  'cancel_booking',
  'rebook_service',
  'confirm_supplier_service',
  'bind_insurance',
  'create_emi_order',
  'create_payment_order',
  'settle_refund',
  'approve_incident_reimbursement',
  'release_escrow',
  'make_visa_eligibility_claim',
]);
