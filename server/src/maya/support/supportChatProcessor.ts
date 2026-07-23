import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../logger/index.js';
import { ensureTravellerForCustomer } from '../../services/travelDomainService.js';
import { MayaBrain } from '../brain.js';
import { createMayaDeps } from '../deps.js';
import { triageMessage } from '../ontrip/triage.js';
import type { MayaTurn } from '../types.js';
import { openSosRecovery } from '../../services/siteCompatibilityService.js';

let processing = false;

export function redactSensitiveTravelData(text: string) {
  return text
    .replace(
      /\b(passport|visa|aadhaar|aadhar)\s*(?:number|no\.?|#)?\s*[:=-]?\s*[a-z0-9-]{5,20}\b/gi,
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

export async function processGovernedSupportChat(chatId: number) {
  const lock = await prisma.support_chats.updateMany({
    where: {
      id: chatId,
      status: 'open',
      ai_is_typing: { not: true },
      OR: [{ agent_id: null }, { agent_id: 0 }],
    },
    data: { ai_is_typing: true },
  });
  if (!lock.count) return false;

  try {
    const chat = await prisma.support_chats.findUnique({ where: { id: chatId } });
    if (!chat) return false;
    const messages = (
      await prisma.support_messages.findMany({
        where: { chat_id: chat.id },
        orderBy: { id: 'desc' },
        take: 15,
      })
    ).reverse();
    const last = messages.at(-1);
    if (!last || last.sender_id !== chat.customer_id) return false;

    const customer =
      chat.customer_id > 0
        ? await prisma.customerUser.findUnique({ where: { id: chat.customer_id } })
        : null;
    const conversation = await canonicalConversation(chat);
    const safeInput = redactSensitiveTravelData(last.content);
    await prisma.channelMessage.upsert({
      where: { idempotencyKey: `support_message:${last.id}` },
      update: {},
      create: {
        conversationId: conversation.id,
        channel: 'chat',
        direction: 'inbound',
        senderType: 'traveller',
        senderRef: String(chat.customer_id),
        body: safeInput,
        idempotencyKey: `support_message:${last.id}`,
      },
    });

    const triage = triageMessage(safeInput);
    let reply: string;
    if (!triage.autoReplyable) {
      const recoveryReply =
        triage.category === 'booking_issue' && customer
          ? await openSosRecovery(customer.id, safeInput)
          : null;
      reply = recoveryReply ?? urgentAcknowledgement(safeInput);
      await prisma.$transaction([
        prisma.callback_requests.create({
          data: {
            name: customer?.name ?? chat.guest_name ?? 'Traveller',
            phone: customer?.phone ?? chat.guest_phone ?? '',
            destination: null,
            status: 'pending',
          },
        }),
        prisma.travelConversation.update({
          where: { id: conversation.id },
          data: { status: 'escalated', mayaMode: 'human_only' },
        }),
        prisma.maya_activity_log.create({
          data: {
            area: 'on_trip',
            action: 'urgent_support_escalation',
            summary: `${triage.category} support chat #${chat.id} escalated to staff.`,
            status: 'attention',
          },
        }),
      ]);
    } else {
      const history: MayaTurn[] = [];
      for (const message of messages.slice(0, -1)) {
        const role = message.sender_id === chat.customer_id ? 'user' : 'model';
        const text = redactSensitiveTravelData(message.content);
        const previous = history.at(-1);
        if (previous?.role === role) previous.parts[0]!.text += `\n${text}`;
        else history.push({ role, parts: [{ text }] });
      }
      while (history[0]?.role === 'model') history.shift();
      const brain = new MayaBrain(createMayaDeps(), env.maya.model);
      const response = await brain.respond({
        input: { text: safeInput },
        history,
        ctx: {
          channel: 'chat',
          sessionId: conversation.id,
          callerName: customer?.name ?? chat.guest_name,
          callerPhone: customer?.phone ?? chat.guest_phone,
        },
      });
      reply = response.text;
    }

    const saved = await prisma.support_messages.create({
      data: { chat_id: chat.id, sender_id: 0, content: reply },
    });
    await prisma.$transaction([
      prisma.channelMessage.create({
        data: {
          conversationId: conversation.id,
          channel: 'chat',
          direction: 'outbound',
          senderType: 'maya',
          body: reply,
          locale: 'en',
          idempotencyKey: `support_message:${saved.id}`,
        },
      }),
      prisma.support_chats.update({ where: { id: chat.id }, data: { agent_id: 0 } }),
    ]);
    return true;
  } finally {
    await prisma.support_chats
      .update({ where: { id: chatId }, data: { ai_is_typing: false } })
      .catch(() => undefined);
  }
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
