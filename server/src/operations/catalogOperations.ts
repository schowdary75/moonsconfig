// @ts-nocheck
import { z } from 'zod';
import { defineOperation } from './defineOperation.js';
import * as legacy from '../legacy/api/db.functions.server.js';
import { prisma } from '../config/prisma.js';

export const adminGetCruiseListings = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }): Promise<any[]> => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureRichInventoryTables();
    const pool = await legacy.getDbPool();
    const [rows] = await pool.query(`
      SELECT c.*, v.company_name as vendor_name 
      FROM cruise_listings c
      LEFT JOIN vendors v ON c.vendor_id = v.id
      ORDER BY c.id DESC
    `);
    return rows as any[];
  });

export const adminCreateCruiseListing = defineOperation({ method: 'POST' })
  .validator(legacy.cruiseListingSchema)
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureRichInventoryTables();
    const pool = await legacy.getDbPool();
    const [result] = await pool.query(
      `INSERT INTO cruise_listings
       (line, ship, itinerary, country, date_sailing, inside_price, balcony_price, suite_price, status, phone, email, vendor_id, b2b_price, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.line,
        data.ship,
        data.itinerary,
        data.country,
        data.date_sailing,
        data.inside_price,
        data.balcony_price,
        data.suite_price,
        data.status,
        data.phone || null,
        data.email || null,
        data.vendor_id ?? null,
        data.b2b_price ?? 0,
        data.is_verified ? 1 : 0,
      ],
    );
    return { success: true, id: (result as any).insertId };
  });

export const adminUpdateCruiseListing = defineOperation({ method: 'POST' })
  .validator(legacy.cruiseListingSchema.extend({ id: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureRichInventoryTables();
    const pool = await legacy.getDbPool();
    await pool.query(
      `UPDATE cruise_listings
       SET line = ?, ship = ?, itinerary = ?, country = ?, date_sailing = ?,
           inside_price = ?, balcony_price = ?, suite_price = ?, status = ?, phone = ?, email = ?, vendor_id = ?, b2b_price = ?, is_verified = ?
       WHERE id = ?`,
      [
        data.line,
        data.ship,
        data.itinerary,
        data.country,
        data.date_sailing,
        data.inside_price,
        data.balcony_price,
        data.suite_price,
        data.status,
        data.phone || null,
        data.email || null,
        data.vendor_id ?? null,
        data.b2b_price ?? 0,
        data.is_verified ? 1 : 0,
        data.id,
      ],
    );
    return { success: true };
  });

export const adminDeleteCruiseListing = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureRichInventoryTables();
    const pool = await legacy.getDbPool();
    await pool.query('DELETE FROM cruise_listings WHERE id = ?', [data.id]);
    return { success: true };
  });

export const adminGetFlightAllotments = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }): Promise<legacy.FlightAllotmentRow[]> => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    return (await prisma.flight_allotments.findMany({ orderBy: { id: 'desc' } })).map((row) => ({
      ...row,
      net_fare: Number(row.net_fare),
      selling_price: Number(row.selling_price),
      seats_total: Number(row.seats_total),
      seats_available: Number(row.seats_available),
    }));
  });

export const adminCreateFlightAllotment = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, flight: legacy.flightInputSchema }))
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    const f = data.flight;
    const created = await prisma.flight_allotments.create({
      data: {
        airline: f.airline,
        flight_no: f.flightNo,
        origin: f.origin,
        destination: f.destination,
        departure_time: new Date(f.departureTime),
        arrival_time: new Date(f.arrivalTime),
        cabin_class: f.cabinClass,
        net_fare: f.netFare,
        selling_price: f.sellingPrice,
        seats_total: f.seatsTotal,
        seats_available: f.seatsAvailable,
        supplier_name: f.supplierName || null,
        status: f.status,
        created_by: admin.email,
        updated_by: admin.email,
      },
    });
    await legacy.logAdminAction(
      admin.email,
      'flight.create',
      'flight_allotment',
      created.id,
      null,
      f,
    );
    return { success: true, id: created.id };
  });

export const adminUpdateFlightAllotment = defineOperation({ method: 'POST' })
  .validator(
    z.object({ auth: legacy.adminAuthSchema, id: z.number(), flight: legacy.flightInputSchema }),
  )
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    const beforeValue = await prisma.flight_allotments.findUnique({ where: { id: data.id } });
    const f = data.flight;
    await prisma.flight_allotments.update({
      where: { id: data.id },
      data: {
        airline: f.airline,
        flight_no: f.flightNo,
        origin: f.origin,
        destination: f.destination,
        departure_time: new Date(f.departureTime),
        arrival_time: new Date(f.arrivalTime),
        cabin_class: f.cabinClass,
        net_fare: f.netFare,
        selling_price: f.sellingPrice,
        seats_total: f.seatsTotal,
        seats_available: f.seatsAvailable,
        supplier_name: f.supplierName || null,
        status: f.status,
        updated_by: admin.email,
      },
    });
    await legacy.logAdminAction(
      admin.email,
      'flight.update',
      'flight_allotment',
      data.id,
      beforeValue,
      f,
    );
    return { success: true };
  });

export const adminDeleteFlightAllotment = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number() }))
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    await legacy.ensureOperationsTables();
    const beforeValue = await prisma.flight_allotments.findUnique({ where: { id: data.id } });
    await prisma.flight_allotments.update({
      where: { id: data.id },
      data: { status: 'inactive', updated_by: admin.email },
    });
    await legacy.logAdminAction(
      admin.email,
      'flight.archive',
      'flight_allotment',
      data.id,
      beforeValue,
      {
        status: 'inactive',
      },
    );
    return { success: true };
  });

export const adminGetOffers = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    return await prisma.promotional_offers.findMany({ orderBy: { id: 'asc' } });
  });

export const adminCreateOffer = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      title: z.string(),
      slug: z.string(),
      description: z.string().optional(),
      discountPercent: z.number(),
      bannerImageUrl: z.string().optional(),
      theme: z
        .enum(['seasonal', 'flash-sale', 'early-bird', 'last-minute', 'exclusive'])
        .default('seasonal'),
      isActive: z.boolean().default(false),
      isGlobal: z.boolean().default(false),
      targetScope: z
        .enum(['global', 'package', 'destination', 'domestic', 'international'])
        .default('global'),
      targetId: z.number().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await prisma.promotional_offers.create({
      data: {
        title: data.title,
        slug: data.slug,
        description: data.description || null,
        discount_percent: data.discountPercent,
        banner_image_url: data.bannerImageUrl || null,
        theme: data.theme,
        is_active: data.isActive,
        is_global: data.isGlobal,
        target_scope: data.targetScope,
        target_id: data.targetId || null,
      },
    });

    return { success: true };
  });

export const adminToggleOffer = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await prisma.promotional_offers.update({
      where: { id: data.id },
      data: { is_active: data.isActive },
    });

    return { success: true };
  });

export const adminGetDestinationsAll = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    return await prisma.destinations.findMany({
      select: { id: true, name: true, country: true },
      orderBy: { name: 'asc' },
    });
  });

export const adminDeleteOffer = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await prisma.$transaction([
      prisma.offer_items.deleteMany({ where: { offer_id: data.id } }),
      prisma.promotional_offers.delete({ where: { id: data.id } }),
    ]);

    return { success: true };
  });

export const getTravelThemes = defineOperation({ method: 'GET' }).handler(
  async (): Promise<legacy.TravelTheme[]> => {
    await legacy.ensureRichInventoryTables();
    return (await prisma.travel_themes.findMany({
      where: { is_active: true },
      orderBy: { id: 'asc' },
    })) as unknown as legacy.TravelTheme[];
  },
);

export const getTravelThemeBySlug = defineOperation({ method: 'GET' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }): Promise<legacy.TravelTheme | null> => {
    await legacy.ensureRichInventoryTables();
    return (await prisma.travel_themes.findFirst({
      where: { slug: data.slug, is_active: true },
    })) as unknown as legacy.TravelTheme | null;
  });

export const adminGetTravelThemes = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }): Promise<legacy.TravelTheme[]> => {
    await legacy.requireAdmin(data.auth);
    return (await prisma.travel_themes.findMany({
      orderBy: { id: 'asc' },
    })) as unknown as legacy.TravelTheme[];
  });

export const adminCreateTravelTheme = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      slug: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1),
      image_url: z.string().nullable().optional(),
      image_key: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const created = await prisma.travel_themes.create({
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description,
        image_url: data.image_url || null,
        image_key: data.image_key || null,
        is_active: true,
      },
    });
    return { success: true, id: created.id };
  });

export const adminUpdateTravelTheme = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      id: z.number(),
      slug: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1),
      image_url: z.string().nullable().optional(),
      image_key: z.string().nullable().optional(),
      is_active: z.number().min(0).max(1).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await prisma.travel_themes.update({
      where: { id: data.id },
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description,
        image_url: data.image_url || null,
        image_key: data.image_key || null,
        is_active: Boolean(data.is_active ?? 1),
      },
    });
    return { success: true };
  });

export const adminDeleteTravelTheme = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, id: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await prisma.travel_themes.update({ where: { id: data.id }, data: { is_active: false } });
    return { success: true };
  });

export const adminGetExperiencesAll = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    return await prisma.master_activities.findMany({
      orderBy: [{ updated_at: 'desc' }, { destination: 'asc' }],
    });
  });

export const adminSetExperienceActive = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      id: z.number().int().positive(),
      status: z.enum(['active', 'inactive']),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    const updated = await prisma.master_activities.update({
      where: { id: data.id },
      data: { status: data.status },
    });
    await legacy.logAdminAction(
      admin.email,
      'experience.status_change',
      'master_activities',
      data.id,
      { status: data.status },
      null,
    );
    return updated;
  });

export const adminUpsertExperienceDetail = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      experience: z.any(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await legacy.requireAdmin(data.auth);
    const { id, ...fields } = data.experience;

    if (!fields.slug) {
      fields.slug =
        String(fields.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        Math.floor(Math.random() * 10000);
    }

    let result;
    if (id) {
      result = await prisma.master_activities.update({
        where: { id },
        data: fields,
      });
      await legacy.logAdminAction(
        admin.email,
        'experience.update',
        'master_activities',
        id,
        null,
        null,
      );
    } else {
      result = await prisma.master_activities.create({
        data: fields,
      });
      await legacy.logAdminAction(
        admin.email,
        'experience.create',
        'master_activities',
        result.id,
        null,
        null,
      );
    }
    return result;
  });

export const getDestinations = defineOperation({ method: 'GET' }).handler(
  async (): Promise<legacy.DestinationRow[]> => {
    return (await prisma.destinations.findMany({
      orderBy: { id: 'asc' },
    })) as unknown as legacy.DestinationRow[];
  },
);

export const getStays = defineOperation({ method: 'GET' }).handler(
  async (): Promise<legacy.StayRow[]> => {
    return (await prisma.stays.findMany({ orderBy: { id: 'asc' } })) as unknown as legacy.StayRow[];
  },
);

export const getExperiences = defineOperation({ method: 'GET' }).handler(
  async (): Promise<legacy.ExperienceRow[]> => {
    const rows = await prisma.master_activities.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, destination: true, description: true },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.name,
      place: row.destination,
      description: row.description ?? '',
      price: '0',
    }));
  },
);

export const adminSaveAiItineraryToActivities = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      destination: z.string(),
      itinerary: z.array(
        z.object({
          day: z.number().optional(),
          title: z.string(),
          description: z.string(),
        }),
      ),
    }),
  )
  .handler(async ({ data }) => {
    await prisma.master_activities.createMany({
      data: data.itinerary.map((day) => ({
        slug: (
          day.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') +
          '-' +
          Math.floor(Math.random() * 10000)
        ).substring(0, 200),
        name: day.title,
        destination: data.destination,
        country: 'Unknown',
        description: day.description,
        status: 'active',
      })),
    });
    return { success: true };
  });

export const getTrendingDestinationsLocal = defineOperation({ method: 'GET' }).handler(async () => [
  {
    slug: 'dubai',
    name: 'Dubai',
    country: 'United Arab Emirates',
    theme: 'Luxury city breaks',
    description:
      'Premium short-haul demand with strong family, shopping, theme park, and celebration travel intent.',
    season: 'Oct-Mar',
    duration: '4-6 days',
  },
  {
    slug: 'bali',
    name: 'Bali',
    country: 'Indonesia',
    theme: 'Honeymoon and wellness',
    description:
      'Strong couple and villa-led itineraries with waterfalls, beaches, private pool stays, and cafe culture.',
    season: 'Apr-Oct',
    duration: '6-8 days',
  },
  {
    slug: 'thailand',
    name: 'Thailand',
    country: 'Thailand',
    theme: 'Island and nightlife circuits',
    description:
      'High-volume value destination across Bangkok, Phuket, Krabi, Pattaya, and island add-ons.',
    season: 'Nov-Apr',
    duration: '5-7 days',
  },
  {
    slug: 'azerbaijan',
    name: 'Azerbaijan',
    country: 'Azerbaijan',
    theme: 'Caucasus short breaks',
    description:
      'Fast-growing visa-friendly route for Indian travelers seeking Baku, Gabala, snow, and heritage.',
    season: 'Apr-Jun, Sep-Feb',
    duration: '5-6 days',
  },
  {
    slug: 'kerala',
    name: 'Kerala',
    country: 'India',
    theme: 'Slow travel and families',
    description:
      'Reliable domestic demand across Kochi, Munnar, Thekkady, Alleppey, beaches, and wellness retreats.',
    season: 'Sep-Mar',
    duration: '5-7 days',
  },
  {
    slug: 'kashmir',
    name: 'Kashmir',
    country: 'India',
    theme: 'Scenic premium domestic',
    description:
      'Consistent high-intent domestic market for couples, families, snow trips, and private-driver itineraries.',
    season: 'Mar-Jun, Dec-Feb',
    duration: '5-7 days',
  },
]);

export const getTrendingData = defineOperation({ method: 'GET' }).handler(
  async (): Promise<legacy.TrendingData> => {
    await legacy.ensureTrendingTables();
    const [destinations, seasonRows, stateRows, sourceRows] = await Promise.all([
      prisma.trend_destinations.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }),
      prisma.trend_seasons.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }),
      prisma.trend_source_states.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }),
      prisma.trend_sources.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }),
    ]);
    return {
      outbound: destinations.filter((r) => r.scope === 'outbound').map(legacy.mapTrendDestination),
      domestic: destinations.filter((r) => r.scope === 'domestic').map(legacy.mapTrendDestination),
      seasons: seasonRows.map((r) => ({
        id: r.slug,
        label: r.label,
        months: r.months,
        theme: r.theme,
        sellNow: legacy.parseJsonArray(r.sell_now),
        advertiseFor: legacy.parseJsonArray(r.advertise_for),
        note: r.note,
      })),
      sourceStates: stateRows.map((r) => ({
        state: r.state,
        cities: r.cities,
        outbound: r.outbound,
        domestic: r.domestic,
        tip: r.tip,
      })),
      sources: sourceRows.map((r) => ({ label: r.label, url: r.url })),
    };
  },
);
