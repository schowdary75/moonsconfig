import { describe, expect, it } from 'vitest';
import {
  destinations,
  getTrending2Destinations,
  getTrending2Keywords,
  marketRows,
  matchesTrending2,
  strategyDestinations,
  type TravelVertical,
} from './trending-strategy-data';

const verticals: TravelVertical[] = ['outbound', 'inbound', 'domestic'];

describe('Trending-2 destination strategy data', () => {
  it('creates one detailed record for every configured sellable destination or circuit', () => {
    for (const vertical of verticals) {
      const expectedNames = destinations[vertical].flatMap((group) => group.places).sort();
      const actualNames = strategyDestinations[vertical]
        .map((destination) => destination.name)
        .sort();
      expect(actualNames).toEqual(expectedNames);
    }
  });

  it('provides unique, campaign-ready detail for every card', () => {
    const allRecords = verticals.flatMap((vertical) => strategyDestinations[vertical]);
    expect(new Set(allRecords.map((record) => record.id)).size).toBe(allRecords.length);

    for (const record of allRecords) {
      expect(record.name).toBeTruthy();
      expect(record.region).toBeTruthy();
      expect(record.trajectory).toContain('2024:');
      expect(record.trajectory).toContain('2025:');
      expect(record.trajectory).toContain('2026:');
      expect(record.sourceUrl).toMatch(/^https:\/\//);
      expect(record.bestMonths).toBeTruthy();
      expect(record.adWindow).toBeTruthy();
      expect(record.budget).toBeTruthy();
      expect(record.targetMarkets.length).toBeGreaterThan(0);
      expect(record.languages.length).toBeGreaterThan(0);
      expect(record.googleKeywords.length).toBeGreaterThanOrEqual(5);
      expect(record.metaInterests.length).toBeGreaterThan(0);
      expect(record.angle).toBeTruthy();
    }
  });

  it('keeps every named city searchable through its card text', () => {
    for (const vertical of verticals) {
      for (const record of strategyDestinations[vertical]) {
        const searchable = [record.name, ...record.cities].join(' ').toLowerCase();
        for (const city of record.cities) expect(searchable).toContain(city.toLowerCase());
      }
    }
  });

  it('covers all required inbound source markets, including the GCC group', () => {
    const inboundMarkets = marketRows.inbound.map((row) => row.market).join(' ');
    for (const market of [
      'USA',
      'UK',
      'Bangladesh',
      'Sri Lanka',
      'Canada',
      'Australia',
      'Germany',
      'France',
      'Russia',
      'Nepal',
      'Malaysia',
      'China',
      'Japan',
      'South Korea',
      'Singapore',
      'Italy',
      'Spain',
      'Netherlands',
      'Israel',
      'GCC',
      'UAE',
      'Saudi Arabia',
      'Oman',
    ]) {
      expect(inboundMarkets).toContain(market);
    }
  });
});

describe('Trending-2 inventory matching helpers', () => {
  const december = new Date(2026, 11, 15);

  it('splits international and india pools by vertical', () => {
    const international = getTrending2Destinations('international', december);
    const india = getTrending2Destinations('india', december);
    expect(international.length).toBeGreaterThan(0);
    expect(india.length).toBeGreaterThan(0);
    expect(international.every((destination) => destination.vertical === 'outbound')).toBe(true);
    expect(india.every((destination) => destination.vertical !== 'outbound')).toBe(true);
    expect(getTrending2Destinations('all', december)).toHaveLength(
      international.length + india.length,
    );
  });

  it('always surfaces explosive-demand picks regardless of month', () => {
    for (const month of [0, 5, 11]) {
      const names = getTrending2Destinations('all', new Date(2026, month, 10)).map(
        (destination) => destination.name,
      );
      expect(names).toContain('Dubai / UAE');
      expect(names).toContain('Goa');
    }
  });

  it('includes in-season destinations by expanding month ranges', () => {
    // Safari circuits carry a 'Jun–Oct' season with rising demand; July sits
    // inside the range but is not literally present in the season string.
    const july = new Date(2026, 6, 10);
    const names = getTrending2Destinations('international', july).map(
      (destination) => destination.name,
    );
    expect(names).toContain('Kenya');
  });

  it('matches inventory text against keywords, including short place names', () => {
    const keywords = getTrending2Keywords('all', december);
    expect(matchesTrending2('Goa beach villa with pool', keywords)).toBe(true);
    expect(matchesTrending2('Phuket & Krabi island hopper', keywords)).toBe(true);
    expect(matchesTrending2('Bangkok Pattaya twin city deal', keywords)).toBe(true);
    expect(matchesTrending2('Antarctica expedition charter', keywords)).toBe(false);
    expect(matchesTrending2('', keywords)).toBe(false);
    expect(matchesTrending2(null, keywords)).toBe(false);
  });
});
