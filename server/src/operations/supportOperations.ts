// @ts-nocheck
import { z } from 'zod';
import { defineOperation } from './defineOperation.js';
import * as legacy from '../legacy/api/db.functions.server.js';
import { prisma } from '../config/prisma.js';
import { publishChatEvent } from '../services/chatEventService.js';

export const autoAssignExpiredChatRequests = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema.optional() }).optional())
  .handler(async ({ data }) => {
    if (data?.auth) await legacy.requireCustomerChatStaff(data.auth);
    const pool = await legacy.getDbPool();
    await legacy.ensureGlobalChatTables();
    await legacy.autoAssignExpiredCustomerChats(pool);
    return { success: true };
  });

export const createCustomerChatRequest = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      customerId: z.string().min(1),
      customerName: z.string().min(1),
      messageText: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const pool = await legacy.getDbPool();
    await legacy.ensureGlobalChatTables();
    await legacy.autoAssignExpiredCustomerChats(pool);

    const [existingRows] = await pool.query(
      `SELECT *
       FROM global_chat_requests
       WHERE customer_id = ? AND status IN ('pending', 'active')
       ORDER BY id DESC
       LIMIT 1`,
      [data.customerId],
    );
    const existing = (existingRows as legacy.CustomerChatRequestRow[])[0];

    let requestId = existing?.id;
    if (!requestId) {
      const [result] = await pool.query(
        `INSERT INTO global_chat_requests
         (customer_id, customer_type, customer_name, first_message, status, expires_at)
         VALUES (?, 'lead', ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
        [data.customerId, data.customerName, data.messageText],
      );
      requestId = (result as any).insertId;
    }

    await pool.query(
      `INSERT INTO global_chat_messages
       (request_id, sender_id, sender_type, receiver_id, receiver_type, message_type, message_text)
       VALUES (?, ?, 'lead', 'support_queue', 'queue', 'user', ?)`,
      [requestId, data.customerId, data.messageText],
    );

    const [rows] = await pool.query('SELECT * FROM global_chat_requests WHERE id = ? LIMIT 1', [
      requestId,
    ]);
    const returnedRequest = (rows as legacy.CustomerChatRequestRow[])[0];

    // Trigger AI auto-responder asynchronously (don't block the user)
    if (returnedRequest && returnedRequest.status === 'pending') {
      setTimeout(() => legacy.triggerAutonomousAIResponse(requestId, data.customerId), 1500);
    }

    return returnedRequest;
  });

export const getCustomerChatRequests = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireCustomerChatStaff(data.auth);
    const pool = await legacy.getDbPool();
    await legacy.ensureGlobalChatTables();
    await legacy.autoAssignExpiredCustomerChats(pool);
    const [rows] = await pool.query(
      `SELECT *
       FROM global_chat_requests
       WHERE status IN ('pending', 'active', 'missed')
       ORDER BY FIELD(status, 'pending', 'active', 'missed'), updated_at DESC`,
    );
    return rows as legacy.CustomerChatRequestRow[];
  });

export const acceptCustomerChatRequest = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      requestId: z.number(),
    }),
  )
  .handler(async ({ data }) => {
    const staff = await legacy.requireCustomerChatStaff(data.auth);
    const pool = await legacy.getDbPool();
    await legacy.ensureGlobalChatTables();
    await legacy.autoAssignExpiredCustomerChats(pool);

    const [requestRows] = await pool.query(
      'SELECT * FROM global_chat_requests WHERE id = ? LIMIT 1',
      [data.requestId],
    );
    const request = (requestRows as legacy.CustomerChatRequestRow[])[0];
    if (!request) throw new Error('Chat request not found');
    if (request.status !== 'pending') return request;

    await pool.query(
      `UPDATE global_chat_requests
       SET status = 'active',
           assigned_employee_id = ?,
           assigned_employee_name = ?,
           assigned_employee_role = ?,
           accepted_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [staff.id, staff.name, staff.role, data.requestId],
    );
    await pool.query(
      `INSERT INTO global_chat_messages
       (request_id, sender_id, sender_type, receiver_id, receiver_type, message_type, message_text)
       VALUES (?, ?, 'crm_user', ?, 'lead', 'system', ?)`,
      [data.requestId, staff.id, request.customer_id, `${staff.name} joined the chat`],
    );

    const [rows] = await pool.query('SELECT * FROM global_chat_requests WHERE id = ? LIMIT 1', [
      data.requestId,
    ]);
    return (rows as legacy.CustomerChatRequestRow[])[0];
  });

export const getCustomerChatByRequest = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      requestId: z.number(),
      customerId: z.string().optional(),
      auth: legacy.adminAuthSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const pool = await legacy.getDbPool();
    await legacy.ensureGlobalChatTables();
    await legacy.autoAssignExpiredCustomerChats(pool);
    if (data.auth) await legacy.requireCustomerChatStaff(data.auth);

    const [requestRows] = await pool.query(
      'SELECT * FROM global_chat_requests WHERE id = ? LIMIT 1',
      [data.requestId],
    );
    const request = (requestRows as legacy.CustomerChatRequestRow[])[0];
    if (!request) throw new Error('Chat request not found');
    if (!data.auth && data.customerId !== request.customer_id)
      throw new Error('Unauthorized chat request');

    const [messageRows] = await pool.query(
      `SELECT *
       FROM global_chat_messages
       WHERE request_id = ?
       ORDER BY created_at ASC`,
      [data.requestId],
    );
    return { request, messages: messageRows as legacy.CustomerChatMessageRow[] };
  });

export const sendCustomerChatMessage = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      requestId: z.number(),
      senderId: z.string(),
      senderType: z.enum(['crm_user', 'lead']),
      messageText: z.string().min(1),
      auth: legacy.adminAuthSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const pool = await legacy.getDbPool();
    await legacy.ensureGlobalChatTables();
    await legacy.autoAssignExpiredCustomerChats(pool);

    const [requestRows] = await pool.query(
      'SELECT * FROM global_chat_requests WHERE id = ? LIMIT 1',
      [data.requestId],
    );
    const request = (requestRows as legacy.CustomerChatRequestRow[])[0];
    if (!request) throw new Error('Chat request not found');

    if (data.senderType === 'crm_user') {
      const staff = data.auth ? await legacy.requireCustomerChatStaff(data.auth) : null;
      if (!staff || request.status !== 'active' || request.assigned_employee_id !== staff.id) {
        throw new Error('Only the assigned team member can reply to this customer chat');
      }
      await pool.query(
        `INSERT INTO global_chat_messages
         (request_id, sender_id, sender_type, receiver_id, receiver_type, message_type, message_text)
         VALUES (?, ?, 'crm_user', ?, 'lead', 'user', ?)`,
        [data.requestId, staff.id, request.customer_id, data.messageText],
      );
    } else {
      if (data.senderId !== request.customer_id) throw new Error('Unauthorized customer chat');
      if (!['pending', 'active'].includes(request.status))
        throw new Error('This chat request is no longer active');
      await pool.query(
        `INSERT INTO global_chat_messages
         (request_id, sender_id, sender_type, receiver_id, receiver_type, message_type, message_text)
         VALUES (?, ?, 'lead', ?, ?, 'user', ?)`,
        [
          data.requestId,
          request.customer_id,
          request.assigned_employee_id || 'support_queue',
          request.assigned_employee_id ? 'crm_user' : 'queue',
          data.messageText,
        ],
      );
    }

    await pool.query('UPDATE global_chat_requests SET updated_at = NOW() WHERE id = ?', [
      data.requestId,
    ]);

    // Trigger AI auto-responder if chat is pending (no human agent) or AI is assigned
    if (
      data.senderType === 'lead' &&
      (request.status === 'pending' || request.assigned_employee_id === 'ai_assistant')
    ) {
      setTimeout(
        () => legacy.triggerAutonomousAIResponse(data.requestId, request.customer_id),
        1500,
      );
    }

    return { success: true };
  });

export const getChatSmartReplies = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      chatId: z.number(),
      auth: legacy.adminAuthSchema,
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireLeadStaff(data.auth);
    const pool = await legacy.getDbPool();
    await legacy.ensureChatTables();

    const [messagesRows] = await pool.query(
      `SELECT m.content as message_text, m.sender_id, u.name as sender_name
       FROM support_messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.chat_id = ?
       ORDER BY m.id ASC LIMIT 15`,
      [data.chatId],
    );
    const messages = messagesRows as any[];
    if (messages.length === 0) return [];

    const [chatRows] = await pool.query(
      'SELECT * FROM support_chats c LEFT JOIN users u ON c.customer_id = u.id WHERE c.id = ? LIMIT 1',
      [data.chatId],
    );
    const chatInfo = chatRows[0];

    const conversationContext = messages
      .map((m: any) => {
        const isAgent = m.sender_id !== (chatInfo?.customer_id || 0);
        return (isAgent ? 'Agent' : 'Customer') + ': ' + m.message_text;
      })
      .join('\n');

    const prompt = `You are an expert travel sales and support agent at MooNs Travel (India). 
Based on the following customer chat, suggest 3 short, distinct, natural-sounding replies the agent could send next.
Each reply must be 1-2 sentences max. Sound human and warm, not robotic.
Return ONLY a JSON array of 3 strings. No markdown, no backticks.

Conversation:
${conversationContext}`;

    try {
      const result = await legacy.withMayaGeminiRotation<any>('gemini-2.5-flash', (model) =>
        model.generateContent(prompt),
      );
      const text = result.response
        .text()
        .replace(/\`\`\`json/g, '')
        .replace(/\`\`\`/g, '')
        .trim();
      return JSON.parse(text);
    } catch (e) {
      console.error('Smart replies generation failed:', e);
      return [];
    }
  });

export const handoverChatToAI = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      chatId: z.number(),
      auth: legacy.adminAuthSchema,
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireLeadStaff(data.auth);
    const pool = await legacy.getDbPool();
    await legacy.ensureGlobalChatTables();

    // Update the request to mark it as AI-handled
    await pool.query(
      `UPDATE global_chat_requests 
       SET assigned_employee_id = 'ai_assistant', 
           assigned_employee_name = 'Maya (AI)',
           assigned_employee_role = 'support',
           status = 'active'
       WHERE id = ?`,
      [data.chatId],
    );

    // Insert a system message
    const [reqRows] = await pool.query(
      'SELECT customer_id FROM global_chat_requests WHERE id = ?',
      [data.chatId],
    );
    const customerId = reqRows[0]?.customer_id;
    if (customerId) {
      await pool.query(
        `INSERT INTO global_chat_messages
         (request_id, sender_id, sender_type, receiver_id, receiver_type, message_type, message_text)
         VALUES (?, 'system', 'system', ?, 'lead', 'system', 'Maya has joined the chat')`,
        [data.chatId, customerId],
      );
      // Trigger AI to send an initial greeting
      await legacy.triggerAutonomousAIResponse(data.chatId, customerId);
    }

    return { success: true };
  });

export const getAllSupportChats = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }): Promise<any[]> => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureChatTables();
    const pool = await legacy.getDbPool();

    const [chats] = await pool.query(
      `SELECT c.*,
       COALESCE(c.guest_name, u.name) as customer_name,
       u.email as customer_email,
       COALESCE(c.guest_phone, u.phone) as customer_phone,
       (SELECT COUNT(*) FROM support_messages m WHERE m.chat_id = c.id) as message_count,
       (SELECT MAX(created_at) FROM support_messages m WHERE m.chat_id = c.id) as last_message_at,
       IF(p.user_id IS NOT NULL, 1, 0) as is_pinned
       FROM support_chats c
       LEFT JOIN users u ON c.customer_id = u.id
       LEFT JOIN global_chat_conversation_pins p ON p.target_id = CAST(c.id AS CHAR) AND p.target_type = 'customer' AND p.user_id = (SELECT CAST(id AS CHAR) FROM users WHERE email = ? LIMIT 1)
       ORDER BY is_pinned DESC, c.status ASC, last_message_at DESC`,
      [data.auth.email],
    );
    return chats as any[];
  });

export const getAdminSupportChatMessages = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, chatId: z.number() }))
  .handler(async ({ data }): Promise<any[]> => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureChatTables();
    const pool = await legacy.getDbPool();

    const [messages] = await pool.query(
      `SELECT m.id, m.content, m.created_at, u.name as sender_name, u.email as sender_email, m.sender_id
       FROM support_messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.chat_id = ?
       ORDER BY m.created_at ASC`,
      [data.chatId],
    );
    return messages as any[];
  });

export const adminSendSupportMessage = defineOperation({ method: 'POST' })
  .validator(
    z.object({ auth: legacy.adminAuthSchema, chatId: z.number(), content: z.string().min(1) }),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureChatTables();
    const pool = await legacy.getDbPool();

    const userId = await legacy.resolveStaffUsersId(pool, admin.email);

    await pool.query(
      'INSERT INTO support_messages (chat_id, sender_id, content) VALUES (?, ?, ?)',
      [data.chatId, userId, data.content],
    );

    // We no longer automatically set agent_id. Humans must explicitly take over.

    await pool.query("UPDATE support_chats SET status = 'open' WHERE id = ?", [data.chatId]);

    void publishChatEvent({
      staffBroadcast: true,
      event: 'chat:support-message',
      payload: { chatId: data.chatId },
    });

    return { success: true };
  });

export const adminTakeOverSupportChat = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, chatId: z.number() }))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const admin = await legacy.requireAdmin(data.auth);
    if (admin.role !== 'admin') throw new Error('Only admins can take over chats');
    await legacy.ensureChatTables();
    const pool = await legacy.getDbPool();
    const userId = await legacy.resolveStaffUsersId(pool, admin.email);
    await pool.query('UPDATE support_chats SET agent_id = ? WHERE id = ?', [userId, data.chatId]);
    return { success: true };
  });

export const closeSupportChat = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, chatId: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureChatTables();
    const pool = await legacy.getDbPool();
    await pool.query("UPDATE support_chats SET status = 'closed' WHERE id = ?", [data.chatId]);
    return { success: true };
  });

export const submitContact = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.string().email('Invalid email address'),
      destination: z.string().min(1, 'Destination is required'),
      message: z.string().min(1, 'Message details are required'),
    }),
  )
  .handler(async ({ data }) => {
    await prisma.contact_submissions.create({ data });
    return { success: true };
  });
