import { describe, expect, it } from 'vitest';
import { LEGACY_AUTHENTICATED_ROUTE_COUNT, legacyAuthenticatedRoutes } from './legacyRouteManifest';

describe('legacy route parity', () => {
  it('registers every authenticated leaf route', () => {
    // Every screen file under _authenticated/ must have a manifest entry, so
    // the expected count is derived from the filesystem instead of hardcoded.
    const routeFiles = Object.keys(import.meta.glob('./_authenticated/**/*.tsx'));
    expect(legacyAuthenticatedRoutes).toHaveLength(routeFiles.length);
    expect(LEGACY_AUTHENTICATED_ROUTE_COUNT).toBe(routeFiles.length);
  });
});
