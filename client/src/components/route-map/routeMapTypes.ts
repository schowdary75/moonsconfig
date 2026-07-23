// Shared types for the MapChart Route Map Generator.
// A "route map" is a static, brochure-style travel map: a MapChart image is used
// purely as the visual background, while stops / routes / labels / icons are drawn
// as an SVG overlay positioned via a real lng/lat -> pixel projection.

export type TransportMode = 'flight' | 'land' | 'cruise' | 'rail';

/**
 * Arrival / departure transport. Unlike a segment (which always has a mode),
 * the entry/exit legs are optional — `'none'` hides that leg entirely on the
 * map, the legend, and the itinerary.
 */
export type EndpointMode = TransportMode | 'none';

export type LabelPosition = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export type ProjectionType =
  'mercator' | 'naturalEarth1' | 'equirectangular' | 'albersUsa' | 'custom';

export interface RouteStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Optional override label text (defaults to `name`). */
  label?: string;
  labelPosition?: LabelPosition;
}

export interface RouteSegment {
  id: string;
  fromStopId: string;
  toStopId: string;
  mode: TransportMode;
  /** -1..1 curvature. 0 = straight line. Ignored when `waypoints` are present. */
  curve?: number;
  /**
   * Optional intermediate control points (in geographic lng/lat) the leg is
   * routed through. When set, the leg is drawn as a smooth spline
   * from → waypoints → to instead of a single curved arc, letting the user
   * shape an arbitrary path by dragging handles on the map.
   */
  waypoints?: Array<{ lng: number; lat: number }>;
}

export interface MapBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export interface MapArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CalibrationPoint {
  name: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
}

export interface MapConfig {
  id: string;
  countryName: string;
  /** Data URL, imported asset URL, or "" for the generated ocean placeholder. */
  backgroundImage: string;
  width: number;
  height: number;
  projectionType: ProjectionType;
  bounds?: MapBounds;
  mapArea: MapArea;
  calibrationPoints?: CalibrationPoint[];
  /** Custom configs the user uploaded / created are stored in localStorage. */
  custom?: boolean;
  /**
   * When set, the projection is fitted to this country's real geometry (from the
   * world-atlas vector data) and its coastline is drawn as the background land.
   * This is what makes every country load a correct map automatically.
   */
  fitFeatureName?: string;
  /**
   * Countries whose internal state/province borders should be drawn. Loaded on
   * demand from public/admin1/. Omit for world/region maps that shouldn't show them.
   */
  admin1Countries?: string[];
}

export interface RouteStyle {
  stroke: string;
  lineColor?: string;
  strokeWidth: number;
  strokeDasharray: string;
  icon: 'plane' | 'car' | 'ship' | 'train';
  label: string;
}

export const ROUTE_STYLES: Record<TransportMode, RouteStyle> = {
  flight: {
    stroke: '#333333',
    lineColor: '#999999',
    strokeWidth: 2.5,
    strokeDasharray: '2 7',
    icon: 'plane',
    label: 'FLIGHTS',
  },
  land: {
    stroke: '#333333',
    lineColor: '#888888',
    strokeWidth: 2.5,
    strokeDasharray: '',
    icon: 'car',
    label: 'LAND',
  },
  cruise: {
    stroke: '#283b91',
    lineColor: '#8fa3ff',
    strokeWidth: 3,
    strokeDasharray: '',
    icon: 'ship',
    label: 'CRUISE',
  },
  rail: {
    stroke: '#cc2929',
    lineColor: '#ff8585',
    strokeWidth: 3,
    strokeDasharray: '8 6',
    icon: 'train',
    label: 'RAIL',
  },
};

/** Brochure palette used for the ocean placeholder + dots/labels. */
export const MAP_THEME = {
  ocean: '#77d1d1',
  land: '#e6e6e6',
  /** Country borders are drawn in the water colour for the MapChart look. */
  border: '#77d1d1',
  /** Slightly darker fill for the country currently selected. */
  landSelected: '#dcdcdc',
  dot: '#b99043',
  label: '#111111',
} as const;

/** Full serialisable route document (used for JSON copy / load + persistence). */
export interface RouteDocument {
  version: 1;
  mapConfigId: string;
  stops: RouteStop[];
  segments: RouteSegment[];
  /** Transport entering from the map border to the first stop (`'none'` = omit). */
  arrivalMode?: EndpointMode;
  /** Transport leaving from the final stop to the map border (`'none'` = omit). */
  departureMode?: EndpointMode;
}
