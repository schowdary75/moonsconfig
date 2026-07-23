// @ts-nocheck -- behavior-parity adapter retained until domain-by-domain type hardening.
import { defineOperation } from './defineOperation.js';
import { z } from 'zod';
import { OUTBOUND, DOMESTIC, type TrendDestination } from '../legacy/travel-trends-data.js';
import { requireAdmin, withMayaGeminiRotation } from '../legacy/api/db.functions.server.js';
import { prisma } from '../config/prisma.js';
import { camelCaseRow, camelCaseRows } from '../utils/rowCase.js';

const SITE_BASE_URL = process.env.MOONS_PUBLIC_URL || 'https://moons.com';

const AuthShape = z.object({ email: z.string(), sessionToken: z.string() });

type CampaignVertical = 'outbound' | 'inbound' | 'domestic';
type CampaignTrend = TrendDestination & {
  vertical: CampaignVertical;
  targetLocations: string[];
  languages: string[];
};

// ---------- helpers ----------

function clamp(text: string, max: number): string {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanStringArray(value: unknown, max: number, count: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === 'string' && v.trim().length > 0)
    .map((v) => clamp(v as string, max))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, count);
}

async function logMayaActivity(action: string, summary: string) {
  try {
    await prisma.maya_activity_log.create({
      data: { action, summary, area: 'marketing', status: 'done' },
    });
  } catch {
    // activity log is best-effort
  }
}

// ---------- deterministic blueprint (always valid; AI enhances on top) ----------

const NEGATIVE_KEYWORDS_DEFAULT = [
  'jobs',
  'visa only',
  'free',
  'wikipedia',
  'news',
  'weather',
  'salary',
  'study',
];

function buildMetaCopy(trend: CampaignTrend) {
  const n = trend.name;
  if (trend.vertical === 'inbound') {
    return {
      primaryTexts: [
        clamp(trend.angle, 125),
        clamp(
          `Discover ${n} with private guides, curated stays and one trusted India travel specialist.`,
          125,
        ),
        clamp(
          `Planning an India journey? Explore ${n} with thoughtful pacing, seamless transfers and local support.`,
          125,
        ),
      ],
      headlines: [
        clamp(`Private ${n} Tours`, 40),
        clamp(`Discover ${n}, India`, 40),
        clamp(`Your India Trip, Curated`, 40),
        clamp(`Plan ${n} With Local Experts`, 40),
        clamp(`Request A Private Itinerary`, 40),
      ],
      descriptions: [
        clamp('Trusted India specialists.', 30),
        clamp('Get a tailored itinerary.', 30),
      ],
    };
  }
  return {
    primaryTexts: [
      clamp(trend.angle, 125),
      clamp(
        `${n} is trending with Indian travellers right now. Handcrafted itineraries, dedicated trip buddy, zero stress. Enquire today!`,
        125,
      ),
      clamp(
        `Planning ${n}? MooNs experts build your perfect trip — stays, transfers & experiences included. Get a free quote.`,
        125,
      ),
    ],
    headlines: [
      clamp(`${n} Packages from India`, 40),
      clamp(`Book Your ${n} Trip`, 40),
      clamp(`${n} — Curated by MooNs`, 40),
      clamp(`Custom ${n} Itineraries`, 40),
      clamp(`${n} Deals This Season`, 40),
    ],
    descriptions: [clamp('Limited seasonal offers.', 30), clamp(`Talk to a ${n} expert.`, 30)],
  };
}

function buildRsaCopy(trend: CampaignTrend) {
  const n = trend.name;
  if (trend.vertical === 'inbound') {
    return {
      headlines: [
        `Private ${n} Tours`,
        `Discover ${n} India`,
        `Tailor-Made India Tours`,
        `Trusted India Tour Experts`,
        `Plan Your India Journey`,
        `${n} With Private Guide`,
        `Luxury India Itineraries`,
        `Local India Travel Experts`,
        `Curated ${n} Holidays`,
        `India Tours Made Personal`,
        `Request A Private Quote`,
        `Handpicked India Stays`,
        `Seamless Private Transfers`,
        `English Speaking Guides`,
        `Build Your India Itinerary`,
      ].map((headline) => clamp(headline, 30)),
      descriptions: [
        clamp(`Explore ${n} with private guides, curated stays and seamless local support.`, 90),
        clamp('Tailor-made India journeys from a trusted local destination specialist.', 90),
        clamp(trend.angle, 90),
        clamp('Share your dates and interests. Receive a thoughtful private itinerary.', 90),
      ],
    };
  }
  return {
    headlines: [
      `${n} Tour Packages`,
      `Book ${n} Packages`,
      `${n} Packages From India`,
      `Customised ${n} Trips`,
      `Luxury ${n} Holidays`,
      `${n} Honeymoon Packages`,
      `Best ${n} Deals 2026`,
      `Plan Your ${n} Trip`,
      `${n} Family Packages`,
      `Expert ${n} Trip Planners`,
      `MooNs Travel — ${n}`,
      `${n} Group Tours`,
      `24x7 On-Trip Support`,
      `Free ${n} Quote Today`,
      `Flexible EMI Options`,
    ].map((h) => clamp(h, 30)),
    descriptions: [
      clamp(
        `Handcrafted ${n} itineraries with stays, transfers & experiences. Get a free quote.`,
        90,
      ),
      clamp(
        'Trusted Indian travel experts. Transparent pricing. Dedicated trip buddy from day one.',
        90,
      ),
      clamp(trend.angle, 90),
      clamp(`Flexible payments & 24x7 support. Plan your ${n} escape with MooNs today.`, 90),
    ],
  };
}

// ---------- AI enhancement ----------

interface AiBlueprint {
  thesis?: string;
  personas?: {
    destination: string;
    name: string;
    description: string;
    metaInterests: string[];
    googleInMarket: string[];
  }[];
  copyByDestination?: Record<
    string,
    {
      primaryTexts?: string[];
      metaHeadlines?: string[];
      metaDescriptions?: string[];
      rsaHeadlines?: string[];
      rsaDescriptions?: string[];
    }
  >;
  negativeKeywords?: string[];
}

async function askMayaForBlueprint(
  trends: CampaignTrend[],
  goal: string,
  budget: number,
  platform: string,
): Promise<AiBlueprint | null> {
  const context = trends.map((t) => ({
    name: t.name,
    vertical: t.vertical,
    targetLocations: t.targetLocations,
    languages: t.languages,
    audience: t.audience,
    angle: t.angle,
    metaInterests: t.metaInterests,
    googleKeywords: t.googleKeywords,
    growthSignal: t.growthSignal,
    trajectory: t.trajectory,
  }));

  const verticalBrief = trends.some((trend) => trend.vertical === 'inbound')
    ? 'foreign travellers considering private, guided journeys to India. Use destination-specialist/DMC positioning and source-market appropriate language.'
    : 'Indian travellers considering outbound international or domestic holidays.';

  const prompt = `You are Maya, MooNs Travel's senior performance marketing manager for ${verticalBrief}
Platform: ${platform === 'meta' ? 'Meta (Facebook/Instagram) Ads' : 'Google Ads Search'}. Goal: ${goal}. Monthly budget: INR ${budget}.
Destinations with demand research: ${JSON.stringify(context)}

Return STRICT JSON (no markdown) with this exact shape:
{
  "thesis": "2-3 sentence why-now media thesis citing the demand signals",
  "personas": [{ "destination": "...", "name": "...", "description": "1 sentence", "metaInterests": ["ONLY real Meta detailed-targeting interest names"], "googleInMarket": ["real Google in-market segment names"] }],
  "copyByDestination": { "<destination name>": {
      "primaryTexts": ["3 Meta primary texts, each under 125 chars, target-market appropriate and benefit-led"],
      "metaHeadlines": ["5 Meta headlines under 40 chars"],
      "metaDescriptions": ["2 Meta link descriptions under 30 chars"],
      "rsaHeadlines": ["15 Google RSA headlines under 30 chars, mix keyword/benefit/CTA"],
      "rsaDescriptions": ["4 Google RSA descriptions under 90 chars"]
  }},
  "negativeKeywords": ["8 negative keywords for travel package search campaigns"]
}
Rules: 2 personas per destination. Match the traveller perspective, language and geo to each supplied vertical and target market. Copy must never exceed the char limits. No emojis in Google copy. Treat the INR amount as the advertiser's internal media budget, not a package price.`;

  try {
    const raw = await withMayaGeminiRotation<string>(
      'gemini-2.5-flash',
      async (model) => {
        const result = await model.generateContent(prompt);
        return result.response.text();
      },
      { generationConfig: { responseMimeType: 'application/json', temperature: 0.7 } },
    );
    return JSON.parse(raw) as AiBlueprint;
  } catch (error) {
    console.warn('[Maya] AI blueprint generation failed, using deterministic fallback:', error);
    return null;
  }
}

// ---------- generate campaign ----------

const TrendContextShape = z.object({
  name: z.string().trim().min(1).max(160),
  region: z.string().trim().min(1).max(120),
  vertical: z.enum(['outbound', 'inbound', 'domestic']),
  demand: z.enum(['explosive', 'very_high', 'high', 'rising']),
  confidence: z.enum(['proven', 'confirmed', 'breakout']),
  trajectory: z.string().trim().min(1).max(1_200),
  growthSignal: z.string().trim().min(1).max(600),
  source: z.string().trim().min(1).max(240),
  entry: z.string().trim().max(240).optional(),
  bestMonths: z.string().trim().min(1).max(240),
  adWindow: z.string().trim().min(1).max(240),
  budget: z.string().trim().min(1).max(240),
  audience: z.string().trim().min(1).max(800),
  angle: z.string().trim().min(1).max(800),
  googleKeywords: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  metaInterests: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  targetLocations: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  languages: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
});

export const mayaCampaignRequestSchema = z.object({
  auth: AuthShape,
  destinations: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
  budget: z.number().positive(),
  goal: z.string().trim().min(1).max(80),
  platform: z.enum(['meta', 'google']),
  trendContexts: z.array(TrendContextShape).max(12).optional(),
});

export function resolveMayaCampaignTrends(
  destinationNames: string[],
  trendContexts: z.infer<typeof TrendContextShape>[] = [],
): CampaignTrend[] {
  const supplied = new Map(
    trendContexts.map((context) => [
      context.name,
      {
        name: context.name,
        region: context.region,
        demand: context.demand,
        confidence: context.confidence,
        trajectory: context.trajectory,
        growthSignal: context.growthSignal,
        source: context.source,
        visa: context.entry,
        bestMonths: context.bestMonths,
        adWindow: context.adWindow,
        budget: context.budget,
        audience: context.audience,
        angle: context.angle,
        googleKeywords: context.googleKeywords,
        metaInterests: context.metaInterests,
        vertical: context.vertical,
        targetLocations: context.targetLocations,
        languages: context.languages,
      } satisfies CampaignTrend,
    ]),
  );
  const builtIn = new Map<string, CampaignTrend>([
    ...OUTBOUND.map(
      (trend) =>
        [
          trend.name,
          {
            ...trend,
            vertical: 'outbound',
            targetLocations: ['India'],
            languages: ['English', 'Hindi'],
          },
        ] as const,
    ),
    ...DOMESTIC.map(
      (trend) =>
        [
          trend.name,
          {
            ...trend,
            vertical: 'domestic',
            targetLocations: ['India'],
            languages: ['English', 'Hindi'],
          },
        ] as const,
    ),
  ]);

  return destinationNames
    .map((name) => supplied.get(name) || builtIn.get(name))
    .filter((trend): trend is CampaignTrend => Boolean(trend));
}

export const adminGenerateMayaCampaign = defineOperation({ method: 'POST' })
  .validator(mayaCampaignRequestSchema)
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const trends = resolveMayaCampaignTrends(data.destinations, data.trendContexts);
    if (trends.length === 0)
      throw new Error(`No trend data found for: ${data.destinations.join(', ')}`);

    const isMeta = data.platform === 'meta';
    const goalKey = data.goal.toLowerCase();
    const metaObjective =
      goalKey.includes('sale') || goalKey.includes('book')
        ? 'OUTCOME_SALES'
        : goalKey.includes('traffic')
          ? 'OUTCOME_TRAFFIC'
          : 'OUTCOME_LEADS';
    const pixelEvent = metaObjective === 'OUTCOME_SALES' ? 'Purchase' : 'Lead';
    const monthTag = new Date()
      .toLocaleString('en-us', { month: 'short', year: '2-digit' })
      .replace(' ', '');

    // 1. AI research + copy (falls back silently to deterministic templates)
    const ai = await askMayaForBlueprint(trends, data.goal, data.budget, data.platform);

    const personas = (
      ai?.personas?.length
        ? ai.personas
        : trends.flatMap((t) => [
            {
              destination: t.name,
              name: `High-intent ${t.audience.split(',')[0] || 'traveller'}`,
              description: `Travellers responding to: ${t.angle}`,
              metaInterests: t.metaInterests,
              googleInMarket: [`Trips to ${t.name}`, 'Air Travel', 'Package Tours'],
            },
          ])
    ).map((p) => ({
      ...p,
      metaInterests: cleanStringArray(p.metaInterests, 80, 10),
      googleInMarket: cleanStringArray(p.googleInMarket, 80, 6),
      needsVerification: true, // interest names must be confirmed in the real Ads Manager picker
    }));

    const negativeKeywords = cleanStringArray(ai?.negativeKeywords, 40, 12).length
      ? cleanStringArray(ai?.negativeKeywords, 40, 12)
      : NEGATIVE_KEYWORDS_DEFAULT;
    const campaignLocations = cleanStringArray(
      trends.flatMap((trend) => trend.targetLocations),
      120,
      20,
    );
    const campaignLanguages = cleanStringArray(
      trends.flatMap((trend) => trend.languages),
      80,
      12,
    );

    const researchJson = JSON.stringify({
      thesis:
        ai?.thesis ||
        `${trends.map((t) => t.name).join(', ')}: ${trends.map((t) => t.growthSignal).join(' · ')}. Demand signals justify immediate ${data.platform} investment at ₹${data.budget.toLocaleString('en-IN')}/month.`,
      personas,
      sources: trends.map((t) => t.source),
      verticals: [...new Set(trends.map((trend) => trend.vertical))],
      targetLocations: campaignLocations,
      languages: campaignLanguages,
      aiGenerated: !!ai,
      generatedAt: new Date().toISOString(),
    });

    // 2. Campaign shell
    const destSlug = slugify(trends.map((t) => t.name).join('-'));
    const campaignName = `MooNs_${data.platform.toUpperCase()}_${trends.map((t) => t.name.replace(/\s+/g, '')).join('-')}_${data.goal}_${monthTag}`;

    const insertedCampaign = await prisma.ad_campaigns.create({
      data: {
        platform: data.platform as any,
        destination: trends.map((t) => t.name).join(', '),
        objective: data.goal,
        buying_type: 'auction',
        special_ad_category: 'NONE',
        budget_type: isMeta ? 'cbo' : 'daily',
        budget_amount: data.budget.toString(),
        bid_strategy: isMeta ? 'LOWEST_COST_WITHOUT_CAP' : 'MAXIMIZE_CONVERSIONS',
        status: 'ready_to_clone',
        name: campaignName,
        research_json: researchJson,
        settings_json: JSON.stringify({
          campaignObjective: isMeta ? metaObjective : 'SEARCH',
          specialAdCategories: 'NONE',
          networks: isMeta
            ? undefined
            : { googleSearch: true, searchPartners: false, displayNetwork: false },
          locations: campaignLocations,
          languages: campaignLanguages,
          negativeKeywords: isMeta ? undefined : negativeKeywords,
          advantageCampaignBudget: isMeta || undefined,
        }),
      },
    });
    const campaignId = insertedCampaign.id;

    // 3. Ad sets / ad groups + creatives — built per trend object (no name parsing)
    const prospectingBudget = Math.round((data.budget * (isMeta ? 0.7 : 1)) / trends.length);

    for (const trend of trends) {
      const persona = personas.find((p) => p.destination === trend.name) || personas[0];
      const aiCopy = ai?.copyByDestination?.[trend.name];
      const metaCopy = buildMetaCopy(trend);
      const rsaCopy = buildRsaCopy(trend);

      const primaryTexts =
        cleanStringArray(aiCopy?.primaryTexts, 125, 3).length >= 2
          ? cleanStringArray(aiCopy?.primaryTexts, 125, 3)
          : metaCopy.primaryTexts;
      const metaHeadlines =
        cleanStringArray(aiCopy?.metaHeadlines, 40, 5).length >= 3
          ? cleanStringArray(aiCopy?.metaHeadlines, 40, 5)
          : metaCopy.headlines;
      const metaDescriptions =
        cleanStringArray(aiCopy?.metaDescriptions, 30, 2).length >= 1
          ? cleanStringArray(aiCopy?.metaDescriptions, 30, 2)
          : metaCopy.descriptions;
      const rsaHeadlines =
        cleanStringArray(aiCopy?.rsaHeadlines, 30, 15).length >= 10
          ? cleanStringArray(aiCopy?.rsaHeadlines, 30, 15)
          : rsaCopy.headlines;
      const rsaDescriptions =
        cleanStringArray(aiCopy?.rsaDescriptions, 90, 4).length >= 3
          ? cleanStringArray(aiCopy?.rsaDescriptions, 90, 4)
          : rsaCopy.descriptions;

      const destPath = slugify(trend.name);
      const utm = (adSetSlug: string) =>
        `utm_source=${isMeta ? 'facebook' : 'google'}&utm_medium=${isMeta ? 'paid_social' : 'cpc'}&utm_campaign=moons_${destSlug}_${slugify(data.goal)}&utm_content=${adSetSlug}`;
      const finalUrl = `${SITE_BASE_URL}/destinations/${destPath}`;

      const adSetDefs = isMeta
        ? [
            {
              name: `${trend.name} — Interest Stack`,
              audienceJson: JSON.stringify({
                locations: trend.targetLocations,
                age_min: 25,
                age_max: 54,
                genders: 'All',
                detailed_targeting: persona.metaInterests.length
                  ? persona.metaInterests
                  : trend.metaInterests,
                custom_audiences: [],
                advantage_audience: false,
              }),
            },
            {
              name: `${trend.name} — Broad Advantage+`,
              audienceJson: JSON.stringify({
                locations: trend.targetLocations,
                age_min: 22,
                age_max: 60,
                genders: 'All',
                detailed_targeting: [],
                custom_audiences: [],
                advantage_audience: true,
              }),
            },
          ]
        : [
            {
              name: `${trend.name} — Search`,
              audienceJson: JSON.stringify({
                locations: trend.targetLocations,
                languages: trend.languages,
                audience_signals: persona.googleInMarket,
              }),
            },
          ];

      for (const def of adSetDefs) {
        const insertedAdSet = await prisma.ad_sets.create({
          data: {
            campaign_id: campaignId,
            name: def.name,
            conversion_location: 'WEBSITE',
            performance_goal: isMeta ? 'OFFSITE_CONVERSIONS' : 'MAXIMIZE_CONVERSIONS',
            pixel_event: pixelEvent,
            budget: prospectingBudget.toString(),
            schedule_json: JSON.stringify({
              start: 'immediately',
              end: null,
              dayparting: 'all_days',
            }),
            audience_json: def.audienceJson,
            placements_json: JSON.stringify(
              isMeta
                ? { type: 'advantage_plus', note: 'Automatic placements recommended' }
                : { networks: ['Google Search'] },
            ),
            optimization_delivery_json: JSON.stringify({
              optimizationGoal: isMeta ? 'OFFSITE_CONVERSIONS' : 'CONVERSIONS',
              billingEvent: 'IMPRESSIONS',
              attribution: isMeta ? '7-day click, 1-day view' : 'data-driven',
            }),
            keywords_json: JSON.stringify(
              isMeta
                ? []
                : trend.googleKeywords.map((k, i) => ({
                    keyword: k,
                    matchType: i < 3 ? 'exact' : 'phrase',
                  })),
            ),
          },
        });
        const adSetId = insertedAdSet.id;

        await prisma.ad_creatives.create({
          data: {
            ad_set_id: adSetId,
            name: `${trend.name} — ${isMeta ? 'Single Image' : 'RSA'} v1`,
            format: isMeta ? 'image' : 'rsa',
            primary_texts_json: JSON.stringify(isMeta ? primaryTexts : []),
            headlines_json: JSON.stringify(isMeta ? metaHeadlines : rsaHeadlines),
            descriptions_json: JSON.stringify(isMeta ? metaDescriptions : rsaDescriptions),
            cta: isMeta ? (metaObjective === 'OUTCOME_LEADS' ? 'GET_QUOTE' : 'BOOK_NOW') : '',
            display_url: SITE_BASE_URL.replace(/^https?:\/\//, ''),
            final_url: finalUrl,
            utm_string: utm(slugify(def.name)),
            brief_json: JSON.stringify({
              visuals: `Hero lifestyle imagery of ${trend.name} matching the angle: "${trend.angle}". People-first, golden hour, aspirational but attainable.`,
              copyTone:
                trend.vertical === 'inbound'
                  ? 'Expert local destination specialist. Culturally respectful, reassuring and tailored to foreign travellers visiting India.'
                  : 'Urgency + trust. Indian-traveller context (visa ease, direct flights, INR pricing).',
            }),
          },
        });
      }
    }

    // Meta remarketing ad set (one per campaign)
    if (isMeta) {
      const rmAdSet = await prisma.ad_sets.create({
        data: {
          campaign_id: campaignId,
          name: 'Remarketing — Site Visitors 30d',
          conversion_location: 'WEBSITE',
          performance_goal: 'OFFSITE_CONVERSIONS',
          pixel_event: pixelEvent,
          budget: Math.round(data.budget * 0.3).toString(),
          schedule_json: JSON.stringify({
            start: 'immediately',
            end: null,
            dayparting: 'all_days',
          }),
          audience_json: JSON.stringify({
            locations: campaignLocations,
            age_min: 22,
            age_max: 60,
            genders: 'All',
            detailed_targeting: [],
            custom_audiences: ['Website visitors — last 30 days (create from Pixel in Audiences)'],
            advantage_audience: false,
          }),
          placements_json: JSON.stringify({
            type: 'advantage_plus',
            note: 'Automatic placements recommended',
          }),
          optimization_delivery_json: JSON.stringify({
            optimizationGoal: 'OFFSITE_CONVERSIONS',
            billingEvent: 'IMPRESSIONS',
            attribution: '7-day click, 1-day view',
          }),
          keywords_json: JSON.stringify([]),
        },
      });
      const firstTrend = trends[0];
      await prisma.ad_creatives.create({
        data: {
          ad_set_id: rmAdSet.id as number,
          name: 'Remarketing — Offer Reminder v1',
          format: 'carousel',
          primary_texts_json: JSON.stringify([
            clamp(
              `Still dreaming of ${trends.map((t) => t.name).join(' or ')}? Your itinerary is one enquiry away — and this season's slots are filling fast.`,
              125,
            ),
          ]),
          headlines_json: JSON.stringify([
            clamp('Your Trip Is Waiting', 40),
            clamp('Pick Up Where You Left Off', 40),
          ]),
          descriptions_json: JSON.stringify([clamp('Seasonal slots filling.', 30)]),
          cta: 'GET_QUOTE',
          display_url: SITE_BASE_URL.replace(/^https?:\/\//, ''),
          final_url: `${SITE_BASE_URL}/destinations/${slugify(firstTrend.name)}`,
          utm_string: `utm_source=facebook&utm_medium=paid_social&utm_campaign=moons_${destSlug}_${slugify(data.goal)}&utm_content=remarketing-30d`,
          brief_json: JSON.stringify({
            visuals: 'Carousel: 1 card per destination highlight + 1 offer card.',
            copyTone: 'Reminder + scarcity, warm not pushy.',
          }),
        },
      });
    }

    await logMayaActivity(
      'campaign.blueprint.created',
      `Built ${data.platform} campaign blueprint "${campaignName}" for ${trends.map((t) => t.name).join(', ')} (₹${data.budget.toLocaleString('en-IN')}, ${ai ? 'AI research' : 'template fallback'})`,
    );

    return { success: true, campaignId, aiGenerated: !!ai };
  });

// ---------- reads ----------

export const adminGetMayaCampaign = defineOperation({ method: 'GET' })
  .validator(z.object({ auth: AuthShape, campaignId: z.number() }))
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const rawCampaign = await prisma.ad_campaigns.findUnique({
      where: { id: data.campaignId },
    });
    const campaign = rawCampaign ? camelCaseRow(rawCampaign) : null;
    if (!campaign) throw new Error('Campaign not found');

    const adSets = camelCaseRows(
      await prisma.ad_sets.findMany({
        where: { campaign_id: data.campaignId },
      }),
    );
    let creatives: any[] = [];
    if (adSets.length > 0) {
      creatives = camelCaseRows(
        await prisma.ad_creatives.findMany({
          where: {
            ad_set_id: { in: adSets.map((s: any) => s.id as number) },
          },
        }),
      );
    }
    const actions = camelCaseRows(
      await prisma.maya_campaign_actions.findMany({
        where: { campaign_id: data.campaignId },
      }),
    );
    const metrics = camelCaseRows(
      await prisma.campaign_metrics.findMany({
        where: { campaign_id: data.campaignId },
        orderBy: { date: 'asc' },
      }),
    );

    return { campaign, adSets, creatives, actions, metrics };
  });

export const adminGetAdCampaigns = defineOperation({ method: 'GET' })
  .validator(z.object({ auth: AuthShape }))
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const rawCampaigns = await prisma.ad_campaigns.findMany({
      orderBy: { created_at: 'asc' },
    });
    const campaigns = camelCaseRows(rawCampaigns);

    const aggregates = await prisma.campaign_metrics.groupBy({
      by: ['campaign_id'],
      _sum: {
        spend: true,
        impressions: true,
        leads: true,
        bookings: true,
      },
    });
    const aggByCampaign = new Map(
      aggregates.map((row) => [
        Number(row.campaign_id),
        {
          spent: row._sum.spend,
          reach: row._sum.impressions,
          leads: row._sum.leads,
          bookings: row._sum.bookings,
        },
      ]),
    );

    return campaigns.map((c: any) => {
      const agg = aggByCampaign.get(c.id);
      return {
        id: c.id,
        name: c.name,
        type: `Maya / ${c.platform.toUpperCase()}`,
        status: c.status,
        budget: c.budgetAmount,
        spent: Number(agg?.spent || 0),
        reach: Number(agg?.reach || 0),
        conversions: Number(agg?.leads || 0) + Number(agg?.bookings || 0),
        isMaya: true,
        externalId: c.externalId,
      };
    });
  });

// ---------- metrics import ----------

const ImportMetricsRequest = z.object({
  auth: AuthShape,
  campaignId: z.number(),
  metrics: z.array(
    z.object({
      date: z.string(),
      level: z.enum(['campaign', 'adset', 'ad']),
      referenceId: z.number().optional(),
      impressions: z.number(),
      clicks: z.number(),
      spend: z.number(),
      leads: z.number(),
      bookings: z.number(),
    }),
  ),
});

export const adminImportCampaignMetrics = defineOperation({ method: 'POST' })
  .validator(ImportMetricsRequest)
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const valuesToInsert = data.metrics
      .filter((m) => !Number.isNaN(new Date(m.date).getTime()))
      .map((m) => ({
        campaign_id: data.campaignId,
        date: new Date(m.date),
        level: m.level,
        reference_id: m.referenceId || null,
        impressions: m.impressions,
        clicks: m.clicks,
        spend: m.spend,
        leads: m.leads,
        bookings: m.bookings,
      }));

    if (valuesToInsert.length > 0) {
      await prisma.campaign_metrics.createMany({ data: valuesToInsert });
    }
    return { success: true, count: valuesToInsert.length };
  });

// ---------- performance analysis (rules + AI narrative) ----------

export const adminAnalyzeCampaignPerformance = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: AuthShape, campaignId: z.number() }))
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const rawCampaign = await prisma.ad_campaigns.findUnique({
      where: { id: data.campaignId },
    });
    const campaign = rawCampaign ? camelCaseRow(rawCampaign) : null;
    if (!campaign) throw new Error('Campaign not found');
    const metrics = camelCaseRows(
      await prisma.campaign_metrics.findMany({
        where: { campaign_id: data.campaignId },
        orderBy: { date: 'asc' },
      }),
    );
    if (metrics.length === 0)
      throw new Error('No metrics imported yet — import performance data first.');

    // Aggregate + derive
    const total = metrics.reduce(
      (acc: any, m: any) => ({
        impressions: acc.impressions + Number(m.impressions || 0),
        clicks: acc.clicks + Number(m.clicks || 0),
        spend: acc.spend + Number(m.spend || 0),
        leads: acc.leads + Number(m.leads || 0),
        bookings: acc.bookings + Number(m.bookings || 0),
      }),
      { impressions: 0, clicks: 0, spend: 0, leads: 0, bookings: 0 },
    );
    const ctr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0;
    const cpc = total.clicks > 0 ? total.spend / total.clicks : 0;
    const cpl = total.leads > 0 ? total.spend / total.leads : null;

    // First-half vs second-half trend
    const mid = Math.floor(metrics.length / 2);
    const half = (rows: any[]) =>
      rows.reduce(
        (a, m) => ({
          spend: a.spend + Number(m.spend || 0),
          leads: a.leads + Number(m.leads || 0),
        }),
        { spend: 0, leads: 0 },
      );
    const h1 = half(metrics.slice(0, mid) as any[]);
    const h2 = half(metrics.slice(mid) as any[]);
    const cplH1 = h1.leads > 0 ? h1.spend / h1.leads : null;
    const cplH2 = h2.leads > 0 ? h2.spend / h2.leads : null;

    // Rule-based findings (travel-industry benchmarks: Meta CTR ~1%+, Search CTR ~3%+)
    type Finding = {
      what: string;
      why: string;
      expectedImpact: string;
      confidenceLevel: 'high' | 'medium' | 'low';
    };
    const findings: Finding[] = [];
    const isMeta = campaign.platform === 'meta';
    const ctrBenchmark = isMeta ? 1.0 : 3.0;

    if (ctr > 0 && ctr < ctrBenchmark * 0.6) {
      findings.push({
        what: isMeta
          ? 'Refresh creatives: launch 2 new image/video variants and pause the weakest ad.'
          : 'Rewrite RSA headlines: pin a keyword-matched headline in position 1 and add price/offer headlines.',
        why: `CTR is ${ctr.toFixed(2)}% vs a ~${ctrBenchmark}% ${isMeta ? 'Meta travel' : 'travel search'} benchmark — the message isn't stopping the scroll.`,
        expectedImpact: 'CTR toward benchmark; CPC and CPL drop proportionally.',
        confidenceLevel: 'high',
      });
    }
    if (cpl !== null && cplH1 !== null && cplH2 !== null && cplH2 > cplH1 * 1.25) {
      findings.push({
        what: 'Investigate fatigue: cap frequency, rotate creative, or expand the audience of the worst ad set.',
        why: `Cost per lead rose from ₹${cplH1.toFixed(0)} to ₹${cplH2.toFixed(0)} (+${(((cplH2 - cplH1) / cplH1) * 100).toFixed(0)}%) between the first and second half of the period.`,
        expectedImpact: 'Return CPL to the earlier baseline.',
        confidenceLevel: 'high',
      });
    }
    if (total.spend > 0 && total.leads === 0) {
      findings.push({
        what: 'Pause and audit the funnel: verify pixel/conversion tracking fires on the landing page, then check landing-page speed and form friction.',
        why: `₹${total.spend.toFixed(0)} spent with 0 recorded leads — either tracking is broken or the landing page isn't converting.`,
        expectedImpact: 'Restore lead recording / stop unproductive spend.',
        confidenceLevel: 'high',
      });
    }
    if (cpl !== null && cplH2 !== null && cplH1 !== null && cplH2 < cplH1 * 0.8) {
      findings.push({
        what: 'Scale budget +20% on this campaign; performance is compounding.',
        why: `CPL improved from ₹${cplH1.toFixed(0)} to ₹${cplH2.toFixed(0)} — the algorithm has found pockets of efficient delivery.`,
        expectedImpact: 'More leads at the improved CPL before auction saturation.',
        confidenceLevel: 'medium',
      });
    }
    if (findings.length === 0) {
      findings.push({
        what: 'Hold steady; introduce one new creative variant as an A/B test.',
        why: `Metrics are within normal ranges (CTR ${ctr.toFixed(2)}%, CPC ₹${cpc.toFixed(0)}${cpl !== null ? `, CPL ₹${cpl.toFixed(0)}` : ''}). No urgent intervention indicated.`,
        expectedImpact: 'Continuous creative testing compounds performance over time.',
        confidenceLevel: 'medium',
      });
    }

    // Optional AI narrative refinement (best-effort)
    let refined = findings;
    try {
      const raw = await withMayaGeminiRotation<string>(
        'gemini-2.5-flash',
        async (model) =>
          (
            await model.generateContent(
              `You are Maya, a performance marketing manager. Refine these campaign optimization recommendations for an Indian travel brand. Keep the same number of items and the same intent, but sharpen the "what" into a specific action and the "why" citing the numbers. Metrics: ${JSON.stringify({ ctr: ctr.toFixed(2), cpc: cpc.toFixed(0), cpl: cpl?.toFixed(0) ?? 'n/a', totalSpend: total.spend.toFixed(0), leads: total.leads, platform: campaign.platform })}. Items: ${JSON.stringify(findings)}. Return STRICT JSON array with objects {what, why, expectedImpact, confidenceLevel}.`,
            )
          ).response.text(),
        { generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } },
      );
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((p: any) => p.what && p.why)) {
        refined = parsed.slice(0, findings.length).map((p: any, i: number) => ({
          what: String(p.what),
          why: String(p.why),
          expectedImpact: String(p.expectedImpact || findings[i]?.expectedImpact || ''),
          confidenceLevel: ['high', 'medium', 'low'].includes(p.confidenceLevel)
            ? p.confidenceLevel
            : findings[i]?.confidenceLevel || 'medium',
        }));
      }
    } catch {
      // keep rule-based text
    }

    await prisma.maya_campaign_actions.createMany({
      data: refined.map((f) => ({
        campaign_id: data.campaignId,
        what: f.what,
        why: f.why,
        expected_impact: f.expectedImpact,
        confidence_level: f.confidenceLevel as any,
        status: 'pending',
      })),
    });
    await logMayaActivity(
      'campaign.diagnosed',
      `Diagnosed campaign "${campaign.name}": ${refined.length} recommendation(s) (CTR ${ctr.toFixed(2)}%, CPL ${cpl !== null ? '₹' + cpl.toFixed(0) : 'n/a'})`,
    );

    return { success: true, count: refined.length };
  });

export const adminUpdateCampaignAction = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: AuthShape,
      actionId: z.number(),
      status: z.enum(['pending', 'accepted', 'rejected', 'dismissed']),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);
    await prisma.maya_campaign_actions.update({
      where: { id: data.actionId },
      data: { status: data.status },
    });
    return { success: true };
  });

export const adminSaveAudienceFromAdSet = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: AuthShape, adSetId: z.number(), name: z.string() }))
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const rawAdSet = await prisma.ad_sets.findUnique({
      where: { id: data.adSetId },
    });
    const adSet = rawAdSet ? camelCaseRow(rawAdSet) : null;
    if (!adSet) throw new Error('AdSet not found');

    await prisma.mktg_audiences.create({
      data: {
        name: data.name,
        description: `Imported from Ad Set: ${adSet.name}`,
        rules: (adSet.audienceJson as string) || '',
        size: 0,
      },
    });
    return { success: true };
  });
