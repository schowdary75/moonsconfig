// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Image,
  LayoutGrid,
  GalleryHorizontalEnd,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import {
  adminGetPackagesAll,
  adminGetCarListingsAll,
  adminGetCruiseListings,
  getAccommodationListings,
} from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/assets')({
  component: Assets,
});

type ServiceKey = 'packages' | 'stays' | 'cars' | 'cruises';
type GalleryItem = {
  id: string;
  url: string;
  title: string;
  service: ServiceKey;
};

const SERVICE_LABELS: Record<ServiceKey, string> = {
  packages: 'Packages',
  stays: 'Stays',
  cars: 'Cars',
  cruises: 'Cruises',
};

function pickImage(row: any): string {
  return (
    row?.image_url ||
    row?.imageUrl ||
    row?.image ||
    row?.hero_image ||
    row?.heroImage ||
    row?.thumbnail_url ||
    row?.thumbnail ||
    ''
  );
}

function pickTitle(row: any): string {
  return (
    row?.title ||
    row?.name ||
    row?.itinerary ||
    row?.ship ||
    row?.model ||
    row?.destination ||
    'Untitled'
  );
}

function Assets() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [view, setView] = useState<'flow' | 'grid'>('flow');
  const [serviceFilter, setServiceFilter] = useState<'all' | ServiceKey>('all');

  const packagesQ = useQuery({
    queryKey: ['assets-packages', user?.session_token],
    queryFn: () => adminGetPackagesAll({ data: { auth: auth! } }),
    enabled: !!auth,
  });
  const carsQ = useQuery({
    queryKey: ['assets-cars', user?.session_token],
    queryFn: () => adminGetCarListingsAll({ data: { auth: auth! } }),
    enabled: !!auth,
  });
  const cruisesQ = useQuery({
    queryKey: ['assets-cruises', user?.session_token],
    queryFn: () => adminGetCruiseListings({ data: { auth: auth! } }),
    enabled: !!auth,
  });
  const staysQ = useQuery({
    queryKey: ['assets-stays'],
    queryFn: () => getAccommodationListings(),
  });

  const isLoading =
    packagesQ.isLoading || carsQ.isLoading || cruisesQ.isLoading || staysQ.isLoading;
  const isError = packagesQ.isError && carsQ.isError && cruisesQ.isError && staysQ.isError;

  const allItems = useMemo<GalleryItem[]>(() => {
    const out: GalleryItem[] = [];
    const push = (rows: any[], service: ServiceKey) => {
      (rows || []).forEach((row, i) => {
        const url = pickImage(row);
        if (!url) return;
        out.push({
          id: `${service}-${row?.id ?? i}`,
          url,
          title: pickTitle(row),
          service,
        });
      });
    };
    push(packagesQ.data as any[], 'packages');
    push(staysQ.data as any[], 'stays');
    push(carsQ.data as any[], 'cars');
    push(cruisesQ.data as any[], 'cruises');
    return out;
  }, [packagesQ.data, staysQ.data, carsQ.data, cruisesQ.data]);

  const items = useMemo(
    () =>
      serviceFilter === 'all' ? allItems : allItems.filter((i) => i.service === serviceFilter),
    [allItems, serviceFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allItems.length };
    for (const it of allItems) c[it.service] = (c[it.service] || 0) + 1;
    return c;
  }, [allItems]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Asset Library</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Every image published across all services on the MooNs website — packages, stays, cars,
            and cruises.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setView('flow')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === 'flow'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Cover Flow"
            >
              <GalleryHorizontalEnd className="h-4 w-4" /> Cover Flow
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === 'grid'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Grid"
            >
              <LayoutGrid className="h-4 w-4" /> Grid
            </button>
          </div>
        </div>
      </div>

      {/* Service filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'packages', 'stays', 'cars', 'cruises'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setServiceFilter(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              serviceFilter === key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {key === 'all' ? 'All' : SERVICE_LABELS[key]}
            <span className="ml-1.5 opacity-70">{counts[key] || 0}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Loading service images...
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-10 text-center text-sm text-destructive">
          Could not load service images. Check your admin session.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <h2 className="text-lg font-semibold">No images found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add photos to your packages, stays, cars, or cruises and they will appear here.
          </p>
        </div>
      ) : view === 'flow' ? (
        <CoverFlow items={items} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <GalleryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function CoverFlow({ items }: { items: GalleryItem[] }) {
  const [active, setActive] = useState(0);
  const [autoDir, setAutoDir] = useState(0); // -1 left, 0 idle, +1 right
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Keep the active index valid if the filtered list changes.
  useEffect(() => {
    if (active > items.length - 1) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);

  const clamp = (n: number) => Math.max(0, Math.min(items.length - 1, n));

  // Auto-scroll while the pointer rests near an edge of the stage.
  useEffect(() => {
    if (autoDir === 0) return;
    const timer = setInterval(() => {
      setActive((cur) => {
        const next = clamp(cur + autoDir);
        return next;
      });
    }, 160);
    return () => clearInterval(timer);
  }, [autoDir, items.length]);

  function onMouseMove(e: React.MouseEvent) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    if (x > 0.64) setAutoDir(1);
    else if (x < 0.36) setAutoDir(-1);
    else setAutoDir(0);
  }

  const current = items[active];

  return (
    <div className="rounded-2xl border bg-gradient-to-b from-zinc-50 to-zinc-100 shadow-sm">
      {/* 3D stage */}
      <div
        ref={stageRef}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setAutoDir(0)}
        className="relative mx-auto flex h-[460px] items-center justify-center overflow-hidden"
        style={{ perspective: '1200px' }}
      >
        {/* Edge hint cursors */}
        <div
          className={`pointer-events-none absolute left-0 top-0 z-[200] flex h-full w-[36%] items-center justify-start pl-4 transition-opacity ${
            autoDir === -1 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <ChevronLeft className="h-8 w-8 text-zinc-400" />
        </div>
        <div
          className={`pointer-events-none absolute right-0 top-0 z-[200] flex h-full w-[36%] items-center justify-end pr-4 transition-opacity ${
            autoDir === 1 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <ChevronRight className="h-8 w-8 text-zinc-400" />
        </div>

        {items.map((item, i) => {
          const offset = i - active;
          const abs = Math.abs(offset);
          const sign = Math.sign(offset);
          const isCenter = offset === 0;

          if (abs > 5) return null;

          const rotateY = isCenter ? 0 : offset < 0 ? 58 : -58;
          const translateX = isCenter ? 0 : sign * 230 + offset * 62;
          const translateZ = isCenter ? 120 : -Math.min(abs, 6) * 45 - 40;
          const scale = isCenter ? 1 : 0.86;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(i)}
              className="absolute outline-none"
              style={{
                width: 300,
                height: 300,
                transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                transition: 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                zIndex: 100 - abs,
                cursor: isCenter ? 'default' : 'pointer',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
              }}
            >
              <img
                src={item.url}
                alt={item.title}
                draggable={false}
                loading="lazy"
                decoding="async"
                className="h-full w-full rounded-md bg-white object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=600&auto=format&fit=crop';
                }}
                style={{
                  boxShadow: isCenter
                    ? '0 20px 45px rgba(0,0,0,0.28)'
                    : '0 10px 24px rgba(0,0,0,0.18)',
                  // Reflection only on the centered image — reflecting every card
                  // doubles paint area and is the main source of scroll jank.
                  WebkitBoxReflect: isCenter
                    ? 'below 2px linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.18) 100%)'
                    : 'none',
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Caption + scrubber + copy */}
      <div className="space-y-4 px-8 pb-8 pt-2">
        {current && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                {SERVICE_LABELS[current.service]}
              </span>
              <p className="truncate text-sm font-semibold text-zinc-900">{current.title}</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {active + 1} of {items.length}
            </p>
          </div>
        )}

        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={() => setActive((c) => clamp(c - 1))}
            disabled={active === 0}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, items.length - 1)}
            value={active}
            onChange={(e) => setActive(Number(e.target.value))}
            className="coverflow-range h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-300"
            aria-label="Scrub assets"
          />
          <button
            type="button"
            onClick={() => setActive((c) => clamp(c + 1))}
            disabled={active === items.length - 1}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {current && (
          <div className="mx-auto flex max-w-2xl items-center justify-center gap-2">
            <p className="truncate rounded border bg-white px-3 py-1.5 text-xs text-zinc-500">
              {current.url}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard.writeText(current.url).then(() => toast.success('URL copied'))
              }
            >
              <Copy className="mr-2 h-3.5 w-3.5" /> Copy URL
            </Button>
          </div>
        )}
      </div>

      <style>{`
        .coverflow-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: hsl(var(--primary));
          box-shadow: 0 1px 3px rgba(0,0,0,0.35);
          cursor: pointer;
        }
        .coverflow-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border: none;
          border-radius: 9999px;
          background: hsl(var(--primary));
          box-shadow: 0 1px 3px rgba(0,0,0,0.35);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

function GalleryCard({ item }: { item: GalleryItem }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="aspect-video bg-muted">
        <img
          src={item.url}
          alt={item.title}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=600&auto=format&fit=crop';
          }}
        />
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {SERVICE_LABELS[item.service]}
          </span>
          <p className="truncate text-sm font-semibold">{item.title}</p>
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.clipboard.writeText(item.url).then(() => toast.success('URL copied'))
            }
          >
            <Copy className="mr-2 h-3.5 w-3.5" /> Copy URL
          </Button>
        </div>
      </div>
    </div>
  );
}
