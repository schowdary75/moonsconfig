import type { user_wishlists_item_type } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface WishlistInput {
  itemId: string;
  itemType: user_wishlists_item_type;
  name: string;
  price: number;
  imageKey: string;
  detail: string;
}

export interface CustomerDeviceInput {
  token: string;
  platform: 'android' | 'ios';
  appVersion?: string;
}

const wishlistData = (userId: number, item: WishlistInput) => ({
  user_id: userId,
  item_id: item.itemId,
  item_type: item.itemType,
  name: item.name,
  price: item.price,
  image_key: item.imageKey,
  detail: item.detail,
});

export const customerRepository = {
  registerDevice: (userId: number, input: CustomerDeviceInput) =>
    prisma.customerDevice.upsert({
      where: { token: input.token },
      update: {
        userId,
        platform: input.platform,
        appVersion: input.appVersion?.trim() || null,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        token: input.token,
        platform: input.platform,
        appVersion: input.appVersion?.trim() || null,
      },
    }),
  removeDevice: (userId: number, token: string) =>
    prisma.customerDevice.deleteMany({ where: { userId, token } }),
  listWishlist: (userId: number) =>
    prisma.user_wishlists.findMany({ where: { user_id: userId }, orderBy: { added_at: 'desc' } }),
  addWishlist: (userId: number, item: WishlistInput) =>
    prisma.user_wishlists.upsert({
      where: {
        user_id_item_type_item_id: {
          user_id: userId,
          item_type: item.itemType,
          item_id: item.itemId,
        },
      },
      update: wishlistData(userId, item),
      create: wishlistData(userId, item),
    }),
  removeWishlist: (userId: number, itemType: user_wishlists_item_type, itemId: string) =>
    prisma.user_wishlists.deleteMany({
      where: { user_id: userId, item_type: itemType, item_id: itemId },
    }),
  replaceWishlist: (userId: number, items: WishlistInput[]) =>
    prisma.$transaction(async (tx) => {
      await tx.user_wishlists.deleteMany({ where: { user_id: userId } });
      if (items.length)
        await tx.user_wishlists.createMany({
          data: items.map((item) => wishlistData(userId, item)),
        });
      return tx.user_wishlists.findMany({
        where: { user_id: userId },
        orderBy: { added_at: 'desc' },
      });
    }),
  listBookings: (userId: number) =>
    prisma.bookings.findMany({
      where: { user_id: userId },
      include: { invoices: true },
      orderBy: { created_at: 'desc' },
    }),
  findBooking: (userId: number, bookingId: number) =>
    prisma.bookings.findFirst({ where: { id: bookingId, user_id: userId } }),
  tripSchedules: (bookingId: number) =>
    prisma.trip_daily_schedules.findMany({
      where: { booking_id: bookingId },
      orderBy: [{ day_number: 'asc' }, { id: 'asc' }],
    }),
  tripMilestones: (bookingId: number) =>
    prisma.trip_live_milestones.findMany({
      where: { booking_id: bookingId },
      orderBy: { id: 'asc' },
    }),
  openTripIncidents: (bookingId: number) =>
    prisma.booking_contingencies.findMany({
      where: {
        booking_id: bookingId,
        plan_b_authorized: false,
        plan_a_status: { not: 'resolved' },
      },
      orderBy: { created_at: 'desc' },
    }),
  recentOpenTripIncident: (bookingId: number, issueType: string, since: Date) =>
    prisma.booking_contingencies.findFirst({
      where: {
        booking_id: bookingId,
        issue_type: issueType,
        created_at: { gte: since },
        plan_b_authorized: false,
        plan_a_status: { not: 'resolved' },
      },
      orderBy: { created_at: 'desc' },
    }),
  createTripIncident: (input: { bookingId: number; issueType: string; details: string | null }) =>
    prisma.booking_contingencies.create({
      data: {
        booking_id: input.bookingId,
        issue_type: input.issueType,
        severity: 'high',
        details: input.details,
        plan_a_status: 'failed',
      },
    }),
  operatorsByIds: (ids: number[]) =>
    ids.length
      ? prisma.operators.findMany({
          where: { id: { in: ids } },
          select: { id: true, company_name: true, contact_name: true, phone: true },
        })
      : Promise.resolve([]),
  // Cancellation is deliberately not exposed as a repository mutation. It must
  // pass through MayaActionProposal approval and the governed executor so that
  // cancelling a booking never implicitly settles a refund or releases escrow.
  cancelBooking: (_userId: number, _bookingId: number) =>
    Promise.reject(
      new Error('Direct cancellation is disabled; use the governed cancellation workflow'),
    ),
  listPayments: (userId: number) =>
    prisma.payment_orders.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    }),
  listRefunds: (userId: number) =>
    prisma.user_refunds.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    }),
  listEscrow: async (userId: number) => {
    const bookings = await prisma.bookings.findMany({
      where: { user_id: userId },
      select: { id: true },
    });
    return prisma.escrow_ledger.findMany({
      where: { booking_id: { in: bookings.map((booking) => booking.id) } },
      orderBy: { created_at: 'desc' },
    });
  },
  listInvoices: (userId: number) =>
    prisma.invoices.findMany({
      where: { user_id: userId },
      include: { bookings: true },
      orderBy: { created_at: 'desc' },
    }),
  invoiceByReference: async (userId: number, bookingReference: string) => {
    const booking = await prisma.bookings.findFirst({
      where: { user_id: userId, booking_reference: bookingReference },
    });
    if (!booking) return null;
    const payments = await prisma.payment_orders.aggregate({
      where: { booking_id: booking.id, status: 'verified' },
      _sum: { amount: true },
    });
    const paidAmount = Number(payments._sum.amount ?? 0);
    return {
      booking,
      paidAmount,
      pendingAmount: Math.max(0, booking.amount - paidAmount),
    };
  },
};
