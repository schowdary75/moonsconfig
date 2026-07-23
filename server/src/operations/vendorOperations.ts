// @ts-nocheck
import { z } from 'zod';
import { defineOperation } from './defineOperation.js';
import * as legacy from '../legacy/api/db.functions.server.js';
import { prisma } from '../config/prisma.js';

export const adminSendRfqEmail = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      vendorEmail: z.string().email(),
      subject: z.string(),
      textBody: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    // Convert newlines to HTML breaks for basic email formatting
    const htmlBody = data.textBody.replace(/\n/g, '<br>');
    await legacy.sendEmailOutbound(data.vendorEmail, data.subject, htmlBody);
    return { success: true };
  });

export const adminReplyToVendorThread = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      vendorId: z.number(),
      threadId: z.string(),
      subject: z.string(),
      htmlBody: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();
    const [vRows] = await pool.query('SELECT * FROM vendors WHERE id = ?', [data.vendorId]);
    if (!vRows || (vRows as any[]).length === 0) throw new Error('Vendor not found');
    const v = (vRows as any[])[0];

    // Add simple line breaks if HTML tags aren't present
    const formattedHtml = data.htmlBody.includes('<')
      ? data.htmlBody
      : data.htmlBody.replace(/\n/g, '<br>');
    const sent = await legacy.sendEmailOutbound(v.email, data.subject, formattedHtml);
    if (!sent) throw new Error('Failed to send email');

    await pool.query(
      `INSERT INTO vendor_communications (vendor_id, thread_id, direction, subject, body_content, status)
       VALUES (?, ?, 'outbound', ?, ?, 'sent')`,
      [v.id, data.threadId, data.subject, formattedHtml],
    );
    return { success: true };
  });

export const adminBulkProcessVendors = defineOperation({ method: 'POST' })
  .validator((d: { auth: any; vendors: any[] }) => d)
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();
    const { vendors } = data;
    if (!vendors || vendors.length === 0) throw new Error('No vendors');
    const insertedVendors: any[] = [];

    // Generate a unique batch group ID
    const batchGroup = `batch_${Date.now()}`;

    for (const v of vendors) {
      if (!v.email || !v.company_name) continue;
      const slug = v.company_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const categoriesJson = JSON.stringify(v.service_categories || []);

      await pool.query(
        `INSERT INTO vendors (slug, company_name, contact_name, email, phone, service_categories, coverage_areas, bio, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review') 
         ON DUPLICATE KEY UPDATE company_name=VALUES(company_name), status='pending_review'`,
        [
          slug,
          v.company_name,
          v.contact_name || v.company_name,
          v.email,
          v.phone || null,
          categoriesJson,
          v.coverage_areas || 'Global',
          v.bio || '',
        ],
      );

      const [rows] = await pool.query(`SELECT id FROM vendors WHERE email = ?`, [v.email]);
      if ((rows as any[]).length > 0) {
        const vendorId = (rows as any[])[0].id;
        insertedVendors.push(vendorId);

        // Add to outreach queue instead of sending immediately
        await pool.query(
          `INSERT INTO vendor_outreach_queue (vendor_id, batch_group) VALUES (?, ?)`,
          [vendorId, batchGroup],
        );
      }
    }

    return { success: true, processedCount: insertedVendors.length, batchGroup };
  });

export const adminProcessVendorRfqBatch = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();

    // Fetch up to 10 pending items
    const [queueRows] = await pool.query(
      `SELECT q.id as queue_id, q.batch_group, v.id as vendor_id, v.email, v.company_name, v.coverage_areas, v.service_categories
       FROM vendor_outreach_queue q
       JOIN vendors v ON q.vendor_id = v.id
       WHERE q.status = 'pending'
       ORDER BY q.created_at ASC
       LIMIT 10`,
    );

    const pendingItems = queueRows as any[];
    if (pendingItems.length === 0) {
      return { success: true, processed: 0, message: 'No pending RFQs' };
    }

    // Mark as processing
    const queueIds = pendingItems.map((item) => item.queue_id);
    await pool.query(`UPDATE vendor_outreach_queue SET status = 'processing' WHERE id IN (?)`, [
      queueIds,
    ]);

    // Load all outreach templates
    const [templateRows] = await pool.query(
      "SELECT * FROM email_templates WHERE type = 'outreach' AND is_active = 1",
    );
    const outreachTemplates = templateRows as any[];
    const defaultTemplate =
      outreachTemplates.find((t) => t.scope_tags === 'general') || outreachTemplates[0];

    let processedCount = 0;

    for (const item of pendingItems) {
      try {
        let selectedTemplate = defaultTemplate;

        if (item.service_categories && outreachTemplates.length > 0) {
          let services = item.service_categories;
          if (typeof services === 'string') {
            try {
              services = JSON.parse(services);
            } catch {
              services = [services];
            }
          }
          if (Array.isArray(services)) {
            for (const t of outreachTemplates) {
              if (t.scope_tags && services.some((s: string) => t.scope_tags.includes(s))) {
                selectedTemplate = t;
                break;
              }
            }
          }
        }

        if (!selectedTemplate) {
          throw new Error('No active outreach templates available in the system.');
        }

        const coverage = item.coverage_areas || 'your region';

        const subject = selectedTemplate.subject
          .replace(/{{company_name}}/g, item.company_name)
          .replace(/{{coverage_areas}}/g, coverage);
        const htmlBody = selectedTemplate.body
          .replace(/{{company_name}}/g, item.company_name)
          .replace(/{{coverage_areas}}/g, coverage);

        // Use fake thread id for demonstration
        const threadId = `thread_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        // Attempt to send email
        await legacy.sendEmailOutbound(item.email, subject, htmlBody);

        // Log to communications
        await pool.query(
          `INSERT INTO vendor_communications (vendor_id, thread_id, direction, subject, body_content, status)
           VALUES (?, ?, 'outbound', ?, ?, 'sent')`,
          [item.vendor_id, threadId, subject, htmlBody],
        );

        // Mark as completed
        await pool.query(`UPDATE vendor_outreach_queue SET status = 'completed' WHERE id = ?`, [
          item.queue_id,
        ]);
        processedCount++;

        // Rate limit mitigation
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e: any) {
        console.error(`Failed to process queue ID ${item.queue_id}:`, e);
        await pool.query(
          `UPDATE vendor_outreach_queue SET status = 'failed', error_message = ? WHERE id = ?`,
          [e.message || 'Unknown error', item.queue_id],
        );
      }
    }

    return { success: true, processed: processedCount };
  });

export const adminGetVendorCommunications = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      vendorId: z.number().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();
    let query = `SELECT c.*, v.company_name, v.email 
                 FROM vendor_communications c
                 JOIN vendors v ON c.vendor_id = v.id`;
    const params: any[] = [];

    if (data.vendorId) {
      query += ` WHERE c.vendor_id = ?`;
      params.push(data.vendorId);
    }

    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(data.limit || 100, data.offset || 0);

    const [rows] = await pool.query(query, params);

    // Also get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM vendor_communications c`;
    const countParams: any[] = [];
    if (data.vendorId) {
      countQuery += ` WHERE c.vendor_id = ?`;
      countParams.push(data.vendorId);
    }
    const [countRows] = await pool.query(countQuery, countParams);
    const total = (countRows as any[])[0].total;

    return { data: rows as any[], total };
  });

export const adminReceiveInboundWebhook = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      threadId: z.string(),
      fromEmail: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();

    // Find vendor by email or thread
    const [vendors] = await pool.query(`SELECT id FROM vendors WHERE email = ?`, [data.fromEmail]);
    if ((vendors as any[]).length === 0) return { success: false, error: 'Vendor not found' };

    const vendorId = (vendors as any[])[0].id;

    // Log the inbound reply
    const [insertResult] = await pool.query(
      `INSERT INTO vendor_communications (vendor_id, thread_id, direction, subject, body_content, status)
       VALUES (?, ?, 'inbound', ?, ?, 'delivered')`,
      [vendorId, data.threadId, data.subject, data.body],
    );
    const commId = (insertResult as any).insertId;

    // AI Parsing Engine
    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
        const genAI = await legacy.getGenAI();
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); // Use flash for consistency
        const prompt = `You are an AI data extraction pipeline. A travel vendor replied with their rates/catalog.
Analyze the following email body and extract any Cars, Stays, or Packages they are offering.
Return a valid JSON array of objects.
Each object must have:
- "inventory_type": "car", "stay", or "package"
- "data": an object with the extracted fields. 
For cars: { type, capacity, price_inr (which is their B2B rate) }
For stays: { title, location, b2b_price }
For packages: { title, days, destination, b2b_price }

If no inventory is found, return [].

Email Body:
${data.body}`;

        const result = await model.generateContent(prompt);
        const jsonStr = result.response
          .text()
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();
        const extracted = JSON.parse(jsonStr);

        for (const item of extracted) {
          if (['car', 'stay', 'package'].includes(item.inventory_type)) {
            await pool.query(
              `INSERT INTO vendor_inventory_drafts (vendor_id, communication_id, inventory_type, extracted_data, status)
               VALUES (?, ?, ?, ?, 'pending')`,
              [vendorId, commId, item.inventory_type, JSON.stringify(item.data)],
            );
          }
        }
      } catch (err) {
        console.error('AI Extraction failed:', err);
      }
    }

    return { success: true };
  });

export const adminGetVendorDrafts = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();
    const [rows] = await pool.query(
      `SELECT d.*, v.company_name, v.email 
       FROM vendor_inventory_drafts d
       JOIN vendors v ON d.vendor_id = v.id
       WHERE d.status = 'pending'
       ORDER BY d.created_at DESC`,
    );
    return rows as any[];
  });

export const adminApproveInventoryDraft = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, draftId: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();

    // Get draft
    const [drafts] = await pool.query(`SELECT * FROM vendor_inventory_drafts WHERE id = ?`, [
      data.draftId,
    ]);
    if ((drafts as any[]).length === 0) throw new Error('Draft not found');
    const draft = (drafts as any[])[0];
    const payload =
      typeof draft.extracted_data === 'string'
        ? JSON.parse(draft.extracted_data)
        : draft.extracted_data;

    if (draft.inventory_type === 'car') {
      await pool.query(
        `INSERT INTO car_listings (type, capacity, image_url, price_inr, vendor_id, b2b_price, features)
         VALUES (?, ?, ?, ?, ?, ?, '[]')`,
        [
          payload.type || 'Standard',
          payload.capacity || 4,
          '',
          (payload.price_inr || 0) * 1.2,
          draft.vendor_id,
          payload.price_inr || 0,
        ], // 20% margin for b2c
      );
    } else if (draft.inventory_type === 'stay') {
      const slug = (payload.title || 'stay').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await pool.query(
        `INSERT INTO accommodation_listings (slug, title, location, type, vendor_id, b2b_price, price, amenities, images)
         VALUES (?, ?, ?, 'hotel', ?, ?, ?, '[]', '[]')`,
        [
          slug,
          payload.title || 'Unknown Stay',
          payload.location || 'Unknown',
          draft.vendor_id,
          payload.b2b_price || 0,
          (payload.b2b_price || 0) * 1.2,
        ],
      );
    } else if (draft.inventory_type === 'package') {
      const slug = (payload.title || 'package').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await pool.query(
        `INSERT INTO packages (slug, title, days, destination, vendor_id, b2b_price, price_inr, highlights, images)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]')`,
        [
          slug,
          payload.title || 'Unknown Package',
          payload.days || 3,
          payload.destination || 'Unknown',
          draft.vendor_id,
          payload.b2b_price || 0,
          (payload.b2b_price || 0) * 1.2,
        ],
      );
    }

    // Mark as approved
    await pool.query(`UPDATE vendor_inventory_drafts SET status = 'approved' WHERE id = ?`, [
      data.draftId,
    ]);

    return { success: true };
  });

export const adminSendRfq = defineOperation({ method: 'POST' })
  .validator(
    (data: unknown) =>
      data as {
        auth: legacy.AdminAuthPayload;
        packageId: number;
        vendorIds: number[];
        subject: string;
        htmlBody: string;
      },
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();

    let sentCount = 0;
    for (const vendorId of data.vendorIds) {
      const [vRows] = await pool.query('SELECT * FROM vendors WHERE id = ?', [vendorId]);
      if (vRows && (vRows as any[]).length > 0) {
        const v = (vRows as any[])[0];
        if (v.email) {
          const sent = await legacy.sendEmailOutbound(v.email, data.subject, data.htmlBody);
          if (sent) {
            await pool.query(
              `INSERT INTO vendor_communications (vendor_id, thread_id, direction, subject, body_content, status)
               VALUES (?, ?, 'outbound', ?, ?, 'sent')`,
              [vendorId, `pkg_${data.packageId}_rfq_${Date.now()}`, data.subject, data.htmlBody],
            );
            sentCount++;
          }
        }
      }
    }

    if (sentCount === 0 && data.vendorIds.length > 0) {
      throw new Error('Failed to connect to SMTP Server or send emails. Please check your config.');
    }

    return { success: true, sentCount };
  });

export const adminRenderRfqTemplate = defineOperation({ method: 'POST' })
  .validator(
    (data: unknown) =>
      data as {
        auth: legacy.AdminAuthPayload;
        packageId: number;
        templateId: number;
        travelDates?: string;
        customHotels?: string[];
      },
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const template = await prisma.email_templates.findUnique({ where: { id: data.templateId } });
    if (!template) throw new Error('Template not found');

    // Build variable map from package data
    const vars = await legacy.buildRfqTemplateVars(data.packageId, data.travelDates);

    // Replace all {{placeholders}} in subject and body
    let subject = template.subject as string;
    let body = template.body as string;
    for (const [key, value] of Object.entries(vars)) {
      subject = subject.split(key).join(value);
      body = body.split(key).join(value);
    }

    return { subject, body };
  });

// Backfill Maya's vendor inbox from recent mail — recovers replies that were
// consumed (marked read) before inbound-logging existed. Safe + de-duplicated.
export const adminReprocessVendorInbox = defineOperation({ method: 'POST' })
  .validator(
    z.object({ auth: legacy.adminAuthSchema, days: z.number().int().min(1).max(30).optional() }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const { reprocessVendorInbox } = await import('../legacy/api/email.listener.js');
    return reprocessVendorInbox(data.days ?? 3);
  });
