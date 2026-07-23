// @ts-nocheck -- behavior-parity adapter retained until domain-by-domain type hardening.
import { defineOperation } from './defineOperation.js';
import { z } from 'zod';
import { requireAdmin } from '../legacy/api/db.functions.server.js';
import { prisma } from '../config/prisma.js';
import { camelCaseRow, camelCaseRows } from '../utils/rowCase.js';

const AuthShape = z.object({ email: z.string(), sessionToken: z.string() });

const META_API = 'https://graph.facebook.com/v23.0';
const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v20';

// ---------- connection storage ----------

interface MetaCredentials {
  accessToken: string;
  adAccountId: string; // numeric, without act_ prefix
  pageId: string;
  pixelId?: string;
}
interface GoogleCredentials {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string; // digits only
  loginCustomerId?: string;
}

async function getConnection(platform: 'meta' | 'google') {
  const row = await prisma.ad_platform_connections.findFirst({ where: { platform } });
  return row ? camelCaseRow(row) : null;
}

function maskSecret(value: string | undefined): string {
  if (!value) return '';
  return value.length <= 8 ? '••••' : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export const adminGetAdPlatformConnections = defineOperation({ method: 'GET' })
  .validator(z.object({ auth: AuthShape }))
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);
    const rawRows = await prisma.ad_platform_connections.findMany();
    const rows = camelCaseRows(rawRows);
    return rows.map((r: any) => {
      const creds = JSON.parse(r.credentialsJson || '{}');
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(creds)) {
        masked[k] = /token|secret/i.test(k) ? maskSecret(String(v)) : String(v);
      }
      return {
        id: r.id,
        platform: r.platform,
        status: r.status,
        lastError: r.lastError,
        lastValidatedAt: r.lastValidatedAt,
        credentials: masked,
      };
    });
  });

export const adminSaveAdPlatformConnection = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: AuthShape,
      platform: z.enum(['meta', 'google']),
      credentials: z.record(z.string(), z.string()),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const existing = await getConnection(data.platform);
    // Merge so re-saving with masked/blank secret fields keeps the stored values
    const prior = existing ? JSON.parse(existing.credentialsJson || '{}') : {};
    const merged: Record<string, string> = { ...prior };
    for (const [k, v] of Object.entries(data.credentials)) {
      if (v && !v.includes('…') && v !== '••••') merged[k] = v.trim();
    }

    if (existing) {
      await prisma.ad_platform_connections.update({
        where: { id: existing.id as number },
        data: { credentials_json: JSON.stringify(merged), status: 'unverified', last_error: null },
      });
    } else {
      await prisma.ad_platform_connections.create({
        data: {
          platform: data.platform,
          credentials_json: JSON.stringify(merged),
          status: 'unverified',
        },
      });
    }
    return { success: true };
  });

// ---------- token / API helpers ----------

async function metaGet(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_API}/${path}`);
  url.searchParams.set('access_token', accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error?.message || `Meta API error ${res.status}`);
  return body;
}

async function metaPost(path: string, accessToken: string, payload: Record<string, any>) {
  const res = await fetch(`${META_API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, access_token: accessToken }),
  });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error?.message || `Meta API error ${res.status}`);
  return body;
}

async function googleAccessToken(creds: GoogleCredentials): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token)
    throw new Error(body.error_description || 'Google OAuth token refresh failed');
  return body.access_token;
}

async function googlePost(
  creds: GoogleCredentials,
  accessToken: string,
  path: string,
  payload: any,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': creds.developerToken,
    'Content-Type': 'application/json',
  };
  if (creds.loginCustomerId) headers['login-customer-id'] = creds.loginCustomerId.replace(/-/g, '');
  const res = await fetch(`${GOOGLE_ADS_API}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || `Google Ads API error ${res.status}`);
  return body;
}

// ---------- test connection ----------

export const adminTestAdPlatformConnection = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: AuthShape, platform: z.enum(['meta', 'google']) }))
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);
    const conn = await getConnection(data.platform);
    if (!conn) throw new Error(`No ${data.platform} connection saved yet.`);
    const creds = JSON.parse(conn.credentialsJson || '{}');

    let detail = '';
    try {
      if (data.platform === 'meta') {
        const c = creds as MetaCredentials;
        if (!c.accessToken || !c.adAccountId || !c.pageId)
          throw new Error('Meta needs accessToken, adAccountId and pageId.');
        const me = await metaGet('me', c.accessToken, { fields: 'id,name' });
        const account = await metaGet(`act_${c.adAccountId.replace(/^act_/, '')}`, c.accessToken, {
          fields: 'name,account_status,currency',
        });
        detail = `Token OK (${me.name}). Ad account: ${account.name} [${account.currency}]`;
      } else {
        const c = creds as GoogleCredentials;
        if (
          !c.developerToken ||
          !c.clientId ||
          !c.clientSecret ||
          !c.refreshToken ||
          !c.customerId
        ) {
          throw new Error(
            'Google needs developerToken, clientId, clientSecret, refreshToken and customerId.',
          );
        }
        const token = await googleAccessToken(c);
        const res = await fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
          headers: { Authorization: `Bearer ${token}`, 'developer-token': c.developerToken },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message || `Google Ads API error ${res.status}`);
        detail = `OAuth OK. Accessible customers: ${(body.resourceNames || []).length}`;
      }
      await prisma.ad_platform_connections.update({
        where: { id: conn.id as number },
        data: { status: 'connected', last_error: null, last_validated_at: new Date() },
      });
      return { success: true, detail };
    } catch (error: any) {
      await prisma.ad_platform_connections.update({
        where: { id: conn.id as number },
        data: { status: 'error', last_error: String(error.message || error) },
      });
      throw error;
    }
  });

// ---------- payload builders ----------

function parseJson(text: string | null | undefined, fallback: any) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function buildMetaPayloads(campaign: any, adSets: any[], creatives: any[], creds: MetaCredentials) {
  const settings = parseJson(campaign.settingsJson, {});
  const actId = `act_${creds.adAccountId.replace(/^act_/, '')}`;
  const budgetPaise = Math.round(Number(campaign.budgetAmount || 0) * 100);

  const steps: { step: string; endpoint: string; payload: any; localId: string }[] = [];

  steps.push({
    step: 'Create campaign (PAUSED)',
    endpoint: `POST ${META_API}/${actId}/campaigns`,
    localId: `campaign:${campaign.id}`,
    payload: {
      name: campaign.name,
      objective: settings.campaignObjective || 'OUTCOME_LEADS',
      status: 'PAUSED',
      special_ad_categories: [],
      buying_type: 'AUCTION',
      ...(campaign.budgetType === 'cbo'
        ? {
            daily_budget: budgetPaise,
            bid_strategy: campaign.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
          }
        : {}),
    },
  });

  for (const set of adSets) {
    const aud = parseJson(set.audienceJson, {});
    const targeting: any = {
      geo_locations: { countries: ['IN'] },
      age_min: aud.age_min || 22,
      age_max: aud.age_max || 60,
    };
    if (Array.isArray(aud.detailed_targeting) && aud.detailed_targeting.length > 0) {
      // Interest names are resolved to IDs at publish time via the Targeting Search API
      targeting.flexible_spec = [
        {
          interests: aud.detailed_targeting.map((name: string) => ({
            name,
            id: '<resolved at publish>',
          })),
        },
      ];
    }
    steps.push({
      step: `Create ad set: ${set.name}`,
      endpoint: `POST ${META_API}/${actId}/adsets`,
      localId: `adset:${set.id}`,
      payload: {
        name: set.name,
        campaign_id: '<campaign id from step 1>',
        status: 'PAUSED',
        billing_event: 'IMPRESSIONS',
        optimization_goal: set.performanceGoal || 'OFFSITE_CONVERSIONS',
        ...(campaign.budgetType !== 'cbo'
          ? { daily_budget: Math.round(Number(set.budget || 0) * 100) }
          : {}),
        targeting,
        ...(creds.pixelId
          ? {
              promoted_object: {
                pixel_id: creds.pixelId,
                custom_event_type: (set.pixelEvent || 'Lead').toUpperCase(),
              },
            }
          : {}),
      },
    });

    for (const creative of creatives.filter((c: any) => c.adSetId === set.id)) {
      const primaryTexts = parseJson(creative.primaryTextsJson, []);
      const headlines = parseJson(creative.headlinesJson, []);
      const descriptions = parseJson(creative.descriptionsJson, []);
      steps.push({
        step: `Create ad creative + ad: ${creative.name}`,
        endpoint: `POST ${META_API}/${actId}/adcreatives → POST ${META_API}/${actId}/ads`,
        localId: `creative:${creative.id}`,
        payload: {
          creative: {
            name: creative.name,
            object_story_spec: {
              page_id: creds.pageId,
              link_data: {
                message: primaryTexts[0] || '',
                name: headlines[0] || '',
                description: descriptions[0] || '',
                link: `${creative.finalUrl}?${creative.utmString || ''}`,
                call_to_action: { type: creative.cta || 'LEARN_MORE' },
              },
            },
          },
          ad: {
            name: creative.name,
            adset_id: '<ad set id>',
            creative: { creative_id: '<creative id>' },
            status: 'PAUSED',
          },
        },
      });
    }
  }
  return steps;
}

function buildGooglePayloads(
  campaign: any,
  adSets: any[],
  creatives: any[],
  creds: GoogleCredentials,
) {
  const settings = parseJson(campaign.settingsJson, {});
  const cid = creds.customerId.replace(/-/g, '');
  const budgetMicros = Math.round((Number(campaign.budgetAmount || 0) / 30) * 1_000_000); // monthly → daily micros

  const steps: { step: string; endpoint: string; payload: any; localId: string }[] = [];

  steps.push({
    step: 'Create campaign budget',
    endpoint: `POST ${GOOGLE_ADS_API}/customers/${cid}/campaignBudgets:mutate`,
    localId: `budget:${campaign.id}`,
    payload: {
      operations: [
        {
          create: {
            name: `${campaign.name} Budget`,
            amountMicros: String(budgetMicros),
            deliveryMethod: 'STANDARD',
            explicitlyShared: false,
          },
        },
      ],
    },
  });

  steps.push({
    step: 'Create Search campaign (PAUSED)',
    endpoint: `POST ${GOOGLE_ADS_API}/customers/${cid}/campaigns:mutate`,
    localId: `campaign:${campaign.id}`,
    payload: {
      operations: [
        {
          create: {
            name: campaign.name,
            status: 'PAUSED',
            advertisingChannelType: 'SEARCH',
            campaignBudget: '<budget resource name from step 1>',
            maximizeConversions: {},
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: false,
              targetContentNetwork: false,
            },
            geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE_OR_INTEREST' },
          },
        },
      ],
    },
  });

  if (Array.isArray(settings.negativeKeywords) && settings.negativeKeywords.length > 0) {
    steps.push({
      step: 'Add campaign negative keywords',
      endpoint: `POST ${GOOGLE_ADS_API}/customers/${cid}/campaignCriteria:mutate`,
      localId: `negatives:${campaign.id}`,
      payload: {
        operations: settings.negativeKeywords.map((k: string) => ({
          create: {
            campaign: '<campaign resource name>',
            negative: true,
            keyword: { text: k, matchType: 'BROAD' },
          },
        })),
      },
    });
  }

  for (const set of adSets) {
    steps.push({
      step: `Create ad group: ${set.name}`,
      endpoint: `POST ${GOOGLE_ADS_API}/customers/${cid}/adGroups:mutate`,
      localId: `adset:${set.id}`,
      payload: {
        operations: [
          {
            create: {
              name: set.name,
              campaign: '<campaign resource name>',
              status: 'PAUSED',
              type: 'SEARCH_STANDARD',
            },
          },
        ],
      },
    });

    const keywords = parseJson(set.keywordsJson, []);
    if (keywords.length > 0) {
      steps.push({
        step: `Add ${keywords.length} keywords to: ${set.name}`,
        endpoint: `POST ${GOOGLE_ADS_API}/customers/${cid}/adGroupCriteria:mutate`,
        localId: `keywords:${set.id}`,
        payload: {
          operations: keywords.map((k: any) => ({
            create: {
              adGroup: '<ad group resource name>',
              status: 'ENABLED',
              keyword: { text: k.keyword, matchType: (k.matchType || 'phrase').toUpperCase() },
            },
          })),
        },
      });
    }

    for (const creative of creatives.filter((c: any) => c.adSetId === set.id)) {
      const headlines = parseJson(creative.headlinesJson, []);
      const descriptions = parseJson(creative.descriptionsJson, []);
      steps.push({
        step: `Create RSA: ${creative.name}`,
        endpoint: `POST ${GOOGLE_ADS_API}/customers/${cid}/adGroupAds:mutate`,
        localId: `creative:${creative.id}`,
        payload: {
          operations: [
            {
              create: {
                adGroup: '<ad group resource name>',
                status: 'PAUSED',
                ad: {
                  finalUrls: [`${creative.finalUrl}?${creative.utmString || ''}`],
                  responsiveSearchAd: {
                    headlines: headlines.slice(0, 15).map((t: string) => ({ text: t })),
                    descriptions: descriptions.slice(0, 4).map((t: string) => ({ text: t })),
                  },
                },
              },
            },
          ],
        },
      });
    }
  }
  return steps;
}

// ---------- publish (dry-run or real; everything created PAUSED) ----------

export const adminPublishCampaign = defineOperation({ method: 'POST' })
  .validator(
    z.object({ auth: AuthShape, campaignId: z.number(), dryRun: z.boolean().default(true) }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.auth);

    const rawCampaign = await prisma.ad_campaigns.findUnique({
      where: { id: data.campaignId },
    });
    const campaign = rawCampaign ? camelCaseRow(rawCampaign) : null;
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.externalId && !data.dryRun)
      throw new Error(
        `Already published (external id ${campaign.externalId}). Delete it in Ads Manager first if you want to republish.`,
      );

    const rawAdSets = await prisma.ad_sets.findMany({
      where: { campaign_id: data.campaignId },
    });
    const adSets = camelCaseRows(rawAdSets);
    const creatives =
      adSets.length > 0
        ? camelCaseRows(
            await prisma.ad_creatives.findMany({
              where: {
                ad_set_id: { in: adSets.map((s: any) => s.id as number) },
              },
            }),
          )
        : [];

    const conn = await getConnection(campaign.platform as 'meta' | 'google');
    if (!conn)
      throw new Error(
        `No ${campaign.platform} connection configured. Add credentials in the Publish tab first.`,
      );
    const creds = JSON.parse(conn.credentialsJson || '{}');

    const steps =
      campaign.platform === 'meta'
        ? buildMetaPayloads(campaign, adSets, creatives, creds)
        : buildGooglePayloads(campaign, adSets, creatives, creds);

    if (data.dryRun) {
      return {
        dryRun: true,
        steps,
        note: 'No API calls made. Everything will be created with status PAUSED — you enable it in Ads Manager after review.',
      };
    }

    if (conn.status !== 'connected')
      throw new Error("Connection is not verified. Run 'Test connection' first.");

    // ---- real publish ----
    const published: { step: string; externalId: string }[] = [];

    if (campaign.platform === 'meta') {
      const c = creds as MetaCredentials;
      const actId = `act_${c.adAccountId.replace(/^act_/, '')}`;
      const settings = parseJson(campaign.settingsJson, {});
      const budgetPaise = Math.round(Number(campaign.budgetAmount || 0) * 100);

      const campaignRes = await metaPost(`${actId}/campaigns`, c.accessToken, {
        name: campaign.name,
        objective: settings.campaignObjective || 'OUTCOME_LEADS',
        status: 'PAUSED',
        special_ad_categories: [],
        buying_type: 'AUCTION',
        ...(campaign.budgetType === 'cbo'
          ? {
              daily_budget: budgetPaise,
              bid_strategy: campaign.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
            }
          : {}),
      });
      published.push({ step: 'campaign', externalId: campaignRes.id });
      await prisma.ad_campaigns.update({
        where: { id: campaign.id as number },
        data: { external_id: campaignRes.id, published_at: new Date(), status: 'live' },
      });

      for (const set of adSets) {
        const aud = parseJson(set.audienceJson, {});
        const targeting: any = {
          geo_locations: { countries: ['IN'] },
          age_min: aud.age_min || 22,
          age_max: aud.age_max || 60,
        };
        if (Array.isArray(aud.detailed_targeting) && aud.detailed_targeting.length > 0) {
          const interests: { id: string; name: string }[] = [];
          for (const name of aud.detailed_targeting) {
            try {
              const search = await metaGet('search', c.accessToken, {
                type: 'adinterest',
                q: name,
                limit: '1',
              });
              if (search.data?.[0]?.id)
                interests.push({ id: search.data[0].id, name: search.data[0].name });
            } catch {
              /* skip unresolvable interest */
            }
          }
          if (interests.length > 0) targeting.flexible_spec = [{ interests }];
        }
        const adSetRes = await metaPost(`${actId}/adsets`, c.accessToken, {
          name: set.name,
          campaign_id: campaignRes.id,
          status: 'PAUSED',
          billing_event: 'IMPRESSIONS',
          optimization_goal: set.performanceGoal || 'OFFSITE_CONVERSIONS',
          ...(campaign.budgetType !== 'cbo'
            ? { daily_budget: Math.round(Number(set.budget || 0) * 100) }
            : {}),
          targeting,
          ...(c.pixelId
            ? {
                promoted_object: {
                  pixel_id: c.pixelId,
                  custom_event_type: (set.pixelEvent || 'Lead').toUpperCase(),
                },
              }
            : {}),
        });
        published.push({ step: `adset:${set.name}`, externalId: adSetRes.id });
        await prisma.ad_sets.update({
          where: { id: set.id as number },
          data: { external_id: adSetRes.id },
        });

        for (const creative of creatives.filter((cr: any) => cr.adSetId === set.id)) {
          const primaryTexts = parseJson(creative.primaryTextsJson, []);
          const headlines = parseJson(creative.headlinesJson, []);
          const descriptions = parseJson(creative.descriptionsJson, []);
          const creativeRes = await metaPost(`${actId}/adcreatives`, c.accessToken, {
            name: creative.name,
            object_story_spec: {
              page_id: c.pageId,
              link_data: {
                message: primaryTexts[0] || '',
                name: headlines[0] || '',
                description: descriptions[0] || '',
                link: `${creative.finalUrl}?${creative.utmString || ''}`,
                call_to_action: { type: creative.cta || 'LEARN_MORE' },
              },
            },
          });
          const adRes = await metaPost(`${actId}/ads`, c.accessToken, {
            name: creative.name,
            adset_id: adSetRes.id,
            creative: { creative_id: creativeRes.id },
            status: 'PAUSED',
          });
          published.push({ step: `ad:${creative.name}`, externalId: adRes.id });
          await prisma.ad_creatives.update({
            where: { id: creative.id as number },
            data: { external_id: adRes.id },
          });
        }
      }
    } else {
      const c = creds as GoogleCredentials;
      const cid = c.customerId.replace(/-/g, '');
      const token = await googleAccessToken(c);
      const settings = parseJson(campaign.settingsJson, {});
      const budgetMicros = Math.round((Number(campaign.budgetAmount || 0) / 30) * 1_000_000);

      const budgetRes = await googlePost(c, token, `customers/${cid}/campaignBudgets:mutate`, {
        operations: [
          {
            create: {
              name: `${campaign.name} Budget ${Date.now()}`,
              amountMicros: String(budgetMicros),
              deliveryMethod: 'STANDARD',
              explicitlyShared: false,
            },
          },
        ],
      });
      const budgetResource = budgetRes.results[0].resourceName;

      const campaignRes = await googlePost(c, token, `customers/${cid}/campaigns:mutate`, {
        operations: [
          {
            create: {
              name: campaign.name,
              status: 'PAUSED',
              advertisingChannelType: 'SEARCH',
              campaignBudget: budgetResource,
              maximizeConversions: {},
              networkSettings: {
                targetGoogleSearch: true,
                targetSearchNetwork: false,
                targetContentNetwork: false,
              },
            },
          },
        ],
      });
      const campaignResource = campaignRes.results[0].resourceName;
      const externalCampaignId = campaignResource.split('/').pop();
      published.push({ step: 'campaign', externalId: externalCampaignId });
      await prisma.ad_campaigns.update({
        where: { id: campaign.id as number },
        data: { external_id: externalCampaignId, published_at: new Date(), status: 'live' },
      });

      if (Array.isArray(settings.negativeKeywords) && settings.negativeKeywords.length > 0) {
        await googlePost(c, token, `customers/${cid}/campaignCriteria:mutate`, {
          operations: settings.negativeKeywords.map((k: string) => ({
            create: {
              campaign: campaignResource,
              negative: true,
              keyword: { text: k, matchType: 'BROAD' },
            },
          })),
        });
      }

      for (const set of adSets) {
        const agRes = await googlePost(c, token, `customers/${cid}/adGroups:mutate`, {
          operations: [
            {
              create: {
                name: set.name,
                campaign: campaignResource,
                status: 'PAUSED',
                type: 'SEARCH_STANDARD',
              },
            },
          ],
        });
        const agResource = agRes.results[0].resourceName;
        published.push({ step: `adgroup:${set.name}`, externalId: agResource.split('/').pop() });
        await prisma.ad_sets.update({
          where: { id: set.id as number },
          data: { external_id: agResource.split('/').pop() },
        });

        const keywords = parseJson(set.keywordsJson, []);
        if (keywords.length > 0) {
          await googlePost(c, token, `customers/${cid}/adGroupCriteria:mutate`, {
            operations: keywords.map((k: any) => ({
              create: {
                adGroup: agResource,
                status: 'ENABLED',
                keyword: { text: k.keyword, matchType: (k.matchType || 'phrase').toUpperCase() },
              },
            })),
          });
        }

        for (const creative of creatives.filter((cr: any) => cr.adSetId === set.id)) {
          const headlines = parseJson(creative.headlinesJson, []);
          const descriptions = parseJson(creative.descriptionsJson, []);
          const adRes = await googlePost(c, token, `customers/${cid}/adGroupAds:mutate`, {
            operations: [
              {
                create: {
                  adGroup: agResource,
                  status: 'PAUSED',
                  ad: {
                    finalUrls: [`${creative.finalUrl}?${creative.utmString || ''}`],
                    responsiveSearchAd: {
                      headlines: headlines.slice(0, 15).map((t: string) => ({ text: t })),
                      descriptions: descriptions.slice(0, 4).map((t: string) => ({ text: t })),
                    },
                  },
                },
              },
            ],
          });
          const adId = adRes.results[0].resourceName.split('/').pop();
          published.push({ step: `rsa:${creative.name}`, externalId: adId });
          await prisma.ad_creatives.update({
            where: { id: creative.id as number },
            data: { external_id: adId },
          });
        }
      }
    }

    try {
      await prisma.maya_activity_log.create({
        data: {
          action: 'campaign.published',
          summary: `Published campaign "${campaign.name}" to ${campaign.platform} (PAUSED) — ${published.length} object(s) created`,
          area: 'marketing',
          status: 'done',
        },
      });
    } catch {
      /* best-effort */
    }

    return {
      dryRun: false,
      published,
      note: 'All objects created with status PAUSED. Review and enable them in Ads Manager.',
    };
  });
