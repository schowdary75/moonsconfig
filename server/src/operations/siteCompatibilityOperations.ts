// @ts-nocheck
import { z } from 'zod';
import { siteCompatibilityService as service } from '../services/siteCompatibilityService.js';
import { defineOperation } from './defineOperation.js';

const auth = z.object({ email: z.string().email(), sessionToken: z.string().min(20) });

export const getGlobalSeo = defineOperation({ method: 'GET' }).handler(() => service.seo());
export const getGlobalPaymentSettings = defineOperation({ method: 'GET' }).handler(() =>
  service.seo(['paymentQrUrl', 'paymentUpiName']),
);

export const getCityCoordinates = defineOperation({ method: 'POST' })
  .validator(z.object({ cities: z.array(z.string()).max(25), context: z.string().optional() }))
  .handler(async ({ data }) => {
    const coordinates: Record<string, { lat: number; lng: number } | null> = {};
    for (const city of data.cities) {
      const cleaned = city
        .replace(/^(Arrival in|Departure from|Exploring|Tour of|Day at|Visit to)\s+/i, '')
        .trim();
      const search = data.context ? `${cleaned}, ${data.context}` : cleaned;
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=1`,
          {
            headers: { 'User-Agent': 'MooNs-TravelApp/1.0' },
            signal: AbortSignal.timeout(10_000),
          },
        );
        const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
        coordinates[city] = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null;
      } catch {
        coordinates[city] = null;
      }
    }
    return { success: true, coordinates };
  });

export const getMySupportChat = defineOperation({ method: 'POST' })
  .validator(z.object({ auth }))
  .handler(({ data }) => service.customerChat(data.auth));

export const sendSupportMessage = defineOperation({ method: 'POST' })
  .validator(z.object({ auth, content: z.string().min(1).max(10_000) }))
  .handler(({ data }) => service.sendCustomerMessage(data.auth, data.content));

const guestDetails = z.object({
  guestToken: z.string().min(16).max(120),
  name: z.string().min(2).max(255),
  mobile: z.string().min(8).max(50),
  email: z.string().email().optional().or(z.literal('')),
});

export const getGuestSupportChat = defineOperation({ method: 'POST' })
  .validator(guestDetails)
  .handler(({ data }) => service.guestChat(data));

export const sendGuestSupportMessage = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      guestToken: z.string().min(16).max(120),
      content: z.string().min(1).max(10_000),
    }),
  )
  .handler(({ data }) => service.sendGuestMessage(data.guestToken, data.content));

export const closeSupportChatByCustomer = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      chatId: z.number().int().positive(),
      guestToken: z.string().optional(),
      auth: auth.optional(),
    }),
  )
  .handler(({ data }) => service.closeChat(data));

export const rateSupportChat = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      chatId: z.number().int().positive(),
      rating: z.number().int().min(1).max(5),
      feedback: z.string().max(5000).optional(),
    }),
  )
  .handler(({ data }) => service.rateChat(data.chatId, data.rating, data.feedback));

export const getTeamMessages = defineOperation({ method: 'POST' })
  .validator(z.object({ auth }))
  .handler(({ data }) => service.teamMessages(data.auth));

export const sendTeamMessage = defineOperation({ method: 'POST' })
  .validator(z.object({ auth, content: z.string().min(1).max(10_000) }))
  .handler(({ data }) => service.sendTeamMessage(data.auth, data.content));

export const submitHolidayReview = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      itemType: z.enum(['general', 'package', 'stay', 'experience']),
      itemId: z.string().nullable(),
      rating: z.number().min(1).max(5),
      authorName: z.string().min(1),
      reviewText: z.string().min(1),
      travelDate: z.string().nullable(),
    }),
  )
  .handler(({ data }) => service.submitReview(data));

export const getBookingDetailsWithItinerary = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      bookingId: z.number().int().positive(),
      userId: z.number().int().positive(),
    }),
  )
  .handler(({ data }) => service.bookingDetails(data.bookingId, data.userId));

export const setSupportChatTypingStatus = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: auth.optional(),
      chatId: z.number().int().positive(),
      isTyping: z.boolean(),
      isMaya: z.boolean().optional(),
    }),
  )
  .handler(({ data }) => service.setTyping(data));
