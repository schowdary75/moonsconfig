// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { Sparkles, Loader2, MapPin, Wind } from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import { VisualImageDropzone } from '@/components/visual-ai/VisualImageDropzone';
import { readVisualImage, validateVisualImage } from '@/components/visual-ai/visualImageUpload';
import { adminAiVisualScrapbook, adminSaveAiItineraryToActivities } from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/ppm/visual-ai')({
  component: ScrapbooksPage,
});

function ScrapbooksPage() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const uploadInFlightRef = useRef(false);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveToCatalog = async () => {
    if (!result || !result.itinerary || !result.destination) return;
    setIsSaving(true);
    try {
      await adminSaveAiItineraryToActivities({
        data: {
          destination: result.destination,
          itinerary: result.itinerary,
        },
      });
      toast.success('Saved itinerary to Activities catalog!');
    } catch (err) {
      toast.error('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (uploadInFlightRef.current) return;

    const validation = validateVisualImage(file);
    if (!validation.valid) {
      setUploadError(validation.message);
      toast.error(validation.message);
      return;
    }

    if (!auth) {
      const message = 'Your session has expired. Sign in again before analyzing an image.';
      setUploadError(message);
      toast.error(message);
      return;
    }

    uploadInFlightRef.current = true;
    setIsGenerating(true);
    setIsDragActive(false);
    setUploadError(null);
    setResult(null);

    try {
      const base64Str = await readVisualImage(file);
      setImageSrc(base64Str);

      try {
        const base64Data = base64Str.split(',')[1];
        const res = await adminAiVisualScrapbook({
          data: { auth, base64Data, mimeType: file.type },
        });
        setResult(res);
        toast.success('AI analyzed the image and built an itinerary!');
      } catch (err) {
        const message =
          'The AI provider could not analyze this image. ' +
          (err instanceof Error ? err.message : 'Please try again.');
        setUploadError(message);
        toast.error(message);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'The image could not be read. Choose another file.';
      setUploadError(message);
      toast.error(message);
    } finally {
      uploadInFlightRef.current = false;
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      <div />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Upload Area */}
        <VisualImageDropzone
          imageSrc={imageSrc}
          busy={isGenerating}
          dragActive={isDragActive}
          error={uploadError}
          onDragActiveChange={setIsDragActive}
          onFile={(file) => void handleImageUpload(file)}
        />

        {/* Right: Results Area */}
        <div className="glass-card rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">AI Generated Blueprint</h3>
          </div>
          <div className="p-6 flex-1 bg-gradient-to-b from-background to-muted/10 overflow-y-auto">
            {isGenerating ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p className="animate-pulse">Gemini Vision is analyzing pixels...</p>
                <p className="text-xs mt-2 text-primary/70">
                  Identifying vibes & drafting itineraries
                </p>
              </div>
            ) : result ? (
              <div className="space-y-6 animate-slide-up">
                <div className="flex gap-4">
                  <div className="flex-1 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold mb-1 text-sm uppercase tracking-wider">
                      <MapPin className="w-3.5 h-3.5" /> Destination
                    </div>
                    <p className="text-lg font-semibold">{result.destination}</p>
                  </div>
                  <div className="flex-1 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-bold mb-1 text-sm uppercase tracking-wider">
                      <Wind className="w-3.5 h-3.5" /> Core Vibe
                    </div>
                    <p className="text-lg font-semibold">{result.vibe}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">
                    Sample 3-Day Itinerary
                  </h4>
                  <div className="space-y-4">
                    {result.itinerary?.map((day: any, idx: number) => (
                      <div
                        key={idx}
                        className="relative pl-6 border-l-2 border-primary/30 pb-2 last:pb-0"
                      >
                        <div className="absolute w-3 h-3 bg-primary rounded-full -left-[7px] top-1.5 ring-4 ring-background" />
                        <h5 className="font-bold text-base">
                          Day {day.day}: {day.title}
                        </h5>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {day.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleSaveToCatalog}
                  disabled={isSaving}
                  className="w-full mt-4 bg-gradient-to-r from-primary to-purple-600 text-white border-0 shadow-lg hover:opacity-90"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {isSaving ? 'Saving...' : 'Save to Catalog'}
                </Button>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Sparkles className="w-6 h-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm">Upload an image to see the AI magic.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
