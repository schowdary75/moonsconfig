import { type customer_reviews_item_type } from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import { siteCompatibilityRepository as repository } from '../repositories/siteCompatibilityRepository.js';
import { publishChatEvent } from './chatEventService.js';
import { verifyAccessToken } from './tokenService.js';
import { sha256 } from '../utils/crypto.js';
import { customerService } from './customerService.js';

interface AuthInput {
  email: string;
  sessionToken: string;
}

async function authenticatedCustomer(auth: AuthInput) {
  try {
    const claims = verifyAccessToken(auth.sessionToken);
    if (claims.principalType === 'customer_user') {
      const user = await repository.customerByIdAndEmail(Number(claims.sub), auth.email);
      if (user) return user;
    }
  } catch {
    // Fall through to legacy session exchange compatibility.
  }
  const user = await repository.customerByLegacySession(auth.email, sha256(auth.sessionToken));
  if (!user) throw new AppError(401, 'Customer access denied', 'CUSTOMER_ACCESS_DENIED');
  return user;
}

async function authenticatedStaff(auth: AuthInput) {
  try {
    const claims = verifyAccessToken(auth.sessionToken);
    if (claims.principalType === 'crm_user') {
      const user = await repository.staffByIdAndEmail(Number(claims.sub), auth.email);
      if (user) return user;
    }
  } catch {
    // Fall through to legacy CRM session compatibility.
  }
  const user = await repository.staffByLegacySession(auth.email, sha256(auth.sessionToken));
  if (!user) throw new AppError(401, 'Staff access denied', 'STAFF_ACCESS_DENIED');
  return user;
}

async function customerChat(customerId: number) {
  const chat = await repository.latestCustomerChat(customerId);
  return !chat || (chat.status === 'closed' && chat.rating !== null)
    ? repository.createChat({ customer_id: customerId })
    : chat;
}

async function guestChat(input: {
  guestToken: string;
  name: string;
  mobile: string;
  email?: string;
}) {
  const email = input.email || `guest-${input.guestToken.slice(0, 20)}@guest.moon.local`;
  const customer =
    (await repository.customerByEmail(email)) ||
    (await repository.createGuest({ name: input.name, email, phone: input.mobile }));
  const existing = await repository.latestGuestChat(input.guestToken);
  const chat =
    !existing || (existing.status === 'closed' && existing.rating !== null)
      ? await repository.createChat({
          customer_id: customer.id,
          guest_token: input.guestToken,
          guest_name: input.name,
          guest_phone: input.mobile,
        })
      : existing;
  return { customer, chat };
}

export function classifySosIssue(content: string) {
  const hotel =
    /Hotel Issue/i.test(content) ||
    /\b(hotel|room|check[ -]?in)\b.*\b(overbook|no (?:booking|room)|refus|closed|unavailable)\b/i.test(
      content,
    );
  const transport =
    /Transport No-Show/i.test(content) ||
    /\b(driver|transport|transfer|pickup|cab|taxi)\b.*\b(no[ -]?show|didn'?t show|not (?:arrived|here)|missing)\b/i.test(
      content,
    ) ||
    /\b(no[ -]?show|didn'?t show|not (?:arrived|here))\b.*\b(driver|transport|transfer|pickup|cab|taxi)\b/i.test(
      content,
    );
  if (hotel) return 'hotel_issue' as const;
  if (transport) return 'transport_no_show' as const;
  return null;
}

export async function openSosRecovery(customerId: number, content: string) {
  const issueType = classifySosIssue(content);
  if (!issueType) return null;
  const { prisma } = await import('../config/prisma.js');
  const bookings = await prisma.bookings.findMany({
    where: { user_id: customerId, status: 'confirmed' },
    orderBy: { travel_date: 'desc' },
    take: 10,
  });
  for (const booking of bookings) {
    try {
      const opened = await customerService.createTripIncident(customerId, booking.id, {
        issueType,
        details: content.slice(0, 1000),
      });
      const status = opened.recovery?.status ?? 'reported';
      return [
        `Maya SOS case ${opened.recovery?.id ?? opened.incident.id} is active for booking ${booking.booking_reference}.`,
        `Current status: ${status.replace(/_/g, ' ')}. I am contacting the assigned ${issueType === 'hotel_issue' ? 'hotel' : 'transport provider'} and tracking a 10-minute response deadline.`,
        'If it does not confirm, I will contact verified alternatives. If none confirms, I will show official local self-booking options here.',
        'Keep any itemized replacement receipt. Reimbursement requires receipt verification and staff approval; no refund has been promised or paid yet.',
      ].join('\n\n');
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'TRIP_NOT_ACTIVE') throw error;
    }
  }
  return [
    'I received the SOS but could not safely start automated recovery because this account has no active confirmed trip attached to it.',
    'The support team has been alerted through this chat. Please share your booking reference and current location. No replacement or reimbursement has been authorized yet.',
  ].join('\n\n');
}

export const siteCompatibilityService = {
  async seo(keys?: string[]) {
    const rows = await repository.seoSettings(keys);
    return Object.fromEntries(
      rows
        .filter((row) => row.setting_value !== null)
        .map((row) => [row.setting_key, row.setting_value]),
    );
  },
  async customerChat(auth: AuthInput) {
    const customer = await authenticatedCustomer(auth);
    const chat = await customerChat(customer.id);
    return {
      success: true,
      chat,
      messages: await repository.messages(chat.id),
      isTyping: false,
      typingName: '',
    };
  },
  async sendCustomerMessage(auth: AuthInput, content: string) {
    const customer = await authenticatedCustomer(auth);
    const chat = await customerChat(customer.id);
    await repository.createMessage(chat.id, customer.id, content);

    const mayaMsg = await openSosRecovery(customer.id, content);
    if (mayaMsg) await repository.createMessage(chat.id, 0, mayaMsg);

    void publishChatEvent({
      staffBroadcast: true,
      event: 'chat:support-message',
      payload: { chatId: chat.id },
    });
    return { success: true };
  },
  async guestChat(input: { guestToken: string; name: string; mobile: string; email?: string }) {
    const { customer, chat } = await guestChat(input);
    return {
      success: true,
      chat,
      messages: await repository.messages(chat.id),
      customerId: customer.id,
      isTyping: false,
      typingName: '',
    };
  },
  async sendGuestMessage(guestToken: string, content: string) {
    const chat = await repository.openGuestChat(guestToken);
    if (!chat) throw new AppError(404, 'No open chat', 'SUPPORT_CHAT_NOT_FOUND');
    await repository.createMessage(chat.id, chat.customer_id, content);

    const mayaMsg = await openSosRecovery(chat.customer_id, content);
    if (mayaMsg) await repository.createMessage(chat.id, 0, mayaMsg);

    void publishChatEvent({
      staffBroadcast: true,
      event: 'chat:support-message',
      payload: { chatId: chat.id },
    });
    return { success: true };
  },
  async closeChat(input: { chatId: number; guestToken?: string; auth?: AuthInput }) {
    const ownerId = input.auth ? (await authenticatedCustomer(input.auth)).id : undefined;
    const chat = await repository.chatById(input.chatId);
    if (!chat || (ownerId !== chat.customer_id && input.guestToken !== chat.guest_token))
      throw new AppError(403, 'Support chat ownership mismatch', 'FORBIDDEN');
    await repository.closeChat(input.chatId);
    return { success: true };
  },
  async teamMessages(auth: AuthInput) {
    await authenticatedStaff(auth);
    return repository.teamMessages();
  },
  async sendTeamMessage(auth: AuthInput, content: string) {
    const staff = await authenticatedStaff(auth);
    const customerIdentity = await repository.customerByEmail(staff.email);
    if (!customerIdentity)
      throw new AppError(409, 'Staff has no customer chat identity', 'CHAT_IDENTITY_MISSING');
    await repository.createTeamMessage(customerIdentity.id, content);
    return { success: true };
  },
  async submitReview(input: {
    itemType: customer_reviews_item_type;
    itemId: string | null;
    rating: number;
    authorName: string;
    reviewText: string;
    travelDate: string | null;
  }) {
    await repository.createReview({
      item_type: input.itemType,
      item_id: input.itemId,
      rating: input.rating,
      author_name: input.authorName,
      review_text: input.reviewText,
      travel_date: input.travelDate ? new Date(input.travelDate) : null,
    });
    return { success: true };
  },
  async bookingDetails(bookingId: number, userId: number) {
    const booking = await repository.booking(bookingId, userId);
    if (!booking) return null;
    return {
      booking,
      itinerary: await repository.itineraryByPackageName(booking.item_name),
      stays: [],
      cars: [],
    };
  },
  async setTyping(input: {
    auth?: AuthInput;
    chatId: number;
    isTyping: boolean;
    isMaya?: boolean;
  }) {
    const entity = input.isMaya
      ? { id: 'maya', type: 'maya', name: 'Maya' }
      : await authenticatedStaff(input.auth!).then((staff) => ({
          id: String(staff.id),
          type: 'admin',
          name: staff.name || staff.email,
        }));
    await repository.setPresenceTyping(
      entity.id,
      entity.type,
      entity.name,
      input.isTyping ? `support_chat_${input.chatId}` : null,
    );
    return { success: true };
  },
  rateChat: async (chatId: number, rating: number, feedback?: string) => {
    await repository.rateChat(chatId, rating, feedback || null);
    return { success: true };
  },
};
