import React from 'react';
import { CarFront, Check, Plane, RotateCcw, Ship, Star, TrainFront, Upload } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import type { TransportMode } from './routeMapTypes';

const STORAGE_KEY = 'route-map-custom-transport-icons-v1';
const DEFAULT_STORAGE_KEY = 'route-map-default-transport-icons-v1';
const MAX_ICON_BYTES = 512 * 1024;

const MODE_DETAILS: Array<{
  mode: TransportMode;
  label: string;
  description: string;
  Icon: React.ElementType;
}> = [
  { mode: 'flight', label: 'Flight', description: 'Aircraft', Icon: Plane },
  { mode: 'land', label: 'Car', description: 'Road', Icon: CarFront },
  { mode: 'cruise', label: 'Ship', description: 'Cruise', Icon: Ship },
  { mode: 'rail', label: 'Train', description: 'Rail', Icon: TrainFront },
];

export interface CustomTransportIcon {
  dataUrl: string;
  fileName: string;
}

export type CustomTransportIconMap = Partial<Record<TransportMode, CustomTransportIcon>>;

function isStoredIcon(value: unknown): value is CustomTransportIcon {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CustomTransportIcon>;
  return (
    typeof candidate.dataUrl === 'string' &&
    candidate.dataUrl.startsWith('data:image/') &&
    typeof candidate.fileName === 'string'
  );
}

export function loadCustomTransportIcons(): CustomTransportIconMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, unknown>;
    return Object.fromEntries(
      MODE_DETAILS.flatMap(({ mode }) =>
        isStoredIcon(parsed[mode]) ? [[mode, parsed[mode]]] : [],
      ),
    ) as CustomTransportIconMap;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be unavailable in privacy-restricted browser contexts.
    }
    return {};
  }
}

export function saveCustomTransportIcons(icons: CustomTransportIconMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
}

/** Load icons that have been explicitly marked as "default" by the user. */
export function loadDefaultTransportIcons(): CustomTransportIconMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEFAULT_STORAGE_KEY) || '{}') as Record<
      string,
      unknown
    >;
    return Object.fromEntries(
      MODE_DETAILS.flatMap(({ mode }) =>
        isStoredIcon(parsed[mode]) ? [[mode, parsed[mode]]] : [],
      ),
    ) as CustomTransportIconMap;
  } catch {
    return {};
  }
}

export function saveDefaultTransportIcons(icons: CustomTransportIconMap) {
  localStorage.setItem(DEFAULT_STORAGE_KEY, JSON.stringify(icons));
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The icon file could not be read.'));
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The icon file could not be read.'));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The SVG file could not be read.'));
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The SVG file could not be read.'));
    reader.readAsText(file);
  });
}

async function validateSvg(file: File) {
  const source = await readAsText(file);
  const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (
    documentNode.querySelector('parsererror') ||
    documentNode.documentElement.tagName.toLowerCase() !== 'svg'
  ) {
    throw new Error('This file is not a valid SVG.');
  }

  const forbiddenElement = documentNode.querySelector(
    'script, foreignObject, iframe, object, embed, audio, video, canvas',
  );
  if (forbiddenElement) {
    throw new Error(`SVG element <${forbiddenElement.tagName}> is not allowed.`);
  }

  for (const element of Array.from(documentNode.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) {
        throw new Error('SVG event handlers are not allowed.');
      }
      if (
        (name === 'href' || name === 'xlink:href') &&
        value &&
        !value.startsWith('#') &&
        !value.startsWith('data:image/')
      ) {
        throw new Error('SVG icons cannot load external resources.');
      }
      if (/url\s*\(\s*(['"]?)(?!#|data:image\/)/i.test(value)) {
        throw new Error('SVG icons cannot load external resources.');
      }
    }
  }
}

async function prepareIcon(file: File): Promise<CustomTransportIcon> {
  if (file.size > MAX_ICON_BYTES) {
    throw new Error('Icon must be smaller than 512 KB.');
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  const isSvg = file.type === 'image/svg+xml' || extension === 'svg';
  const isRaster =
    (file.type === 'image/png' && extension === 'png') ||
    (file.type === 'image/webp' && extension === 'webp');

  if (!isSvg && !isRaster) {
    throw new Error('Upload an SVG, PNG, or WebP icon.');
  }
  if (isSvg) await validateSvg(file);

  return {
    dataUrl: await readAsDataUrl(file),
    fileName: file.name,
  };
}

interface TransportIconUploaderProps {
  icons: CustomTransportIconMap;
  defaultIcons: CustomTransportIconMap;
  onChange: (icons: CustomTransportIconMap) => void;
  onDefaultsChange: (defaults: CustomTransportIconMap) => void;
}

export function TransportIconUploader({
  icons,
  defaultIcons,
  onChange,
  onDefaultsChange,
}: TransportIconUploaderProps) {
  const inputRefs = React.useRef<Partial<Record<TransportMode, HTMLInputElement | null>>>({});

  const handleUpload = async (mode: TransportMode, file: File | null) => {
    if (!file) return;
    try {
      const icon = await prepareIcon(file);
      onChange({ ...icons, [mode]: icon });
      toast.success(`${MODE_DETAILS.find((item) => item.mode === mode)?.label} icon updated.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not use this icon.');
    }
  };

  const resetIcon = (mode: TransportMode) => {
    const next = { ...icons };
    delete next[mode];
    onChange(next);
    toast.success(`${MODE_DETAILS.find((item) => item.mode === mode)?.label} restored to default.`);
  };

  const toggleDefault = (mode: TransportMode) => {
    const isDefault = !!defaultIcons[mode];
    if (isDefault) {
      const next = { ...defaultIcons };
      delete next[mode];
      onDefaultsChange(next);
      toast.success(
        `${MODE_DETAILS.find((item) => item.mode === mode)?.label} removed from defaults.`,
      );
    } else if (icons[mode]) {
      onDefaultsChange({ ...defaultIcons, [mode]: icons[mode]! });
      toast.success(
        `${MODE_DETAILS.find((item) => item.mode === mode)?.label} set as default icon!`,
      );
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {MODE_DETAILS.map(({ mode, label, description, Icon }) => {
        const customIcon = icons[mode];
        const isDefault = !!defaultIcons[mode];
        return (
          <div
            key={mode}
            className={`rounded-lg border bg-background p-2 ${isDefault ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                {customIcon ? (
                  <img
                    src={customIcon.dataUrl}
                    alt={`${label} custom icon preview`}
                    className="h-7 w-7 object-contain"
                  />
                ) : (
                  <Icon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-medium">{label}</p>
                  {isDefault && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                      <Check className="h-2.5 w-2.5" /> Default
                    </span>
                  )}
                </div>
                <p className="truncate text-[10px] text-muted-foreground">
                  {customIcon?.fileName || `${description} default`}
                </p>
              </div>
            </div>

            <input
              ref={(node) => {
                inputRefs.current[mode] = node;
              }}
              type="file"
              accept=".svg,image/svg+xml,.png,image/png,.webp,image/webp"
              className="hidden"
              onChange={(event) => {
                void handleUpload(mode, event.target.files?.[0] || null);
                event.target.value = '';
              }}
            />
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                title={customIcon ? 'Replace' : 'Upload'}
                onClick={() => inputRefs.current[mode]?.click()}
              >
                <Upload className="h-3 w-3" />
              </Button>
              {customIcon && (
                <Button
                  type="button"
                  variant={isDefault ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2"
                  title={
                    isDefault ? 'Remove as default' : `Set ${label.toLowerCase()} as default icon`
                  }
                  onClick={() => toggleDefault(mode)}
                >
                  <Star className={`h-3 w-3 ${isDefault ? 'fill-current' : ''}`} />
                </Button>
              )}
              {customIcon && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  title={`Restore default ${label.toLowerCase()} icon`}
                  onClick={() => resetIcon(mode)}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
      <p className="col-span-2 text-[10px] leading-relaxed text-muted-foreground">
        SVG gives the sharpest export. Icons should face right; the map rotates them toward each
        destination. Maximum 512 KB each.
      </p>
    </div>
  );
}
