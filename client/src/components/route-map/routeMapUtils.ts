import {
  geoMercator,
  geoNaturalEarth1,
  geoEquirectangular,
  geoAlbersUsa,
  type GeoProjection,
} from 'd3-geo';
import type {
  MapConfig,
  MapBounds,
  CalibrationPoint,
  RouteStop,
  RouteSegment,
  RouteDocument,
} from './routeMapTypes';
import { CALIBRATION_KEY_PREFIX } from '@/data/mapConfigs';
import { getCountryFeature } from '@/data/worldGeo';

// ─────────────────────────────────────────────────────────────────────────────
// ids
// ─────────────────────────────────────────────────────────────────────────────
export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// projection
// ─────────────────────────────────────────────────────────────────────────────
const PROJECTION_FACTORIES: Record<string, (() => GeoProjection) | undefined> = {
  mercator: geoMercator,
  naturalEarth1: geoNaturalEarth1,
  equirectangular: geoEquirectangular,
  albersUsa: geoAlbersUsa,
};

function boundsToFeature(bounds: MapBounds): GeoJSON.Feature {
  const { minLng, maxLng, minLat, maxLat } = bounds;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPoint',
      coordinates: [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
      ],
    },
  };
}

/** Build a fitted d3 projection for a config, or null when using the "custom" fallback. */
export function buildProjection(config: MapConfig): GeoProjection | null {
  const factory = PROJECTION_FACTORIES[config.projectionType];
  if (!factory) return null;
  const projection = factory();
  const { mapArea, bounds, fitFeatureName } = config;

  // Fit to the real country geometry when available (accurate for any shape),
  // leaving a small ocean margin so labels near the coast aren't clipped.
  if (fitFeatureName) {
    const feature = getCountryFeature(fitFeatureName);
    if (feature) {
      const insetX = mapArea.width * 0.14;
      const insetY = mapArea.height * 0.14;
      try {
        projection.fitExtent(
          [
            [mapArea.x + insetX, mapArea.y + insetY],
            [mapArea.x + mapArea.width - insetX, mapArea.y + mapArea.height - insetY],
          ],
          feature,
        );
        return projection;
      } catch {
        /* fall through to bounds */
      }
    }
  }

  if (bounds) {
    try {
      if (bounds.maxLng - bounds.minLng >= 359) {
        const worldExtent: [[number, number], [number, number]] = [
          [mapArea.x, mapArea.y],
          [mapArea.x + mapArea.width, mapArea.y + mapArea.height],
        ];
        projection.fitExtent(worldExtent, { type: 'Sphere' });
      } else {
        const padX = mapArea.width * 0.12;
        const padY = mapArea.height * 0.12;
        const padExtent: [[number, number], [number, number]] = [
          [mapArea.x + padX, mapArea.y + padY],
          [mapArea.x + mapArea.width - padX, mapArea.y + mapArea.height - padY],
        ];
        projection.fitExtent(padExtent, boundsToFeature(bounds));
      }
    } catch {
      return null;
    }
  }
  return projection;
}

// ─────────────────────────────────────────────────────────────────────────────
// affine calibration (least squares over >= 3 calibration points)
//   x = a*lng + b*lat + c ,  y = d*lng + e*lat + f
// ─────────────────────────────────────────────────────────────────────────────
type Affine = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

function solve3x3(A: number[][], rhs: number[]): number[] | null {
  // Gaussian elimination with partial pivoting.
  const m = A.map((row, i) => [...row, rhs[i]]);
  const n = 3;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let k = col; k <= n; k++) m[r][k] -= factor * m[col][k];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

function fitAffine(points: CalibrationPoint[]): Affine | null {
  if (points.length < 3) return null;
  // Normal equations for [lng, lat, 1] -> x  and  -> y
  let Sll = 0,
    Sla = 0,
    Sl = 0,
    Saa = 0,
    Sa = 0,
    S1 = 0;
  let Sxl = 0,
    Sxa = 0,
    Sx = 0,
    Syl = 0,
    Sya = 0,
    Sy = 0;
  for (const p of points) {
    const { lng, lat, x, y } = p;
    Sll += lng * lng;
    Sla += lng * lat;
    Sl += lng;
    Saa += lat * lat;
    Sa += lat;
    S1 += 1;
    Sxl += x * lng;
    Sxa += x * lat;
    Sx += x;
    Syl += y * lng;
    Sya += y * lat;
    Sy += y;
  }
  const M = [
    [Sll, Sla, Sl],
    [Sla, Saa, Sa],
    [Sl, Sa, S1],
  ];
  const solX = solve3x3(M, [Sxl, Sxa, Sx]);
  const solY = solve3x3(M, [Syl, Sya, Sy]);
  if (!solX || !solY) return null;
  return {
    a: solX[0],
    b: solX[1],
    c: solX[2],
    d: solY[0],
    e: solY[1],
    f: solY[2],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// core: latLng -> pixel
// ─────────────────────────────────────────────────────────────────────────────
export interface ProjectionContext {
  config: MapConfig;
  projection: GeoProjection | null;
  affine: Affine | null;
}

export function createProjectionContext(config: MapConfig): ProjectionContext {
  const calibration = config.calibrationPoints ?? [];
  return {
    config,
    projection: buildProjection(config),
    affine: calibration.length >= 3 ? fitAffine(calibration) : null,
  };
}

function boundsToPoint(lat: number, lng: number, config: MapConfig): [number, number] {
  const { mapArea, bounds } = config;
  if (!bounds) return [mapArea.x + mapArea.width / 2, mapArea.y + mapArea.height / 2];
  const { minLng, maxLng, minLat, maxLat } = bounds;
  const fx = (lng - minLng) / (maxLng - minLng || 1);
  const fy = (maxLat - lat) / (maxLat - minLat || 1);
  return [mapArea.x + fx * mapArea.width, mapArea.y + fy * mapArea.height];
}

/**
 * Convert lng/lat into SVG x/y pixel coordinates for a given map config.
 * Priority: calibration affine (>=3 pts) → d3 projection → bounds fallback.
 */
export function latLngToPoint(
  lat: number,
  lng: number,
  config: MapConfig,
  ctx?: ProjectionContext,
): [number, number] {
  const context = ctx ?? createProjectionContext(config);
  if (context.affine) {
    const { a, b, c, d, e, f } = context.affine;
    return [a * lng + b * lat + c, d * lng + e * lat + f];
  }
  if (context.projection) {
    const projected = context.projection([lng, lat]);
    if (projected && Number.isFinite(projected[0]) && Number.isFinite(projected[1])) {
      return projected;
    }
  }
  return boundsToPoint(lat, lng, config);
}

/**
 * Inverse of {@link latLngToPoint}: turn an SVG pixel back into lng/lat using the
 * same projection/affine/bounds priority. Used when dragging waypoint handles.
 */
export function pointToLatLng(
  x: number,
  y: number,
  config: MapConfig,
  ctx?: ProjectionContext,
): { lng: number; lat: number } | null {
  const context = ctx ?? createProjectionContext(config);
  if (context.affine) {
    const { a, b, c, d, e, f } = context.affine;
    // Solve [a b; d e] * [lng lat] = [x-c, y-f]
    const det = a * e - b * d;
    if (Math.abs(det) < 1e-9) return null;
    const px = x - c;
    const py = y - f;
    return { lng: (e * px - b * py) / det, lat: (a * py - d * px) / det };
  }
  if (context.projection && context.projection.invert) {
    const inv = context.projection.invert([x, y]);
    if (inv && Number.isFinite(inv[0]) && Number.isFinite(inv[1])) {
      return { lng: inv[0], lat: inv[1] };
    }
  }
  const { mapArea, bounds } = config;
  if (bounds && mapArea.width && mapArea.height) {
    const fx = (x - mapArea.x) / mapArea.width;
    const fy = (y - mapArea.y) / mapArea.height;
    return {
      lng: bounds.minLng + fx * (bounds.maxLng - bounds.minLng),
      lat: bounds.maxLat - fy * (bounds.maxLat - bounds.minLat),
    };
  }
  return null;
}

/**
 * Smooth Catmull-Rom spline through an ordered list of pixel points
 * ([from, ...waypoints, to]). Returns the same geometry shape as
 * {@link createCurvedPath} so the renderer can treat all leg types uniformly.
 */
export function createSplinePath(points: [number, number][]): CurveGeometry {
  if (points.length < 3) {
    // Nothing to spline — fall back to a straight/2-point line.
    return createPolylineGeometry(points);
  }

  // Catmull-Rom → cubic Bézier for a smooth curve that passes through each point.
  let path = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  const sampled: [number, number][] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    // Sample the cubic so mid/angle/length reuse the polyline math.
    for (let s = 1; s <= 8; s++) {
      const t = s / 8;
      const mt = 1 - t;
      const bx =
        mt * mt * mt * p1[0] + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * p2[0];
      const by =
        mt * mt * mt * p1[1] + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p2[1];
      sampled.push([bx, by]);
    }
  }
  const metrics = createPolylineGeometry(sampled);
  return { ...metrics, path };
}

/** Great-circle distance between two lat/lng points, in km. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total distance along the ordered stops, in km. */
export function totalRouteKm(stops: RouteStop[]): number {
  let sum = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (validateLat(a.lat) && validateLng(a.lng) && validateLat(b.lat) && validateLng(b.lng)) {
      sum += haversineKm(a.lat, a.lng, b.lat, b.lng);
    }
  }
  return sum;
}

/** Is a projected pixel point inside the map frame (plus a generous margin)? */
export function isWithinFrame(
  point: [number, number],
  config: MapConfig,
  marginRatio = 0.25,
): boolean {
  const mx = config.width * marginRatio;
  const my = config.height * marginRatio;
  const [x, y] = point;
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= -mx &&
    x <= config.width + mx &&
    y >= -my &&
    y <= config.height + my
  );
}

/** Rebuild segments as a linear chain, preserving mode/curve of surviving links. */
export function rebuildLinearChain(stops: RouteStop[], prev: RouteSegment[]): RouteSegment[] {
  const byPair = new Map(prev.map((s) => [`${s.fromStopId}->${s.toStopId}`, s]));
  const next: RouteSegment[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i].id;
    const to = stops[i + 1].id;
    next.push(
      byPair.get(`${from}->${to}`) ?? {
        id: createId('seg'),
        fromStopId: from,
        toStopId: to,
        mode: prev[i]?.mode ?? 'land',
        curve: prev[i]?.curve ?? 0.25,
      },
    );
  }
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// curved paths
// ─────────────────────────────────────────────────────────────────────────────
export interface CurveGeometry {
  path: string;
  midX: number;
  midY: number;
  angleDeg: number;
  length: number;
}

function quadraticBezierLength(
  startX: number,
  startY: number,
  controlX: number,
  controlY: number,
  endX: number,
  endY: number,
): number {
  // A short fixed sampling pass is stable and more than accurate enough for
  // deciding whether a route icon has room between its endpoint markers.
  const STEPS = 24;
  let length = 0;
  let previousX = startX;
  let previousY = startY;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const mt = 1 - t;
    const x = mt * mt * startX + 2 * mt * t * controlX + t * t * endX;
    const y = mt * mt * startY + 2 * mt * t * controlY + t * t * endY;
    length += Math.hypot(x - previousX, y - previousY);
    previousX = x;
    previousY = y;
  }
  return length;
}

/**
 * Quadratic Bezier "travel arc". curveAmount is a signed factor (-1..1); the
 * control point is offset perpendicular to the chord by curveAmount * length/2.
 * The tangent at the midpoint of a quadratic is always parallel to the chord,
 * so the icon angle is simply the chord direction.
 */
export function createCurvedPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  curveAmount = 0.25,
): CurveGeometry {
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy) || 1;
  const mx = (startX + endX) / 2;
  const my = (startY + endY) / 2;
  // perpendicular unit vector
  const nx = -dy / length;
  const ny = dx / length;
  const offset = curveAmount * length * 0.5;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;

  // midpoint of quadratic at t = 0.5
  const midX = 0.25 * startX + 0.5 * cx + 0.25 * endX;
  const midY = 0.25 * startY + 0.5 * cy + 0.25 * endY;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  const path =
    curveAmount === 0
      ? `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${endX.toFixed(2)} ${endY.toFixed(2)}`
      : `M ${startX.toFixed(2)} ${startY.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${endX.toFixed(2)} ${endY.toFixed(2)}`;

  const pathLength =
    curveAmount === 0 ? length : quadraticBezierLength(startX, startY, cx, cy, endX, endY);

  return { path, midX, midY, angleDeg, length: pathLength };
}

// ─────────────────────────────────────────────────────────────────────────────
// polyline (OSRM) geometry
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchOsrmRoute(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
): Promise<[number, number][] | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;
    return data.routes[0].geometry.coordinates as [number, number][];
  } catch {
    return null;
  }
}

export function createPolylineGeometry(points: [number, number][]): CurveGeometry {
  if (points.length === 0) return { path: '', midX: 0, midY: 0, angleDeg: 0, length: 0 };
  if (points.length === 1) {
    return {
      path: `M ${points[0][0]} ${points[0][1]}`,
      midX: points[0][0],
      midY: points[0][1],
      angleDeg: 0,
      length: 0,
    };
  }

  let path = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  let totalLength = 0;
  const segData: { length: number; dx: number; dy: number }[] = [];

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    path += ` L ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy);
    totalLength += len;
    segData.push({ length: len, dx, dy });
  }

  const targetLength = totalLength / 2;
  const pointAtLength = (distance: number): [number, number] => {
    let travelled = 0;
    for (let i = 0; i < segData.length; i++) {
      const seg = segData[i];
      if (seg.length === 0) continue;
      if (travelled + seg.length >= distance) {
        const ratio = Math.max(0, Math.min(1, (distance - travelled) / seg.length));
        return [points[i][0] + seg.dx * ratio, points[i][1] + seg.dy * ratio];
      }
      travelled += seg.length;
    }
    return points[points.length - 1];
  };

  const [midX, midY] = pointAtLength(targetLength);
  // Sample on both sides of the anchor. This follows bends naturally and avoids
  // an arbitrary incoming/outgoing angle when the midpoint lands on a vertex.
  const tangentWindow = Math.min(6, totalLength / 4);
  const before = pointAtLength(Math.max(0, targetLength - tangentWindow));
  const after = pointAtLength(Math.min(totalLength, targetLength + tangentWindow));
  let tangentDx = after[0] - before[0];
  let tangentDy = after[1] - before[1];
  if (tangentDx === 0 && tangentDy === 0) {
    const fallback = segData.find((seg) => seg.length > 0);
    tangentDx = fallback?.dx ?? 1;
    tangentDy = fallback?.dy ?? 0;
  }
  const angleDeg = (Math.atan2(tangentDy, tangentDx) * 180) / Math.PI;

  return { path, midX, midY, angleDeg, length: totalLength };
}

// ─────────────────────────────────────────────────────────────────────────────
// label placement
// ─────────────────────────────────────────────────────────────────────────────
export interface LabelPlacement {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  needsLeader: boolean;
}

export function resolveLabelPlacement(
  stop: RouteStop,
  point: [number, number],
  position: RouteStop['labelPosition'],
  fallbackSide: 'left' | 'right',
): LabelPlacement {
  const [x, y] = point;
  const gap = 12;
  const resolved =
    !position || position === 'auto' ? (fallbackSide === 'left' ? 'left' : 'right') : position;
  switch (resolved) {
    case 'top':
      return { x, y: y - gap, anchor: 'middle', needsLeader: false };
    case 'bottom':
      return { x, y: y + gap + 4, anchor: 'middle', needsLeader: false };
    case 'left':
      return { x: x - gap, y: y + 4, anchor: 'end', needsLeader: false };
    case 'right':
    default:
      return { x: x + gap, y: y + 4, anchor: 'start', needsLeader: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// calibration persistence
// ─────────────────────────────────────────────────────────────────────────────
export function loadCalibration(configId: string): CalibrationPoint[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CALIBRATION_KEY_PREFIX + configId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CalibrationPoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCalibration(configId: string, points: CalibrationPoint[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CALIBRATION_KEY_PREFIX + configId, JSON.stringify(points));
}

export function clearCalibration(configId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CALIBRATION_KEY_PREFIX + configId);
}

// ─────────────────────────────────────────────────────────────────────────────
// geocoding (place name -> lat/lng) via OpenStreetMap Nominatim
//   - free, CORS-enabled, no API key
//   - usage policy: keep it light; we debounce in the UI and cap results
// ─────────────────────────────────────────────────────────────────────────────
export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
  displayName: string;
}

interface NominatimItem {
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
}

/** Names that shouldn't be used to bias a place query (world / regions). */
const NON_BIAS_NAMES = new Set(['World / Global', 'Norway / Nordics']);

export async function geocodePlace(
  query: string,
  opts: { countryName?: string; signal?: AbortSignal } = {},
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const bias = opts.countryName && !NON_BIAS_NAMES.has(opts.countryName) ? opts.countryName : '';
  const q = bias ? `${trimmed}, ${bias}` : trimmed;

  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1' +
    '&accept-language=en&q=' +
    encodeURIComponent(q);

  const res = await fetch(url, {
    signal: opts.signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = (await res.json()) as NominatimItem[];

  const seen = new Set<string>();
  const results: GeocodeResult[] = [];
  for (const item of data) {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      name: item.name?.trim() || item.display_name.split(',')[0].trim(),
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      displayName: item.display_name,
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// validation
// ─────────────────────────────────────────────────────────────────────────────
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function validateLng(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

export function validateRoute(stops: RouteStop[], segments: RouteSegment[]): ValidationResult {
  const errors: string[] = [];
  const ids = new Set(stops.map((s) => s.id));

  stops.forEach((stop, i) => {
    if (!stop.name.trim()) errors.push(`Stop ${i + 1}: name is required.`);
    if (!validateLat(stop.lat))
      errors.push(`${stop.name || `Stop ${i + 1}`}: latitude must be between -90 and 90.`);
    if (!validateLng(stop.lng))
      errors.push(`${stop.name || `Stop ${i + 1}`}: longitude must be between -180 and 180.`);
  });

  segments.forEach((seg, i) => {
    if (!ids.has(seg.fromStopId) || !ids.has(seg.toStopId)) {
      errors.push(`Route ${i + 1}: references a stop that no longer exists.`);
    }
    if (seg.fromStopId === seg.toStopId) {
      errors.push(`Route ${i + 1}: start and end stops must differ.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON import / export
// ─────────────────────────────────────────────────────────────────────────────
export function serializeRoute(doc: RouteDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function parseRouteDocument(raw: string): RouteDocument {
  const parsed = JSON.parse(raw) as RouteDocument;
  if (!parsed || !Array.isArray(parsed.stops) || !Array.isArray(parsed.segments)) {
    throw new Error('Invalid route JSON: expected { stops: [], segments: [] }.');
  }
  return {
    version: 1,
    mapConfigId: parsed.mapConfigId ?? 'world',
    stops: parsed.stops,
    segments: parsed.segments,
    arrivalMode: ['flight', 'land', 'cruise', 'rail', 'none'].includes(parsed.arrivalMode || '')
      ? parsed.arrivalMode
      : 'flight',
    departureMode: ['flight', 'land', 'cruise', 'rail', 'none'].includes(parsed.departureMode || '')
      ? parsed.departureMode
      : 'flight',
  };
}
