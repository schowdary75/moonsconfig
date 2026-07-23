// @ts-nocheck
import { z } from 'zod';
import { defineOperation } from './defineOperation.js';
import * as legacy from '../legacy/api/db.functions.server.js';
import { prisma } from '../config/prisma.js';

export const adminGetCampaigns = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    return await prisma.mktg_campaigns.findMany();
  });

export const adminCreateCampaign = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, campaign: legacy.campaignInputSchema }))
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    const inserted = await prisma.mktg_campaigns.create({
      data: {
        name: data.campaign.name,
        type: data.campaign.type,
        status: data.campaign.status,
        budget: data.campaign.budget == null ? null : data.campaign.budget,
        spent: data.campaign.spent,
        reach: data.campaign.reach,
        conversions: data.campaign.conversions,
        start_date: data.campaign.startDate ? new Date(data.campaign.startDate) : null,
        end_date: data.campaign.endDate ? new Date(data.campaign.endDate) : null,
      },
    });
    await legacy.logAdminAction(
      admin.email,
      'campaign.create',
      'mktg_campaign',
      inserted.id,
      null,
      data.campaign,
    );
    return { success: true };
  });

export const adminUpdateCampaignStatus = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      id: z.number(),
      status: z.enum(['draft', 'active', 'paused', 'completed']),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    await prisma.mktg_campaigns.update({ where: { id: data.id }, data: { status: data.status } });
    await legacy.logAdminAction(admin.email, 'campaign.status', 'mktg_campaign', data.id, null, {
      status: data.status,
    });
    return { success: true };
  });

export const adminGetAudiences = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    return await prisma.mktg_audiences.findMany();
  });

export const adminCreateAudience = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      audience: z.object({
        name: z.string().trim().min(1).max(255),
        description: z.string().trim().max(2000).optional(),
        rules: z.string().trim().max(4000).optional(),
        size: z.coerce.number().int().min(0).default(0),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    await prisma.mktg_audiences.create({
      data: {
        name: data.audience.name,
        description: data.audience.description || null,
        rules: data.audience.rules || null,
        size: data.audience.size,
      },
    });
    await legacy.logAdminAction(
      admin.email,
      'audience.create',
      'mktg_audience',
      null,
      null,
      data.audience,
    );
    return { success: true };
  });

export const adminDeleteAudience = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number() }))
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    await prisma.mktg_audiences.delete({ where: { id: data.id } });
    await legacy.logAdminAction(
      admin.email,
      'audience.delete',
      'mktg_audience',
      data.id,
      null,
      null,
    );
    return { success: true };
  });

export const adminGetAutomations = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    return await prisma.mktg_automations.findMany();
  });

export const adminCreateAutomation = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      automation: z.object({
        name: z.string().trim().min(1).max(255),
        triggerEvent: z.string().trim().min(1).max(100),
        workflowJson: z.string().trim().max(8000).optional(),
        isActive: z.boolean().default(false),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    await prisma.mktg_automations.create({
      data: {
        name: data.automation.name,
        trigger_event: data.automation.triggerEvent,
        workflow_json: data.automation.workflowJson || JSON.stringify({ steps: [] }),
        is_active: data.automation.isActive,
      },
    });
    await legacy.logAdminAction(
      admin.email,
      'automation.create',
      'mktg_automation',
      null,
      null,
      data.automation,
    );
    return { success: true };
  });

export const adminToggleAutomation = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    await prisma.mktg_automations.update({
      where: { id: data.id },
      data: { is_active: data.isActive },
    });
    await legacy.logAdminAction(
      admin.email,
      'automation.toggle',
      'mktg_automation',
      data.id,
      null,
      {
        isActive: data.isActive,
      },
    );
    return { success: true };
  });

export const adminUpdateAutomation = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      id: z.number().int().positive(),
      automation: z.object({
        name: z.string().trim().min(1).max(255),
        triggerEvent: z.string().trim().min(1).max(100),
        workflowJson: z.string().trim().max(8000).optional(),
        isActive: z.boolean().default(false),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    await prisma.mktg_automations.update({
      where: { id: data.id },
      data: {
        name: data.automation.name,
        trigger_event: data.automation.triggerEvent,
        workflow_json: data.automation.workflowJson || JSON.stringify({ steps: [] }),
        is_active: data.automation.isActive,
      },
    });
    await legacy.logAdminAction(
      admin.email,
      'automation.update',
      'mktg_automation',
      data.id,
      null,
      data.automation,
    );
    return { success: true };
  });

export const adminDeleteAutomation = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    await prisma.mktg_automations.delete({ where: { id: data.id } });
    await legacy.logAdminAction(
      admin.email,
      'automation.delete',
      'mktg_automation',
      data.id,
      null,
      null,
    );
    return { success: true };
  });

export const adminGetPpmAnalytics = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();
    const [bookingRows] = await pool
      .query(
        `
      SELECT 
        COUNT(*) AS booking_count,
        COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0) AS confirmed_revenue,
        COALESCE(SUM(amount), 0) AS gross_booking_value
      FROM bookings
    `,
      )
      .catch(
        () => [[{ booking_count: 0, confirmed_revenue: 0, gross_booking_value: 0 }], []] as any,
      );
    const [packageRows] = await pool
      .query(
        `
      SELECT item_name, COUNT(*) AS booking_count, COALESCE(SUM(amount), 0) AS revenue
      FROM bookings
      WHERE item_type = 'package'
      GROUP BY item_name
      ORDER BY revenue DESC
      LIMIT 8
    `,
      )
      .catch(() => [[], []] as any);
    const summary = (bookingRows as any[])[0] || {};

    const [trendRows] = await pool
      .query(
        `
      SELECT DATE_FORMAT(created_at, '%b') AS month, DATE_FORMAT(created_at, '%Y-%m') AS ym,
             COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0) AS revenue,
             COUNT(*) AS bookings
      FROM bookings
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY ym, month ORDER BY ym ASC
    `,
      )
      .catch(() => [[], []] as any);

    const [statusRows] = await pool
      .query(
        `
      SELECT status, COUNT(*) AS total, COALESCE(SUM(amount), 0) AS value
      FROM bookings GROUP BY status
    `,
      )
      .catch(() => [[], []] as any);

    const [typeRows] = await pool
      .query(
        `
      SELECT item_type, COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0) AS revenue
      FROM bookings GROUP BY item_type ORDER BY revenue DESC
    `,
      )
      .catch(() => [[], []] as any);

    const [demandRows] = await pool
      .query(
        `
      SELECT destination, COUNT(*) AS leads,
             SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted
      FROM lead_submissions
      WHERE destination IS NOT NULL AND destination <> ''
      GROUP BY destination ORDER BY leads DESC LIMIT 8
    `,
      )
      .catch(() => [[], []] as any);

    const statusMix = {
      confirmed: 0,
      pending: 0,
      cancelled: 0,
      confirmedValue: 0,
      pendingValue: 0,
      cancelledValue: 0,
    };
    for (const row of statusRows as any[]) {
      if (row.status === 'confirmed') {
        statusMix.confirmed = Number(row.total);
        statusMix.confirmedValue = Number(row.value);
      }
      if (row.status === 'pending') {
        statusMix.pending = Number(row.total);
        statusMix.pendingValue = Number(row.value);
      }
      if (row.status === 'cancelled') {
        statusMix.cancelled = Number(row.total);
        statusMix.cancelledValue = Number(row.value);
      }
    }

    return {
      success: true,
      summary: {
        bookingCount: Number(summary.booking_count || 0),
        confirmedRevenue: Number(summary.confirmed_revenue || 0),
        grossBookingValue: Number(summary.gross_booking_value || 0),
      },
      packagePerformance: (packageRows as any[]).map((row) => ({
        name: row.item_name || 'Unnamed package',
        bookings: Number(row.booking_count || 0),
        revenue: Number(row.revenue || 0),
      })),
      monthlyTrend: (trendRows as any[]).map((row) => ({
        month: row.month,
        revenue: Number(row.revenue || 0),
        bookings: Number(row.bookings || 0),
      })),
      statusMix,
      typeMix: (typeRows as any[]).map((row) => ({
        type: row.item_type || 'other',
        bookings: Number(row.total || 0),
        revenue: Number(row.revenue || 0),
      })),
      demandSignals: (demandRows as any[]).map((row) => ({
        destination: row.destination,
        leads: Number(row.leads || 0),
        converted: Number(row.converted || 0),
      })),
    };
  });

export const adminGetGlobalSeo = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema.optional() }))
  .handler(async () => {
    const rows = await prisma.global_seo_settings.findMany().catch(() => []);
    const settings: Record<string, string> = {};
    for (const r of rows) {
      if (r.setting_value !== null) {
        settings[r.setting_key] = r.setting_value;
      }
    }
    return settings;
  });

export const adminSaveGlobalSeo = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, settings: z.record(z.string()) }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    for (const [key, value] of Object.entries(data.settings)) {
      await prisma.global_seo_settings.upsert({
        where: { setting_key: key },
        create: { setting_key: key, setting_value: value },
        update: { setting_value: value },
      });
    }
    return { success: true };
  });
