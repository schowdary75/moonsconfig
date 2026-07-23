import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Plane, Car, Ship, TrainFront, Download, type LucideIcon } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { RouteStop, RouteSegment, TransportMode, EndpointMode } from './routeMapTypes';

const MODE_META: Record<TransportMode, { label: string; Icon: LucideIcon }> = {
  flight: { label: 'flight', Icon: Plane },
  land: { label: 'car', Icon: Car },
  rail: { label: 'train', Icon: TrainFront },
  cruise: { label: 'cruise', Icon: Ship },
};

function TransferRow({ mode, text }: { mode: TransportMode; text: string }) {
  const { Icon } = MODE_META[mode];
  return (
    <div className="flex items-center gap-2 py-2 pl-7 text-xs text-primary/80">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

/**
 * Brochure-style vertical itinerary ("Your route"): arrival, each stop, and the
 * transfer mode between stops — all derived live from the edited route.
 */
export function RouteSummaryPanel({
  stops,
  segments,
  arrivalMode,
  departureMode,
  className,
}: {
  stops: RouteStop[];
  segments: RouteSegment[];
  arrivalMode: EndpointMode;
  departureMode: EndpointMode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  const segmentFor = (fromId: string, toId: string) =>
    segments.find((s) => s.fromStopId === fromId && s.toStopId === toId) ??
    segments.find((s) => s.fromStopId === fromId);

  const firstStop = stops[0];

  const downloadPng = async () => {
    if (!panelRef.current || stops.length === 0) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(panelRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
        // exclude the download button itself from the capture
        filter: (node) => !(node instanceof HTMLElement && node.dataset?.exportExclude === 'true'),
      });
      const link = document.createElement('a');
      const first = stops[0]?.name?.trim() || 'route';
      const last = stops[stops.length - 1]?.name?.trim() || '';
      link.download = `your-route-${[first, last].filter(Boolean).join('-').toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Route itinerary downloaded.');
    } catch (e) {
      console.error(e);
      toast.error('Could not export the route itinerary.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-sm', className)}
    >
      <div className="relative border-b border-border px-4 py-2.5 text-center text-sm font-semibold">
        Your route
        <button
          type="button"
          data-export-exclude="true"
          onClick={downloadPng}
          disabled={downloading || stops.length === 0}
          title="Download as PNG"
          aria-label="Download route itinerary as PNG"
          className="absolute right-2 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 sm:min-h-0 sm:min-w-0"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      {stops.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Add stops to see the itinerary here.
        </p>
      ) : (
        <div className="relative px-4 py-3">
          {/* vertical timeline line behind the dots */}
          {stops.length > 1 && (
            <span aria-hidden className="absolute bottom-6 left-[21.5px] top-10 w-px bg-border" />
          )}
          {arrivalMode !== 'none' && (
            <TransferRow mode={arrivalMode} text={`Arrival at ${firstStop.name || 'first stop'}`} />
          )}
          {stops.map((stop, index) => {
            const next = stops[index + 1];
            const seg = next ? segmentFor(stop.id, next.id) : null;
            // Intermediate legs always have a mode; only the final (departure)
            // leg may be optional.
            const legMode: EndpointMode = next ? (seg?.mode ?? 'land') : departureMode;
            const showTransfer = legMode !== 'none';
            const transferMode: TransportMode = legMode === 'none' ? 'land' : legMode;
            const transferText = next
              ? `Transfer by ${MODE_META[transferMode].label}`
              : `Departure by ${MODE_META[transferMode].label}`;
            return (
              <div key={stop.id} className="relative">
                <div className="flex items-center gap-2.5 py-1">
                  <span className="relative z-10 h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/50 ring-4 ring-card" />
                  <span className="text-sm font-semibold text-foreground">
                    {stop.name || `Stop ${index + 1}`}
                  </span>
                </div>
                {showTransfer && <TransferRow mode={transferMode} text={transferText} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
