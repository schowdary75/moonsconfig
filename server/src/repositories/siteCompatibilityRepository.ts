import {
  type customer_reviews_item_type,
  customer_reviews_status,
  support_chats_status,
} from '@prisma/client';
import { prisma } from '../config/prisma.js';

export const siteCompatibilityRepository = {
  seoSettings: (keys?: string[]) =>
    prisma.global_seo_settings.findMany({
      where: keys ? { setting_key: { in: keys } } : undefined,
      select: { setting_key: true, setting_value: true },
    }),
  customerByIdAndEmail: (id: number, email: string) =>
    prisma.customerUser.findFirst({ where: { id, email: { equals: email } } }),
  customerByLegacySession: async (email: string, tokenHash: string) => {
    const session = await prisma.auth_sessions.findFirst({
      where: { token_hash: tokenHash, revoked_at: null, expires_at: { gt: new Date() } },
    });
    return session
      ? prisma.customerUser.findFirst({ where: { id: session.user_id, email: { equals: email } } })
      : null;
  },
  staffByIdAndEmail: (id: number, email: string) =>
    prisma.crmUser.findFirst({ where: { id, email: { equals: email } } }),
  staffByLegacySession: async (email: string, tokenHash: string) => {
    const session = await prisma.crmAuthSession.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
    });
    return session
      ? prisma.crmUser.findFirst({ where: { id: session.userId, email: { equals: email } } })
      : null;
  },
  latestCustomerChat: (customerId: number) =>
    prisma.support_chats.findFirst({
      where: { customer_id: customerId },
      orderBy: { id: 'desc' },
    }),
  latestGuestChat: (guestToken: string) =>
    prisma.support_chats.findFirst({ where: { guest_token: guestToken }, orderBy: { id: 'desc' } }),
  openGuestChat: (guestToken: string) =>
    prisma.support_chats.findFirst({
      where: { guest_token: guestToken, status: support_chats_status.open },
    }),
  chatById: (id: number) => prisma.support_chats.findUnique({ where: { id } }),
  createChat: (data: {
    customer_id: number;
    guest_token?: string;
    guest_name?: string;
    guest_phone?: string;
  }) => prisma.support_chats.create({ data }),
  messages: async (chatId: number) => {
    const messages = await prisma.support_messages.findMany({
      where: { chat_id: chatId },
      orderBy: { created_at: 'asc' },
    });
    const users = await prisma.customerUser.findMany({
      where: { id: { in: Array.from(new Set(messages.map((message) => message.sender_id))) } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));
    return messages.map((message) => ({
      ...message,
      sender_name: userById.get(message.sender_id)?.name ?? null,
      sender_email: userById.get(message.sender_id)?.email ?? null,
    }));
  },
  createMessage: (chatId: number, senderId: number, content: string) =>
    prisma.support_messages.create({
      data: { chat_id: chatId, sender_id: senderId, content },
    }),
  closeChat: (id: number) =>
    prisma.support_chats.update({ where: { id }, data: { status: support_chats_status.closed } }),
  rateChat: (id: number, rating: number, feedback: string | null) =>
    prisma.support_chats.update({ where: { id }, data: { rating, feedback } }),
  customerByEmail: (email: string) => prisma.customerUser.findUnique({ where: { email } }),
  createGuest: (data: { name: string; email: string; phone: string }) =>
    prisma.customerUser.create({
      data: { ...data, is_guest: true, points_balance: 0 },
    }),
  teamMessages: async () => {
    const messages = await prisma.team_messages.findMany({ orderBy: { created_at: 'asc' } });
    const users = await prisma.customerUser.findMany({
      where: { id: { in: Array.from(new Set(messages.map((message) => message.sender_id))) } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));
    return messages.map((message) => ({
      ...message,
      sender_name: userById.get(message.sender_id)?.name ?? null,
      sender_email: userById.get(message.sender_id)?.email ?? null,
    }));
  },
  createTeamMessage: (senderId: number, content: string) =>
    prisma.team_messages.create({ data: { sender_id: senderId, content } }),
  createReview: (data: {
    item_type: customer_reviews_item_type;
    item_id: string | null;
    rating: number;
    author_name: string;
    review_text: string;
    travel_date: Date | null;
  }) =>
    prisma.customer_reviews.create({
      data: {
        ...data,
        status: customer_reviews_status.approved,
        published_at: new Date(),
      },
    }),
  booking: (id: number, userId: number) =>
    prisma.bookings.findFirst({ where: { id, user_id: userId } }),
  itineraryByPackageName: async (name: string) => {
    const packageRecord = await prisma.packages.findFirst({
      where: { name },
      select: { id: true },
    });
    return packageRecord
      ? prisma.package_itinerary.findMany({
          where: { package_id: packageRecord.id },
          orderBy: { day_number: 'asc' },
        })
      : [];
  },
  setPresenceTyping: (
    entityId: string,
    entityType: string,
    entityName: string,
    typingTo: string | null,
  ) =>
    prisma.user_presence.upsert({
      where: { entity_id_entity_type: { entity_id: entityId, entity_type: entityType } },
      create: {
        entity_id: entityId,
        entity_type: entityType,
        entity_name: entityName,
        typing_to: typingTo,
        typing_updated_at: typingTo ? new Date() : null,
      },
      update: {
        typing_to: typingTo,
        typing_updated_at: typingTo ? new Date() : null,
      },
    }),
};
