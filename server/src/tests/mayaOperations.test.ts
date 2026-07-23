import { describe, expect, it } from 'vitest';
import { OUTBOUND } from '../legacy/travel-trends-data.js';
import {
  mayaCampaignRequestSchema,
  resolveMayaCampaignTrends,
} from '../operations/mayaOperations.js';

const inboundContext = {
  name: 'Golden Triangle & Rajasthan',
  region: 'Golden Triangle & Rajasthan',
  vertical: 'inbound' as const,
  demand: 'explosive' as const,
  confidence: 'proven' as const,
  trajectory: '2024: established → 2025: growing → 2026: scale',
  growthSignal: 'Strong multi-market demand for first-visit India circuits.',
  source: 'Ministry of Tourism · Data Compendium 2025',
  entry: 'India e-Visa for eligible passports',
  bestMonths: 'Oct–Mar',
  adWindow: 'Launch 90–180 days ahead',
  budget: 'US$900–2,800 pp · indicative land-only',
  audience: 'USA, UK, Australia, Germany and France culture travellers.',
  angle: 'Private guides, heritage stays and seamless multi-city transfers.',
  googleKeywords: ['golden triangle private tour India'],
  metaInterests: ['India travel', 'Cultural tourism'],
  targetLocations: ['USA', 'United Kingdom', 'Australia'],
  languages: ['English'],
};

describe('Maya campaign trend contexts', () => {
  it('preserves the original built-in destination lookup', () => {
    const [builtInDestination] = OUTBOUND;
    if (!builtInDestination) throw new Error('Expected at least one built-in outbound destination');
    const resolved = resolveMayaCampaignTrends([builtInDestination.name]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      name: builtInDestination.name,
      vertical: 'outbound',
      targetLocations: ['India'],
      languages: ['English', 'Hindi'],
    });
  });

  it('resolves a validated inbound context with foreign targeting', () => {
    const parsed = mayaCampaignRequestSchema.parse({
      auth: { email: 'admin@example.com', sessionToken: 'session-token' },
      destinations: [inboundContext.name],
      budget: 50000,
      goal: 'leads',
      platform: 'meta',
      trendContexts: [inboundContext],
    });
    const resolved = resolveMayaCampaignTrends(parsed.destinations, parsed.trendContexts);
    expect(resolved[0]).toMatchObject({
      name: inboundContext.name,
      vertical: 'inbound',
      targetLocations: inboundContext.targetLocations,
      languages: inboundContext.languages,
    });
  });

  it('rejects incomplete or unbounded client-supplied contexts', () => {
    const result = mayaCampaignRequestSchema.safeParse({
      auth: { email: 'admin@example.com', sessionToken: 'session-token' },
      destinations: [inboundContext.name],
      budget: 50000,
      goal: 'leads',
      platform: 'meta',
      trendContexts: [{ ...inboundContext, targetLocations: [] }],
    });
    expect(result.success).toBe(false);
  });
});
