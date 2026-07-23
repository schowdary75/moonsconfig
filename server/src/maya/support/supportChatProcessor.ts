import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../logger/index.js';
import { ensureTravellerForCustomer } from '../../services/travelDomainService.js';
import { MayaBrain } from '../brain.js';
import { createMayaDeps } from '../deps.js';
import { triageMessage, type Triage } from '../ontrip/triage.js';
import type { MayaTurn } from '../types.js';
import { openSosRecovery } from '../../services/siteCompatibilityService.js';

let processing = false;

export function redactSensitiveTravelData(text: string) {
  return text
    .replace(
      /\b(passport|visa|aadhaar|aadhar)\s*(?:number|no\.?|#)\s*(?:is\s*)?[:=-]?\s*[a-z0-9-]{5,20}\b/gi,
      '$1 number [REDACTED]',
    )
    .replace(
      /\b(passport|visa|aadhaar|aadhar)\s+(?!number\b|no\b|is\b)[a-z0-9-]{5,20}\b/gi,
      '$1 number [REDACTED]',
    )
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[REDACTED ID]');
}

function urgentAcknowledgement(text: string) {
  if (/[\u0900-\u097f]/.test(text)) {
    return 'मैं Maya, MooNs Travel की वर्चुअल असिस्टेंट हूँ। मैंने हमारी ऑन-ट्रिप टीम को तुरंत अलर्ट कर दिया है। कृपया सुरक्षित स्थान पर रहें और अपना फ़ोन पास रखें।';
  }
  if (/[\u0c00-\u0c7f]/.test(text)) {
    return 'నేను MooNs Travel వర్చువల్ అసిస్టెంట్ Mayaని. మా ఆన్-ట్రిప్ బృందాన్ని వెంటనే అప్రమత్తం చేశాను. దయచేసి సురక్షిత ప్రదేశంలో ఉండి, మీ ఫోన్ దగ్గర ఉంచుకోండి.';
  }
  return "I'm Maya, MooNs Travel's virtual assistant. I've alerted our on-trip team immediately. Please stay somewhere safe and keep your phone with you.";
}

async function canonicalConversation(chat: {
  id: number;
  customer_id: number;
  guest_name: string | null;
}) {
  const participantRef = String(chat.id);
  const participant = await prisma.conversationParticipant.findFirst({
    where: { participantType: 'legacy_support_chat', participantRef },
  });
  if (participant) {
    return prisma.travelConversation.findUniqueOrThrow({
      where: { id: participant.conversationId },
    });
  }
  const traveller =
    chat.customer_id > 0
      ? await ensureTravellerForCustomer(chat.customer_id).catch(() => null)
      : null;
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.travelConversation.create({
      data: {
        travellerId: traveller?.id ?? null,
        subject: 'Traveller support',
        mayaMode: 'copilot',
      },
    });
    await tx.conversationParticipant.create({
      data: {
        conversationId: conversation.id,
        participantType: 'legacy_support_chat',
        participantRef,
        displayName: chat.guest_name,
      },
    });
    return conversation;
  });
}

export interface SupportChatProcessorContext {
  chat: {
    id: number;
    customer_id: number;
    guest_name: string | null;
    guest_phone: string | null;
  };
  messages: Array<{ id: number; sender_id: number; content: string }>;
  customer: { id: number; name: string | null; phone: string | null } | null;
  conversation: { id: string; mayaMode: string };
}

export interface GovernedSupportChatRepository {
  acquire(chatId: number): Promise<boolean>;
  release(chatId: number): Promise<void>;
  load(chatId: number): Promise<SupportChatProcessorContext | null>;
  reserveInbound(
    context: SupportChatProcessorContext,
    messageId: number,
    body: string,
  ): Promise<boolean>;
  escalate(
    context: SupportChatProcessorContext,
    triage: Triage,
    safeInput: string,
  ): Promise<string>;
  saveReply(context: SupportChatProcessorContext, reply: string): Promise<void>;
  recordProviderFailure(context: SupportChatProcessorContext): Promise<void>;
}

export interface SupportChatReplyProvider {
  respond(input: {
    safeInput: string;
    history: MayaTurn[];
    context: {
      conversationId: string;
      callerName: string | null;
      callerPhone: string | null;
    };
  }): Promise<string>;
}

export function createGovernedSupportChatProcessor({
  repository,
  replyProvider,
}: {
  repository: GovernedSupportChatRepository;
  replyProvider: SupportChatReplyProvider;
}) {
  return async (chatId: number): Promise<boolean> => {
    if (!(await repository.acquire(chatId))) return false;
    try {
      const context = await repository.load(chatId);
      if (!context || context.conversation.mayaMode === 'human_only') return false;
      const last = context.messages.at(-1);
      if (!last || last.sender_id !== context.chat.customer_id) return false;

      const safeInput = redactSensitiveTravelData(last.content);
      if (!(await repository.reserveInbound(context, last.id, safeInput))) return false;

      const triage = triageMessage(safeInput);
      let reply: string;
      if (!triage.autoReplyable) {
        reply = await repository.escalate(context, triage, safeInput);
      } else {
        const history: MayaTurn[] = [];
        for (const message of context.messages.slice(0, -1)) {
          const role = message.sender_id === context.chat.customer_id ? 'user' : 'model';
          const text = redactSensitiveTravelData(message.content);
          const previous = history.at(-1);
          if (previous?.role === role) previous.parts[0]!.text += `\n${text}`;
          else history.push({ role, parts: [{ text }] });
        }
        while (history[0]?.role === 'model') history.shift();
        try {
          reply = await replyProvider.respond({
            safeInput,
            history,
            context: {
              conversationId: context.conversation.id,
              callerName: context.customer?.name ?? context.chat.guest_name,
              callerPhone: context.customer?.phone ?? context.chat.guest_phone,
            },
          });
        } catch {
          await repository.recordProviderFailure(context);
          return false;
        }
        if (!reply.trim()) {
          await repository.recordProviderFailure(context);
          return false;
        }
      }

      await repository.saveReply(context, reply);
      return true;
    } finally {
      await repository.release(chatId);
    }
  };
}

const supportChatRepository: GovernedSupportChatRepository = {
  async acquire(chatId) {
    const lock = await prisma.support_chats.updateMany({
      where: {
        id: chatId,
        status: 'open',
        ai_is_typing: { not: true },
        OR: [{ agent_id: null }, { agent_id: 0 }],
      },
      data: { ai_is_typing: true },
    });
    return lock.count > 0;
  },
  async release(chatId) {
    await prisma.support_chats
      .update({ where: { id: chatId }, data: { ai_is_typing: false } })
      .catch(() => undefined);
  },
  async load(chatId) {
    const chat = await prisma.support_chats.findUnique({ where: { id: chatId } });
    if (!chat) return null;
    const messages = (
      await prisma.support_messages.findMany({
        where: { chat_id: chat.id },
        orderBy: { id: 'desc' },
        take: 15,
      })
    ).reverse();
    const customer =
      chat.customer_id > 0
        ? await prisma.customerUser.findUnique({ where: { id: chat.customer_id } })
        : null;
    const conversation = await canonicalConversation(chat);
    return { chat, messages, customer, conversation };
  },
  async reserveInbound(context, messageId, body) {
    const idempotencyKey = `support_message:${messageId}`;
    const existing = await prisma.channelMessage.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) return false;
    await prisma.channelMessage.create({
      data: {
        conversationId: context.conversation.id,
        channel: 'chat',
        direction: 'inbound',
        senderType: 'traveller',
        senderRef: String(context.chat.customer_id),
        body,
        idempotencyKey,
      },
    });
    return true;
  },
  async escalate(context, triage, safeInput) {
    const recoveryReply =
      triage.category === 'booking_issue' && context.customer
        ? await openSosRecovery(context.customer.id, safeInput)
        : null;
    const reply = recoveryReply ?? urgentAcknowledgement(safeInput);
    await prisma.$transaction([
      prisma.callback_requests.create({
        data: {
          name: context.customer?.name ?? context.chat.guest_name ?? 'Traveller',
          phone: context.customer?.phone ?? context.chat.guest_phone ?? '',
          destination: null,
          status: 'pending',
        },
      }),
      prisma.travelConversation.update({
        where: { id: context.conversation.id },
        data: { status: 'escalated', mayaMode: 'human_only' },
      }),
      prisma.maya_activity_log.create({
        data: {
          area: 'on_trip',
          action: 'urgent_support_escalation',
          summary: `${triage.category} support chat #${context.chat.id} escalated to staff.`,
          status: 'attention',
        },
      }),
    ]);
    return reply;
  },
  async saveReply(context, reply) {
    const saved = await prisma.support_messages.create({
      data: { chat_id: context.chat.id, sender_id: 0, content: reply },
    });
    await prisma.$transaction([
      prisma.channelMessage.create({
        data: {
          conversationId: context.conversation.id,
          channel: 'chat',
          direction: 'outbound',
          senderType: 'maya',
          body: reply,
          locale: 'en',
          idempotencyKey: `support_message:${saved.id}`,
        },
      }),
      prisma.support_chats.update({ where: { id: context.chat.id }, data: { agent_id: 0 } }),
    ]);
  },
  async recordProviderFailure(context) {
    await prisma.maya_activity_log.create({
      data: {
        area: 'support',
        action: 'support_reply_provider_failure',
        summary: `Support chat #${context.chat.id} needs staff review after a reply provider failure.`,
        status: 'attention',
      },
    });
  },
};

const supportReplyProvider: SupportChatReplyProvider = {
  async respond({ safeInput, history, context }) {
    const response = await new MayaBrain(createMayaDeps(), env.maya.model).respond({
      input: { text: safeInput },
      history,
      ctx: {
        channel: 'chat',
        sessionId: context.conversationId,
        callerName: context.callerName,
        callerPhone: context.callerPhone,
      },
    });
    return response.text;
  },
};

const processSupportChat = createGovernedSupportChatProcessor({
  repository: supportChatRepository,
  replyProvider: supportReplyProvider,
});

export async function processGovernedSupportChat(chatId: number) {
  return processSupportChat(chatId);
}

export async function processGovernedSupportChats() {
  if (!env.maya.enabled || processing) return { processed: 0, disabled: !env.maya.enabled };
  processing = true;
  try {
    const chats = await prisma.support_chats.findMany({
      where: {
        status: 'open',
        ai_is_typing: { not: true },
        OR: [{ agent_id: null }, { agent_id: 0 }],
      },
      select: { id: true },
      take: 50,
    });
    let processed = 0;
    for (const chat of chats) {
      try {
        if (await processGovernedSupportChat(chat.id)) processed += 1;
      } catch (error) {
        logger.error('Governed Maya support turn failed', { chatId: chat.id, error });
      }
    }
    return { processed, disabled: false };
  } finally {
    processing = false;
  }
}
