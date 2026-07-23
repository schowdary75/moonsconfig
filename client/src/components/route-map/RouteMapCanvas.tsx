import React from 'react';
import { geoPath } from 'd3-geo';
import { ALL_COUNTRY_FEATURES, INDIA_CLAIM_FEATURE } from '@/data/worldGeo';
import { loadAdmin1LinesFor, type BorderLine } from '@/data/admin1Borders';
import {
  ROUTE_STYLES,
  MAP_THEME,
  type MapConfig,
  type RouteStop,
  type RouteSegment,
  type TransportMode,
  type EndpointMode,
} from './routeMapTypes';
import { Plus, Minus, Maximize } from 'lucide-react';
import {
  buildProjection,
  createCurvedPath,
  createSplinePath,
  latLngToPoint,
  pointToLatLng,
  resolveLabelPlacement,
  isWithinFrame,
  createPolylineGeometry,
  type ProjectionContext,
  type CurveGeometry,
} from './routeMapUtils';
import { RouteLegend } from './RouteLegend';
import { MIN_TRANSPORT_ICON_PATH_LENGTH, TransportRouteIcon } from './TransportRouteIcon';
import { getRouteMapTouchAction } from './routeMapInteraction';

interface RouteMapCanvasProps {
  config: MapConfig;
  stops: RouteStop[];
  segments: RouteSegment[];
  arrivalMode?: EndpointMode;
  departureMode?: EndpointMode;
  ctx: ProjectionContext;
  osrmCache?: Record<string, [number, number][]>;
  showLabels?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showIcons?: boolean;
  showAdmin1?: boolean;
  /** User-uploaded icon data URLs per transport mode (override built-in vehicles). */
  customIcons?: Partial<Record<TransportMode, string>>;
  calibrationMode?: boolean;
  onCalibrationClick?: (x: number, y: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** When true, show draggable waypoint handles for shaping each leg's path. */
  editPath?: boolean;
  /** Commit edited segments (waypoint add/move/remove) back to the parent. */
  onSegmentsChange?: (segments: RouteSegment[]) => void;
}

interface LabelLayout {
  stop: RouteStop;
  point: [number, number];
  indices: number[];
  text: string;
  placement: ReturnType<typeof resolveLabelPlacement>;
  numX: number;
  numY: number;
  badgeX: number;
  badgeY: number;
  badgeWidth: number;
  badgeHeight: number;
}

interface CollisionBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const boxesOverlap = (a: CollisionBox, b: CollisionBox, padding = 4) =>
  a.left < b.right + padding &&
  a.right > b.left - padding &&
  a.top < b.bottom + padding &&
  a.bottom > b.top - padding;

export function RouteMapCanvas({
  config,
  stops,
  segments,
  arrivalMode = 'flight',
  departureMode = 'flight',
  ctx,
  osrmCache,
  showLabels = true,
  showDots = true,
  showLegend = true,
  showIcons = true,
  showAdmin1 = true,
  customIcons,
  calibrationMode = false,
  onCalibrationClick,
  containerRef,
  editPath = false,
  onSegmentsChange,
}: RouteMapCanvasProps) {
  const { width, height, mapArea, backgroundImage } = config;
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [viewBox, setViewBox] = React.useState({ x: 0, y: 0, width, height });
  const [isPanning, setIsPanning] = React.useState(false);
  // Active waypoint drag: which segment + waypoint index is being moved.
  const [draggingWp, setDraggingWp] = React.useState<{ segId: string; index: number } | null>(null);

  // Geographic zoom: instead of scaling the rendered SVG (which blows up labels
  // and lines), we raise the projection scale and re-render the map at the new
  // zoom level. `null` = whole map. Bitmap/calibrated maps can't reproject, so
  // they fall back to the old viewBox zoom.
  interface GeoView {
    scale: number;
    translate: [number, number];
  }
  const [geoView, setGeoView] = React.useState<GeoView | null>(null);
  // Live pixel offset while dragging; committed into geoView on release so the
  // expensive re-projection happens once instead of on every mousemove.
  const [panOffset, setPanOffset] = React.useState<[number, number] | null>(null);
  const canGeoZoom = !backgroundImage && !!ctx.projection && !ctx.affine;
  const MAX_GEO_ZOOM = 64;

  const geoRef = React.useRef({
    canGeoZoom,
    scale: 1,
    translate: [0, 0] as [number, number],
  });
  geoRef.current = {
    canGeoZoom,
    scale: ctx.projection?.scale() ?? 1,
    translate: ctx.projection?.translate() ?? [0, 0],
  };

  const panStartRef = React.useRef<{
    clientX: number;
    clientY: number;
    viewBox: typeof viewBox;
    geoView: GeoView | null;
  } | null>(null);

  React.useEffect(() => {
    setViewBox({ x: 0, y: 0, width, height });
    setGeoView(null);
  }, [config.id, config.bounds, height, width]);

  // Zoom by `factor` (>1 = in) around the fractional frame position (fx, fy).
  const applyZoom = React.useCallback(
    (fx: number, fy: number, factor: number) => {
      const base = geoRef.current;
      if (base.canGeoZoom) {
        const px = fx * width;
        const py = fy * height;
        setGeoView((current) => {
          const cur = current ?? { scale: base.scale, translate: base.translate };
          const nextScale = Math.min(
            base.scale * MAX_GEO_ZOOM,
            Math.max(base.scale, cur.scale * factor),
          );
          if (nextScale <= base.scale) return null;
          const ratio = nextScale / cur.scale;
          return {
            scale: nextScale,
            translate: [px - (px - cur.translate[0]) * ratio, py - (py - cur.translate[1]) * ratio],
          };
        });
        return;
      }

      setViewBox((current) => {
        const pointerX = current.x + fx * current.width;
        const pointerY = current.y + fy * current.height;
        const nextWidth = Math.min(width, Math.max(width / 64, current.width / factor));
        const nextHeight = Math.min(height, Math.max(height / 64, current.height / factor));
        const nextX = pointerX - (pointerX - current.x) * (nextWidth / current.width);
        const nextY = pointerY - (pointerY - current.y) * (nextHeight / current.height);
        return {
          x: Math.min(width - nextWidth, Math.max(0, nextX)),
          y: Math.min(height - nextHeight, Math.max(0, nextY)),
          width: nextWidth,
          height: nextHeight,
        };
      });
    },
    [height, width],
  );

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Re-projecting the whole map is expensive, so wheel deltas are accumulated
    // and applied once per animation frame instead of once per wheel event —
    // fast scrolling stays smooth instead of flooding the main thread.
    let pending: { factor: number; fx: number; fy: number } | null = null;
    let timer = 0;

    const flush = () => {
      timer = 0;
      if (!pending) return;
      const { fx, fy, factor } = pending;
      pending = null;
      applyZoom(fx, fy, factor);
    };

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const rect = svg.getBoundingClientRect();
      const deltaPixels =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * rect.height
            : event.deltaY;
      // Preserve fine trackpad deltas and soften coarse mouse-wheel notches.
      const dampedDelta = Math.max(-80, Math.min(80, deltaPixels));
      const factor = Math.exp(-dampedDelta * 0.0018);
      const fx = (event.clientX - rect.left) / rect.width;
      const fy = (event.clientY - rect.top) / rect.height;
      pending = { factor: (pending?.factor ?? 1) * factor, fx, fy };
      if (!timer) timer = window.setTimeout(flush, 16);
    };

    // A non-passive native listener is required so the browser never forwards
    // the same wheel gesture to the editor/sidebar scroll container.
    svg.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleNativeWheel);
      if (timer) window.clearTimeout(timer);
    };
  }, [applyZoom]);

  // The projection actually used for rendering: base, or a zoomed re-projection.
  const viewConfig = React.useMemo<MapConfig>(() => {
    if (!geoView || !canGeoZoom) return config;
    return { ...config, mapArea: { x: 0, y: 0, width, height } };
  }, [config, geoView, canGeoZoom, width, height]);

  const viewCtx = React.useMemo<ProjectionContext>(() => {
    if (!geoView || !canGeoZoom) return ctx;
    const projection = buildProjection(config);
    if (!projection) return ctx;
    projection.scale(geoView.scale);
    projection.translate(geoView.translate);
    return { config: viewConfig, projection, affine: null };
  }, [ctx, geoView, canGeoZoom, config, viewConfig]);

  const pointById = React.useMemo(() => {
    const map = new Map<string, [number, number]>();
    for (const stop of stops) {
      map.set(stop.id, latLngToPoint(stop.lat, stop.lng, viewConfig, viewCtx));
    }
    return map;
  }, [stops, viewConfig, viewCtx]);

  // Stops that belong on the BASE (whole-country) map. Anything outside (e.g. a
  // leftover stop from a different country) is skipped so it can't draw a stray
  // line across the map. Evaluated against the base projection on purpose:
  // zooming in must not hide route lines to stops that scrolled out of view.
  const visibleIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const stop of stops) {
      const p = latLngToPoint(stop.lat, stop.lng, config, ctx);
      if (isWithinFrame(p, config)) set.add(stop.id);
    }
    return set;
  }, [stops, config, ctx]);

  const usedModes = React.useMemo(() => {
    const set = new Set<TransportMode>();
    segments.forEach((s) => set.add(s.mode));
    if (stops.length > 0) {
      if (arrivalMode !== 'none') set.add(arrivalMode);
      if (departureMode !== 'none') set.add(departureMode);
    }
    return Array.from(set);
  }, [arrivalMode, departureMode, segments, stops.length]);

  const endpointRoutes = React.useMemo(() => {
    if (stops.length === 0) return [];
    const { x, y, width: frameWidth, height: frameHeight } = viewConfig.mapArea;

    const borderCandidates = (point: [number, number]): [number, number][] => {
      const [pointX, pointY] = point;
      const candidates: Array<{ distance: number; point: [number, number] }> = [
        { distance: Math.abs(pointX - x), point: [x, pointY] },
        { distance: Math.abs(x + frameWidth - pointX), point: [x + frameWidth, pointY] },
        { distance: Math.abs(pointY - y), point: [pointX, y] },
        { distance: Math.abs(y + frameHeight - pointY), point: [pointX, y + frameHeight] },
      ];
      candidates.sort((a, b) => a.distance - b.distance);
      return candidates.map((candidate) => candidate.point);
    };

    const buildEndpoint = (
      stop: RouteStop,
      mode: EndpointMode,
      direction: 'arrival' | 'departure',
      borderPoint: [number, number],
    ) => {
      // 'none' = this leg is optional and omitted from the map.
      if (mode === 'none') return null;
      const stopPoint = pointById.get(stop.id);
      if (!stopPoint || !visibleIds.has(stop.id)) return null;
      const from = direction === 'arrival' ? borderPoint : stopPoint;
      const to = direction === 'arrival' ? stopPoint : borderPoint;
      const curve = mode === 'flight' ? (to[0] >= from[0] ? -0.22 : 0.22) : 0;
      return {
        id: `endpoint-${direction}`,
        mode,
        geo: createCurvedPath(from[0], from[1], to[0], to[1], curve),
      };
    };

    const firstStop = stops[0];
    const lastStop = stops[stops.length - 1];
    const firstPoint = pointById.get(firstStop.id);
    const lastPoint = pointById.get(lastStop.id);
    if (!firstPoint || !lastPoint) return [];

    const endpointDistance = Math.hypot(firstPoint[0] - lastPoint[0], firstPoint[1] - lastPoint[1]);
    const endpointsOverlap = endpointDistance < 44;
    const arrivalBorder = borderCandidates(firstPoint)[0];
    // When arrival and departure use the same/nearby city, use a different
    // side of the map for departure so both paths and vehicle icons stay clear.
    const departureCandidates = borderCandidates(lastPoint);
    const departureBorder =
      departureCandidates[endpointsOverlap && departureCandidates.length > 1 ? 1 : 0];

    return [
      buildEndpoint(firstStop, arrivalMode, 'arrival', arrivalBorder),
      buildEndpoint(lastStop, departureMode, 'departure', departureBorder),
    ].filter(Boolean) as Array<{
      id: string;
      mode: TransportMode;
      geo: ReturnType<typeof createCurvedPath>;
    }>;
  }, [arrivalMode, viewConfig.mapArea, departureMode, pointById, stops, visibleIds]);

  const labelLayouts = React.useMemo<LabelLayout[]>(() => {
    const grouped = new Map<
      string,
      { stop: RouteStop; point: [number, number]; indices: number[]; order: number }
    >();
    stops.forEach((stop, index) => {
      const point = pointById.get(stop.id);
      if (!point || !visibleIds.has(stop.id)) return;
      const text = stop.label?.trim() || stop.name;
      if (!grouped.has(text)) {
        grouped.set(text, { stop, point, indices: [], order: index });
      }
      grouped.get(text)!.indices.push(index + 1);
    });

    const occupied: CollisionBox[] = [];
    const markerBoxes = stops.flatMap((candidate) => {
      const candidatePoint = pointById.get(candidate.id);
      if (!candidatePoint || !visibleIds.has(candidate.id)) return [];
      return [
        {
          stopId: candidate.id,
          box: {
            left: candidatePoint[0] - 7,
            top: candidatePoint[1] - 7,
            right: candidatePoint[0] + 7,
            bottom: candidatePoint[1] + 7,
          },
        },
      ];
    });
    const entries = Array.from(grouped.values()).sort((a, b) => {
      const aEndpoint = a.order === 0 || a.order === stops.length - 1 ? 0 : 1;
      const bEndpoint = b.order === 0 || b.order === stops.length - 1 ? 0 : 1;
      return aEndpoint - bEndpoint || a.order - b.order;
    });

    return entries.map(({ stop, point, indices }) => {
      const text = stop.label?.trim() || stop.name;
      const textWidth = Math.max(20, text.length * 7.5);
      const textString = indices.join(', ');
      const badgeWidth = Math.max(18, textString.length * 6 + 8);
      const badgeHeight = 18;
      const outward: 'left' | 'right' = point[0] < width / 2 ? 'left' : 'right';
      const opposite = outward === 'left' ? 'right' : 'left';
      const requested = stop.labelPosition;
      const positions: Array<RouteStop['labelPosition']> =
        requested && requested !== 'auto'
          ? [requested]
          : [
              outward,
              'top',
              opposite,
              'bottom',
              outward,
              'top',
              opposite,
              'bottom',
              outward,
              'top',
              opposite,
              'bottom',
            ];
      const gaps =
        requested && requested !== 'auto' ? [12] : [12, 12, 12, 12, 28, 28, 28, 28, 46, 46, 46, 46];

      let selected: LabelLayout | null = null;
      let selectedBox: CollisionBox | null = null;

      positions.some((position, candidateIndex) => {
        const base = resolveLabelPlacement(stop, point, position, outward);
        const gapDelta = gaps[candidateIndex] - 12;
        const placement = { ...base, needsLeader: gapDelta > 0 };
        if (position === 'left') placement.x -= gapDelta;
        if (position === 'right') placement.x += gapDelta;
        if (position === 'top') placement.y -= gapDelta;
        if (position === 'bottom') placement.y += gapDelta;

        let textLeft = placement.x - textWidth / 2;
        if (placement.anchor === 'start') textLeft = placement.x;
        if (placement.anchor === 'end') textLeft = placement.x - textWidth;
        const textBox = {
          left: textLeft,
          top: placement.y - 13,
          right: textLeft + textWidth,
          bottom: placement.y + 3,
        };

        let numX = placement.x;
        if (placement.anchor === 'start') numX += textWidth / 2;
        if (placement.anchor === 'end') numX -= textWidth / 2;
        const isAbove = position === 'top';
        const numY = placement.y + (isAbove ? -14 : 14);
        const badgeX = numX - badgeWidth / 2;
        const badgeY = numY - 13;
        const box: CollisionBox = {
          left: Math.min(textBox.left, badgeX),
          top: Math.min(textBox.top, badgeY),
          right: Math.max(textBox.right, badgeX + badgeWidth),
          bottom: Math.max(textBox.bottom, badgeY + badgeHeight),
        };
        const framePadding = 5;
        const frame = viewConfig.mapArea;
        const insideFrame =
          box.left >= frame.x + framePadding &&
          box.right <= frame.x + frame.width - framePadding &&
          box.top >= frame.y + framePadding &&
          box.bottom <= frame.y + frame.height - framePadding;
        const collides = occupied.some((existing) => boxesOverlap(box, existing));
        const coversAnotherStop = markerBoxes.some(
          (marker) => marker.stopId !== stop.id && boxesOverlap(box, marker.box, 2),
        );

        selected = {
          stop,
          point,
          indices,
          text,
          placement,
          numX,
          numY,
          badgeX,
          badgeY,
          badgeWidth,
          badgeHeight,
        };
        selectedBox = box;
        return insideFrame && !collides && !coversAnotherStop;
      });

      if (selectedBox) occupied.push(selectedBox);
      return selected!;
    });
  }, [viewConfig.mapArea, pointById, stops, visibleIds, width]);

  // Vector "land" background drawn with the SAME projection as the routes, so it
  // always aligns. Only computed when there is no uploaded bitmap background.
  const selectedName = config.fitFeatureName ?? config.countryName;
  const landPaths = React.useMemo(() => {
    if (backgroundImage || !viewCtx.projection) return [];
    const path = geoPath(viewCtx.projection);
    const out: { d: string; selected: boolean }[] = [];
    for (const f of ALL_COUNTRY_FEATURES) {
      const d = path(f);
      if (!d) continue;
      out.push({ d, selected: f.properties.name === selectedName });
    }
    return out;
  }, [backgroundImage, viewCtx.projection, selectedName]);

  // India re-drawn on top with its official (claimed) boundary, so the
  // Pakistan/China fills over Kashmir from the base dataset are covered.
  const indiaOverlay = React.useMemo(() => {
    if (backgroundImage || !viewCtx.projection) return null;
    return geoPath(viewCtx.projection)(INDIA_CLAIM_FEATURE);
  }, [backgroundImage, viewCtx.projection]);

  // Internal state/province borders, fetched on demand for the shown country only.
  const admin1Key = (config.admin1Countries ?? []).join('|');
  const [admin1Lines, setAdmin1Lines] = React.useState<BorderLine[]>([]);
  React.useEffect(() => {
    if (!admin1Key || backgroundImage || !showAdmin1) {
      setAdmin1Lines([]);
      return;
    }
    let cancelled = false;
    loadAdmin1LinesFor(admin1Key.split('|')).then((lines) => {
      if (!cancelled) setAdmin1Lines(lines);
    });
    return () => {
      cancelled = true;
    };
  }, [admin1Key, backgroundImage, showAdmin1]);

  const admin1Path = React.useMemo(() => {
    if (!viewCtx.projection || admin1Lines.length === 0) return null;
    return geoPath(viewCtx.projection)({
      type: 'MultiLineString',
      coordinates: admin1Lines,
    });
  }, [viewCtx.projection, admin1Lines]);

  // Single source of truth for a leg's rendered geometry, shared by the drawn
  // path AND the edit handles — so the "add" handle always sits ON the visible
  // path (curve / road / spline), never on a straight-line midpoint.
  const legGeometry = (seg: RouteSegment): CurveGeometry | null => {
    const fromStop = stops.find((s) => s.id === seg.fromStopId);
    const toStop = stops.find((s) => s.id === seg.toStopId);
    const from = pointById.get(seg.fromStopId);
    const to = pointById.get(seg.toStopId);
    if (!from || !to || !fromStop || !toStop) return null;

    if (seg.waypoints && seg.waypoints.length > 0) {
      const pts: [number, number][] = [
        from,
        ...seg.waypoints.map((w) => latLngToPoint(w.lat, w.lng, viewConfig, viewCtx)),
        to,
      ];
      return createSplinePath(pts);
    }

    const cacheKey = `${fromStop.lng},${fromStop.lat}-${toStop.lng},${toStop.lat}`;
    if (seg.mode === 'land' && osrmCache && osrmCache[cacheKey] && osrmCache[cacheKey].length > 0) {
      const projected = osrmCache[cacheKey].map((pt) =>
        latLngToPoint(pt[1], pt[0], viewConfig, viewCtx),
      );
      return createPolylineGeometry(projected);
    }

    let actualCurve = seg.curve ?? 0.25;
    if (seg.mode === 'flight') {
      const dx = to[0] - from[0];
      let mag = Math.abs(actualCurve);
      if (mag < 0.1) mag = 0.3;
      actualCurve = dx > 0 ? -mag : mag;
    }
    return createCurvedPath(from[0], from[1], to[0], to[1], actualCurve);
  };

  const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!calibrationMode || !onCalibrationClick || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width;
    const sy = viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height;
    onCalibrationClick(Math.round(sx), Math.round(sy));
  };

  // ── Path-edit helpers (draggable waypoints) ────────────────────────────────
  /** clientX/Y → SVG (viewBox) coordinates, matching the projected-point space. */
  const clientToSvg = (clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return [
      viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
      viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
    ];
  };

  const startWaypointDrag = (
    event: React.PointerEvent<SVGElement>,
    segId: string,
    index: number,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setDraggingWp({ segId, index });
  };

  // Grab the leg's midpoint handle: insert a waypoint AT that point (so the shape
  // is preserved, not straightened) and immediately start dragging it — one
  // fluid "pull the line to bend it" gesture. A plain click just leaves the new
  // point on the existing path.
  const startAddWaypointDrag = (
    event: React.PointerEvent<SVGElement>,
    seg: RouteSegment,
    atX: number,
    atY: number,
  ) => {
    if (event.button !== 0 || !onSegmentsChange) return;
    event.stopPropagation();
    const geo = pointToLatLng(atX, atY, viewConfig, viewCtx);
    if (!geo) return;
    const wps = seg.waypoints ?? [];
    const insertAt = Math.ceil(wps.length / 2);
    const nextWps = [...wps.slice(0, insertAt), geo, ...wps.slice(insertAt)];
    onSegmentsChange(segments.map((s) => (s.id === seg.id ? { ...s, waypoints: nextWps } : s)));
    svgRef.current?.setPointerCapture(event.pointerId);
    setDraggingWp({ segId: seg.id, index: insertAt });
  };

  const removeWaypoint = (segId: string, index: number) => {
    if (!onSegmentsChange) return;
    onSegmentsChange(
      segments.map((s) =>
        s.id === segId ? { ...s, waypoints: (s.waypoints ?? []).filter((_, i) => i !== index) } : s,
      ),
    );
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (calibrationMode || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      viewBox,
      // Panning must work from ANY framing (whole map, auto-zoom, wheel zoom),
      // so fall back to the base projection when no manual zoom is active.
      geoView: geoView ?? { scale: geoRef.current.scale, translate: geoRef.current.translate },
    };
    setIsPanning(true);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    // Waypoint drag takes precedence over map panning.
    if (draggingWp && onSegmentsChange) {
      event.preventDefault();
      const svgPt = clientToSvg(event.clientX, event.clientY);
      if (svgPt) {
        const geo = pointToLatLng(svgPt[0], svgPt[1], viewConfig, viewCtx);
        if (geo) {
          onSegmentsChange(
            segments.map((s) =>
              s.id === draggingWp.segId
                ? {
                    ...s,
                    waypoints: (s.waypoints ?? []).map((w, i) =>
                      i === draggingWp.index ? geo : w,
                    ),
                  }
                : s,
            ),
          );
        }
      }
      return;
    }

    const start = panStartRef.current;
    if (!start || !svgRef.current) return;
    event.preventDefault();

    const rect = svgRef.current.getBoundingClientRect();

    if (geoRef.current.canGeoZoom) {
      // Geographic pan: track the offset live (cheap group transform) and
      // commit it into the projection translate on release.
      const dx = ((event.clientX - start.clientX) / rect.width) * width;
      const dy = ((event.clientY - start.clientY) / rect.height) * height;
      setPanOffset([dx, dy]);
      return;
    }

    const dx = ((event.clientX - start.clientX) / rect.width) * start.viewBox.width;
    const dy = ((event.clientY - start.clientY) / rect.height) * start.viewBox.height;
    setViewBox({
      ...start.viewBox,
      x: Math.min(width - start.viewBox.width, Math.max(0, start.viewBox.x - dx)),
      y: Math.min(height - start.viewBox.height, Math.max(0, start.viewBox.y - dy)),
    });
  };

  const stopPanning = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (draggingWp) {
      setDraggingWp(null);
      return;
    }
    const start = panStartRef.current;
    if (start?.geoView && panOffset && geoRef.current.canGeoZoom) {
      // Translation is exact under any projection scale, so committing the
      // dragged offset re-renders the map in precisely the dragged position.
      setGeoView({
        scale: start.geoView.scale,
        translate: [
          start.geoView.translate[0] + panOffset[0],
          start.geoView.translate[1] + panOffset[1],
        ],
      });
    }
    setPanOffset(null);
    panStartRef.current = null;
    setIsPanning(false);
  };

  const resetManualZoom = () => {
    setViewBox({ x: 0, y: 0, width, height });
    setGeoView(null);
  };
  const isZoomed = geoView !== null || viewBox.width !== width || viewBox.height !== height;

  // legend position: bottom-left
  const legendRows = ['land', 'flight', 'cruise', 'rail'].filter((m) =>
    usedModes.includes(m as TransportMode),
  ).length;
  const legendHeight = 28 + legendRows * 26;

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{
        width: '100%',
        aspectRatio: `${width} / ${height}`,
        backgroundColor: MAP_THEME.ocean,
        borderRadius: 8,
        overflow: 'hidden',
        overscrollBehavior: 'contain',
      }}
    >
      {/* Zoom controls (excluded from PNG/SVG export via data-export-exclude) */}
      <div
        data-export-exclude="true"
        className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-md border border-black/10 bg-white/90 shadow-sm backdrop-blur-sm"
      >
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => applyZoom(0.5, 0.5, 1.5)}
          className="flex h-10 w-10 items-center justify-center text-neutral-700 transition-colors hover:bg-neutral-100 sm:h-8 sm:w-8"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => applyZoom(0.5, 0.5, 1 / 1.5)}
          disabled={!isZoomed}
          className="flex h-10 w-10 items-center justify-center border-t border-black/10 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40 sm:h-8 sm:w-8"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          title="Reset zoom (or double-click the map)"
          onClick={resetManualZoom}
          disabled={!isZoomed}
          className="flex h-10 w-10 items-center justify-center border-t border-black/10 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40 sm:h-8 sm:w-8"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>

      {/* All map layers share one SVG; zoom re-projects the geography so detail
          stays sharp and labels keep their screen size. */}
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onClick={handleClick}
        onDoubleClick={resetManualZoom}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        onPointerCancel={stopPanning}
        aria-label={`${config.countryName} route map. Scroll for continuous zoom, drag to pan, and double-click to reset.`}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          cursor: calibrationMode ? 'crosshair' : isPanning ? 'grabbing' : 'grab',
          touchAction: getRouteMapTouchAction({
            editPath,
            isPanning,
            draggingWaypoint: draggingWp !== null,
          }),
        }}
      >
        {/* While dragging, the whole map shifts via a cheap group transform;
            the offset is committed into the projection on release. */}
        <g transform={panOffset ? `translate(${panOffset[0]} ${panOffset[1]})` : undefined}>
          {/* Layer 1a: uploaded bitmap background (custom maps only) */}
          {backgroundImage && (
            <image
              href={backgroundImage}
              x={mapArea.x}
              y={mapArea.y}
              width={mapArea.width}
              height={mapArea.height}
              preserveAspectRatio="none"
            />
          )}

          {/* Layer 1b: vector land (real coastlines, MapChart-style) */}
          {landPaths.length > 0 && (
            <g>
              {landPaths.map((lp, i) => (
                <path
                  key={i}
                  d={lp.d}
                  fill={lp.selected ? MAP_THEME.landSelected : MAP_THEME.land}
                  stroke={MAP_THEME.border}
                  strokeWidth={0.9}
                  strokeLinejoin="round"
                />
              ))}
              {/* Kashmir belongs to India: India is painted again on top with its
                claimed boundary, covering the base dataset's Pakistan/China
                fills and border lines in the region. */}
              {indiaOverlay && (
                <path
                  d={indiaOverlay}
                  fill={selectedName === 'India' ? MAP_THEME.landSelected : MAP_THEME.land}
                  stroke={MAP_THEME.border}
                  strokeWidth={0.9}
                  strokeLinejoin="round"
                />
              )}
            </g>
          )}

          {/* Layer 1c: internal state / province borders (same water colour, thinner) */}
          {admin1Path && (
            <path
              d={admin1Path}
              fill="none"
              stroke={MAP_THEME.border}
              strokeWidth={0.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.8}
            />
          )}

          {/* Layer 2 + 3a: arrival from the border and departure to the border */}
          {endpointRoutes.map(({ id, mode, geo }) => {
            const style = ROUTE_STYLES[mode];
            return (
              <g key={id}>
                <path
                  d={geo.path}
                  fill="none"
                  stroke={style.lineColor || style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray || undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {showIcons && geo.length >= MIN_TRANSPORT_ICON_PATH_LENGTH && (
                  <TransportRouteIcon
                    mode={mode}
                    color={style.stroke}
                    x={geo.midX}
                    y={geo.midY}
                    angleDeg={geo.angleDeg}
                    customIconUrl={customIcons?.[mode]}
                  />
                )}
              </g>
            );
          })}

          {/* Layer 2 + 3b: route paths and icons between itinerary stops */}
          {segments.map((seg) => {
            if (!visibleIds.has(seg.fromStopId) || !visibleIds.has(seg.toStopId)) return null;
            const geo = legGeometry(seg);
            if (!geo) return null;
            const style = ROUTE_STYLES[seg.mode];

            return (
              <g key={seg.id}>
                <path
                  d={geo.path}
                  fill="none"
                  stroke={style.lineColor || style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray || undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {showIcons && geo.length >= MIN_TRANSPORT_ICON_PATH_LENGTH && (
                  <TransportRouteIcon
                    mode={seg.mode}
                    color={style.stroke}
                    x={geo.midX}
                    y={geo.midY}
                    angleDeg={geo.angleDeg}
                    customIconUrl={customIcons?.[seg.mode]}
                  />
                )}
              </g>
            );
          })}

          {/* Layer 4: city dots */}
          {showDots &&
            stops.map((stop) => {
              const p = pointById.get(stop.id);
              if (!p || !visibleIds.has(stop.id)) return null;
              return (
                <circle
                  key={`dot-${stop.id}`}
                  cx={p[0]}
                  cy={p[1]}
                  r={4.5}
                  fill={MAP_THEME.dot}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              );
            })}

          {/* Layer 5: city labels */}
          {showLabels &&
            labelLayouts.map(
              ({
                stop,
                point,
                indices,
                text,
                placement,
                numX,
                numY,
                badgeX,
                badgeY,
                badgeWidth,
                badgeHeight,
              }) => {
                const textString = indices.join(', ');
                return (
                  <g key={`label-group-${stop.id}`}>
                    {placement.needsLeader && (
                      <line
                        x1={point[0]}
                        y1={point[1]}
                        x2={placement.x}
                        y2={placement.y}
                        stroke="#737373"
                        strokeWidth={0.8}
                        opacity={0.65}
                      />
                    )}
                    <text
                      x={placement.x}
                      y={placement.y}
                      textAnchor={placement.anchor}
                      fontSize={13}
                      fontWeight={700}
                      fill={MAP_THEME.label}
                      fontFamily="system-ui, sans-serif"
                      style={{
                        paintOrder: 'stroke',
                        stroke: '#ffffff',
                        strokeWidth: 3,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {text}
                    </text>
                    <rect
                      x={badgeX}
                      y={badgeY}
                      width={badgeWidth}
                      height={badgeHeight}
                      rx={9}
                      ry={9}
                      fill="#e11d48"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    <text
                      x={numX}
                      y={numY - 1}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={800}
                      fill="#ffffff"
                      fontFamily="system-ui, sans-serif"
                    >
                      {textString}
                    </text>
                  </g>
                );
              },
            )}

          {/* Layer 5b: path-edit handles (excluded from PNG/SVG export) */}
          {editPath && (
            <g data-export-exclude="true">
              {segments.map((seg) => {
                if (!visibleIds.has(seg.fromStopId) || !visibleIds.has(seg.toStopId)) return null;
                const geo = legGeometry(seg);
                if (!geo) return null;

                const wpPts = (seg.waypoints ?? []).map(
                  (w) => latLngToPoint(w.lat, w.lng, viewConfig, viewCtx) as [number, number],
                );
                const stroke = ROUTE_STYLES[seg.mode].stroke;
                const dragging = draggingWp?.segId === seg.id;

                return (
                  <g key={`edit-${seg.id}`}>
                    {/* "Bend" handle: sits ON the current path midpoint. Grabbing it
                        drops a waypoint there and drags in one gesture. Hidden while
                        this leg is being dragged so it doesn't sit under the cursor. */}
                    {!dragging && (
                      <circle
                        cx={geo.midX}
                        cy={geo.midY}
                        r={5.5}
                        fill={stroke}
                        stroke="#ffffff"
                        strokeWidth={2}
                        opacity={0.55}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(e) => startAddWaypointDrag(e, seg, geo.midX, geo.midY)}
                      >
                        <title>Drag to bend this leg</title>
                      </circle>
                    )}
                    {/* Existing waypoints — rendered on top so they stay grabbable.
                        Drag to move, double-click to remove. */}
                    {wpPts.map((p, i) => {
                      const active = dragging && draggingWp?.index === i;
                      return (
                        <circle
                          key={`wp-${seg.id}-${i}`}
                          cx={p[0]}
                          cy={p[1]}
                          r={active ? 7.5 : 6.5}
                          fill="#ffffff"
                          stroke={stroke}
                          strokeWidth={2.5}
                          style={{ cursor: 'grab' }}
                          onPointerDown={(e) => startWaypointDrag(e, seg.id, i)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            removeWaypoint(seg.id, i);
                          }}
                        >
                          <title>Drag to shape · double-click to remove</title>
                        </circle>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          )}
        </g>

        {/* Layer 6: legend (screen-pinned, so it stays put while dragging) */}
        {showLegend && <RouteLegend modes={usedModes} x={24} y={height - 24 - legendHeight} />}

        {/* Calibration markers (not exported meaning-critical, but harmless) */}
        {calibrationMode &&
          (config.calibrationPoints ?? []).map((cp, i) => (
            <g key={`cal-${i}`}>
              <circle cx={cp.x} cy={cp.y} r={6} fill="none" stroke="#e11d48" strokeWidth={2} />
              <circle cx={cp.x} cy={cp.y} r={1.5} fill="#e11d48" />
              <text x={cp.x + 9} y={cp.y + 4} fontSize={11} fontWeight={700} fill="#e11d48">
                {cp.name}
              </text>
            </g>
          ))}
      </svg>
    </div>
  );
}
