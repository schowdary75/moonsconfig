import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plane,
  Car,
  Ship,
  TrainFront,
  Loader2,
  Search,
  MapPin,
  Ban,
  Route as RouteIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ROUTE_STYLES,
  type RouteStop,
  type RouteSegment,
  type TransportMode,
  type EndpointMode,
  type LabelPosition,
} from './routeMapTypes';
import {
  validateLat,
  validateLng,
  geocodePlace,
  rebuildLinearChain,
  createId,
  haversineKm,
  totalRouteKm,
  type GeocodeResult,
} from './routeMapUtils';

interface RouteStopEditorProps {
  stops: RouteStop[];
  segments: RouteSegment[];
  arrivalMode: EndpointMode;
  departureMode: EndpointMode;
  countryName?: string;
  onChange: (stops: RouteStop[], segments: RouteSegment[]) => void;
  onArrivalModeChange: (mode: EndpointMode) => void;
  onDepartureModeChange: (mode: EndpointMode) => void;
}

/**
 * City-name input with live geocoding: typing a place fetches its real lat/lng
 * from OpenStreetMap and, on pick, fills coordinates so the dot lands correctly.
 */
function GeocodeInput({
  value,
  countryName,
  onChangeName,
  onPick,
}: {
  value: string;
  countryName?: string;
  onChangeName: (name: string) => void;
  onPick: (name: string, lat: number, lng: number) => void;
}) {
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const found = await geocodePlace(q, { countryName, signal: controller.signal });
        setResults(found);
        setOpen(found.length > 0);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([]);
      } finally {
        setLoading(false);
      }
    }, 450);
  };

  // close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative flex-1">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => {
            onChangeName(e.target.value);
            runSearch(e.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Type a city…"
          className="h-7 pr-6 text-xs"
        />
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
        </span>
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-72 overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  onPick(r.name, r.lat, r.lng);
                  setOpen(false);
                }}
              >
                <span className="text-xs font-medium">{r.name}</span>
                <span className="line-clamp-1 text-[10px] text-muted-foreground">
                  {r.displayName}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {r.lat.toFixed(3)}, {r.lng.toFixed(3)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MODE_ICON: Record<TransportMode, React.ElementType> = {
  flight: Plane,
  land: Car,
  cruise: Ship,
  rail: TrainFront,
};

function EndpointModeSelector({
  label,
  mode,
  onChange,
}: {
  label: 'Arrival' | 'Departure';
  mode: EndpointMode;
  onChange: (mode: EndpointMode) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-[38px]">
      <span className="w-14 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value && typeof onChange === 'function') {
            onChange(value as EndpointMode);
          }
        }}
        className="gap-1"
      >
        {(Object.keys(ROUTE_STYLES) as TransportMode[]).map((transportMode) => {
          const Icon = MODE_ICON[transportMode];
          const active = mode === transportMode;
          return (
            <ToggleGroupItem
              key={transportMode}
              value={transportMode}
              aria-label={`${label} by ${transportMode}`}
              title={`${label}: ${ROUTE_STYLES[transportMode].label}`}
              className="h-7 w-8 rounded-md border border-border p-0 data-[state=on]:border-transparent"
              style={
                active
                  ? { backgroundColor: ROUTE_STYLES[transportMode].stroke, color: '#fff' }
                  : undefined
              }
            >
              <Icon
                className="h-3.5 w-3.5"
                style={active ? undefined : { color: ROUTE_STYLES[transportMode].stroke }}
              />
            </ToggleGroupItem>
          );
        })}
        {/* Optional endpoint: 'none' hides this leg on the map + itinerary. */}
        <ToggleGroupItem
          value="none"
          aria-label={`No ${label.toLowerCase()} transport`}
          title={`${label}: none (hide this leg)`}
          className="h-7 w-8 rounded-md border border-border p-0 text-muted-foreground data-[state=on]:border-transparent data-[state=on]:bg-muted-foreground data-[state=on]:text-white"
        >
          <Ban className="h-3.5 w-3.5" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export function RouteStopEditor({
  stops,
  segments,
  arrivalMode,
  departureMode,
  countryName,
  onChange,
  onArrivalModeChange,
  onDepartureModeChange,
}: RouteStopEditorProps) {
  const commit = (nextStops: RouteStop[], nextSegments?: RouteSegment[]) => {
    onChange(nextStops, nextSegments ?? rebuildLinearChain(nextStops, segments));
  };

  const addStop = () => {
    const last = stops[stops.length - 1];
    const newStop: RouteStop = {
      id: createId('stop'),
      name: `Stop ${stops.length + 1}`,
      lat: last ? Number((last.lat + 0.5).toFixed(3)) : 0,
      lng: last ? Number((last.lng + 0.5).toFixed(3)) : 0,
      labelPosition: 'auto',
    };
    commit([...stops, newStop]);
  };

  const updateStop = (id: string, patch: Partial<RouteStop>) => {
    commit(
      stops.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      segments,
    );
  };

  const removeStop = (id: string) => {
    commit(stops.filter((s) => s.id !== id));
  };

  const moveStop = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= stops.length) return;
    const next = [...stops];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const setSegmentMode = (segId: string, mode: TransportMode) => {
    onChange(
      stops,
      segments.map((s) => (s.id === segId ? { ...s, mode } : s)),
    );
  };

  const setSegmentCurve = (segId: string, curve: number) => {
    onChange(
      stops,
      segments.map((s) => (s.id === segId ? { ...s, curve } : s)),
    );
  };

  const legs = Math.max(0, stops.length - 1);
  const totalKm = totalRouteKm(stops);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Itinerary</span>
        </div>
        <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={addStop}>
          <Plus className="h-3.5 w-3.5" /> Add stop
        </Button>
      </div>

      {/* Route summary */}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="gap-1 font-normal">
          <MapPin className="h-3 w-3" /> {stops.length} stop{stops.length === 1 ? '' : 's'}
        </Badge>
        <Badge variant="secondary" className="gap-1 font-normal">
          <RouteIcon className="h-3 w-3" /> {legs} leg{legs === 1 ? '' : 's'}
        </Badge>
        {totalKm > 0 && (
          <Badge variant="secondary" className="font-normal">
            ≈ {totalKm >= 1000 ? `${(totalKm / 1000).toFixed(1)}k` : Math.round(totalKm)} km
          </Badge>
        )}
      </div>

      {stops.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <MapPin className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground/60" />
          <p className="text-xs font-medium text-foreground">No stops yet</p>
          <p className="text-[11px] text-muted-foreground">
            Click “Add stop”, then type a city to auto-fill its coordinates.
          </p>
        </div>
      )}

      <div className="relative">
        {/* vertical connector line running through the timeline */}
        {stops.length > 1 && (
          <div className="pointer-events-none absolute bottom-6 left-[15px] top-6 w-px bg-border" />
        )}
        <div className="space-y-2">
          {stops.length > 0 && (
            <EndpointModeSelector
              label="Arrival"
              mode={arrivalMode}
              onChange={onArrivalModeChange}
            />
          )}
          {stops.map((stop, index) => {
            const latOk = validateLat(stop.lat);
            const lngOk = validateLng(stop.lng);
            const segment = segments[index]; // link from this stop to next
            const next = stops[index + 1];
            const legKm =
              segment && next && latOk && lngOk && validateLat(next.lat) && validateLng(next.lng)
                ? haversineKm(stop.lat, stop.lng, next.lat, next.lng)
                : 0;
            return (
              <div key={stop.id} className="relative">
                <div className="flex gap-2">
                  {/* timeline node */}
                  <div className="relative z-10 flex flex-col items-center pt-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm ring-4 ring-card">
                      {index + 1}
                    </span>
                  </div>

                  <div className="flex-1 rounded-xl border border-border bg-card p-2.5 shadow-sm transition-colors hover:border-primary/40">
                    <div className="flex items-center gap-1.5">
                      <GeocodeInput
                        value={stop.name}
                        countryName={countryName}
                        onChangeName={(name) => updateStop(stop.id, { name })}
                        onPick={(name, lat, lng) => updateStop(stop.id, { name, lat, lng })}
                      />
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => moveStop(index, -1)}
                          disabled={index === 0}
                          aria-label="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => moveStop(index, 1)}
                          disabled={index === stops.length - 1}
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeStop(stop.id)}
                        aria-label="Remove stop"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <div>
                        <Input
                          type="number"
                          step="0.001"
                          value={Number.isFinite(stop.lat) ? stop.lat : ''}
                          onChange={(e) => updateStop(stop.id, { lat: parseFloat(e.target.value) })}
                          placeholder="Latitude"
                          className={`h-7 text-xs ${latOk ? '' : 'border-destructive focus-visible:ring-destructive'}`}
                        />
                        {!latOk && <p className="mt-0.5 text-[10px] text-destructive">-90 to 90</p>}
                      </div>
                      <div>
                        <Input
                          type="number"
                          step="0.001"
                          value={Number.isFinite(stop.lng) ? stop.lng : ''}
                          onChange={(e) => updateStop(stop.id, { lng: parseFloat(e.target.value) })}
                          placeholder="Longitude"
                          className={`h-7 text-xs ${lngOk ? '' : 'border-destructive focus-visible:ring-destructive'}`}
                        />
                        {!lngOk && (
                          <p className="mt-0.5 text-[10px] text-destructive">-180 to 180</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <Select
                        value={stop.labelPosition ?? 'auto'}
                        onValueChange={(v) =>
                          updateStop(stop.id, { labelPosition: v as LabelPosition })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['auto', 'top', 'bottom', 'left', 'right'] as LabelPosition[]).map(
                            (p) => (
                              <SelectItem key={p} value={p} className="text-xs capitalize">
                                Label: {p}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                      <Input
                        value={stop.label ?? ''}
                        onChange={(e) => updateStop(stop.id, { label: e.target.value })}
                        placeholder="Custom label"
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Route mode between this stop and the next */}
                {segment && (
                  <div className="flex items-center gap-2 py-1.5 pl-[38px]">
                    <ToggleGroup
                      type="single"
                      value={segment.mode}
                      onValueChange={(v) => v && setSegmentMode(segment.id, v as TransportMode)}
                      className="gap-1"
                    >
                      {(Object.keys(ROUTE_STYLES) as TransportMode[]).map((mode) => {
                        const Icon = MODE_ICON[mode];
                        const active = segment.mode === mode;
                        return (
                          <ToggleGroupItem
                            key={mode}
                            value={mode}
                            aria-label={mode}
                            title={ROUTE_STYLES[mode].label}
                            className="h-7 w-8 rounded-md border border-border p-0 data-[state=on]:border-transparent"
                            style={
                              active
                                ? { backgroundColor: ROUTE_STYLES[mode].stroke, color: '#fff' }
                                : undefined
                            }
                          >
                            <Icon
                              className="h-3.5 w-3.5"
                              style={active ? undefined : { color: ROUTE_STYLES[mode].stroke }}
                            />
                          </ToggleGroupItem>
                        );
                      })}
                    </ToggleGroup>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">curve</span>
                      <input
                        type="range"
                        min={-0.8}
                        max={0.8}
                        step={0.05}
                        value={segment.curve ?? 0.25}
                        onChange={(e) => setSegmentCurve(segment.id, parseFloat(e.target.value))}
                        className="h-1 w-14 cursor-pointer accent-primary"
                      />
                    </div>

                    {legKm > 0 && (
                      <span className="ml-auto text-[10px] font-medium text-muted-foreground">
                        {legKm >= 1000 ? `${(legKm / 1000).toFixed(1)}k` : Math.round(legKm)} km
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {stops.length > 0 && (
            <EndpointModeSelector
              label="Departure"
              mode={departureMode}
              onChange={onDepartureModeChange}
            />
          )}
        </div>
      </div>
      {/* Sticky bottom Add stop button — avoids scroll-up frustration */}
      {stops.length > 1 && (
        <div className="sticky bottom-0 z-10 flex justify-center border-t border-border bg-gradient-to-t from-card via-card to-card/80 pb-1 pt-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-3 text-xs shadow-sm"
            onClick={addStop}
          >
            <Plus className="h-3.5 w-3.5" /> Add stop
          </Button>
        </div>
      )}
    </div>
  );
}
