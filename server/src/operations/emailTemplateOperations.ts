// @ts-nocheck
import { z } from 'zod';
import { defineOperation } from './defineOperation.js';
import * as legacy from '../legacy/api/db.functions.server.js';
import { prisma } from '../config/prisma.js';

export const adminGetEmailTemplates = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureEmailTemplateScopeTags();
    await legacy.seedRfqTemplates();
    await legacy.seedOutreachTemplates();
    return await prisma.email_templates.findMany({ orderBy: { created_at: 'desc' } });
  });

export const adminCreateEmailTemplate = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      name: z.string(),
      subject: z.string(),
      body: z.string(),
      type: z.string(),
      scope_tags: z.string().optional(),
      is_active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureEmailTemplateScopeTags();
    const created = await prisma.email_templates.create({
      data: {
        name: data.name,
        subject: data.subject,
        body: data.body,
        type: data.type,
        scope_tags: data.scope_tags || 'full',
        is_active: data.is_active !== false,
      },
    });
    return { success: true, insertId: created.id };
  });

export const adminUpdateEmailTemplate = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      id: z.number(),
      name: z.string(),
      subject: z.string(),
      body: z.string(),
      type: z.string(),
      scope_tags: z.string().optional(),
      is_active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureEmailTemplateScopeTags();
    await prisma.email_templates.update({
      where: { id: data.id },
      data: {
        name: data.name,
        subject: data.subject,
        body: data.body,
        type: data.type,
        scope_tags: data.scope_tags || 'full',
        is_active: data.is_active !== false,
      },
    });
    return { success: true };
  });

export const adminToggleEmailTemplateActive = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number(), is_active: z.boolean() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await prisma.email_templates.update({
      where: { id: data.id },
      data: { is_active: data.is_active },
    });
    return { success: true };
  });

export const adminDeleteEmailTemplate = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await prisma.email_templates.delete({ where: { id: data.id } });
    return { success: true };
  });
