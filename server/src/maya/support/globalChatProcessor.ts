import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { MayaBrain } from '../brain.js';
import { createMayaDeps } from '../deps.js';
import { triageMessage } from '../ontrip/triage.js';
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

export async function processGovernedGlobalChat(requestId: number, customerId: string) {
  if (!env.maya.enabled) return { processed: false, disabled: true };
  const lock = await prisma.global_chat_requests.updateMany({
    where: {
      id: requestId,
      status: { in: ['pending', 'active'] },
      ai_is_typing: { not: true },
      OR: [{ assigned_employee_id: null }, { assigned_employee_id: 'ai_assistant' }],
    },
    data: { ai_is_typing: true },
  });
  if (!lock.count) return { processed: false, disabled: false };
  try {
    const request = await prisma.global_chat_requests.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (request.customer_id !== customerId) return { processed: false, disabled: false };
    const messages = (
      await prisma.global_chat_messages.findMany({
        where: { request_id: requestId },
        orderBy: { id: 'desc' },
        take: 15,
      })
    ).reverse();
    const last = messages.at(-1);
    if (!last || last.sender_id === 'ai_assistant' || last.sender_type !== 'lead') {
      return { processed: false, disabled: false };
    }
    const conversation = await canonicalConversation(request);
    const safeInput = redactSensitiveTravelData(last.message_text);
    await prisma.channelMessage.upsert({
      where: { idempotencyKey: `global_chat_message:${last.id}` },
      update: {},
      create: {
        conversationId: conversation.id,
        channel: 'chat',
        direction: 'inbound',
        senderType: 'traveller',
        senderRef: customerId,
        body: safeInput,
        idempotencyKey: `global_chat_message:${last.id}`,
      },
    });

    const triage = triageMessage(safeInput);
    let reply: string;
    if (!triage.autoReplyable) {
      reply =
        "I'm Maya, MooNs Travel's virtual assistant. I've alerted our on-trip team immediately. If you are in immediate danger, contact local emergency services first and stay somewhere safe.";
      await prisma.$transaction([
        prisma.travelConversation.update({
          where: { id: conversation.id },
          data: { status: 'escalated', mayaMode: 'human_only' },
        }),
        prisma.maya_activity_log.create({
          data: {
            area: 'on_trip',
            action: 'urgent_global_chat_escalation',
            summary: `${triage.category} global chat #${requestId} escalated to staff.`,
            status: 'attention',
          },
        }),
      ]);
    } else {
      const history: MayaTurn[] = [];
      for (const message of messages.slice(0, -1)) {
        const role = message.sender_type === 'lead' ? 'user' : 'model';
        const text = redactSensitiveTravelData(message.message_text);
        const previous = history.at(-1);
        if (previous?.role === role) previous.parts[0]!.text += `\n${text}`;
        else history.push({ role, parts: [{ text }] });
      }
      while (history[0]?.role === 'model') history.shift();
      const response = await new MayaBrain(createMayaDeps(), env.maya.model).respond({
        input: { text: safeInput },
        history,
        ctx: {
          channel: 'chat',
          sessionId: conversation.id,
          callerName: request.customer_name,
        },
      });
      reply = response.text;
    }

    const saved = await prisma.global_chat_messages.create({
      data: {
        request_id: requestId,
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
          conversationId: conversation.id,
          channel: 'chat',
          direction: 'outbound',
          senderType: 'maya',
          body: reply,
          idempotencyKey: `global_chat_message:${saved.id}`,
        },
      }),
      prisma.global_chat_requests.update({
        where: { id: requestId },
        data: { updated_at: new Date() },
      }),
    ]);
    return { processed: true, disabled: false };
  } finally {
    await prisma.global_chat_requests
      .update({ where: { id: requestId }, data: { ai_is_typing: false } })
      .catch(() => undefined);
  }
}
