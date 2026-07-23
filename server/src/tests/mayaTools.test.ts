import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { dispatchTool } from '../maya/tools.js';
import type { MayaDeps, MayaToolContext } from '../maya/types.js';

/**
 * A tiny in-memory Prisma stand-in exposing only the delegate methods Maya's
 * tools touch. Enough to exercise real filtering, de-duplication and writes
 * without a database.
 */
function makeFakePrisma() {
  const packages = [
    {
      id: 1,
      name: 'Goa Beach Bliss',
      destination: 'Goa',
      country: 'India',
      days: 4,
      nights: 3,
      price: 25000,
      category: 'Economy',
      is_active: true,
    },
    {
      id: 2,
      name: 'Goa Luxury Honeymoon',
      destination: 'Goa',
      country: 'India',
      days: 5,
      nights: 4,
      price: 60000,
      category: 'Luxury',
      is_active: true,
    },
    {
      id: 3,
      name: 'Bali Escape',
      destination: 'Bali',
      country: 'Indonesia',
      days: 6,
      nights: 5,
      price: 80000,
      category: 'Premium',
      is_active: true,
    },
    {
      id: 4,
      name: 'Old Goa Retreat',
      destination: 'Goa',
      country: 'India',
      days: 3,
      nights: 2,
      price: 18000,
      category: 'Economy',
      is_active: false,
    },
    {
      id: 5,
      name: 'Family Saver Escape to Dubai',
      destination: 'Dubai',
      country: 'United Arab Emirates',
      days: 6,
      nights: 5,
      price: 56000,
      category: 'Economy',
      is_active: true,
    },
  ];
  const leads: any[] = [];
  const callbacks: any[] = [];
  let leadSeq = 100;
  let cbSeq = 500;

  const contains = (hay: string, needle?: { contains?: string }) =>
    !needle?.contains || hay.toLowerCase().includes(needle.contains.toLowerCase());

  const prisma = {
    packages: {
      findMany: vi.fn(async ({ where, take }: any) => {
        let rows = packages.filter((p) => p.is_active === (where.is_active ?? true));
        if (where.OR) {
          rows = rows.filter((p) =>
            where.OR.some(
              (condition: any) =>
                contains(p.destination, condition.destination) &&
                contains(p.country, condition.country) &&
                contains(p.name, condition.name),
            ),
          );
        }
        if (where.price?.lte != null) rows = rows.filter((p) => p.price <= where.price.lte);
        if (where.id?.in) rows = rows.filter((p) => where.id.in.includes(p.id));
        rows = [...rows].sort((a, b) => a.price - b.price);
        return rows.slice(0, take ?? rows.length);
      }),
      findUnique: vi.fn(async ({ where }: any) => packages.find((p) => p.id === where.id) ?? null),
    },
    lead_submissions: {
      findFirst: vi.fn(async ({ where }: any) => {
        const found = leads.filter((l) => l.phone === where.phone);
        return found.length ? found[found.length - 1] : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: ++leadSeq, ...data };
        leads.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = leads.find((l) => l.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    callback_requests: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: ++cbSeq, ...data };
        callbacks.push(row);
        return row;
      }),
    },
    _state: { leads, callbacks },
  };
  return prisma;
}

function makeCtx(overrides?: Partial<MayaToolContext>) {
  const prisma = makeFakePrisma();
  const sendWhatsApp = vi.fn(async (_to: string, _message: string) => ({
    ok: true,
    channel: 'whatsapp' as const,
    provider: 'whatsapp_cloud',
  }));
  const logActivity = vi.fn(async () => {});
  const deps: MayaDeps = {
    prisma: prisma as unknown as PrismaClient,
    sendWhatsApp,
    logActivity,
    now: () => new Date('2026-07-22T10:00:00Z'),
  };
  const ctx: MayaToolContext = {
    channel: 'voice',
    callerPhone: '+919999912345',
    callerName: 'Test Caller',
    sessionId: 'sess-1',
    deps,
    ...overrides,
  };
  return { ctx, prisma, sendWhatsApp, logActivity };
}

describe('Maya tools — find_packages', () => {
  it('returns only real, active packages matching the destination', async () => {
    const { ctx } = makeCtx();
    const res = await dispatchTool('find_packages', { destination: 'Goa' }, ctx);
    expect(res.ok).toBe(true);
    const pkgs = res.data?.packages as any[];
    expect(pkgs.map((p) => p.id).sort()).toEqual([1, 2]); // inactive #4 excluded
    expect(res.message).toContain('Goa Beach Bliss');
  });

  it('respects the budget ceiling', async () => {
    const { ctx } = makeCtx();
    const res = await dispatchTool(
      'find_packages',
      { destination: 'Goa', maxBudgetInr: 30000 },
      ctx,
    );
    expect((res.data?.packages as any[]).map((p) => p.id)).toEqual([1]);
  });

  it('never invents a package when nothing matches', async () => {
    const { ctx } = makeCtx();
    const res = await dispatchTool('find_packages', { destination: 'Antarctica' }, ctx);
    expect(res.ok).toBe(true);
    expect(res.data?.packages).toEqual([]);
    expect(res.message.toLowerCase()).toContain('custom itinerary');
  });

  it.each(['UAE', 'UEA'])('resolves %s to United Arab Emirates inventory', async (destination) => {
    const { ctx } = makeCtx();
    const res = await dispatchTool('find_packages', { destination, keyword: 'family' }, ctx);
    expect(res.ok).toBe(true);
    expect((res.data?.packages as any[]).map((p) => p.id)).toEqual([5]);
  });
});

describe('Maya tools — capture_lead', () => {
  it('creates a new lead then de-duplicates on the same phone', async () => {
    const { ctx, prisma } = makeCtx();
    const first = await dispatchTool(
      'capture_lead',
      { name: 'Asha', destination: 'Goa', travelers: 2 },
      ctx,
    );
    expect(first.ok).toBe(true);
    expect(first.data?.isNew).toBe(true);
    expect(prisma._state.leads).toHaveLength(1);

    const second = await dispatchTool(
      'capture_lead',
      { name: 'Asha R', destination: 'Goa', budgetRange: '₹1L' },
      ctx,
    );
    expect(second.data?.isNew).toBe(false);
    expect(prisma._state.leads).toHaveLength(1); // updated, not duplicated
    expect(prisma._state.leads[0].name).toBe('Asha R');
  });
});

describe('Maya tools — send_whatsapp_summary', () => {
  it('actually dispatches a message and reports the channel', async () => {
    const { ctx, sendWhatsApp } = makeCtx();
    const res = await dispatchTool(
      'send_whatsapp_summary',
      { summary: 'Here are your Goa options.', packageIds: [1, 2] },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(sendWhatsApp).toHaveBeenCalledOnce();
    const [, body] = sendWhatsApp.mock.calls[0]!;
    expect(body).toContain('Goa Beach Bliss'); // real package names appended
    expect(body).toContain('Maya');
  });

  it('fails cleanly when there is no phone number', async () => {
    const { ctx } = makeCtx({ callerPhone: null });
    const res = await dispatchTool('send_whatsapp_summary', { summary: 'hi' }, ctx);
    expect(res.ok).toBe(false);
  });
});

describe('Maya tools — callbacks & escalation', () => {
  it('schedules a callback', async () => {
    const { ctx, prisma } = makeCtx();
    const res = await dispatchTool('schedule_callback', { name: 'Ravi' }, ctx);
    expect(res.ok).toBe(true);
    expect(prisma._state.callbacks).toHaveLength(1);
  });

  it('escalates to a human and raises an attention alert', async () => {
    const { ctx, logActivity } = makeCtx();
    const res = await dispatchTool('escalate_to_human', { reason: 'Angry about a refund' }, ctx);
    expect(res.ok).toBe(true);
    expect(logActivity).toHaveBeenCalledWith(
      'voice',
      'escalation',
      expect.anything(),
      expect.stringContaining('refund'),
      'attention',
    );
  });
});

describe('Maya tools — dispatch hardening', () => {
  it('rejects unknown tools', async () => {
    const { ctx } = makeCtx();
    const res = await dispatchTool('drop_database', {}, ctx);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Unknown tool');
  });

  it('rejects invalid arguments via the Zod guard', async () => {
    const { ctx } = makeCtx();
    const res = await dispatchTool('get_package_quote', { packageId: -5 }, ctx);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Invalid arguments');
  });
});
