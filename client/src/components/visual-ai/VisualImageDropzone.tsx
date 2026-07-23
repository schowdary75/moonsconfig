import { useRef, type DragEvent, type KeyboardEvent } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VISUAL_IMAGE_MIME_TYPES } from './visualImageUpload';

type VisualImageDropzoneProps = {
  imageSrc: string | null;
  busy: boolean;
  dragActive: boolean;
  error: string | null;
  onDragActiveChange: (active: boolean) => void;
  onFile: (file: File) => void;
};

export function VisualImageDropzone({
  imageSrc,
  busy,
  dragActive,
  error,
  onDragActiveChange,
  onFile,
}: VisualImageDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const openPicker = () => {
    if (!busy) fileInputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (busy || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openPicker();
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (busy) return;
    dragDepthRef.current += 1;
    onDragActiveChange(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!busy) event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (busy) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) onDragActiveChange(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    onDragActiveChange(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-disabled={busy}
      aria-busy={busy}
      aria-describedby="visual-image-help visual-image-feedback"
      data-drag-active={dragActive ? 'true' : 'false'}
      className={cn(
        'glass-card rounded-xl p-6 flex flex-col items-center justify-center min-h-[400px] border-dashed border-2 bg-primary/5 relative overflow-hidden group cursor-pointer outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        dragActive ? 'border-primary bg-primary/15' : 'border-primary/20',
        busy && 'cursor-wait opacity-80',
      )}
      onClick={(event) => {
        if (event.target !== fileInputRef.current) openPicker();
      }}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {imageSrc ? (
        <>
          <img
            src={imageSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
          />
          <div className="relative z-10 flex flex-col items-center p-6 bg-background/80 backdrop-blur-md rounded-xl shadow-lg border border-border/50 pointer-events-none">
            <img
              src={imageSrc}
              alt="Selected travel inspiration"
              className="w-48 h-48 object-cover rounded-lg shadow-sm mb-4"
            />
            <span className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium">
              {busy ? 'Analyzing image…' : 'Choose a different image'}
            </span>
          </div>
        </>
      ) : (
        <div className="text-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            {busy ? (
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            ) : (
              <ImageIcon className="w-8 h-8 text-primary" />
            )}
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {dragActive ? 'Release to upload' : busy ? 'Analyzing image…' : 'Drop inspiration here'}
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            Drop an image, select one, or press Enter or Space.
          </p>
          <span className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg">
            Select image
          </span>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="sr-only"
        accept={VISUAL_IMAGE_MIME_TYPES.join(',')}
        disabled={busy}
        aria-label="Choose a travel inspiration image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file && !busy) onFile(file);
        }}
      />
      <p id="visual-image-help" className="relative z-10 mt-4 text-xs text-muted-foreground">
        JPEG, PNG, WebP, or AVIF · maximum 10 MiB
      </p>
      <p
        id="visual-image-feedback"
        role={error ? 'alert' : 'status'}
        className={cn(
          'relative z-10 mt-2 min-h-5 text-center text-sm',
          error ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {error ?? (busy ? 'Analysis is in progress. Please keep this page open.' : '')}
      </p>
    </div>
  );
}
