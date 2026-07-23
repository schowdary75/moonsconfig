import type { MapConfig } from '@/components/route-map/routeMapTypes';
import { COUNTRY_NAMES, getCountryBounds, getCountryAspect, isUsaName } from './worldGeo';

// Curated entries. These keep stable ids that the sample routes reference.
// Backgrounds are drawn as vector land (from world-atlas) via `fitFeatureName` /
// `bounds`, so nothing needs to be uploaded — selecting the map is enough.

export const BUILT_IN_MAP_CONFIGS: MapConfig[] = [
  {
    id: 'world',
    countryName: 'World / Global',
    backgroundImage: '',
    width: 1000,
    height: 520,
    projectionType: 'naturalEarth1',
    bounds: { minLng: -170, maxLng: 190, minLat: -58, maxLat: 84 },
    mapArea: { x: 0, y: 0, width: 1000, height: 520 },
  },
  {
    id: 'india',
    countryName: 'India',
    backgroundImage: '',
    width: 760,
    height: 840,
    projectionType: 'mercator',
    fitFeatureName: 'India',
    admin1Countries: ['India'],
    bounds: { minLng: 67.5, maxLng: 98.5, minLat: 6, maxLat: 37.5 },
    mapArea: { x: 0, y: 0, width: 760, height: 840 },
  },
  {
    id: 'nordics',
    countryName: 'Norway / Nordics',
    backgroundImage: '',
    width: 780,
    height: 1040,
    projectionType: 'mercator',
    // region spanning several countries → fit to a bounds rectangle, not one feature
    admin1Countries: ['Norway', 'Sweden', 'Finland'],
    bounds: { minLng: 3, maxLng: 33, minLat: 57, maxLat: 71.6 },
    mapArea: { x: 0, y: 0, width: 780, height: 1040 },
  },
  {
    id: 'usa',
    countryName: 'USA',
    backgroundImage: '',
    width: 1000,
    height: 620,
    projectionType: 'albersUsa',
    fitFeatureName: 'United States of America',
    admin1Countries: ['United States of America'],
    bounds: { minLng: -125, maxLng: -66, minLat: 24, maxLat: 49.5 },
    mapArea: { x: 0, y: 0, width: 1000, height: 620 },
  },
  {
    id: 'europe',
    countryName: 'Europe',
    backgroundImage: '',
    width: 900,
    height: 840,
    projectionType: 'mercator',
    bounds: { minLng: -12, maxLng: 45, minLat: 35, maxLat: 72 },
    mapArea: { x: 0, y: 0, width: 900, height: 840 },
  },
];

const CURATED_COUNTRY_NAMES = new Set(['India', 'United States of America']);

/** Build a ready-to-use config for any world-atlas country, on demand. */
const countryConfigCache = new Map<string, MapConfig>();
export function buildCountryConfig(name: string): MapConfig {
  const cached = countryConfigCache.get(name);
  if (cached) return cached;

  const aspect = getCountryAspect(name); // width / height
  const MAX = 900;
  let width: number;
  let height: number;
  if (aspect >= 1) {
    width = MAX;
    height = Math.round(MAX / aspect);
  } else {
    height = MAX;
    width = Math.round(MAX * aspect);
  }
  const usa = isUsaName(name);
  const config: MapConfig = {
    id: `country:${name}`,
    countryName: name,
    backgroundImage: '',
    width,
    height,
    projectionType: usa ? 'albersUsa' : 'mercator',
    fitFeatureName: name,
    admin1Countries: [name],
    bounds: getCountryBounds(name) ?? undefined,
    mapArea: { x: 0, y: 0, width, height },
  };
  countryConfigCache.set(name, config);
  return config;
}

/** All selectable country names (curated first, then the full atlas A→Z). */
export function getSelectableCountries(): { id: string; label: string }[] {
  const atlas = COUNTRY_NAMES.filter((n) => !CURATED_COUNTRY_NAMES.has(n)).map((n) => ({
    id: `country:${n}`,
    label: n,
  }));
  return atlas;
}

/** Resolve any selectable id (built-in, `country:*`, or custom) to a config. */
export function resolveConfigById(id: string, custom: MapConfig[]): MapConfig | null {
  const builtIn = BUILT_IN_MAP_CONFIGS.find((c) => c.id === id);
  if (builtIn) return builtIn;
  const customCfg = custom.find((c) => c.id === id);
  if (customCfg) return customCfg;
  if (id.startsWith('country:')) return buildCountryConfig(id.slice('country:'.length));
  return null;
}

export const CUSTOM_MAP_CONFIGS_KEY = 'route_map_custom_configs';
export const CALIBRATION_KEY_PREFIX = 'route_map_calibration_';
export const LAST_ROUTE_DOC_KEY = 'route_map_last_document';

export function loadCustomConfigs(): MapConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_MAP_CONFIGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MapConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomConfigs(configs: MapConfig[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CUSTOM_MAP_CONFIGS_KEY, JSON.stringify(configs));
}
