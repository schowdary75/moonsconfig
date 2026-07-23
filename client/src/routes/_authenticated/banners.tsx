// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useState } from 'react';
import { toast } from '@/lib/toast';
import { Sparkles, Loader2, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/auth-context';
import { adminAiGenerateBanner } from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/banners')({
  component: BannersPage,
});

function BannersPage() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  const [theme, setTheme] = useState('');
  const [tone, setTone] = useState('Exciting & Urgent');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!theme.trim() || !auth) return;
    setIsGenerating(true);
    setCopied(false);
    try {
      const res = await adminAiGenerateBanner({ data: { auth, theme, tone } });
      setResult(res);
      toast.success('AI generated banner copy!');
    } catch (err) {
      console.error('Banner generation error:', err);
      toast.error(
        'Failed to generate banner copy: ' + (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    const text = `${result.headline}\n${result.subheadline}\n\n${result.callToAction}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard!');
  };

  return (
    <div className="flex flex-col h-full gap-4 min-h-[calc(100vh-7rem)]">
      {/* AI Header Section */}
      <div className="bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/5 rounded-xl border border-primary/20 p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-lg">AI WhatsApp Banner Copy Generator</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Instantly generate high-converting text for your WhatsApp promos.
          </p>
        </div>

        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <Input
            placeholder="Theme (e.g. 'Bali Honeymoon Deal')"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="bg-white/60 backdrop-blur-sm"
          />
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="flex h-9 w-40 items-center justify-between rounded-md border border-input bg-white/60 backdrop-blur-sm px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option>Exciting & Urgent</option>
            <option>Luxurious & Elegant</option>
            <option>Budget-Friendly & Fun</option>
          </select>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !theme.trim()}
            className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Generate
          </Button>
        </div>
      </div>

      {/* AI Result Banner */}
      {result && (
        <div className="bg-white rounded-xl border shadow-sm p-4 relative animate-fade-in flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1 space-y-1 pl-2 border-l-4 border-primary">
            <h4 className="font-black text-xl text-zinc-900 uppercase tracking-tight">
              {result.headline}
            </h4>
            <p className="text-zinc-600 font-medium">{result.subheadline}</p>
            <p className="text-primary font-bold pt-1">{result.callToAction}</p>
          </div>
          <Button variant="outline" size="sm" onClick={copyToClipboard} className="shrink-0">
            {copied ? (
              <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 mr-2" />
            )}
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </Button>
        </div>
      )}

      {/* Existing HTML Iframe Editor */}
      <div className="flex-1 rounded-xl border bg-card shadow-sm overflow-hidden min-h-[600px]">
        <iframe
          src="/banners.html"
          className="w-full h-full border-none"
          title="Banners Configuration"
        />
      </div>
    </div>
  );
}
