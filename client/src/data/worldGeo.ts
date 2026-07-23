import { feature } from 'topojson-client';
import { geoBounds } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
// world-atlas ships TopoJSON of every country. We render it as vector "land" so
// selecting any country produces a clean MapChart-style background automatically —
// no bitmap images, and it aligns perfectly with routes because it shares the
// exact same projection. The 110m topology keeps the interactive route-map
// chunk small; country-specific admin boundaries are still loaded on demand
// from the higher-detail files in public/admin1.
import countries110m from 'world-atlas/countries-110m.json';
// India drawn with its official (claimed) boundary — full Jammu & Kashmir
// including Gilgit-Baltistan and Aksai Chin. Extracted from Natural Earth's
// "admin_0_countries_ind" (India point-of-view) dataset, simplified to match
// the surrounding world data.
import indiaClaim from './indiaClaim.json';

type CountryFeature = Feature<Geometry, { name: string }>;

const topology = countries110m as unknown as Topology<{
  countries: GeometryCollection<{ name: string }>;
}>;
const collection = feature(topology, topology.objects.countries) as unknown as FeatureCollection<
  Geometry,
  { name: string }
>;

export const INDIA_CLAIM_FEATURE: CountryFeature = {
  type: 'Feature',
  properties: { name: 'India' },
  geometry: (indiaClaim as unknown as FeatureCollection<Geometry>).features[0].geometry,
};

export const ALL_COUNTRY_FEATURES: CountryFeature[] = collection.features
  .filter((f) => f.properties && f.properties.name)
  .map((f) => (f.properties.name === 'India' ? INDIA_CLAIM_FEATURE : f))
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

const FEATURE_BY_NAME = new Map<string, CountryFeature>(
  ALL_COUNTRY_FEATURES.map((f) => [f.properties.name, f]),
);

export const COUNTRY_NAMES: string[] = ALL_COUNTRY_FEATURES.map((f) => f.properties.name);

export function getCountryFeature(name: string): CountryFeature | null {
  return FEATURE_BY_NAME.get(name) ?? null;
}

/** Names the US atlas entry might use, so we can pick an Albers projection for it. */
const US_NAMES = new Set(['United States of America', 'United States', 'USA']);
export function isUsaName(name: string): boolean {
  return US_NAMES.has(name);
}

/** [[west, south], [east, north]] with antimeridian wrap normalised so east > west. */
export function getCountryBounds(name: string): {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
} | null {
  const f = getCountryFeature(name);
  if (!f) return null;
  const [[w, s], [e0, n]] = geoBounds(f);
  const e = e0 < w ? e0 + 360 : e0;
  return { minLng: w, maxLng: e, minLat: s, maxLat: n };
}

const mercY = (lat: number) =>
  Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));

/** Cheap Mercator aspect ratio (x span / y span) used only to size the canvas. */
export function getCountryAspect(name: string): number {
  const b = getCountryBounds(name);
  if (!b) return 1;
  const xSpan = ((b.maxLng - b.minLng) * Math.PI) / 180;
  const ySpan = Math.max(1e-3, mercY(b.maxLat) - mercY(b.minLat));
  const aspect = xSpan / ySpan;
  return Math.max(0.45, Math.min(2.6, aspect));
}
