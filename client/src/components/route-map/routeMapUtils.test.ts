import { describe, expect, it } from 'vitest';
import type { RouteSegment, RouteStop } from './routeMapTypes';
import {
  haversineKm,
  rebuildLinearChain,
  totalRouteKm,
  validateLat,
  validateLng,
  validateRoute,
} from './routeMapUtils';

function stop(id: string, name: string, lat: number, lng: number): RouteStop {
  return { id, name, lat, lng };
}

function segment(
  id: string,
  fromStopId: string,
  toStopId: string,
  overrides: Partial<RouteSegment> = {},
): RouteSegment {
  return {
    id,
    fromStopId,
    toStopId,
    mode: 'land',
    curve: 0.25,
    ...overrides,
  };
}

describe('route coordinate validation', () => {
  it('accepts inclusive latitude boundaries and rejects invalid values', () => {
    expect(validateLat(-90)).toBe(true);
    expect(validateLat(0)).toBe(true);
    expect(validateLat(90)).toBe(true);
    expect(validateLat(-90.0001)).toBe(false);
    expect(validateLat(90.0001)).toBe(false);
    expect(validateLat(Number.NaN)).toBe(false);
    expect(validateLat(Number.POSITIVE_INFINITY)).toBe(false);
    expect(validateLat(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('accepts inclusive longitude boundaries and rejects invalid values', () => {
    expect(validateLng(-180)).toBe(true);
    expect(validateLng(0)).toBe(true);
    expect(validateLng(180)).toBe(true);
    expect(validateLng(-180.0001)).toBe(false);
    expect(validateLng(180.0001)).toBe(false);
    expect(validateLng(Number.NaN)).toBe(false);
    expect(validateLng(Number.POSITIVE_INFINITY)).toBe(false);
    expect(validateLng(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});

describe('validateRoute', () => {
  const london = stop('london', 'London', 51.5074, -0.1278);
  const paris = stop('paris', 'Paris', 48.8566, 2.3522);

  it('accepts a valid route', () => {
    expect(validateRoute([london, paris], [segment('leg-1', 'london', 'paris')])).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('reports blank names and invalid coordinates', () => {
    const result = validateRoute([stop('invalid', '   ', 91, -181)], []);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Stop 1: name is required.',
      '   : latitude must be between -90 and 90.',
      '   : longitude must be between -180 and 180.',
    ]);
  });

  it('reports missing stop references', () => {
    const result = validateRoute([london], [segment('leg-1', 'london', 'missing')]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Route 1: references a stop that no longer exists.');
  });

  it('reports self-referencing segments', () => {
    const result = validateRoute([london], [segment('leg-1', 'london', 'london')]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Route 1: start and end stops must differ.');
  });
});

describe('route distances', () => {
  const london = stop('london', 'London', 51.5074, -0.1278);
  const paris = stop('paris', 'Paris', 48.8566, 2.3522);

  it('returns zero for identical points', () => {
    expect(haversineKm(london.lat, london.lng, london.lat, london.lng)).toBe(0);
  });

  it('matches the documented London-to-Paris great-circle distance', () => {
    // Commonly reported great-circle distance is approximately 344 km.
    expect(haversineKm(london.lat, london.lng, paris.lat, paris.lng)).toBeCloseTo(344, -1);
  });

  it('sums valid adjacent legs and skips legs containing invalid coordinates', () => {
    const invalid = stop('invalid', 'Invalid', Number.NaN, 0);

    expect(totalRouteKm([london, paris])).toBeCloseTo(344, -1);
    expect(totalRouteKm([london, paris, invalid])).toBeCloseTo(344, -1);
    expect(totalRouteKm([london, invalid, paris])).toBe(0);
  });
});

describe('rebuildLinearChain', () => {
  it('preserves surviving links with their mode, curve, and waypoints', () => {
    const stops = [stop('a', 'A', 0, 0), stop('b', 'B', 1, 1), stop('c', 'C', 2, 2)];
    const preserved = segment('kept', 'a', 'b', {
      mode: 'flight',
      curve: -0.4,
      waypoints: [{ lat: 0.5, lng: 0.25 }],
    });

    const rebuilt = rebuildLinearChain(stops, [preserved]);

    expect(rebuilt[0]).toBe(preserved);
    expect(rebuilt[0]).toMatchObject({
      id: 'kept',
      mode: 'flight',
      curve: -0.4,
      waypoints: [{ lat: 0.5, lng: 0.25 }],
    });
  });

  it('uses safe defaults for newly created links', () => {
    const stops = [stop('a', 'A', 0, 0), stop('b', 'B', 1, 1), stop('c', 'C', 2, 2)];

    const rebuilt = rebuildLinearChain(stops, []);

    expect(rebuilt).toHaveLength(2);
    expect(
      rebuilt.map(({ fromStopId, toStopId, mode, curve }) => ({
        fromStopId,
        toStopId,
        mode,
        curve,
      })),
    ).toEqual([
      { fromStopId: 'a', toStopId: 'b', mode: 'land', curve: 0.25 },
      { fromStopId: 'b', toStopId: 'c', mode: 'land', curve: 0.25 },
    ]);
    expect(rebuilt[0].id).toMatch(/^seg_/);
    expect(rebuilt[1].id).toMatch(/^seg_/);
  });
});
