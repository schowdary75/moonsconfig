import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { MayaBrain } from '../brain.js';
import { createMayaDeps } from '../deps.js';
import { triageMessage, type Triage } from '../ontrip/triage.js';
import type { MayaTurn } from '../types.js';
import { redactSensitiveTravelData } from './supportChatProcessor.js';

async function canonicalConversation(request: {
  id: number;
  customer_id: string;
  customer_name: string;
}) {
  const participantRef = String(request.id);
  const participant = await prisma.conversationParticipant.findFirst({
    where: { participantType: 'legacy_global_chat', participantRef },
  });
  if (participant) {
    return prisma.travelConversation.findUniqueOrThrow({
      where: { id: participant.conversationId },
    });
  }
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.travelConversation.create({
      data: { subject: 'Website traveller chat', mayaMode: 'copilot' },
    });
    await tx.conversationParticipant.create({
      data: {
        conversationId: conversation.id,
        participantType: 'legacy_global_chat',
        participantRef,
        displayName: request.customer_name,
      },
    });
    return conversation;
  });
}

export interface GlobalChatProcessorContext {
  request: {
    id: number;
    customer_id: string;
    customer_name: string;
  };
  messages: Array<{
    id: number;
    sender_id: string;
    sender_type: string;
    message_text: string;
  }>;
  conversation: { id: string; mayaMode: string };
}

export interface GovernedGlobalChatRepository {
  isEnabled(): boolean;
  acquire(requestId: number): Promise<boolean>;
  release(requestId: number): Promise<void>;
  load(requestId: number): Promise<GlobalChatProcessorContext>;
  reserveInbound(
    context: GlobalChatProcessorContext,
    messageId: number,
    customerId: string,
    body: string,
  ): Promise<boolean>;
  escalate(context: GlobalChatProcessorContext, triage: Triage): Promise<string>;
  saveReply(context: GlobalChatProcessorContext, customerId: string, reply: string): Promise<void>;
  recordProviderFailure(context: GlobalChatProcessorContext): Promise<void>;
}

export interface GlobalChatReplyProvider {
  respond(input: {
    safeInput: string;
    history: MayaTurn[];
    context: {
      conversationId: string;
      callerName: string;
    };
  }): Promise<string>;
}

export function createGovernedGlobalChatProcessor({
  repository,
  replyProvider,
}: {
  repository: GovernedGlobalChatRepository;
  replyProvider: GlobalChatReplyProvider;
}) {
  return async (requestId: number, customerId: string) => {
    if (!repository.isEnabled()) return { processed: false, disabled: true };
    if (!(await repository.acquire(requestId))) return { processed: false, disabled: false };
    try {
      const context = await repository.load(requestId);
      if (
        context.request.customer_id !== customerId ||
        context.conversation.mayaMode === 'human_only'
      ) {
        return { processed: false, disabled: false };
      }
      const last = context.messages.at(-1);
      if (!last || last.sender_id === 'ai_assistant' || last.sender_type !== 'lead') {
        return { processed: false, disabled: false };
      }

      const safeInput = redactSensitiveTravelData(last.message_text);
      if (!(await repository.reserveInbound(context, last.id, customerId, safeInput))) {
        return { processed: false, disabled: false };
      }

      const triage = triageMessage(safeInput);
      let reply: string;
      if (!triage.autoReplyable) {
        reply = await repository.escalate(context, triage);
      } else {
        const history: MayaTurn[] = [];
        for (const message of context.messages.slice(0, -1)) {
          const role = message.sender_type === 'lead' ? 'user' : 'model';
          const text = redactSensitiveTravelData(message.message_text);
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
              callerName: context.request.customer_name,
            },
          });
        } catch {
          await repository.recordProviderFailure(context);
          return { processed: false, disabled: false };
        }
        if (!reply.trim()) {
          await repository.recordProviderFailure(context);
          return { processed: false, disabled: false };
        }
      }

      await repository.saveReply(context, customerId, reply);
      return { processed: true, disabled: false };
    } finally {
      await repository.release(requestId);
    }
  };
}

const globalChatRepository: GovernedGlobalChatRepository = {
  isEnabled: () => env.maya.enabled,
  async acquire(requestId) {
    const lock = await prisma.global_chat_requests.updateMany({
      where: {
        id: requestId,
        status: { in: ['pending', 'active'] },
        ai_is_typing: { not: true },
        OR: [{ assigned_employee_id: null }, { assigned_employee_id: 'ai_assistant' }],
      },
      data: { ai_is_typing: true },
    });
    return lock.count > 0;
  },
  async release(requestId) {
    await prisma.global_chat_requests
      .update({ where: { id: requestId }, data: { ai_is_typing: false } })
      .catch(() => undefined);
  },
  async load(requestId) {
    const request = await prisma.global_chat_requests.findUniqueOrThrow({
      where: { id: requestId },
    });
    const messages = (
      await prisma.global_chat_messages.findMany({
        where: { request_id: requestId },
        orderBy: { id: 'desc' },
        take: 15,
      })
    ).reverse();
    const conversation = await canonicalConversation(request);
    return { request, messages, conversation };
  },
  async reserveInbound(context, messageId, customerId, body) {
    const idempotencyKey = `global_chat_message:${messageId}`;
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
        senderRef: customerId,
        body,
        idempotencyKey,
      },
    });
    return true;
  },
  async escalate(context, triage) {
    const reply =
      "I'm Maya, MooNs Travel's virtual assistant. I've alerted our on-trip team immediately. If you are in immediate danger, contact local emergency services first and stay somewhere safe.";
    await prisma.$transaction([
      prisma.travelConversation.update({
        where: { id: context.conversation.id },
        data: { status: 'escalated', mayaMode: 'human_only' },
      }),
      prisma.maya_activity_log.create({
        data: {
          area: 'on_trip',
          action: 'urgent_global_chat_escalation',
          summary: `${triage.category} global chat #${context.request.id} escalated to staff.`,
          status: 'attention',
        },
      }),
    ]);
    return reply;
  },
  async saveReply(context, customerId, reply) {
    const saved = await prisma.global_chat_messages.create({
      data: {
        request_id: context.request.id,
        sender_id: 'ai_assistant',
        sender_type: 'crm_user',
        receiver_id: customerId,
        receiver_type: 'lead',
        message_type: 'user',
        message_text: reply,
      },
    });
    await prisma.$transaction([
      prisma.channelMessage.create({
        data: {
          conversationId: context.conversation.id,
          channel: 'chat',
          direction: 'outbound',
          senderType: 'maya',
          body: reply,
          idempotencyKey: `global_chat_message:${saved.id}`,
        },
      }),
      prisma.global_chat_requests.update({
        where: { id: context.request.id },
        data: { updated_at: new Date() },
      }),
    ]);
  },
  async recordProviderFailure(context) {
    await prisma.maya_activity_log.create({
      data: {
        area: 'support',
        action: 'global_chat_reply_provider_failure',
        summary: `Global chat #${context.request.id} needs staff review after a reply provider failure.`,
        status: 'attention',
      },
    });
  },
};

const globalChatReplyProvider: GlobalChatReplyProvider = {
  async respond({ safeInput, history, context }) {
    const response = await new MayaBrain(createMayaDeps(), env.maya.model).respond({
      input: { text: safeInput },
      history,
      ctx: {
        channel: 'chat',
        sessionId: context.conversationId,
        callerName: context.callerName,
      },
    });
    return response.text;
  },
};

const processGlobalChat = createGovernedGlobalChatProcessor({
  repository: globalChatRepository,
  replyProvider: globalChatReplyProvider,
});

export async function processGovernedGlobalChat(requestId: number, customerId: string) {
  return processGlobalChat(requestId, customerId);
}
