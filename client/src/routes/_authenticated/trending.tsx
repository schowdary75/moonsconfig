// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useState, useEffect } from 'react';
import {
  CalendarClock,
  Clipboard,
  ExternalLink,
  Flame,
  Globe2,
  MapPin,
  Megaphone,
  Plane,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';
import { useNavigate } from '@/lib/routerCompat';
import {
  adminAiAnalyzeTrends,
  adminGenerateMayaCampaign,
  getTrendingData,
} from '@/lib/api/db.functions';
import type {
  TrendDestination,
  SeasonBlock,
  SourceStateRow,
  Demand,
  Confidence,
} from '@/lib/travel-trends-data';

export const Route = createFileRoute('/_authenticated/trending')({
  component: TrendingAdminPage,
});

const DEMAND_META: Record<Demand, { label: string; class: string }> = {
  explosive: {
    label: '🔥 Explosive',
    class: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  },
  very_high: {
    label: 'Very High',
    class: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
  },
  high: {
    label: 'High',
    class: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  },
  rising: {
    label: 'Rising',
    class: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  },
};

const CONFIDENCE_META: Record<Confidence, { label: string; class: string; hint: string }> = {
  proven: {
    label: '✓✓✓ Proven · 3-yr data',
    class: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    hint: 'Appears in 3 consecutive years of independent reports — safe to scale spend',
  },
  confirmed: {
    label: '✓✓ Confirmed · 2-yr',
    class: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    hint: 'Two years of supporting data — invest with normal caution',
  },
  breakout: {
    label: '✦ Breakout · new',
    class: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30',
    hint: 'One-year surge — first-mover upside, test with small budgets',
  },
};

function copyKeywords(dest: TrendDestination) {
  const text = [
    `GOOGLE ADS — ${dest.name}`,
    ...dest.googleKeywords.map((k) => `  ${k}`),
    ``,
    `META INTERESTS — ${dest.name}`,
    ...dest.metaInterests.map((k) => `  ${k}`),
  ].join('\n');
  navigator.clipboard.writeText(text);
  toast.success(`Keyword pack for ${dest.name} copied`);
}

function DestinationCard({
  dest,
  index,
  onGenerateMaya,
  isGenerating,
}: {
  dest: TrendDestination;
  index: number;
  onGenerateMaya: (dest: TrendDestination) => void;
  isGenerating: boolean;
}) {
  const demand = DEMAND_META[dest.demand];
  const confidence = CONFIDENCE_META[dest.confidence];
  return (
    <div
      className="group glass-card flex flex-col rounded-2xl border border-border/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-slide-up"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug">{dest.name}</h3>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {dest.region}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${demand.class}`}>
            {demand.label}
          </span>
          <span
            title={confidence.hint}
            className={`cursor-help rounded-full border px-2.5 py-1 text-[10px] font-bold ${confidence.class}`}
          >
            {confidence.label}
          </span>
        </div>
      </div>

      {/* Growth signal */}
      <div className="mt-3 rounded-lg border border-border/40 bg-muted/20 p-2.5">
        <div className="flex items-start gap-2">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-snug">{dest.growthSignal}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Source: {dest.source}</p>
          </div>
        </div>
      </div>

      {/* 3-year trajectory */}
      <div className="mt-2 rounded-lg border border-border/30 bg-background/60 p-2.5">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
          2024 → 2025 → 2026 trajectory
        </p>
        <p className="text-[11px] leading-snug">{dest.trajectory}</p>
      </div>

      {/* Facts grid */}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        {dest.visa && (
          <div className="flex items-center gap-1.5">
            <Plane className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate">
              <span className="text-muted-foreground">Visa:</span>{' '}
              <span className="font-semibold">{dest.visa}</span>
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="truncate">
            <span className="text-muted-foreground">Season:</span>{' '}
            <span className="font-semibold">{dest.bestMonths}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Megaphone className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="truncate">
            <span className="text-muted-foreground">Run ads:</span>{' '}
            <span className="font-semibold">{dest.adWindow}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wallet className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="truncate">
            <span className="text-muted-foreground">Budget:</span>{' '}
            <span className="font-semibold">{dest.budget}</span>
          </span>
        </div>
      </div>

      {/* Audience + angle */}
      <div className="mt-3 space-y-2 text-[11px] leading-snug">
        <p>
          <span className="font-bold text-muted-foreground uppercase tracking-wider text-[9px]">
            Who buys ·{' '}
          </span>
          {dest.audience}
        </p>
        <p className="rounded-lg bg-primary/5 border border-primary/15 p-2">
          <span className="font-bold text-primary uppercase tracking-wider text-[9px]">
            Ad angle ·{' '}
          </span>
          {dest.angle}
        </p>
      </div>

      {/* Keywords */}
      <div className="mt-3 flex-1">
        <div className="flex flex-wrap gap-1.5">
          {dest.googleKeywords.slice(0, 3).map((keyword) => (
            <span
              key={keyword}
              className="rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {keyword}
            </span>
          ))}
          {dest.googleKeywords.length > 3 && (
            <span className="rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              +{dest.googleKeywords.length - 3}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <Button
          variant="default"
          size="sm"
          className="h-8 w-full text-xs font-semibold shadow-sm"
          disabled={isGenerating}
          onClick={() => onGenerateMaya(dest)}
        >
          {isGenerating ? (
            <Sparkles className="mr-2 h-3.5 w-3.5 animate-pulse" />
          ) : (
            <span className="mr-1">🚀</span>
          )}
          {isGenerating ? 'Maya is drafting...' : 'Ask Maya to build campaigns'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-[10px]"
          onClick={() => copyKeywords(dest)}
        >
          <Clipboard className="mr-2 h-3 w-3" /> Copy Google + Meta keyword pack
        </Button>
      </div>
    </div>
  );
}

function TrendingAdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [aiTrends, setAiTrends] = useState<any[] | null>(null);
  const [query, setQuery] = useState('');

  const [outbound, setOutbound] = useState<TrendDestination[]>([]);
  const [domestic, setDomestic] = useState<TrendDestination[]>([]);
  const [seasons, setSeasons] = useState<SeasonBlock[]>([]);
  const [sourceStates, setSourceStates] = useState<SourceStateRow[]>([]);
  const [sources, setSources] = useState<{ label: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getTrendingData();
        if (!active) return;
        setOutbound(data.outbound);
        setDomestic(data.domestic);
        setSeasons(data.seasons);
        setSourceStates(data.sourceStates);
        setSources(data.sources);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load trending data');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleRunAnalysis = async () => {
    if (!user) return;
    setIsAnalyzing(true);
    try {
      const auth = { email: user.email!, sessionToken: user.session_token! };
      const res = await adminAiAnalyzeTrends({ data: { auth } });
      setAiTrends(res.trends);
    } catch (err) {
      console.error(err);
      toast.error('Failed to run AI analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateMaya = async (dest: TrendDestination) => {
    if (!user) return;
    setIsGenerating(dest.name);
    try {
      const auth = { email: user.email!, sessionToken: user.session_token! };
      // Default to Meta and a standard budget for the prototype, these could be inputs later
      const data = {
        auth,
        destinations: [dest.name],
        budget: 50000,
        goal: 'leads',
        platform: 'meta' as const,
      };
      const res = await adminGenerateMayaCampaign({ data });
      if (res.campaignId) {
        toast.success(`Blueprint created for ${dest.name}! Redirecting...`);
        navigate({ to: `/marketing/campaigns/${res.campaignId}` });
      }
    } catch (err) {
      console.error(err);
      toast.error(`Failed to generate campaign for ${dest.name}`);
    } finally {
      setIsGenerating(null);
    }
  };

  const filter = (rows: TrendDestination[]) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((dest) =>
      [dest.name, dest.region, dest.audience, dest.angle, ...dest.googleKeywords]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  };

  const allDestinations = [...outbound, ...domestic];
  const explosiveCount = allDestinations.filter((d) => d.demand === 'explosive').length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ─── Hero ─── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent p-6 animate-slide-up">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-500/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div />
          <Button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="h-9 text-xs shadow-sm"
          >
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            {isAnalyzing ? 'Analyzing market...' : 'Match Trends to My Inventory'}
          </Button>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <Globe2 className="h-3.5 w-3.5 text-orange-500" /> <b>{outbound.length}</b> outbound
            markets
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-rose-500" /> <b>{domestic.length}</b> domestic
            markets
          </span>
          <span className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-rose-500" /> <b>{explosiveCount}</b> explosive-growth
            picks
          </span>
          <span className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-blue-500" /> <b>{sourceStates.length}</b> source
            states for geo-targeting
          </span>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-bold uppercase tracking-wider text-[9px] text-muted-foreground">
            Confidence (2024 → 2025 → 2026):
          </span>
          {(Object.keys(CONFIDENCE_META) as Confidence[]).map((key) => {
            const meta = CONFIDENCE_META[key];
            const count = allDestinations.filter((d) => d.confidence === key).length;
            return (
              <span
                key={key}
                title={meta.hint}
                className={`cursor-help rounded-full border px-2.5 py-1 text-[10px] font-bold ${meta.class}`}
              >
                {meta.label} · {count}
              </span>
            );
          })}
          <span className="text-muted-foreground">
            — every card shows its full 3-year evidence chain.
          </span>
        </div>
      </div>

      {/* ─── AI matcher result ─── */}
      {aiTrends && (
        <div className="glass-card rounded-2xl border border-primary/20 p-5 animate-scale-in">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold">Maya's Trend → Inventory Matches</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {aiTrends.map((trend: any, idx: number) => (
              <div key={idx} className="rounded-xl border border-border/40 bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-primary">{trend.destination}</p>
                  <Badge variant="outline" className="text-[9px]">
                    {trend.search_trend_keyword}
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
                  {trend.why_its_trending}
                </p>
                <div className="mt-3 rounded-lg bg-muted/40 p-2.5 text-[11px]">
                  <p>
                    <span className="font-bold uppercase tracking-wider text-[9px] text-muted-foreground">
                      Angle ·{' '}
                    </span>
                    {trend.marketing_angle}
                  </p>
                  <p className="mt-1.5 border-t border-border/40 pt-1.5">
                    <span className="font-bold uppercase tracking-wider text-[9px] text-muted-foreground">
                      Sell ·{' '}
                    </span>
                    <span className="font-semibold text-primary">
                      {trend.recommended_package_name}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Search ─── */}
      <div className="relative w-full sm:w-96">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search destination, keyword, audience..."
          className="pl-9"
        />
      </div>

      {/* ─── Tabs ─── */}
      <Tabs defaultValue="outbound">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="outbound">✈️ Outbound International</TabsTrigger>
          <TabsTrigger value="domestic">🇮🇳 Domestic India</TabsTrigger>
          <TabsTrigger value="seasons">📅 Season Planner</TabsTrigger>
          <TabsTrigger value="states">🎯 Source States</TabsTrigger>
        </TabsList>

        <TabsContent value="outbound">
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filter(outbound).map((dest, idx) => (
              <DestinationCard
                key={dest.name}
                dest={dest}
                index={idx}
                onGenerateMaya={handleGenerateMaya}
                isGenerating={isGenerating === dest.name}
              />
            ))}
          </div>
          {!loading && filter(outbound).length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              No outbound market matches your search.
            </p>
          )}
        </TabsContent>

        <TabsContent value="domestic">
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filter(domestic).map((dest, idx) => (
              <DestinationCard
                key={dest.name}
                dest={dest}
                index={idx}
                onGenerateMaya={handleGenerateMaya}
                isGenerating={isGenerating === dest.name}
              />
            ))}
          </div>
          {!loading && filter(domestic).length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              No domestic market matches your search.
            </p>
          )}
        </TabsContent>

        <TabsContent value="seasons">
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {seasons.map((season, idx) => (
              <div
                key={season.id}
                className="glass-card rounded-2xl p-5 animate-slide-up"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{season.label}</h3>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {season.months} · {season.theme}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/15 to-rose-500/10">
                    <CalendarClock className="h-5 w-5 text-orange-500" />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Travels now — fulfil these
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {season.sellNow.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      Advertise now — books ahead
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {season.advertiseFor.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-3 rounded-lg bg-muted/30 border border-border/40 p-2.5 text-[11px] leading-snug text-muted-foreground">
                  💡 {season.note}
                </p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="states">
          <div className="mt-4 glass-card overflow-hidden rounded-2xl">
            <div className="border-b border-border/40 bg-muted/30 px-5 py-3">
              <p className="text-xs font-bold">
                Where the buyers live — use these as geo-targets in Google & Meta campaigns
              </p>
              <p className="text-[11px] text-muted-foreground">
                MakeMyTrip: Maharashtra, Karnataka and Delhi lead all international travel searches
                from India.
              </p>
            </div>
            <div className="divide-y divide-border/40">
              {sourceStates.map((row) => (
                <div
                  key={row.state}
                  className="grid gap-2 px-5 py-4 lg:grid-cols-[180px_1fr_1fr_1.2fr] lg:items-start hover:bg-muted/20 transition-colors"
                >
                  <div>
                    <p className="text-sm font-bold">{row.state}</p>
                    <p className="text-[11px] text-muted-foreground">{row.cities}</p>
                  </div>
                  <div className="text-[11px]">
                    <p className="font-bold uppercase tracking-wider text-[9px] text-muted-foreground">
                      Outbound favourites
                    </p>
                    <p className="mt-0.5 leading-snug">{row.outbound}</p>
                  </div>
                  <div className="text-[11px]">
                    <p className="font-bold uppercase tracking-wider text-[9px] text-muted-foreground">
                      Domestic favourites
                    </p>
                    <p className="mt-0.5 leading-snug">{row.domestic}</p>
                  </div>
                  <p className="rounded-lg bg-primary/5 border border-primary/15 p-2 text-[11px] leading-snug">
                    <span className="font-bold text-primary uppercase tracking-wider text-[9px]">
                      Targeting tip ·{' '}
                    </span>
                    {row.tip}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Sources ─── */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Research sources · compiled July 2026 · validate live volumes in Google Keyword Planner
          before spending
        </p>
        <div className="flex flex-wrap gap-2">
          {sources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-primary/40"
            >
              <ExternalLink className="h-3 w-3" /> {source.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
