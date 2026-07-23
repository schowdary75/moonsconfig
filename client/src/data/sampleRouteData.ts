import type { RouteDocument } from '@/components/route-map/routeMapTypes';

// Sample routes. lat/lng are approximate but geographically correct so they land
// in the right place under the projection defined in mapConfigs.ts.

let uid = 0;
const id = (p: string) => `${p}_${(uid++).toString(36)}`;

// ── India ────────────────────────────────────────────────────────────────────
const indiaStops = [
  { name: 'Delhi', lat: 28.61, lng: 77.209 },
  { name: 'Jaipur', lat: 26.912, lng: 75.787 },
  { name: 'Udaipur', lat: 24.585, lng: 73.712 },
  { name: 'Mumbai', lat: 19.076, lng: 72.878 },
  { name: 'Goa', lat: 15.3, lng: 74.083 },
  { name: 'Bengaluru', lat: 12.972, lng: 77.594 },
  { name: 'Chennai', lat: 13.083, lng: 80.271 },
];

const indiaModes = [
  'rail', // Delhi -> Jaipur
  'land', // Jaipur -> Udaipur
  'flight', // Udaipur -> Mumbai
  'flight', // Mumbai -> Goa
  'land', // Goa -> Bengaluru
  'rail', // Bengaluru -> Chennai
] as const;

function buildDocument(
  mapConfigId: string,
  stopsInput: { name: string; lat: number; lng: number }[],
  modes: readonly string[],
): RouteDocument {
  const stops = stopsInput.map((s) => ({ id: id('stop'), ...s }));
  const segments = modes.map((mode, i) => ({
    id: id('seg'),
    fromStopId: stops[i].id,
    toStopId: stops[i + 1].id,
    mode: mode as RouteDocument['segments'][number]['mode'],
    curve: 0.25,
  }));
  return { version: 1, mapConfigId, stops, segments };
}

export const INDIA_SAMPLE: RouteDocument = buildDocument('india', indiaStops, indiaModes);

export const SAMPLE_ROUTES: { label: string; document: RouteDocument }[] = [
  { label: 'Incredible India', document: INDIA_SAMPLE },
];
