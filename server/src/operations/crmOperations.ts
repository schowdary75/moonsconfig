// @ts-nocheck
import { z } from 'zod';
import { defineOperation } from './defineOperation.js';
import * as legacy from '../legacy/api/db.functions.server.js';
import { prisma } from '../config/prisma.js';

export const adminGetPipelines = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    let rows = await prisma.crm_pipelines.findMany({ orderBy: { order: 'asc' } });
    if (rows.length === 0) {
      const defaultStages = [
        { name: 'New Lead', order: 1 },
        { name: 'Qualified', order: 2 },
        { name: 'Quote Sent', order: 3 },
        { name: 'Negotiation', order: 4 },
        { name: 'Won', order: 5 },
        { name: 'Lost', order: 6 },
      ];
      await prisma.crm_pipelines.createMany({ data: defaultStages });
      await legacy.logAdminAction(
        admin.email,
        'pipeline.seed_defaults',
        'crm_pipeline',
        null,
        null,
        defaultStages,
      );
      rows = await prisma.crm_pipelines.findMany({ orderBy: { order: 'asc' } });
    }
    return rows;
  });

export const adminGetDeals = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    return await prisma.crm_deals.findMany({ orderBy: { created_at: 'asc' } });
  });

export const adminUpdateDealStatus = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      dealId: z.number(),
      pipelineId: z.number().optional(),
      status: z.enum(['open', 'won', 'lost']),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const updateData: any = { status: data.status };
    if (data.pipelineId) {
      updateData.pipeline_id = data.pipelineId;
    }
    await prisma.crm_deals.update({ where: { id: data.dealId }, data: updateData });

    // Simulate Automation Logic
    let automationTriggered = null;
    if (data.status === 'won') {
      automationTriggered = { type: 'marketing', message: 'Added to "Welcome Series" automation.' };
    } else if (data.status === 'lost') {
      automationTriggered = { type: 'marketing', message: 'Added to "Re-engagement" campaign.' };
    } else if (data.pipelineId === 3) {
      // Negotiation
      automationTriggered = {
        type: 'task',
        message: 'Task created: Follow-up on negotiation in 24h.',
      };
    } else if (data.pipelineId === 2) {
      // Quote Sent
      automationTriggered = {
        type: 'marketing',
        message: 'Active listener for Quote follow-up started.',
      };
    }

    return { success: true, automationTriggered };
  });

export const adminCreateDeal = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      title: z.string(),
      pipelineId: z.number(),
      customerName: z.string().optional(),
      value: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await prisma.crm_deals.create({
      data: {
        title: data.title,
        pipeline_id: data.pipelineId,
        customer_name: data.customerName || null,
        value: data.value || null,
      },
    });
    return { success: true };
  });

export const adminGetClients = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    return await prisma.crm_clients.findMany({ orderBy: { id: 'asc' } });
  });

export const adminCreateClient = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await prisma.crm_clients.create({
      data: {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        status: 'Lead',
        lifetime_value: 0,
        last_active: 'Just now',
      },
    });
    return { success: true };
  });

export const adminGetClientById = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    return await prisma.crm_clients.findUnique({ where: { id: data.id } });
  });
