import { describe, expect, it } from 'vitest';
import {
  buildHomeFeaturedDestinationsResponse,
  canonicalDestination,
  quarterForIndiaDate,
} from '../compatibility/homeOrbit.js';

const packages = [
  ['Thailand', 'Thailand', 52000],
  ['Vietnam', 'Vietnam', 61000],
  ['Bali', 'Indonesia', 68000],
  ['Georgia', 'Georgia', 72000],
  ['Kashmir', 'India', 36000],
  ['Kerala', 'India', 41000],
  ['Dubai', 'UAE', 59000],
].map(([destination, country, price], index) => ({
  destination: String(destination),
  country: String(country),
  price: Number(price),
  slug: `${String(destination).toLowerCase()}-${index}`,
  image_url: `/images/${String(destination).toLowerCase()}.webp`,
}));

describe('home featured destination selection', () => {
  it('uses India time for quarter boundaries', () => {
    expect(quarterForIndiaDate(new Date('2026-06-30T18:29:59.000Z'))).toBe('q2');
    expect(quarterForIndiaDate(new Date('2026-06-30T18:30:00.000Z'))).toBe('q3');
  });

  it.each([
    [1, 'q1'],
    [2, 'q1'],
    [3, 'q1'],
    [4, 'q2'],
    [5, 'q2'],
    [6, 'q2'],
    [7, 'q3'],
    [8, 'q3'],
    [9, 'q3'],
    [10, 'q4'],
    [11, 'q4'],
    [12, 'q4'],
  ])('maps month %i to %s', (month, expectedQuarter) => {
    expect(quarterForIndiaDate(new Date(Date.UTC(2026, Number(month) - 1, 15, 8)))).toBe(
      expectedQuarter,
    );
  });

  it('normalizes destination aliases', () => {
    expect(canonicalDestination('Baku, Azerbaijan')).toBe('azerbaijan');
    expect(canonicalDestination('Phuket · Thailand')).toBe('thailand');
    expect(canonicalDestination('Almaty')).toBe('kazakhstan');
  });

  it('returns six bookable destinations with a 4/2 international mix', () => {
    const response = buildHomeFeaturedDestinationsResponse({
      packages,
      now: new Date('2026-07-21T08:00:00.000Z'),
      season: {
        slug: 'q3',
        label: 'Jul – Sep',
        sell_now: JSON.stringify(['Kerala', 'Bali', 'Georgia', 'Thailand/Vietnam', 'Kashmir']),
      },
      trends: [],
      editorial: [{ name: 'Dubai', sort_order: 1 }],
    });

    expect(response.monthKey).toBe('2026-07');
    expect(response.destinations).toHaveLength(6);
    expect(response.destinations.filter((item) => item.country === 'India')).toHaveLength(2);
    expect(new Set(response.destinations.map((item) => item.name)).size).toBe(6);
    expect(response.destinations.every((item) => item.startingPrice > 0)).toBe(true);
    expect(response.destinations.every((item) => item.latitude !== null)).toBe(true);
  });

  it('drops unusable packages and gracefully returns the available set', () => {
    const response = buildHomeFeaturedDestinationsResponse({
      packages: [packages[0]!, { ...packages[1]!, image_url: '' }],
      now: new Date('2026-01-10T08:00:00.000Z'),
      season: null,
      trends: [],
      editorial: [],
    });
    expect(response.destinations.map((item) => item.name)).toEqual(['Thailand']);
  });

  it('prefers valid active-inventory coordinates and rejects invalid values', () => {
    const response = buildHomeFeaturedDestinationsResponse({
      packages: [packages[0]!, packages[1]!],
      now: new Date('2026-01-10T08:00:00.000Z'),
      season: null,
      trends: [],
      editorial: [],
      coordinates: [
        { destination: 'Thailand', latitude: 12.34, longitude: 98.76 },
        { destination: 'Vietnam', latitude: 200, longitude: 999 },
      ],
    });

    expect(response.destinations[0]).toMatchObject({ latitude: 12.34, longitude: 98.76 });
    expect(response.destinations[1]).toMatchObject({ latitude: 21.0285, longitude: 105.8542 });
  });
});
