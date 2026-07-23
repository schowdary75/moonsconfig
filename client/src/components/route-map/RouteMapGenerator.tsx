import React, { useMemo, useRef, useState } from 'react';
import { toPng, toSvg } from 'html-to-image';
import { toast } from '@/lib/toast';
import {
  Download,
  ImageDown,
  Upload,
  MapPin,
  AlertTriangle,
  ChevronsUpDown,
  ChevronDown,
  Check,
  Trash2,
  ZoomIn,
  Globe,
  Map as MapIcon,
  Save,
  Spline,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { RouteMapCanvas } from './RouteMapCanvas';
import { RouteStopEditor } from './RouteStopEditor';
import { RouteSummaryPanel } from './RouteSummaryPanel';
import {
  loadCustomTransportIcons,
  loadDefaultTransportIcons,
  saveCustomTransportIcons,
  saveDefaultTransportIcons,
  TransportIconUploader,
  type CustomTransportIconMap,
} from './TransportIconUploader';
import type {
  MapConfig,
  ProjectionType,
  RouteStop,
  RouteSegment,
  RouteDocument,
  EndpointMode,
} from './routeMapTypes';
import {
  createProjectionContext,
  createId,
  validateRoute,
  validateLat,
  validateLng,
  latLngToPoint,
  isWithinFrame,
  rebuildLinearChain,
  serializeRoute,
  parseRouteDocument,
  MAX_ROUTE_DOCUMENT_BYTES,
  totalRouteKm,
  fetchOsrmRoute,
} from './routeMapUtils';
import { useAuth } from '@/components/auth-context';
import {
  adminSaveRouteMap,
  adminGetRouteMaps,
  adminGetRouteMapDetail,
  adminDeleteRouteMap,
} from '@/lib/api/db.functions';
import {
  BUILT_IN_MAP_CONFIGS,
  loadCustomConfigs,
  saveCustomConfigs,
  resolveConfigById,
  getSelectableCountries,
} from '@/data/mapConfigs';
import { INDIA_SAMPLE } from '@/data/sampleRouteData';

const PROJECTIONS: { value: ProjectionType; label: string }[] = [
  { value: 'mercator', label: 'Mercator (most countries)' },
  { value: 'naturalEarth1', label: 'Natural Earth (world)' },
  { value: 'equirectangular', label: 'Equirectangular' },
  { value: 'albersUsa', label: 'Albers USA' },
  { value: 'custom', label: 'Custom (bounds)' },
];

interface SavedRouteRow {
  id: number;
  name: string;
  country: string;
  stop_count: number;
  distance_km: number;
  image_url: string;
  created_by: string;
  created_at: string;
}

/** Skip overlay UI (zoom buttons, path-edit handles, …) when capturing for export.
 *  Uses Element (not HTMLElement) so SVG overlay nodes are excluded too. */
function excludeFromExport(node: HTMLElement) {
  return !(node instanceof Element && (node as HTMLElement).dataset?.exportExclude === 'true');
}

function normalizeCountryName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-t border-border pt-3">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md py-1 text-left hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <SectionLabel>{title}</SectionLabel>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </section>
  );
}

interface PickerOption {
  id: string;
  label: string;
}

function MapPicker({
  featured,
  countries,
  value,
  currentLabel,
  onChange,
}: {
  featured: PickerOption[];
  countries: PickerOption[];
  value: string;
  currentLabel: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-sm font-normal"
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search any country…" />
          <CommandList>
            <CommandEmpty>No map found.</CommandEmpty>
            <CommandGroup heading="Featured">
              {featured.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="All countries">
              {countries.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function RouteMapGenerator() {
  const { user } = useAuth();
  // custom (uploaded) configs are persisted; everything else is derived on demand
  const [customConfigs, setCustomConfigs] = useState<MapConfig[]>(() => loadCustomConfigs());
  const [selectedId, setSelectedId] = useState<string>(INDIA_SAMPLE.mapConfigId);
  // session-only edits to projection / bounds / name, keyed by config id
  const [overrides, setOverrides] = useState<Record<string, Partial<MapConfig>>>({});

  // route document
  const [stops, setStops] = useState<RouteStop[]>(INDIA_SAMPLE.stops);
  const [segments, setSegments] = useState<RouteSegment[]>(INDIA_SAMPLE.segments);
  const [arrivalMode, setArrivalMode] = useState<EndpointMode>(
    INDIA_SAMPLE.arrivalMode ?? 'flight',
  );
  const [departureMode, setDepartureMode] = useState<EndpointMode>(
    INDIA_SAMPLE.departureMode ?? 'flight',
  );

  // osrm cache (lat/lng coordinates for land routes)
  const [osrmCache, setOsrmCache] = useState<Record<string, [number, number][]>>({});

  // style toggles
  const [showLabels, setShowLabels] = useState(true);
  const [showDots, setShowDots] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showIcons, setShowIcons] = useState(true);
  const [showAdmin1, setShowAdmin1] = useState(true);
  const [editPath, setEditPath] = useState(false);
  const [defaultTransportIcons, setDefaultTransportIcons] = useState<CustomTransportIconMap>(() =>
    loadDefaultTransportIcons(),
  );
  const [customTransportIcons, setCustomTransportIcons] = useState<CustomTransportIconMap>(() => {
    const saved = loadCustomTransportIcons();
    // Merge: defaults fill in any mode that doesn't already have a custom icon
    const defaults = loadDefaultTransportIcons();
    return { ...defaults, ...saved };
  });

  // auto-zoom: map framing follows the stops so you always see the route
  const [autoZoom, setAutoZoom] = useState(false);

  // misc
  const [exporting, setExporting] = useState(false);

  // saved routes (persisted in the route_maps table)
  const [savedRoutes, setSavedRoutes] = useState<SavedRouteRow[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string>('');
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const routeJsonInputRef = useRef<HTMLInputElement | null>(null);

  // ── resolve the active config ──
  const config = useMemo<MapConfig>(() => {
    const base = resolveConfigById(selectedId, customConfigs) ?? BUILT_IN_MAP_CONFIGS[0];
    return { ...base, ...(overrides[selectedId] ?? {}) };
  }, [selectedId, customConfigs, overrides]);
  const activeCountryKey = normalizeCountryName(config.countryName);
  const countrySavedRoutes = useMemo(
    () =>
      savedRoutes.filter((route) => normalizeCountryName(route.country || '') === activeCountryKey),
    [activeCountryKey, savedRoutes],
  );

  React.useEffect(() => {
    if (
      selectedSavedId &&
      !countrySavedRoutes.some((route) => String(route.id) === selectedSavedId)
    ) {
      setSelectedSavedId('');
    }
  }, [countrySavedRoutes, selectedSavedId]);

  // projection for the BASE (whole-country) map — used to detect off-map stops
  const baseCtx = useMemo(() => createProjectionContext(config), [config]);
  const validation = useMemo(() => validateRoute(stops, segments), [stops, segments]);

  const validStops = useMemo(
    () => stops.filter((s) => validateLat(s.lat) && validateLng(s.lng)),
    [stops],
  );
  const inFrameStops = useMemo(
    () =>
      validStops.filter((s) => isWithinFrame(latLngToPoint(s.lat, s.lng, config, baseCtx), config)),
    [validStops, config, baseCtx],
  );
  // Stops outside the whole-country map (e.g. leftovers from another country).
  const offMapStops = useMemo(
    () => validStops.filter((s) => !inFrameStops.includes(s)),
    [validStops, inFrameStops],
  );

  // Auto-zoom: derive a tight bounds around the stops so the map frames the route.
  // A single stop still gets a sensible minimum span. Custom bitmap maps opt out
  // (their background is a fixed image that can't reproject).
  const autoZoomActive = autoZoom && !config.backgroundImage;
  const stopBounds = useMemo(() => {
    const src = inFrameStops.length >= 1 ? inFrameStops : validStops;
    if (src.length === 0) return null;
    const lats = src.map((s) => s.lat);
    const lngs = src.map((s) => s.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const padLat = Math.max(1.5, (maxLat - minLat) * 0.35);
    const padLng = Math.max(1.5, (maxLng - minLng) * 0.35);
    return {
      minLat: minLat - padLat,
      maxLat: maxLat + padLat,
      minLng: minLng - padLng,
      maxLng: maxLng + padLng,
    };
  }, [inFrameStops, validStops]);

  // The config actually rendered: base map, or an auto-zoomed framing of the stops.
  const viewConfig = useMemo<MapConfig>(() => {
    if (!autoZoomActive || !stopBounds) return config;
    // size the canvas to the route's Mercator aspect so it fills the frame
    const mercY = (lat: number) =>
      Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
    const xSpan = ((stopBounds.maxLng - stopBounds.minLng) * Math.PI) / 180;
    const ySpan = Math.max(1e-3, mercY(stopBounds.maxLat) - mercY(stopBounds.minLat));
    const aspect = Math.max(0.5, Math.min(2.4, xSpan / ySpan));
    const MAX = 900;
    const width = aspect >= 1 ? MAX : Math.round(MAX * aspect);
    const height = aspect >= 1 ? Math.round(MAX / aspect) : MAX;
    return {
      ...config,
      width,
      height,
      mapArea: { x: 0, y: 0, width, height },
      bounds: stopBounds,
      fitFeatureName: undefined,
      projectionType: config.projectionType === 'equirectangular' ? 'equirectangular' : 'mercator',
    };
  }, [config, autoZoomActive, stopBounds]);

  const ctx = useMemo(() => createProjectionContext(viewConfig), [viewConfig]);
  const doc: RouteDocument = useMemo(
    () => ({
      version: 1,
      mapConfigId: config.id,
      stops,
      segments,
      arrivalMode,
      departureMode,
    }),
    [arrivalMode, config.id, departureMode, stops, segments],
  );

  // ── fetch real OSRM geometries for land routes ──
  React.useEffect(() => {
    const stopById = new Map(stops.map((s) => [s.id, s]));
    segments.forEach((seg) => {
      if (seg.mode === 'land') {
        const from = stopById.get(seg.fromStopId);
        const to = stopById.get(seg.toStopId);
        if (
          from &&
          to &&
          validateLat(from.lat) &&
          validateLng(from.lng) &&
          validateLat(to.lat) &&
          validateLng(to.lng)
        ) {
          const cacheKey = `${from.lng},${from.lat}-${to.lng},${to.lat}`;
          if (!osrmCache[cacheKey]) {
            // mark as fetching so we don't spam requests
            setOsrmCache((prev) => ({ ...prev, [cacheKey]: [] }));
            fetchOsrmRoute(from.lng, from.lat, to.lng, to.lat).then((pts) => {
              if (pts) {
                setOsrmCache((prev) => ({ ...prev, [cacheKey]: pts }));
              }
            });
          }
        }
      }
    });
  }, [segments, stops, osrmCache]);

  // picker options
  const featuredOptions = useMemo<PickerOption[]>(
    () => [
      ...BUILT_IN_MAP_CONFIGS.map((c) => ({ id: c.id, label: c.countryName })),
      ...customConfigs.map((c) => ({ id: c.id, label: `${c.countryName} (custom)` })),
    ],
    [customConfigs],
  );
  const countryOptions = useMemo<PickerOption[]>(() => getSelectableCountries(), []);

  const handleMapChange = (nextId: string) => {
    if (nextId === selectedId) return;
    const nextConfig = resolveConfigById(nextId, customConfigs);
    const countryChanged =
      nextConfig &&
      normalizeCountryName(nextConfig.countryName) !== normalizeCountryName(config.countryName);

    setSelectedId(nextId);
    setSelectedSavedId('');
    if (countryChanged) {
      setStops([]);
      setSegments([]);
      setArrivalMode('flight');
      setDepartureMode('flight');
      setSaveName('');
      setOsrmCache({});
      setAutoZoom(false);
      toast.success(`Switched to ${nextConfig.countryName}. Start a new route.`);
    }
  };

  // ── config edits ──
  const updateConfig = (patch: Partial<MapConfig>) => {
    setOverrides((prev) => ({ ...prev, [selectedId]: { ...(prev[selectedId] ?? {}), ...patch } }));
    if (config.custom) {
      setCustomConfigs((prev) => {
        const next = prev.map((c) => (c.id === selectedId ? { ...c, ...patch } : c));
        saveCustomConfigs(next);
        return next;
      });
    }
  };

  const updateBounds = (key: keyof NonNullable<MapConfig['bounds']>, value: number) => {
    const base = config.bounds ?? { minLng: -180, maxLng: 180, minLat: -85, maxLat: 85 };
    // manual bounds editing implies dropping the auto feature-fit
    updateConfig({ bounds: { ...base, [key]: value }, fitFeatureName: undefined });
  };

  // ── background / custom map upload ──
  const handleBackgroundUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 900;
        const h = img.naturalHeight || 700;
        const newConfig: MapConfig = {
          id: createId('custom'),
          countryName: file.name.replace(/\.[^.]+$/, '') || 'Custom Map',
          backgroundImage: dataUrl,
          width: w,
          height: h,
          projectionType: 'mercator',
          bounds: config.bounds,
          mapArea: { x: 0, y: 0, width: w, height: h },
          calibrationPoints: [],
          custom: true,
        };
        setCustomConfigs((prev) => {
          const next = [...prev, newConfig];
          saveCustomConfigs(next);
          return next;
        });
        setSelectedId(newConfig.id);
        toast.success(`Custom map "${newConfig.countryName}" added (${w}×${h}).`);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const updateCustomTransportIcons = (next: CustomTransportIconMap) => {
    setCustomTransportIcons(next);
    try {
      saveCustomTransportIcons(next);
    } catch (error) {
      console.error(error);
      toast.error('Icon applied, but browser storage is full so it may not survive a refresh.');
    }
  };

  const updateDefaultTransportIcons = (next: CustomTransportIconMap) => {
    setDefaultTransportIcons(next);
    try {
      saveDefaultTransportIcons(next);
    } catch (error) {
      console.error(error);
      toast.error('Default set, but browser storage is full.');
    }
  };

  // ── route editing ──
  const handleRouteChange = (nextStops: RouteStop[], nextSegments: RouteSegment[]) => {
    setStops(nextStops);
    setSegments(nextSegments);
  };
  const removeOffMapStops = () => {
    const offIds = new Set(offMapStops.map((s) => s.id));
    const kept = stops.filter((s) => !offIds.has(s.id));
    setStops(kept);
    setSegments(rebuildLinearChain(kept, segments));
    toast.success(`Removed ${offIds.size} stop(s) outside ${config.countryName}.`);
  };

  const clearRoute = () => {
    setStops([]);
    setSegments([]);
    toast.success('Route cleared.');
  };

  const routeJsonFilename = () => {
    const countrySlug = config.countryName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `route-map-${countrySlug || 'journey'}.json`;
  };

  const exportRouteJson = () => {
    const blob = new Blob([serializeRoute(doc)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = routeJsonFilename();
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Route JSON exported.');
  };

  const importRouteJson = async (file: File | null) => {
    if (!file) return;
    try {
      if (file.size > MAX_ROUTE_DOCUMENT_BYTES) {
        throw new Error('The selected file exceeds the 1 MB route-document limit.');
      }
      const parsed = parseRouteDocument(await file.text());
      const importedConfig = resolveConfigById(parsed.mapConfigId, customConfigs);
      if (!importedConfig) {
        throw new Error(
          `Map "${parsed.mapConfigId}" is not available. Import or select that map first.`,
        );
      }

      setSelectedId(importedConfig.id);
      setSelectedSavedId('');
      setStops(parsed.stops);
      setSegments(parsed.segments);
      setArrivalMode(parsed.arrivalMode ?? 'flight');
      setDepartureMode(parsed.departureMode ?? 'flight');
      setOsrmCache({});
      setAutoZoom(false);
      toast.success(`Imported ${parsed.stops.length} route stop(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import the route JSON.');
    } finally {
      if (routeJsonInputRef.current) routeJsonInputRef.current.value = '';
    }
  };

  // ── export ──
  const download = (dataUrl: string, ext: string) => {
    const link = document.createElement('a');
    link.download = `route-map-${config.countryName.toLowerCase().replace(/\s+/g, '-')}.${ext}`;
    link.href = dataUrl;
    link.click();
  };
  const routeName = () => {
    const first = stops[0]?.name?.trim();
    const last = stops[stops.length - 1]?.name?.trim();
    if (stops.length >= 2 && first && last) return `${config.countryName}: ${first} → ${last}`;
    if (first) return `${config.countryName}: ${first}`;
    return `${config.countryName} route map`;
  };

  const saveExportToDb = async (dataUrl: string) => {
    if (!user?.email || !user?.session_token) return; // not signed in — skip silently
    const base64 = dataUrl.split(',')[1];
    if (!base64) return;
    try {
      const res = await adminSaveRouteMap({
        data: {
          auth: { email: user.email, sessionToken: user.session_token },
          name: routeName(),
          country: config.countryName,
          stopCount: stops.length,
          distanceKm: Math.round(totalRouteKm(stops)),
          routeJson: serializeRoute(doc),
          base64,
        },
      });
      if (res?.success) toast.success('Saved to database.');
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : '';
      toast.error(
        /unauthor/i.test(msg)
          ? 'Downloaded, but you need admin/editor access to save it to the database.'
          : 'Downloaded, but saving to the database failed.',
      );
    }
  };

  // ── saved routes (database) ──
  const authPayload = () =>
    user?.email && user?.session_token
      ? { email: user.email, sessionToken: user.session_token }
      : null;

  const refreshSavedRoutes = React.useCallback(async () => {
    const auth =
      user?.email && user?.session_token
        ? { email: user.email, sessionToken: user.session_token }
        : null;
    if (!auth) return;
    try {
      const rows = await adminGetRouteMaps<SavedRouteRow[]>({
        data: { auth, country: config.countryName, limit: 100 },
      });
      setSavedRoutes(rows || []);
    } catch {
      // not an admin/editor — the saved-routes section just stays empty
    }
  }, [config.countryName, user?.email, user?.session_token]);

  React.useEffect(() => {
    refreshSavedRoutes();
  }, [refreshSavedRoutes]);

  const saveRoute = async () => {
    const auth = authPayload();
    if (!auth) {
      toast.error('Sign in with an admin account to save routes.');
      return;
    }
    if (stops.length === 0) {
      toast.error('Add at least one stop before saving.');
      return;
    }
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(canvasRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#77d1d1',
        filter: excludeFromExport,
      });
      const base64 = dataUrl.split(',')[1];
      if (!base64) throw new Error('Could not capture the map image.');
      const res = await adminSaveRouteMap({
        data: {
          auth,
          name: saveName.trim() || routeName(),
          country: config.countryName,
          stopCount: stops.length,
          distanceKm: Math.round(totalRouteKm(stops)),
          routeJson: serializeRoute(doc),
          base64,
        },
      });
      if (res?.success) {
        toast.success('Route saved.');
        setSaveName('');
        await refreshSavedRoutes();
        if (res.id) setSelectedSavedId(String(res.id));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(
        /unauthor|denied/i.test(msg)
          ? 'Admin access required to save routes.'
          : msg || 'Failed to save route.',
      );
    } finally {
      setSaving(false);
    }
  };

  const loadSavedRoute = async (idValue: string) => {
    const auth = authPayload();
    if (!auth || !idValue) return;
    setSelectedSavedId(idValue);
    setLoadingSaved(true);
    try {
      const detail = await adminGetRouteMapDetail<SavedRouteRow & { route_json: string }>({
        data: { auth, id: Number(idValue) },
      });
      const parsed = parseRouteDocument(detail.route_json);
      if (parsed.mapConfigId) setSelectedId(parsed.mapConfigId);
      setStops(parsed.stops);
      setSegments(parsed.segments);
      setArrivalMode(parsed.arrivalMode ?? 'flight');
      setDepartureMode(parsed.departureMode ?? 'flight');
      toast.success(`Loaded "${detail.name}".`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load saved route.');
    } finally {
      setLoadingSaved(false);
    }
  };

  const deleteSavedRoute = async () => {
    const auth = authPayload();
    if (!auth || !selectedSavedId) return;
    const route = countrySavedRoutes.find((r) => String(r.id) === selectedSavedId);
    if (!window.confirm(`Delete saved route "${route?.name || selectedSavedId}"?`)) return;
    try {
      await adminDeleteRouteMap({ data: { auth, id: Number(selectedSavedId) } });
      toast.success('Saved route deleted.');
      setSelectedSavedId('');
      await refreshSavedRoutes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete saved route.');
    }
  };

  const exportPng = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(canvasRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#77d1d1',
        filter: excludeFromExport,
      });
      download(dataUrl, 'png');
      toast.success('PNG exported.');
      await saveExportToDb(dataUrl);
    } catch (e) {
      console.error(e);
      toast.error('PNG export failed (a remote background image may block capture).');
    } finally {
      setExporting(false);
    }
  };
  const exportSvg = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toSvg(canvasRef.current, {
        cacheBust: true,
        backgroundColor: '#77d1d1',
        filter: excludeFromExport,
      });
      download(dataUrl, 'svg');
      toast.success('SVG exported.');
    } catch (e) {
      console.error(e);
      toast.error('SVG export failed.');
    } finally {
      setExporting(false);
    }
  };
  const currentLabel = config.custom ? `${config.countryName} (custom)` : config.countryName;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-normal">
            <MapPin className="h-5 w-5 text-primary" /> MapChart Route Map
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick any country and a brochure-style map loads automatically. Add stops, choose
            transport, export as PNG/SVG.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5 shadow-sm mr-2">
            <button
              type="button"
              onClick={() => setAutoZoom(true)}
              disabled={!!config.backgroundImage}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40',
                autoZoom
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <ZoomIn className="h-3.5 w-3.5" /> Auto-zoom
            </button>
            <button
              type="button"
              onClick={() => setAutoZoom(false)}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                !autoZoom
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Globe className="h-3.5 w-3.5" /> Whole map
            </button>
          </div>

          <Button
            variant={editPath ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditPath((v) => !v)}
            title="Drag handles on the map to shape each leg; click + to add a waypoint, double-click a handle to remove it"
          >
            <Spline className="mr-2 h-4 w-4" /> {editPath ? 'Cancel Edit' : 'Edit Path'}
          </Button>

          <input
            ref={routeJsonInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Choose route JSON to import"
            onChange={(event) => void importRouteJson(event.target.files?.[0] ?? null)}
          />
          <Button
            variant="outline"
            size="sm"
            title="Import a version 1 route JSON file (maximum 1 MB)"
            onClick={() => routeJsonInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" /> Import JSON
          </Button>
          <Button variant="outline" size="sm" onClick={exportRouteJson}>
            <Download className="mr-2 h-4 w-4" /> Export JSON
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={saveRoute}
            disabled={saving || stops.length === 0}
          >
            <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving…' : 'Save Route'}
          </Button>

          <Button variant="outline" size="sm" onClick={exportSvg} disabled={exporting}>
            <ImageDown className="mr-2 h-4 w-4" /> SVG
          </Button>
          <Button size="sm" onClick={exportPng} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" /> {exporting ? 'Exporting…' : 'Export PNG'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_1fr]">
        {/* ── Left sidebar ── */}
        <div className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
          <div className="space-y-2">
            <SectionLabel>Country / Map</SectionLabel>
            <MapPicker
              featured={featuredOptions}
              countries={countryOptions}
              value={selectedId}
              currentLabel={currentLabel}
              onChange={handleMapChange}
            />
          </div>

          {/* Custom background and Projection controls hidden per request */}

          <div className="space-y-2 border-t border-border pt-3">
            <SectionLabel>Saved Routes</SectionLabel>
            <div className="flex flex-col gap-1.5">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={routeName()}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex gap-1.5">
              <Select value={selectedSavedId} onValueChange={loadSavedRoute}>
                <SelectTrigger className="h-8 flex-1 text-xs" disabled={loadingSaved}>
                  <SelectValue
                    placeholder={
                      loadingSaved
                        ? 'Loading…'
                        : countrySavedRoutes.length
                          ? 'Load a saved route…'
                          : `No ${config.countryName} routes yet`
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {countrySavedRoutes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)} className="text-xs">
                      {r.name} · {r.stop_count} stops
                      {r.distance_km ? ` · ${r.distance_km} km` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-destructive"
                onClick={deleteSavedRoute}
                disabled={!selectedSavedId}
                title="Delete selected saved route"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <RouteStopEditor
              stops={stops}
              segments={segments}
              arrivalMode={arrivalMode}
              departureMode={departureMode}
              countryName={config.countryName}
              onChange={handleRouteChange}
              onArrivalModeChange={setArrivalMode}
              onDepartureModeChange={setDepartureMode}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 w-full gap-1 text-xs text-muted-foreground hover:text-destructive"
              onClick={clearRoute}
              disabled={stops.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear route
            </Button>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Type a city to auto-fill coordinates. Place search ©{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                OpenStreetMap
              </a>{' '}
              contributors.
            </p>
          </div>

          <CollapsibleSection title="Style">
            {(
              [
                ['Labels', showLabels, setShowLabels],
                ['City dots', showDots, setShowDots],
                ['Transport icons', showIcons, setShowIcons],
                ['State borders', showAdmin1, setShowAdmin1],
                ['Legend', showLegend, setShowLegend],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="flex items-center justify-between text-xs">
                <span>{label}</span>
                <Switch checked={value} onCheckedChange={(v) => setter(v)} />
              </label>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Custom Transport Icons">
            <TransportIconUploader
              icons={customTransportIcons}
              defaultIcons={defaultTransportIcons}
              onChange={updateCustomTransportIcons}
              onDefaultsChange={updateDefaultTransportIcons}
            />
          </CollapsibleSection>
        </div>

        {/* ── Center: map preview (sticks while the sidebar scrolls) ── */}
        <div className="flex flex-col self-start rounded-xl border border-border bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.05)_1px,transparent_0)] [background-size:16px_16px] p-4 lg:sticky lg:top-0">
          {/* Map toolbar */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapIcon className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{config.countryName}</span>
              {autoZoomActive && stopBounds && (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <ZoomIn className="h-3 w-3" /> zoomed to route
                </Badge>
              )}
            </div>
          </div>

          {offMapStops.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                {offMapStops.length} stop{offMapStops.length === 1 ? '' : 's'} fall outside the{' '}
                <strong>{config.countryName}</strong> map (
                {offMapStops
                  .slice(0, 3)
                  .map((s) => s.name)
                  .join(', ')}
                {offMapStops.length > 3 ? '…' : ''}) and {offMapStops.length === 1 ? 'is' : 'are'}{' '}
                hidden.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={removeOffMapStops}
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove them
              </Button>
            </div>
          )}
          {!validation.valid && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <ul className="list-inside list-disc space-y-0.5">
                {validation.errors.slice(0, 4).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {validation.errors.length > 4 && <li>+{validation.errors.length - 4} more…</li>}
              </ul>
            </div>
          )}
          <div className="flex flex-col items-start gap-4 xl:flex-row">
            <div className="min-w-0 w-full flex-1">
              <RouteMapCanvas
                config={viewConfig}
                ctx={ctx}
                stops={validStops}
                segments={segments}
                arrivalMode={arrivalMode}
                departureMode={departureMode}
                osrmCache={osrmCache}
                showLabels={showLabels}
                showDots={showDots}
                showLegend={showLegend}
                showIcons={showIcons}
                showAdmin1={showAdmin1}
                customIcons={Object.fromEntries(
                  Object.entries(customTransportIcons).map(([mode, icon]) => [mode, icon.dataUrl]),
                )}
                containerRef={canvasRef}
                editPath={editPath}
                onSegmentsChange={setSegments}
              />
            </div>
            <RouteSummaryPanel
              stops={validStops}
              segments={segments}
              arrivalMode={arrivalMode}
              departureMode={departureMode}
              className="w-full shrink-0 xl:w-[230px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
