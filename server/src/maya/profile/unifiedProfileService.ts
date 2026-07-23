import type { MayaDeps } from '../types.js';

/**
 * Unified traveller profile — the "don't make me repeat myself" fix.
 *
 * A single traveller is often scattered across three tables: the marketing
 * `lead_submissions`, the sales `crm_clients` record, and the `CustomerUser`
 * account. This service stitches them together by phone/email into one view so
 * every agent — and Maya — sees the same history, preferences and value.
 */

export interface UnifiedProfile {
  found: boolean;
  identity: { name: string | null; phone: string | null; email: string | null };
  sources: { hasCustomerAccount: boolean; leadCount: number; isCrmClient: boolean };
  preferences: {
    destinationsOfInterest: string[];
    themes: string[];
    budgetBands: string[];
  };
  value: {
    bookingsCount: number;
    totalBookedInr: number;
    lifetimeValueInr: number;
    pointsBalance: number;
  };
}

export interface ProfileLookup {
  phone?: string | null;
  email?: string | null;
}

const uniq = (values: (string | null | undefined)[]): string[] => [
  ...new Set(values.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim())),
];

export async function getUnifiedProfile(
  deps: MayaDeps,
  lookup: ProfileLookup,
): Promise<UnifiedProfile> {
  const phone = lookup.phone?.trim() || null;
  const email = lookup.email?.trim() || null;
  const orById: Record<string, string>[] = [];
  if (phone) orById.push({ phone });
  if (email) orById.push({ email });

  const empty: UnifiedProfile = {
    found: false,
    identity: { name: null, phone, email },
    sources: { hasCustomerAccount: false, leadCount: 0, isCrmClient: false },
    preferences: { destinationsOfInterest: [], themes: [], budgetBands: [] },
    value: { bookingsCount: 0, totalBookedInr: 0, lifetimeValueInr: 0, pointsBalance: 0 },
  };
  if (orById.length === 0) return empty;

  const [customer, leads, crmClient] = await Promise.all([
    deps.prisma.customerUser.findFirst({
      where: { OR: orById },
      select: { id: true, name: true, phone: true, email: true, points_balance: true },
    }),
    deps.prisma.lead_submissions.findMany({
      where: { OR: orById },
      select: {
        name: true,
        destination: true,
        theme: true,
        budget_range: true,
        phone: true,
        email: true,
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    }),
    deps.prisma.crm_clients.findFirst({
      where: { OR: orById },
      select: { name: true, lifetime_value: true, phone: true, email: true },
    }),
  ]);

  let bookingsCount = 0;
  let totalBookedInr = 0;
  if (customer) {
    const bookings = await deps.prisma.bookings.findMany({
      where: { user_id: customer.id },
      select: { amount: true },
    });
    bookingsCount = bookings.length;
    totalBookedInr = bookings.reduce((sum, b) => sum + (b.amount ?? 0), 0);
  }

  const found = Boolean(customer || leads.length || crmClient);
  const name = customer?.name ?? crmClient?.name ?? leads[0]?.name ?? null;

  return {
    found,
    identity: {
      name,
      phone: phone ?? customer?.phone ?? crmClient?.phone ?? null,
      email: email ?? customer?.email ?? crmClient?.email ?? null,
    },
    sources: {
      hasCustomerAccount: Boolean(customer),
      leadCount: leads.length,
      isCrmClient: Boolean(crmClient),
    },
    preferences: {
      destinationsOfInterest: uniq(leads.map((l) => l.destination)),
      themes: uniq(leads.map((l) => l.theme)),
      budgetBands: uniq(leads.map((l) => l.budget_range)),
    },
    value: {
      bookingsCount,
      totalBookedInr,
      lifetimeValueInr: Number(crmClient?.lifetime_value ?? 0),
      pointsBalance: customer?.points_balance ?? 0,
    },
  };
}
