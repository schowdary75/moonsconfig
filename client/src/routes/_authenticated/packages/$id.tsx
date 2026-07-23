// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useMemo, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { createFileRoute, Link, useNavigate } from '@/lib/routerCompat';
import { toast } from '@/lib/toast';
import {
  ArrowLeft,
  ImageUp,
  Save,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Car,
  Plane,
  Train,
  Ship,
  Eye,
  Code,
  Sunrise,
  Compass,
  Sunset,
  Database,
  Film,
  Video,
} from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import {
  adminGetPackageBuilderInventory,
  adminGetPackageDetail,
  adminUploadAsset,
  adminUpsertPackageDetail,
  adminAiGenerateItinerary,
  adminAiEstimatePrice,
  adminAiGenerateSEO,
  PackageDetail,
  PackageLineItem,
  adminGetVendorsAll,
  adminGetMasterCatalog,
  adminAiComposeRfq,
  adminSendRfq,
} from '@/lib/api/db.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { SendRfqModal } from '@/components/send-rfq-modal';
import { Label } from '@/components/ui/label';
export const Route = createFileRoute('/_authenticated/packages/$id')({
  component: PackageEditor,
});

type FormState = {
  id?: number;
  slug: string;
  name: string;
  description: string;
  country: string;
  destination: string;
  nights: number;
  days: number;
  price: number;
  vendor_id?: number;
  b2b_price: number;
  category: 'Economy' | 'Premium' | 'Luxury';
  image_url: string;
  image_key: string;
  is_active: boolean;
  themesText: string;
  itineraryText: string;
  inclusionsText: string;
  exclusionsText: string;
  lineItems: PackageLineItem[];
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  images: string[];
};

type ItineraryEditorDay = {
  day_number: number;
  title: string;
  description: string;
  city: string;
  route_location: string;
  route_lat: string;
  route_lng: string;
  route_mode?: 'road' | 'flight' | 'rail' | 'cruise' | '';
  slot_morning: string;
  slot_afternoon: string;
  slot_evening: string;
};

const emptyForm: FormState = {
  slug: '',
  name: '',
  description: '',
  country: '',
  destination: '',
  nights: 3,
  days: 4,
  price: 50000,
  b2b_price: 40000,
  category: 'Premium',
  image_url: '',
  image_key: 'dubai',
  is_active: true,
  themesText: 'Luxury\nFamily',
  itineraryText: '1 | Arrival | Private transfer and check-in | City | City | ',
  inclusionsText: 'Stay | Hotel accommodation\nTransfers | Private airport transfers',
  exclusionsText: 'Flights\nVisa fees',
  lineItems: [],
  meta_title: '',
  meta_description: '',
  meta_keywords: '',
  images: [],
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toCoordinateString(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '';
}

function parseCoordinate(value: string, min: number, max: number) {
  if (!value.trim()) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`Coordinate ${value} is outside the allowed range.`);
  }
  return numeric;
}

function parseCoordsPair(value: string) {
  const [latRaw = '', lngRaw = ''] = value.split(',').map((part) => part.trim());
  return { route_lat: latRaw, route_lng: lngRaw };
}

function formatItineraryDay(day: ItineraryEditorDay) {
  const coords =
    day.route_lat.trim() || day.route_lng.trim()
      ? `${day.route_lat.trim()},${day.route_lng.trim()}`
      : '';
  return [
    day.day_number,
    day.title,
    day.description,
    day.city,
    day.route_location || day.city,
    coords,
    day.route_mode || 'road',
    day.slot_morning || '',
    day.slot_afternoon || '',
    day.slot_evening || '',
  ].join(' | ');
}

function parseItineraryText(text: string): ItineraryEditorDay[] {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const [
        dayStr = '',
        title = '',
        description = '',
        city = '',
        routeLocation = '',
        coords = '',
        routeMode = 'road',
        slotMorning = '',
        slotAfternoon = '',
        slotEvening = '',
      ] = line.split('|').map((part) => part.trim());
      const parsedCoords = parseCoordsPair(coords);
      return {
        day_number: Number(dayStr) || index + 1,
        title: title || `Day ${index + 1}`,
        description: description || '',
        city,
        route_location: routeLocation || city,
        route_lat: parsedCoords.route_lat,
        route_lng: parsedCoords.route_lng,
        route_mode: (routeMode as any) || 'road',
        slot_morning: slotMorning,
        slot_afternoon: slotAfternoon,
        slot_evening: slotEvening,
      };
    });
}

function toForm(pkg: PackageDetail): FormState {
  return {
    id: pkg.id,
    slug: pkg.slug,
    name: pkg.name,
    description: pkg.description,
    country: pkg.country,
    destination: pkg.destination,
    nights: Number(pkg.nights),
    days: Number(pkg.days),
    price: Number(pkg.price),
    vendor_id: (pkg as any).vendor_id ?? undefined,
    b2b_price: Number((pkg as any).b2b_price || 0),
    category: pkg.category as 'Economy' | 'Premium' | 'Luxury',
    image_url: pkg.image_url,
    image_key: pkg.image_key,
    is_active: Boolean(pkg.is_active),
    meta_title: pkg.meta_title || '',
    meta_description: pkg.meta_description || '',
    meta_keywords: pkg.meta_keywords || '',
    images: pkg.images || [],
    themesText: pkg.themes.join('\n'),
    itineraryText: pkg.itinerary
      .map((day) =>
        formatItineraryDay({
          day_number: day.day_number,
          title: day.title,
          description: day.description,
          city: day.city || '',
          route_location: day.route_location || day.city || '',
          route_lat: toCoordinateString(day.route_lat),
          route_lng: toCoordinateString(day.route_lng),
          route_mode: (day as any).route_mode || 'road',
          slot_morning: (day as any).slot_morning || '',
          slot_afternoon: (day as any).slot_afternoon || '',
          slot_evening: (day as any).slot_evening || '',
        }),
      )
      .join('\n'),
    inclusionsText: pkg.inclusions.map((item) => `${item.category} | ${item.item}`).join('\n'),
    exclusionsText: pkg.exclusions.map((item) => item.item).join('\n'),
    lineItems: pkg.line_items || [],
  };
}

function parseForm(form: FormState) {
  const itinerary = parseItineraryText(form.itineraryText).map((day, index) => {
    const hasLat = day.route_lat.trim().length > 0;
    const hasLng = day.route_lng.trim().length > 0;
    if (hasLat !== hasLng) {
      throw new Error(
        `Day ${index + 1} must include both latitude and longitude, or leave both blank.`,
      );
    }
    return {
      day_number: Number(day.day_number) || index + 1,
      title: day.title || `Day ${index + 1}`,
      description: day.description || '',
      city: day.city || null,
      route_location: day.route_location || day.city || null,
      route_lat: parseCoordinate(day.route_lat, -90, 90),
      route_lng: parseCoordinate(day.route_lng, -180, 180),
      route_mode: day.route_mode || 'road',
      slot_morning: day.slot_morning || null,
      slot_afternoon: day.slot_afternoon || null,
      slot_evening: day.slot_evening || null,
    };
  });

  return {
    id: form.id,
    slug: form.slug || slugify(form.name),
    name: form.name,
    description: form.description,
    country: form.country,
    destination: form.destination,
    nights: Number(form.nights),
    days: Number(form.days),
    price: Number(form.price),
    vendor_id: form.vendor_id || undefined,
    b2b_price: Number(form.b2b_price || 0),
    category: form.category,
    image_url: form.image_url,
    image_key: form.image_key,
    images: form.images,
    is_active: form.is_active,
    meta_title: form.meta_title || null,
    meta_description: form.meta_description || null,
    meta_keywords: form.meta_keywords || null,
    themes: form.themesText
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean),
    itinerary,
    inclusions: form.inclusionsText
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [category, item] = line.split('|').map((part) => part.trim());
        return { category: category || 'Included', item: item || category || '' };
      })
      .filter((item) => item.item),
    exclusions: form.exclusionsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => ({ item })),
    line_items: form.lineItems,
  };
}

function PackageEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = id === 'new';
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'visual' | 'raw'>('visual');
  const [builderItems, setBuilderItems] = useState<any[]>([]);
  const [isGeneratingItinerary, setIsGeneratingItinerary] = useState(false);
  const [isEstimatingPrice, setIsEstimatingPrice] = useState(false);
  const [isGeneratingSEO, setIsGeneratingSEO] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [catalogActivities, setCatalogActivities] = useState<any[]>([]);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isRfqModalOpen, setIsRfqModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState('overview');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const exportBusyRef = useRef(false);

  const handleOpenRfqModal = () => setIsRfqModalOpen(true);

  const handleOpenCatalog = async () => {
    setIsCatalogModalOpen(true);
    if (catalogActivities.length === 0) {
      if (!auth) return;
      setIsLoadingCatalog(true);
      try {
        const res = await adminGetMasterCatalog({
          data: {
            auth,
            catalogType: 'activity',
            status: 'active',
            destination: form.destination,
          } as any,
        });
        setCatalogActivities(res.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingCatalog(false);
      }
    }
  };

  const handleAddActivityToItinerary = (activity: any) => {
    const next = [...itineraryDays];
    const newDayNum = next.length + 1;
    next.push({
      day_number: newDayNum,
      title: activity.name || activity.title || `Day ${newDayNum}`,
      description: activity.description || '',
      city: activity.destination || activity.place || form.destination || '',
      route_location: activity.destination || activity.place || form.destination || '',
      route_lat: '',
      route_lng: '',
      route_mode: 'road',
      slot_morning: '',
      slot_afternoon: '',
      slot_evening: '',
    });
    saveItineraryDays(next);
    toast.success('Added to itinerary');
    setIsCatalogModalOpen(false);
  };

  const itineraryDays = useMemo(() => {
    return parseItineraryText(form.itineraryText);
  }, [form.itineraryText]);

  const sendPointsToIframe = () => {
    if (iframeRef.current?.contentWindow) {
      const validPoints = itineraryDays
        .filter((d) => d.route_lat && d.route_lng)
        .map((d) => ({
          lat: Number(d.route_lat),
          lng: Number(d.route_lng),
          name: d.route_location || d.city || `Day ${d.day_number}`,
          desc: d.description || '',
          mode: d.route_mode || 'road',
        }));
      iframeRef.current.contentWindow.postMessage(validPoints, window.location.origin);
    }
  };

  useEffect(() => {
    if (activeTab === 'route') {
      sendPointsToIframe();
    }
  }, [activeTab, itineraryDays]);

  // ── animated route export (GIF / WebM) ──
  // The animator iframe does the capture + encoding and posts the finished blob
  // back; we only drive it and handle the download.
  const [exportState, setExportState] = useState<{
    busy: boolean;
    label: string;
    progress: number;
  }>({
    busy: false,
    label: '',
    progress: 0,
  });

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'route-export-start') {
        exportBusyRef.current = true;
        setExportState({ busy: true, label: 'Preparing…', progress: 0 });
      } else if (msg.type === 'route-export-progress') {
        setExportState({
          busy: true,
          label: msg.label || 'Rendering…',
          progress: Math.max(0, Math.min(1, Number(msg.progress) || 0)),
        });
      } else if (msg.type === 'route-export-done') {
        exportBusyRef.current = false;
        setExportState({ busy: false, label: '', progress: 0 });
        const url = URL.createObjectURL(msg.blob as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(form.name || 'route')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}-journey.${msg.format === 'gif' ? 'gif' : 'webm'}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(
          `${msg.format === 'gif' ? 'GIF' : 'Video'} exported (${(msg.size / 1024 / 1024).toFixed(1)} MB).`,
        );
      } else if (msg.type === 'route-export-error') {
        exportBusyRef.current = false;
        setExportState({ busy: false, label: '', progress: 0 });
        toast.error(`Export failed: ${msg.message}`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [form.name]);

  const startRouteExport = (format: 'gif' | 'webm') => {
    if (exportBusyRef.current) return;
    const stops = itineraryDays.filter((d) => d.route_lat && d.route_lng).length;
    if (stops < 2) {
      toast.error('Add at least two itinerary stops with coordinates first.');
      return;
    }
    const animator = iframeRef.current?.contentWindow;
    if (!animator) {
      toast.error('Route preview is still loading.');
      return;
    }
    exportBusyRef.current = true;
    setExportState({ busy: true, label: 'Preparing…', progress: 0 });
    animator.postMessage({ type: 'route-export', format }, window.location.origin);
  };

  const saveItineraryDays = (days: ItineraryEditorDay[]) => {
    update('itineraryText', days.map(formatItineraryDay).join('\n'));
  };

  const handleUpdateDay = (index: number, field: string, value: any) => {
    const next = [...itineraryDays];
    next[index] = { ...next[index], [field]: value };
    saveItineraryDays(next);
  };

  const handleAddDay = () => {
    const next = [...itineraryDays];
    const newDayNum = next.length + 1;
    next.push({
      day_number: newDayNum,
      title: `Adventure Day ${newDayNum}`,
      description: 'Explore premium spots...',
      city: form.destination || '',
      route_location: form.destination || '',
      route_lat: '',
      route_lng: '',
      route_mode: 'road',
      slot_morning: '',
      slot_afternoon: '',
      slot_evening: '',
    });
    saveItineraryDays(next);
  };

  const handleRemoveDay = (index: number) => {
    let next = itineraryDays.filter((_, idx) => idx !== index);
    next = next.map((d, idx) => ({ ...d, day_number: idx + 1 }));
    saveItineraryDays(next);
  };

  const handleMoveDay = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === itineraryDays.length - 1) return;
    const next = [...itineraryDays];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    const renumbered = next.map((d, idx) => ({ ...d, day_number: idx + 1 }));
    saveItineraryDays(renumbered);
  };

  useEffect(() => {
    async function load() {
      if (!auth) return;
      setLoading(true);
      try {
        const vens = await adminGetVendorsAll({ data: { auth } });
        setVendors(vens);
        if (!isNew) {
          const detail = await adminGetPackageDetail({ data: { auth, id: Number(id) } });
          if (detail) setForm(toForm(detail));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load package');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, user?.session_token]);

  const previewUrl = useMemo(() => form.image_url.trim(), [form.image_url]);
  const lineItemTotal = useMemo(
    () => form.lineItems.reduce((sum, item) => sum + Number(item.total_selling || 0), 0),
    [form.lineItems],
  );

  async function loadBuilderItems(destination = form.destination) {
    if (!auth || !destination) return;
    try {
      const res = await adminGetPackageBuilderInventory({ data: { auth, destination } });
      setBuilderItems(res.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load master catalog items');
    }
  }

  function addLineItem(item: any, rate: any) {
    const quantity = 1;
    const netCost = Number(rate?.net_cost || 0);
    const sellingPrice = Number(rate?.selling_price || 0);
    setForm((current) => ({
      ...current,
      price: Math.round(
        current.lineItems.reduce((sum, row) => sum + Number(row.total_selling || 0), 0) +
          sellingPrice,
      ),
      lineItems: [
        ...current.lineItems,
        {
          catalog_type: item.catalog_type,
          catalog_id: item.id,
          rate_card_id: rate?.id || null,
          vendor_id: rate?.vendor_id || null,
          vendor_name: rate?.vendor_name || null,
          item_name: item.name,
          unit_type: rate?.unit_type || 'fixed',
          quantity,
          net_cost: netCost,
          selling_price: sellingPrice,
          total_net: quantity * netCost,
          total_selling: quantity * sellingPrice,
          notes: '',
        },
      ],
    }));
  }

  function updateLineItem(index: number, patch: Partial<PackageLineItem>) {
    setForm((current) => {
      const next = current.lineItems.map((item, i) => {
        if (i !== index) return item;
        const merged = { ...item, ...patch };
        const quantity = Number(merged.quantity || 0);
        return {
          ...merged,
          total_net: quantity * Number(merged.net_cost || 0),
          total_selling: quantity * Number(merged.selling_price || 0),
        };
      });
      return {
        ...current,
        lineItems: next,
        price: Math.round(
          next.reduce((sum, item) => sum + Number(item.total_selling || 0), 0) || current.price,
        ),
      };
    });
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!auth) return;
    setSaving(true);
    setError(null);
    try {
      const payload = parseForm(form);
      const res = await adminUpsertPackageDetail({ data: { auth, package: payload } });
      await navigate({ to: '/packages/$id', params: { id: String(res.id) } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save package');
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File | null) {
    if (!file || !auth) return;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const result = await adminUploadAsset({
      data: { auth, originalFilename: file.name, mimeType: file.type as any, base64 },
    });
    update('image_url', result.publicUrl);
  }

  async function uploadGalleryImage(file: File | null) {
    if (!file || !auth) return;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const result = await adminUploadAsset({
      data: { auth, originalFilename: file.name, mimeType: file.type as any, base64 },
    });
    setForm((current) => ({ ...current, images: [...current.images, result.publicUrl] }));
  }

  function removeGalleryImage(index: number) {
    setForm((current) => {
      const next = [...current.images];
      next.splice(index, 1);
      return { ...current, images: next };
    });
  }

  async function handleAiEstimatePrice() {
    if (!auth || !form.destination) return;
    setIsEstimatingPrice(true);
    try {
      const res = await adminAiEstimatePrice({
        data: {
          auth,
          destination: form.destination,
          days: form.days,
          category: form.category,
          itineraryText: form.itineraryText,
        },
      });
      update('price', res.estimated_price_inr);
    } catch (err) {
      console.error(err);
    } finally {
      setIsEstimatingPrice(false);
    }
  }

  async function handleAiGenerateItinerary() {
    if (!auth || !form.destination) return;
    setIsGeneratingItinerary(true);
    try {
      const text = await adminAiGenerateItinerary({
        data: { auth, destination: form.destination, days: form.days, category: form.category },
      });
      update('itineraryText', text);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingItinerary(false);
    }
  }

  async function handleAiGenerateSEO() {
    if (!auth || !form.destination || !form.name) return;
    setIsGeneratingSEO(true);
    try {
      const res = await adminAiGenerateSEO({
        data: {
          auth,
          destination: form.destination,
          name: form.name,
          description: form.description,
        },
      });
      setForm((current) => ({
        ...current,
        meta_title: res.meta_title,
        meta_description: res.meta_description,
        meta_keywords: res.meta_keywords,
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingSEO(false);
    }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading package...</div>;

  return (
    <div className=" space-y-6 p-8">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link to="/packages">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">
            {isNew ? 'Create Package' : form.name || `Package ${id}`}
          </h1>
          <p className="text-muted-foreground">
            Changes save into MooNsConfig and appear on the public website through the Config API.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleOpenRfqModal} disabled={!form.id || !auth}>
            <Sunrise className="mr-2 h-4 w-4" /> Send RFQ
          </Button>
          <Button onClick={save} disabled={saving || !auth}>
            <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="route">Route</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    name: e.target.value,
                    slug: current.slug || slugify(e.target.value),
                  }))
                }
              />
            </Field>
            <Field label="Slug">
              <Input value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))} />
            </Field>
            <Field label="Destination">
              <Input
                value={form.destination}
                onChange={(e) => update('destination', e.target.value)}
              />
            </Field>
            <Field label="Country">
              <Input value={form.country} onChange={(e) => update('country', e.target.value)} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className="min-h-36"
            />
          </Field>
        </TabsContent>

        <TabsContent value="seo" className="space-y-4 pt-4">
          <div className="flex justify-end mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiGenerateSEO}
              disabled={isGeneratingSEO || !form.destination || !form.name}
            >
              {isGeneratingSEO ? 'Generating...' : '✨ AI Generate SEO'}
            </Button>
          </div>
          <Field label="Meta Title">
            <Input
              value={form.meta_title}
              onChange={(e) => update('meta_title', e.target.value)}
              placeholder="Default will be generated if left blank"
            />
          </Field>
          <Field label="Meta Description">
            <Textarea
              value={form.meta_description}
              onChange={(e) => update('meta_description', e.target.value)}
              className="min-h-24"
              placeholder="Default will be generated if left blank"
            />
          </Field>
          <Field label="Meta Keywords">
            <Input
              value={form.meta_keywords}
              onChange={(e) => update('meta_keywords', e.target.value)}
              placeholder="Comma-separated keywords"
            />
          </Field>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4 pt-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Nights">
              <Input
                type="number"
                value={form.nights}
                onChange={(e) => update('nights', Number(e.target.value))}
              />
            </Field>
            <Field label="Days">
              <Input
                type="number"
                value={form.days}
                onChange={(e) => update('days', Number(e.target.value))}
              />
            </Field>
            <Field label="Price INR (B2C Selling)">
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => update('price', Number(e.target.value))}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAiEstimatePrice}
                  disabled={isEstimatingPrice || !form.destination}
                  title="AI Market Estimate"
                >
                  {isEstimatingPrice ? '...' : '✨'}
                </Button>
              </div>
            </Field>
            <Field label="B2B Net Price (INR)">
              <Input
                type="number"
                value={form.b2b_price || ''}
                onChange={(e) => update('b2b_price', Number(e.target.value))}
              />
            </Field>
            <Field label="Primary Supplier">
              <select
                value={form.vendor_id || ''}
                onChange={(e) => update('vendor_id', Number(e.target.value))}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select Supplier...</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.company_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value as FormState['category'])}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option>Economy</option>
                <option>Premium</option>
                <option>Luxury</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-3 rounded-md border p-4">
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => update('is_active', checked)}
            />
            <span className="text-sm font-medium">Published on public website</span>
          </label>
        </TabsContent>

        <TabsContent value="builder" className="space-y-5 pt-4">
          <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <Database className="h-4 w-4 text-primary" /> Destination Builder
              </div>
              <p className="text-xs text-muted-foreground">
                Fetch master vendors, stays, rooms, activities, and cars for{' '}
                {form.destination || 'the selected destination'}.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => loadBuilderItems()}
              disabled={!form.destination}
            >
              Load Master Items
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <div className="rounded-md border bg-background">
              <div className="border-b px-3 py-2 text-sm font-semibold">Available Master Items</div>
              <div className="max-h-[520px] overflow-y-auto">
                {builderItems.map((item) => (
                  <div key={`${item.catalog_type}-${item.id}`} className="border-b p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="text-xs capitalize text-muted-foreground">
                          {item.catalog_type} · {item.subtype || item.destination}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(item.rates || []).length === 0 ? (
                        <span className="text-xs text-muted-foreground">No rate card yet</span>
                      ) : (
                        item.rates.map((rate: any) => (
                          <Button
                            key={rate.id}
                            size="sm"
                            variant="outline"
                            onClick={() => addLineItem(item, rate)}
                          >
                            Add INR {Number(rate.selling_price || 0).toLocaleString('en-IN')}{' '}
                            {rate.vendor_name ? `· ${rate.vendor_name}` : ''}
                          </Button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
                {builderItems.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Load a destination to see master catalog items.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border bg-background">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-semibold">Package Line Items</span>
                <span className="text-sm font-bold text-primary">
                  INR {lineItemTotal.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                {form.lineItems.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-2 border-b p-3 md:grid-cols-[70px_1fr_80px_100px_auto]"
                  >
                    <Input
                      type="number"
                      placeholder="Day"
                      value={item.day_number || ''}
                      onChange={(e) =>
                        updateLineItem(index, {
                          day_number: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                    <div>
                      <div className="text-sm font-medium">{item.item_name}</div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {item.catalog_type} · {item.unit_type}{' '}
                        {item.vendor_name ? `· ${item.vendor_name}` : ''}
                      </div>
                    </div>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) })}
                    />
                    <Input
                      type="number"
                      value={item.selling_price}
                      onChange={(e) =>
                        updateLineItem(index, { selling_price: Number(e.target.value) })
                      }
                    />
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          lineItems: current.lineItems.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {form.lineItems.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No package line items yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="route" className="pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">Cinematic Route</h3>
              <p className="text-xs text-muted-foreground">
                Export the animated journey to share with clients. Rendering takes ~30–90s.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {exportState.busy && (
                <div
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <div
                    className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="Route export progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(exportState.progress * 100)}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.round(exportState.progress * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono">{exportState.label}</span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={exportState.busy}
                onClick={() => startRouteExport('gif')}
              >
                <Film className="mr-2 h-4 w-4" /> Export GIF
              </Button>
              <Button
                size="sm"
                disabled={exportState.busy}
                onClick={() => startRouteExport('webm')}
              >
                <Video className="mr-2 h-4 w-4" /> Export Video
              </Button>
            </div>
          </div>
          <div className="h-[750px]">
            {/* ?v= busts the browser cache for this static file — without it an
                old cached copy of the animator keeps running after a deploy. */}
            <iframe
              ref={iframeRef}
              onLoad={sendPointsToIframe}
              src="/route-animator.html?v=3"
              className="w-full h-full border-0 rounded-xl shadow-sm bg-black"
              title="Route Animator"
            />
          </div>
        </TabsContent>

        <TabsContent value="itinerary" className="space-y-4 pt-4">
          <div className="flex items-center justify-between border-b pb-3 mb-4">
            <div>
              <h3 className="text-lg font-bold font-display text-primary">
                Interactive Itinerary Studio
              </h3>
              <p className="text-xs text-muted-foreground">
                Visually design and organize the daily luxury activities of this expedition.
              </p>
            </div>
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted border">
              <button
                type="button"
                onClick={() => setEditMode('visual')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  editMode === 'visual'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Visual Cards
              </button>
              <button
                type="button"
                onClick={() => setEditMode('raw')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  editMode === 'raw'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                Raw Text
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenCatalog}>
                <Database className="w-4 h-4 mr-2 text-primary" /> Add from Catalog
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAiGenerateItinerary}
                disabled={isGeneratingItinerary || !form.destination}
              >
                {isGeneratingItinerary ? 'Generating...' : '✨ AI Generate Itinerary'}
              </Button>
            </div>
          </div>

          {editMode === 'raw' ? (
            <Field label="Itinerary Lines: day | title | description | city | route location | optional lat,lng">
              <Textarea
                value={form.itineraryText}
                onChange={(e) => update('itineraryText', e.target.value)}
                className="min-h-80 font-mono text-sm border-border/60"
              />
            </Field>
          ) : (
            <div className="space-y-4">
              {/* Daily cards grid */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {itineraryDays.map((day, idx) => (
                  <div
                    key={day.day_number}
                    className="relative p-5 rounded-xl border border-border/80 bg-card hover:shadow-md transition-all group flex flex-col gap-4"
                  >
                    {/* Header bar of day card */}
                    <div className="flex items-center justify-between border-b pb-3 border-border/50">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center bg-primary text-primary-foreground font-mono font-bold text-xs px-2.5 py-1 rounded-md">
                          DAY {String(day.day_number).padStart(2, '0')}
                        </span>
                        <input
                          type="text"
                          className="font-bold text-sm bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 text-foreground font-sans"
                          value={day.title}
                          placeholder="Day Title"
                          onChange={(e) => handleUpdateDay(idx, 'title', e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveDay(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDay(idx, 'down')}
                          disabled={idx === itineraryDays.length - 1}
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDay(idx)}
                          className="p-1 rounded hover:bg-destructive/10 text-destructive/80 hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Card inputs: description, city, route coordinates */}
                    <div className="grid gap-4 md:grid-cols-[1fr_180px_180px_110px_110px]">
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Activity Summary
                        </span>
                        <Textarea
                          className="text-xs resize-none min-h-[64px] border-border/60"
                          value={day.description}
                          placeholder="Summarize the activities of this day..."
                          onChange={(e) => handleUpdateDay(idx, 'description', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Location / City
                        </span>
                        <input
                          type="text"
                          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                          value={day.city}
                          placeholder="e.g. Dubai"
                          onChange={(e) => handleUpdateDay(idx, 'city', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Route Stop
                        </span>
                        <input
                          type="text"
                          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                          value={day.route_location}
                          placeholder="Map label/place"
                          onChange={(e) => handleUpdateDay(idx, 'route_location', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Latitude
                        </span>
                        <input
                          type="number"
                          step="0.000001"
                          min="-90"
                          max="90"
                          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                          value={day.route_lat}
                          placeholder="25.2048"
                          onChange={(e) => handleUpdateDay(idx, 'route_lat', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Longitude
                        </span>
                        <input
                          type="number"
                          step="0.000001"
                          min="-180"
                          max="180"
                          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                          value={day.route_lng}
                          placeholder="55.2708"
                          onChange={(e) => handleUpdateDay(idx, 'route_lng', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Daily Pillars Slots & Transport Segments */}
                    <div className="grid gap-3 md:grid-cols-[3fr_1fr] border-t border-border/50 pt-3">
                      {/* Interactive daily activities slots */}
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="p-2.5 rounded-lg bg-muted/30 border border-dashed border-border/60 flex flex-col gap-1">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Sunrise className="w-3 h-3 text-amber-500" /> Morning
                          </span>
                          <input
                            type="text"
                            placeholder="e.g. Sunrise Balloon Ride"
                            value={day.slot_morning}
                            onChange={(e) => handleUpdateDay(idx, 'slot_morning', e.target.value)}
                            className="bg-transparent border-none text-[11px] focus:outline-none placeholder-muted-foreground text-foreground px-0.5"
                          />
                        </div>
                        <div className="p-2.5 rounded-lg bg-muted/30 border border-dashed border-border/60 flex flex-col gap-1">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Compass className="w-3 h-3 text-blue-500" /> Afternoon
                          </span>
                          <input
                            type="text"
                            placeholder="e.g. Guided Souk Walk"
                            value={day.slot_afternoon}
                            onChange={(e) => handleUpdateDay(idx, 'slot_afternoon', e.target.value)}
                            className="bg-transparent border-none text-[11px] focus:outline-none placeholder-muted-foreground text-foreground px-0.5"
                          />
                        </div>
                        <div className="p-2.5 rounded-lg bg-muted/30 border border-dashed border-border/60 flex flex-col gap-1">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Sunset className="w-3 h-3 text-purple-500" /> Evening
                          </span>
                          <input
                            type="text"
                            placeholder="e.g. Michelin Dinner"
                            value={day.slot_evening}
                            onChange={(e) => handleUpdateDay(idx, 'slot_evening', e.target.value)}
                            className="bg-transparent border-none text-[11px] focus:outline-none placeholder-muted-foreground text-foreground px-0.5"
                          />
                        </div>
                      </div>

                      {/* Travel Transfer Segment Card */}
                      <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 flex flex-col justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                          Ground/Air Segment
                        </span>
                        <div className="flex gap-1.5 mt-1.5 justify-around">
                          <button
                            type="button"
                            onClick={() => handleUpdateDay(idx, 'route_mode', 'road')}
                            className={`p-1 rounded bg-card hover:bg-muted text-muted-foreground ${!day.route_mode || day.route_mode === 'road' ? 'ring-2 ring-primary text-primary' : ''}`}
                            title="Road"
                          >
                            <Car className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateDay(idx, 'route_mode', 'flight')}
                            className={`p-1 rounded bg-card hover:bg-muted text-muted-foreground ${day.route_mode === 'flight' ? 'ring-2 ring-primary text-primary' : ''}`}
                            title="Flight"
                          >
                            <Plane className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateDay(idx, 'route_mode', 'rail')}
                            className={`p-1 rounded bg-card hover:bg-muted text-muted-foreground ${day.route_mode === 'rail' ? 'ring-2 ring-primary text-primary' : ''}`}
                            title="Rail"
                          >
                            <Train className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateDay(idx, 'route_mode', 'cruise')}
                            className={`p-1 rounded bg-card hover:bg-muted text-muted-foreground ${day.route_mode === 'cruise' ? 'ring-2 ring-primary text-primary' : ''}`}
                            title="Cruise"
                          >
                            <Ship className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add day button */}
              <Button
                type="button"
                variant="outline"
                onClick={handleAddDay}
                className="w-full h-11 border-dashed border-border/80 hover:bg-muted font-bold text-xs gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Expedition Day
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="content" className="space-y-4 pt-4">
          <div className="flex items-center justify-end gap-2 border-b pb-2">
            <span className="text-sm font-medium">Raw Edit</span>
            <Switch
              checked={editMode === 'visual'}
              onCheckedChange={(c) => setEditMode(c ? 'visual' : 'raw')}
            />
            <span className="text-sm font-medium text-muted-foreground">Visual Builder</span>
          </div>

          {editMode === 'raw' ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Themes">
                <Textarea
                  value={form.themesText}
                  onChange={(e) => update('themesText', e.target.value)}
                  className="min-h-64"
                />
              </Field>
              <Field label="Inclusions (Format: Category | Item)">
                <Textarea
                  value={form.inclusionsText}
                  onChange={(e) => update('inclusionsText', e.target.value)}
                  className="min-h-64"
                />
              </Field>
              <Field label="Exclusions">
                <Textarea
                  value={form.exclusionsText}
                  onChange={(e) => update('exclusionsText', e.target.value)}
                  className="min-h-64"
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-8 md:grid-cols-3">
              {/* Themes */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center justify-between">
                  Themes{' '}
                  <span className="text-xs bg-muted px-2 py-1 rounded-full">
                    {form.themesText.split(/\r?\n|,/).filter((t) => t.trim()).length}
                  </span>
                </h3>
                <div className="space-y-2">
                  {form.themesText
                    .split(/\r?\n|,/)
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((theme, i, arr) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={theme}
                          onChange={(e) => {
                            const next = [...arr];
                            next[i] = e.target.value;
                            update('themesText', next.join('\n'));
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const next = arr.filter((_, idx) => idx !== i);
                            update('themesText', next.join('\n'));
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update(
                        'themesText',
                        form.themesText + (form.themesText ? '\n' : '') + 'New Theme',
                      )
                    }
                    className="w-full gap-2 border-dashed"
                  >
                    <Plus className="w-4 h-4" /> Add Theme
                  </Button>
                </div>
              </div>

              {/* Inclusions */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center justify-between">
                  Inclusions{' '}
                  <span className="text-xs bg-muted px-2 py-1 rounded-full">
                    {form.inclusionsText.split(/\r?\n/).filter((t) => t.trim()).length}
                  </span>
                </h3>
                <div className="space-y-3">
                  {form.inclusionsText
                    .split(/\r?\n/)
                    .filter(Boolean)
                    .map((line, i, arr) => {
                      const [c = '', v = ''] = line.split('|').map((p) => p.trim());
                      return (
                        <div
                          key={i}
                          className="flex flex-col gap-2 p-4 border rounded-xl bg-card relative group shadow-sm transition-shadow hover:shadow-md"
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 bg-background/50 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              const next = arr.filter((_, idx) => idx !== i);
                              update('inclusionsText', next.join('\n'));
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div>
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                              Category
                            </Label>
                            <Input
                              value={c}
                              className="h-8 font-medium bg-background/50"
                              placeholder="e.g. Flights, Hotel"
                              onChange={(e) => {
                                const next = [...arr];
                                next[i] = `${e.target.value} | ${v}`;
                                update('inclusionsText', next.join('\n'));
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                              Description
                            </Label>
                            <Textarea
                              value={v}
                              className="min-h-16 text-sm bg-background/50 resize-none"
                              placeholder="Description of inclusion..."
                              onChange={(e) => {
                                const next = [...arr];
                                next[i] = `${c} | ${e.target.value}`;
                                update('inclusionsText', next.join('\n'));
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update(
                        'inclusionsText',
                        form.inclusionsText +
                          (form.inclusionsText ? '\n' : '') +
                          'Category | Item description',
                      )
                    }
                    className="w-full gap-2 border-dashed"
                  >
                    <Plus className="w-4 h-4" /> Add Inclusion
                  </Button>
                </div>
              </div>

              {/* Exclusions */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center justify-between">
                  Exclusions{' '}
                  <span className="text-xs bg-muted px-2 py-1 rounded-full">
                    {form.exclusionsText.split(/\r?\n/).filter((t) => t.trim()).length}
                  </span>
                </h3>
                <div className="space-y-2">
                  {form.exclusionsText
                    .split(/\r?\n/)
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((exc, i, arr) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={exc}
                          onChange={(e) => {
                            const next = [...arr];
                            next[i] = e.target.value;
                            update('exclusionsText', next.join('\n'));
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const next = arr.filter((_, idx) => idx !== i);
                            update('exclusionsText', next.join('\n'));
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update(
                        'exclusionsText',
                        form.exclusionsText + (form.exclusionsText ? '\n' : '') + 'New Exclusion',
                      )
                    }
                    className="w-full gap-2 border-dashed"
                  >
                    <Plus className="w-4 h-4" /> Add Exclusion
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="media" className="space-y-8 pt-4">
          <div className="grid gap-6 md:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Hero Image</h3>
              <Field label="Image URL">
                <Input
                  value={form.image_url}
                  onChange={(e) => update('image_url', e.target.value)}
                />
              </Field>
              <Field label="Image key fallback">
                <Input
                  value={form.image_key}
                  onChange={(e) => update('image_key', e.target.value)}
                />
              </Field>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
                <ImageUp className="h-4 w-4" />
                Upload Hero Image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={(event) => upload(event.target.files?.[0] || null)}
                />
              </label>
            </div>
            <div className="overflow-hidden rounded-lg border bg-muted/30">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt=""
                  className="h-64 w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src =
                      'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=800&auto=format&fit=crop';
                  }}
                />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No image
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Gallery Images</h3>
                <p className="text-sm text-muted-foreground">
                  These images will animate on the package card in the storefront.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted bg-primary/5 text-primary border-primary/20">
                <ImageUp className="h-4 w-4" />
                Add to Gallery
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={(event) => uploadGalleryImage(event.target.files?.[0] || null)}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {form.images.map((imgUrl, i) => (
                <div
                  key={i}
                  className="relative group rounded-lg overflow-hidden border bg-muted/30 aspect-video"
                >
                  <img
                    src={imgUrl}
                    alt={`Gallery image ${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src =
                        'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=800&auto=format&fit=crop';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeGalleryImage(i)}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-destructive text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {form.images.length === 0 && (
                <div className="col-span-full py-8 text-center border border-dashed rounded-lg text-muted-foreground text-sm">
                  No gallery images added yet. The storefront will fall back to auto-generating
                  curated images.
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {isCatalogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-2xl rounded-xl shadow-lg border flex flex-col max-h-[85vh]">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Select Activity from Catalog</h3>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingCatalog ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading catalog items...
                </div>
              ) : catalogActivities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activities found in catalog for this destination.
                </div>
              ) : (
                <div className="space-y-3">
                  {catalogActivities.map((act) => (
                    <div
                      key={act.id}
                      className="p-4 rounded-lg border bg-muted/10 hover:bg-muted/30 transition-colors flex items-start justify-between gap-4"
                    >
                      <div>
                        <h4 className="font-semibold text-sm">{act.name || act.title}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {act.description}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => handleAddActivityToItinerary(act)}>
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end">
              <Button variant="outline" onClick={() => setIsCatalogModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <SendRfqModal
        isOpen={isRfqModalOpen}
        onClose={() => setIsRfqModalOpen(false)}
        auth={auth}
        packageId={form.id || 0}
        destination={form.destination}
        country={form.country}
        packageDurationDays={form.days}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
