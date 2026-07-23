// @ts-nocheck
import { z } from 'zod';
import { defineOperation } from './defineOperation.js';
import {
  adminAuthSchema,
  requireSecurityAdmin,
  getSecurityModule,
  securityAuthSchema,
  ipRuleSchema,
} from '../legacy/api/db.functions.server.js';
type SecuritySettings = any;
export const adminGetSecuritySettings = defineOperation({ method: 'POST' })
  .validator(securityAuthSchema)
  .handler(async ({ data }): Promise<SecuritySettings> => {
    await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    return security.getSecuritySettings();
  });

export const adminSaveSecuritySettings = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      settings: z.object({
        f12TrapBlockEnabled: z.boolean(),
        honeypotBlockEnabled: z.boolean(),
        botUaBlockEnabled: z.boolean(),
        spoofedBrowserBlockEnabled: z.boolean(),
        rateLimitBlockEnabled: z.boolean(),
        sourceMapBlockingEnabled: z.boolean(),
        rateLimitMaxRequests: z.number().int().min(1).max(10000),
        rateLimitWindowSeconds: z.number().int().min(1).max(3600),
        blockDurationHours: z.number().int().min(1).max(8760),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    await security.saveSecuritySettings(data.settings, admin.email);
    return { success: true };
  });

export const adminListBlockedIps = defineOperation({ method: 'POST' })
  .validator(securityAuthSchema)
  .handler(async ({ data }) => {
    await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    return security.getBlockedIpRows();
  });

export const adminListAllowlistedIps = defineOperation({ method: 'POST' })
  .validator(securityAuthSchema)
  .handler(async ({ data }) => {
    await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    return security.getAllowlistRows();
  });

export const adminGetSecurityEvents = defineOperation({ method: 'POST' })
  .validator(
    z.object({ auth: adminAuthSchema, limit: z.number().int().min(1).max(500).optional() }),
  )
  .handler(async ({ data }) => {
    await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    return security.getSecurityEvents(data.limit || 100);
  });

export const adminGetSecurityOverview = defineOperation({ method: 'POST' })
  .validator(securityAuthSchema)
  .handler(async ({ data }) => {
    await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    const [settings, policy, blocks, allowlist, events] = await Promise.all([
      security.getSecuritySettings(),
      security.getSecurityPolicy(),
      security.getBlockedIpRows(),
      security.getAllowlistRows(),
      security.getSecurityEvents(100),
    ]);
    return { settings, policy, blocks, allowlist, events };
  });

export const adminBlockIp = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      ip: ipRuleSchema,
      reason: z.string().min(3).max(1000),
      durationHours: z.number().int().min(1).max(8760).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    await security.blockIpAddress({
      ip: data.ip,
      reason: data.reason,
      source: 'manual',
      blockedBy: admin.email,
      durationHours: data.durationHours,
    });
    return { success: true };
  });

export const adminUnblockIp = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema, ip: ipRuleSchema }))
  .handler(async ({ data }) => {
    const admin = await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    await security.unblockIp(data.ip, admin.email);
    return { success: true };
  });

export const adminAllowlistIp = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      ip: ipRuleSchema,
      label: z.string().min(1).max(160),
      notes: z.string().max(1000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    await security.allowlistIp({
      ip: data.ip,
      label: data.label,
      notes: data.notes,
      createdBy: admin.email,
    });
    return { success: true };
  });

export const adminRemoveAllowlistedIp = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: adminAuthSchema, ip: ipRuleSchema }))
  .handler(async ({ data }) => {
    const admin = await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    await security.removeAllowlistedIp(data.ip, admin.email);
    return { success: true };
  });

export const adminExtendIpBlock = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: adminAuthSchema,
      ip: ipRuleSchema,
      durationHours: z.number().int().min(1).max(8760),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireSecurityAdmin(data.auth);
    const security = await getSecurityModule();
    await security.blockIpAddress({
      ip: data.ip,
      reason: `Manual extension for ${data.durationHours} hours`,
      source: 'manual',
      blockedBy: admin.email,
      durationHours: data.durationHours,
    });
    await security.recordSecurityEvent({
      eventType: 'ip_block_extended',
      source: 'manual',
      ipAddress: data.ip,
      reason: `Extended for ${data.durationHours} hours`,
      createdBy: admin.email,
    });
    return { success: true };
  });
