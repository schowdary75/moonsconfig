import { z } from 'zod';
import type { GeminiSchema, MayaTool, MayaToolContext, MayaToolResult } from './types.js';
import { buildCustomQuote, raiseRfqForGaps } from './pricing/customQuoteService.js';
import {
  completeGovernedAction,
  failGovernedAction,
  governMayaTool,
} from './governance/actionService.js';

/**
 * Maya's tool registry — the layer that turns the conversational agent into one
 * that can actually *act*: recognise callers, search real inventory, capture
 * leads, send WhatsApp follow-ups, schedule callbacks and escalate to a human.
 *
 * Every tool has (1) a Gemini function-declaration schema the model sees and
 * (2) a Zod schema that hardens the model's arguments before they touch the
 * database. Tools never invent data — if there are no matching packages they
 * say so, so a customer is never quoted something that does not exist.
 */

// ---------- helpers ----------

const INR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const DESTINATION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  uae: ['United Arab Emirates', 'Dubai', 'Abu Dhabi'],
  uea: ['United Arab Emirates', 'Dubai', 'Abu Dhabi'],
  'united arab emirates': ['UAE', 'Dubai', 'Abu Dhabi'],
};

export function destinationSearchTerms(destination: string): string[] {
  const term = destination.trim();
  const normalized = term
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const aliases = DESTINATION_ALIASES[normalized] ?? [];
  return [...new Set([term, ...aliases].filter(Boolean))];
}

/** Prefer an explicit phone argument, else the phone the channel already knows. */
function resolvePhone(argPhone: string | undefined, ctx: MayaToolContext): string | null {
  const p = (argPhone ?? ctx.callerPhone ?? '').trim();
  return p.length >= 6 ? p : null;
}

function ok(message: string, data?: Record<string, unknown>): MayaToolResult {
  return { ok: true, message, data };
}
function fail(message: string, data?: Record<string, unknown>): MayaToolResult {
  return { ok: false, message, data };
}

// ---------- recognize_caller ----------

const recognizeCallerParams: GeminiSchema = {
  type: 'object',
  properties: {
    phone: {
      type: 'string',
      description: 'Caller phone number in E.164 form. Omit to use the current caller.',
    },
  },
};
const recognizeCallerSchema = z.object({ phone: z.string().trim().optional() });

const recognizeCaller: MayaTool = {
  name: 'recognize_caller',
  description:
    'Look up whether this phone number belongs to an existing lead so Maya can greet a returning traveller by name and reference their trip. Call this at the start of a call when a phone number is available.',
  parameters: recognizeCallerParams,
  validate: recognizeCallerSchema,
  async execute(rawArgs, ctx) {
    const args = recognizeCallerSchema.parse(rawArgs);
    const phone = resolvePhone(args.phone, ctx);
    if (!phone) return fail('No phone number is available to look up.');

    const lead = await ctx.deps.prisma.lead_submissions.findFirst({
      where: { phone },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        destination: true,
        status: true,
        travel_month: true,
        last_contacted_at: true,
      },
    });
    if (!lead) return ok('No prior record for this caller — treat as a new enquiry.');

    return ok(
      `Returning traveller: ${lead.name}, previously interested in ${lead.destination}` +
        (lead.travel_month ? ` around ${lead.travel_month}` : '') +
        ` (status: ${lead.status}).`,
      {
        leadId: lead.id,
        name: lead.name,
        destination: lead.destination,
        status: lead.status,
      },
    );
  },
};

// ---------- find_packages ----------

const findPackagesParams: GeminiSchema = {
  type: 'object',
  properties: {
    destination: {
      type: 'string',
      description: 'Destination or country the traveller mentioned, e.g. "Goa" or "Bali".',
    },
    maxBudgetInr: {
      type: 'integer',
      description: 'Optional per-package budget ceiling in INR.',
    },
    keyword: {
      type: 'string',
      description: 'Optional free-text hint to match in the package name (e.g. "honeymoon").',
    },
  },
  required: ['destination'],
};
const findPackagesSchema = z.object({
  destination: z.string().trim().min(1),
  maxBudgetInr: z.number().int().positive().optional(),
  keyword: z.string().trim().optional(),
});

const findPackages: MayaTool = {
  name: 'find_packages',
  description:
    'Search MooNs’ real, active package inventory by destination (and optional budget/keyword). Returns up to 5 genuine packages with live prices. Use this before quoting anything — never invent a package or price.',
  parameters: findPackagesParams,
  validate: findPackagesSchema,
  async execute(rawArgs, ctx) {
    const args = findPackagesSchema.parse(rawArgs);
    const term = args.destination;
    const searchTerms = destinationSearchTerms(term);

    const rows = await ctx.deps.prisma.packages.findMany({
      where: {
        is_active: true,
        OR: searchTerms.flatMap((searchTerm) => [
          { destination: { contains: searchTerm } },
          { country: { contains: searchTerm } },
          { name: { contains: searchTerm } },
        ]),
        ...(args.maxBudgetInr ? { price: { lte: args.maxBudgetInr } } : {}),
      },
      orderBy: { price: 'asc' },
      take: 8,
      select: {
        id: true,
        name: true,
        destination: true,
        country: true,
        days: true,
        nights: true,
        price: true,
        category: true,
      },
    });

    const keyword = args.keyword?.toLowerCase();
    const matches = (
      keyword ? rows.filter((r) => r.name.toLowerCase().includes(keyword)) : rows
    ).slice(0, 5);

    if (matches.length === 0) {
      return ok(
        `No active packages currently match "${term}"${
          args.maxBudgetInr ? ` under ${INR(args.maxBudgetInr)}` : ''
        }. Offer to have a specialist build a custom itinerary instead.`,
        { packages: [] },
      );
    }

    const summary = matches
      .map(
        (p) => `#${p.id} ${p.name} — ${p.days}D/${p.nights}N ${p.category}, from ${INR(p.price)}`,
      )
      .join('; ');
    return ok(`Found ${matches.length} package(s): ${summary}.`, { packages: matches });
  },
};

// ---------- get_package_quote ----------

const getPackageQuoteParams: GeminiSchema = {
  type: 'object',
  properties: {
    packageId: { type: 'integer', description: 'Id of the package to quote (from find_packages).' },
    travelers: { type: 'integer', description: 'Number of travellers. Defaults to 2.' },
  },
  required: ['packageId'],
};
const getPackageQuoteSchema = z.object({
  packageId: z.number().int().positive(),
  travelers: z.number().int().positive().max(50).default(2),
});

const getPackageQuote: MayaTool = {
  name: 'get_package_quote',
  description:
    'Produce an indicative price for a specific package and traveller count using the real per-package price from inventory. The figure is a starting indication, not a final locked fare.',
  parameters: getPackageQuoteParams,
  validate: getPackageQuoteSchema,
  async execute(rawArgs, ctx) {
    const args = getPackageQuoteSchema.parse(rawArgs);
    const pkg = await ctx.deps.prisma.packages.findUnique({
      where: { id: args.packageId },
      select: { id: true, name: true, price: true, days: true, nights: true, is_active: true },
    });
    if (!pkg || !pkg.is_active) return fail('That package is not available.');

    const indicativeTotal = pkg.price * args.travelers;
    return ok(
      `${pkg.name}: ${INR(pkg.price)} per person, indicative total ${INR(indicativeTotal)} for ` +
        `${args.travelers} traveller(s) (${pkg.days}D/${pkg.nights}N). Confirm exact fare after dates and availability.`,
      { packageId: pkg.id, perPerson: pkg.price, travelers: args.travelers, indicativeTotal },
    );
  },
};

// ---------- capture_lead ----------

const captureLeadParams: GeminiSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: "Traveller's name." },
    phone: { type: 'string', description: 'Phone in E.164. Omit to use the current caller.' },
    email: { type: 'string', description: 'Email if provided.' },
    destination: { type: 'string', description: 'Destination they want to travel to.' },
    travelMonth: { type: 'string', description: 'Rough travel timing, e.g. "December".' },
    travelers: { type: 'integer', description: 'Party size.' },
    budgetRange: { type: 'string', description: 'Budget band they mentioned, if any.' },
    notes: { type: 'string', description: 'Anything else worth capturing for the sales team.' },
  },
  required: ['name', 'destination'],
};
const captureLeadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  phone: z.string().trim().optional(),
  email: z.string().trim().max(255).optional(),
  destination: z.string().trim().min(1).max(255),
  travelMonth: z.string().trim().max(80).optional(),
  travelers: z.number().int().positive().max(50).optional(),
  budgetRange: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
});

const captureLead: MayaTool = {
  name: 'capture_lead',
  description:
    'Save (or update) this enquiry as a lead in the CRM so the sales team follows up and nothing is lost. Call this once you have a name and destination. Reuses the existing lead for a known phone number instead of creating duplicates.',
  parameters: captureLeadParams,
  validate: captureLeadSchema,
  async execute(rawArgs, ctx) {
    const args = captureLeadSchema.parse(rawArgs);
    const phone = resolvePhone(args.phone, ctx) ?? '';
    const source = `maya_${ctx.channel}`;
    const now = ctx.deps.now();

    const existing = phone
      ? await ctx.deps.prisma.lead_submissions.findFirst({
          where: { phone },
          orderBy: { created_at: 'desc' },
          select: { id: true },
        })
      : null;

    let leadId: number;
    if (existing) {
      await ctx.deps.prisma.lead_submissions.update({
        where: { id: existing.id },
        data: {
          name: args.name,
          destination: args.destination,
          ...(args.email ? { email: args.email } : {}),
          ...(args.travelMonth ? { travel_month: args.travelMonth } : {}),
          ...(args.travelers ? { travelers_count: args.travelers } : {}),
          ...(args.budgetRange ? { budget_range: args.budgetRange } : {}),
          ...(args.notes ? { notes: args.notes } : {}),
          ai_managed: true,
          last_contacted_at: now,
          updated_at: now,
        },
      });
      leadId = existing.id;
    } else {
      const created = await ctx.deps.prisma.lead_submissions.create({
        data: {
          name: args.name,
          phone,
          email: args.email ?? '',
          destination: args.destination,
          travel_month: args.travelMonth ?? null,
          travelers_count: args.travelers ?? 2,
          budget_range: args.budgetRange ?? 'Not specified',
          notes: args.notes ?? null,
          lead_source: source,
          status: 'new',
          ai_managed: true,
          last_contacted_at: now,
        },
        select: { id: true },
      });
      leadId = created.id;
    }

    await ctx.deps.logActivity(
      'leads',
      existing ? 'lead_updated' : 'lead_captured',
      leadId,
      `Maya (${ctx.channel}) ${existing ? 'updated' : 'captured'} lead "${args.name}" for ${args.destination}.`,
    );
    return ok(`Lead ${existing ? 'updated' : 'captured'} (#${leadId}). The team will follow up.`, {
      leadId,
      isNew: !existing,
    });
  },
};

// ---------- send_whatsapp_summary ----------

const sendWhatsAppParams: GeminiSchema = {
  type: 'object',
  properties: {
    phone: { type: 'string', description: 'Recipient phone in E.164. Omit to use the caller.' },
    summary: {
      type: 'string',
      description: 'The message body to send the traveller (their trip details / next steps).',
    },
    packageIds: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Optional package ids to append with real names and prices.',
    },
  },
  required: ['summary'],
};
const sendWhatsAppSchema = z.object({
  phone: z.string().trim().optional(),
  summary: z.string().trim().min(1).max(2000),
  packageIds: z.array(z.number().int().positive()).max(5).optional(),
});

const sendWhatsAppSummary: MayaTool = {
  name: 'send_whatsapp_summary',
  description:
    'Send the traveller a WhatsApp message with their trip summary and any package details. This is how Maya delivers the "I’ll send it to you on WhatsApp" promise — it actually goes out (falling back to SMS if WhatsApp is unavailable).',
  parameters: sendWhatsAppParams,
  validate: sendWhatsAppSchema,
  async execute(rawArgs, ctx) {
    const args = sendWhatsAppSchema.parse(rawArgs);
    const phone = resolvePhone(args.phone, ctx);
    if (!phone) return fail('No phone number is available to send to.');

    let body = args.summary;
    if (args.packageIds?.length) {
      const pkgs = await ctx.deps.prisma.packages.findMany({
        where: { id: { in: args.packageIds }, is_active: true },
        select: { id: true, name: true, days: true, nights: true, price: true },
      });
      if (pkgs.length) {
        body +=
          '\n\nOptions:\n' +
          pkgs
            .map((p) => `• ${p.name} (${p.days}D/${p.nights}N) — from ${INR(p.price)}`)
            .join('\n');
      }
    }
    body += '\n\n— Maya, MooNs Travel';

    const delivery = await ctx.deps.sendWhatsApp(phone, body);
    await ctx.deps.logActivity(
      'followups',
      'whatsapp_sent',
      null,
      `Maya sent a trip summary to ${phone} via ${delivery.channel}.`,
      delivery.ok ? 'done' : 'attention',
    );
    if (!delivery.ok)
      return fail(`Could not deliver the message (${delivery.error ?? 'unknown'}).`);
    return ok(`Sent via ${delivery.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.`, {
      channel: delivery.channel,
    });
  },
};

// ---------- schedule_callback ----------

const scheduleCallbackParams: GeminiSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: "Traveller's name." },
    phone: { type: 'string', description: 'Phone in E.164. Omit to use the caller.' },
    destination: { type: 'string', description: 'Destination of interest, if relevant.' },
    preferredTime: { type: 'string', description: 'When they would like to be called back.' },
  },
  required: ['name'],
};
const scheduleCallbackSchema = z.object({
  name: z.string().trim().min(1).max(255),
  phone: z.string().trim().optional(),
  destination: z.string().trim().max(255).optional(),
  preferredTime: z.string().trim().max(120).optional(),
});

const scheduleCallback: MayaTool = {
  name: 'schedule_callback',
  description:
    'Queue a callback request so a human agent rings the traveller back. Use when the traveller asks to be called later or wants to speak to a person about something Maya cannot finish now.',
  parameters: scheduleCallbackParams,
  validate: scheduleCallbackSchema,
  async execute(rawArgs, ctx) {
    const args = scheduleCallbackSchema.parse(rawArgs);
    const phone = resolvePhone(args.phone, ctx);
    if (!phone) return fail('No phone number is available to schedule a callback.');

    const created = await ctx.deps.prisma.callback_requests.create({
      data: {
        name: args.name,
        phone,
        destination: args.destination ?? null,
        status: 'pending',
      },
      select: { id: true },
    });
    await ctx.deps.logActivity(
      'followups',
      'callback_scheduled',
      created.id,
      `Maya scheduled a callback for ${args.name} (${phone})` +
        (args.preferredTime ? ` — preferred: ${args.preferredTime}` : '') +
        '.',
    );
    return ok(`Callback booked (#${created.id}). A specialist will call back.`, {
      callbackId: created.id,
    });
  },
};

// ---------- escalate_to_human ----------

const escalateParams: GeminiSchema = {
  type: 'object',
  properties: {
    reason: { type: 'string', description: 'Why this needs a human right now.' },
    name: { type: 'string', description: "Traveller's name, if known." },
    phone: { type: 'string', description: 'Phone in E.164. Omit to use the caller.' },
  },
  required: ['reason'],
};
const escalateSchema = z.object({
  reason: z.string().trim().min(1).max(600),
  name: z.string().trim().max(255).optional(),
  phone: z.string().trim().optional(),
});

const escalateToHuman: MayaTool = {
  name: 'escalate_to_human',
  description:
    'Flag the conversation for urgent human attention (complaint, upset customer, complex change, anything beyond Maya). Creates a priority callback and raises an alert in Mission Control.',
  parameters: escalateParams,
  validate: escalateSchema,
  async execute(rawArgs, ctx) {
    const args = escalateSchema.parse(rawArgs);
    const phone = resolvePhone(args.phone, ctx);
    const name = args.name ?? ctx.callerName ?? 'Caller';

    let callbackId: number | null = null;
    if (phone) {
      const created = await ctx.deps.prisma.callback_requests.create({
        data: { name, phone, destination: null, status: 'pending' },
        select: { id: true },
      });
      callbackId = created.id;
    }
    await ctx.deps.logActivity(
      'voice',
      'escalation',
      callbackId,
      `Maya escalated to a human: ${args.reason} (${name}${phone ? `, ${phone}` : ''}).`,
      'attention',
    );
    return ok('A human specialist has been alerted and will take over shortly.', { callbackId });
  },
};

// ---------- find_catalog_items (real ids for build_custom_quote) ----------

const findCatalogParams: GeminiSchema = {
  type: 'object',
  properties: {
    catalogType: {
      type: 'string',
      enum: ['stay', 'room', 'activity', 'car'],
      description: 'Which kind of component to search.',
    },
    destination: { type: 'string', description: 'Destination or city, e.g. "Goa".' },
    keyword: { type: 'string', description: 'Optional name filter.' },
  },
  required: ['catalogType', 'destination'],
};
const findCatalogSchema = z.object({
  catalogType: z.enum(['stay', 'room', 'activity', 'car']),
  destination: z.string().trim().min(1),
  keyword: z.string().trim().optional(),
});

const findCatalogItems: MayaTool = {
  name: 'find_catalog_items',
  description:
    'Search the real catalogue (stays, rooms, activities, cars) by destination to obtain genuine catalog ids. Feed those ids into build_custom_quote — never invent an id or a price.',
  parameters: findCatalogParams,
  validate: findCatalogSchema,
  async execute(rawArgs, ctx) {
    const args = findCatalogSchema.parse(rawArgs);
    const where = {
      status: 'active' as const,
      destination: { contains: args.destination },
      ...(args.keyword ? { name: { contains: args.keyword } } : {}),
    };
    const q = {
      where,
      take: 6,
      orderBy: { name: 'asc' as const },
      select: { id: true, name: true },
    };
    const rows =
      args.catalogType === 'stay'
        ? await ctx.deps.prisma.master_stays.findMany(q)
        : args.catalogType === 'room'
          ? await ctx.deps.prisma.master_rooms.findMany(q)
          : args.catalogType === 'activity'
            ? await ctx.deps.prisma.master_activities.findMany(q)
            : await ctx.deps.prisma.master_cars.findMany(q);

    if (rows.length === 0) {
      return ok(
        `No ${args.catalogType} options on file for ${args.destination}. Offer a custom build — the team can source one via RFQ.`,
        { items: [] },
      );
    }
    const items = rows.map((r) => ({
      catalogType: args.catalogType,
      catalogId: r.id,
      name: r.name,
    }));
    return ok(
      `Found ${items.length} ${args.catalogType}(s) in ${args.destination}: ${items
        .map((i) => `#${i.catalogId} ${i.name}`)
        .join('; ')}.`,
      { items },
    );
  },
};

// ---------- build_custom_quote (rate-card-backed, never firm-quotes gaps) ----------

const buildQuoteParams: GeminiSchema = {
  type: 'object',
  properties: {
    travelDate: { type: 'string', description: 'Trip start date, ISO e.g. 2026-12-10.' },
    travelers: { type: 'integer', description: 'Number of travellers.' },
    items: {
      type: 'array',
      description: 'Real catalog components to price (resolved catalog ids only — never invented).',
      items: {
        type: 'object',
        properties: {
          catalogType: { type: 'string', enum: ['stay', 'room', 'activity', 'car'] },
          catalogId: { type: 'integer', description: 'Real id from the catalogue.' },
          quantity: {
            type: 'number',
            description: 'Units: nights for stays/rooms, count for activities/cars.',
          },
          label: { type: 'string', description: 'Human label for the line.' },
        },
        required: ['catalogType', 'catalogId', 'quantity'],
      },
    },
  },
  required: ['travelDate', 'travelers', 'items'],
};
const buildQuoteSchema = z.object({
  travelDate: z.string().min(1),
  travelers: z.number().int().positive().max(50),
  items: z
    .array(
      z.object({
        catalogType: z.enum(['stay', 'room', 'activity', 'car']),
        catalogId: z.number().int().positive(),
        quantity: z.number().positive().max(1000),
        label: z.string().trim().max(160).optional(),
      }),
    )
    .min(1)
    .max(30),
});

const buildCustomQuoteTool: MayaTool = {
  name: 'build_custom_quote',
  description:
    'Assemble a custom itinerary quote (stays, transport, activities) priced ONLY from real, active, in-validity rate cards. If any component lacks a live rate, the quote stays INDICATIVE and Maya must not present it as a firm price — this tool auto-raises a supplier RFQ for the gaps and tells the traveller the team will confirm the final price. Never invent prices; only a fully rate-card-backed quote is firm.',
  parameters: buildQuoteParams,
  validate: buildQuoteSchema,
  async execute(rawArgs, ctx) {
    const args = buildQuoteSchema.parse(rawArgs);
    const travelDate = new Date(args.travelDate);
    if (Number.isNaN(travelDate.getTime())) return fail('That travel date is not valid.');

    const quote = await buildCustomQuote(ctx.deps, {
      travelers: args.travelers,
      travelDate,
      items: args.items,
    });
    if (quote.gaps.length > 0) await raiseRfqForGaps(ctx.deps, quote.gaps);

    await ctx.deps.logActivity(
      'quotes',
      'custom_quote_built',
      null,
      `Maya built a ${quote.confidence} custom quote (${quote.lines.length} lines, ${quote.gaps.length} gap(s)).`,
      quote.confidence === 'confirmed' ? 'done' : 'attention',
    );

    const money = quote.currency
      ? `${quote.currency} ${quote.totalSelling.toLocaleString()}`
      : `${quote.totalSelling}`;
    if (quote.confidence === 'confirmed') {
      return ok(
        `Firm custom quote ready: ${money} for ${args.travelers} traveller(s) — all ${quote.lines.length} components are rate-card-backed.`,
        {
          confidence: 'confirmed',
          totalSelling: quote.totalSelling,
          currency: quote.currency,
          lines: quote.lines.length,
        },
      );
    }
    const gapLabels = quote.gaps.map((g) => g.label).join(', ');
    return ok(
      `I can give an indicative figure of about ${money} from the rates we have, but ${quote.gaps.length} part(s) (${gapLabels}) need a live supplier rate. I've asked our team to confirm those, so I can't lock this as a final price yet — they'll send the confirmed quote shortly.`,
      {
        confidence: 'indicative',
        indicativeTotal: quote.totalSelling,
        currency: quote.currency,
        gaps: quote.gaps.map((g) => ({ label: g.label, reason: g.gapReason })),
      },
    );
  },
};

// ---------- registry ----------

export const mayaTools: MayaTool[] = [
  recognizeCaller,
  findPackages,
  getPackageQuote,
  captureLead,
  sendWhatsAppSummary,
  scheduleCallback,
  escalateToHuman,
  findCatalogItems,
  buildCustomQuoteTool,
];

const toolsByName = new Map(mayaTools.map((t) => [t.name, t]));

/** Gemini `tools` payload (one entry with all function declarations). */
export function toGeminiTools() {
  return [
    {
      functionDeclarations: mayaTools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

/**
 * Validate + execute a tool call the model produced. Never throws — every
 * failure comes back as a `MayaToolResult` the model can read and recover from.
 */
export async function dispatchTool(
  name: string,
  rawArgs: unknown,
  ctx: MayaToolContext,
): Promise<MayaToolResult> {
  const tool = toolsByName.get(name);
  if (!tool) return fail(`Unknown tool "${name}".`);

  const parsed = tool.validate.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return fail(`Invalid arguments for ${name}: ${issues.join('; ')}.`);
  }

  let proposalId: string | null = null;
  try {
    const governed = await governMayaTool(name, parsed.data, ctx);
    if (!governed.execute) return governed.result;
    proposalId = governed.proposalId;
    const result = await tool.execute(parsed.data, ctx);
    await completeGovernedAction(proposalId, result, ctx);
    return result;
  } catch (error) {
    await failGovernedAction(proposalId, error, ctx);
    return fail(
      `Tool ${name} failed: ${error instanceof Error ? error.message : 'unexpected error'}.`,
    );
  }
}

/** Execute an already-approved proposal without creating another proposal. */
export async function executeApprovedTool(
  name: string,
  rawArgs: unknown,
  ctx: MayaToolContext,
): Promise<MayaToolResult> {
  const tool = toolsByName.get(name);
  if (!tool) return fail(`Unknown tool "${name}".`);
  const parsed = tool.validate.safeParse(rawArgs ?? {});
  if (!parsed.success) return fail(`Approved action ${name} contains invalid arguments.`);
  try {
    return await tool.execute(parsed.data, ctx);
  } catch (error) {
    return fail(
      `Tool ${name} failed: ${error instanceof Error ? error.message : 'unexpected error'}.`,
    );
  }
}
