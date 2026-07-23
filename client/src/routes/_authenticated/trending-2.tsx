import { createFileRoute, useNavigate } from '@/lib/routerCompat';
import { type FormEvent, useMemo, useState } from 'react';
import {
  CalendarClock,
  Clipboard,
  Flame,
  Globe2,
  Loader2,
  LockKeyhole,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/components/auth-context';
import {
  adminAiAnalyzeTrends,
  adminGenerateMayaCampaign,
  verifyProtectedScreenAccess,
} from '@/lib/api/db.functions';
import { toast } from '@/lib/toast';
import {
  calendar,
  marketRows,
  strategyDestinations,
  type MarketRow,
  type StrategyConfidence,
  type StrategyDemand,
  type StrategyDestination,
  type TravelVertical,
} from '@/lib/trending-strategy-data';

export const Route = createFileRoute('/_authenticated/trending-2')({
  component: TrendingStrategyPage,
});

type MainTab = 'outbound' | 'india' | 'seasons' | 'sources';
type IndiaMode = 'inbound' | 'domestic';

const demandMeta: Record<StrategyDemand, { label: string; className: string }> = {
  explosive: {
    label: '🔥 Explosive',
    className: 'border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
  very_high: {
    label: 'Very High',
    className: 'border-orange-500/35 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
  high: {
    label: 'High',
    className: 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  rising: {
    label: 'Rising',
    className: 'border-blue-500/35 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
};

const confidenceMeta: Record<
  StrategyConfidence,
  { label: string; className: string; hint: string }
> = {
  proven: {
    label: '✓✓✓ Proven · 3-yr data',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    hint: 'Established demand with multiple supporting signals; suitable for scaled budgets.',
  },
  confirmed: {
    label: '✓✓ Confirmed · 2-yr',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
    hint: 'Supported demand with enough evidence for controlled growth.',
  },
  breakout: {
    label: '✦ Breakout · new',
    className: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
    hint: 'Promising or specialist demand; validate lead quality before scaling.',
  },
};

const seasonGroups = [
  {
    label: 'Winter & Spring',
    months: 'Jan – Mar',
    theme: 'Winter sun · romance · culture',
    rows: calendar.slice(0, 3),
  },
  {
    label: 'Summer Holidays',
    months: 'Apr – Jun',
    theme: 'Families · hills · long haul',
    rows: calendar.slice(3, 6),
  },
  {
    label: 'Monsoon & Early Festive',
    months: 'Jul – Sep',
    theme: 'Value · wellness · festive booking',
    rows: calendar.slice(6, 9),
  },
  {
    label: 'Festive & Year End',
    months: 'Oct – Dec',
    theme: 'Puja · Diwali · weddings · winter',
    rows: calendar.slice(9, 12),
  },
];

function copyKeywordPack(destination: StrategyDestination) {
  const text = [
    `GOOGLE ADS — ${destination.name}`,
    ...destination.googleKeywords.map((keyword) => `  ${keyword}`),
    '',
    `META INTERESTS — ${destination.name}`,
    ...destination.metaInterests.map((interest) => `  ${interest}`),
  ].join('\n');
  void navigator.clipboard.writeText(text);
  toast.success(`Keyword pack for ${destination.name} copied`);
}

function destinationMatches(destination: StrategyDestination, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    destination.name,
    destination.region,
    destination.growthSignal,
    destination.trajectory,
    destination.audience,
    destination.angle,
    ...destination.cities,
    ...destination.targetMarkets,
    ...destination.themes,
    ...destination.googleKeywords,
    ...destination.metaInterests,
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function DestinationCard({
  destination,
  index,
  onGenerate,
  isGenerating,
}: {
  destination: StrategyDestination;
  index: number;
  onGenerate: (destination: StrategyDestination) => void;
  isGenerating: boolean;
}) {
  const demand = demandMeta[destination.demand];
  const confidence = confidenceMeta[destination.confidence];

  return (
    <article
      className="glass-card flex h-full flex-col rounded-2xl border border-border/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-slide-up"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug">{destination.name}</h3>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {destination.region}
          </p>
          {destination.cities.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {destination.cities.map((city) => (
                <span
                  key={city}
                  className="rounded-full bg-muted/50 px-2 py-0.5 text-[9px] font-medium"
                >
                  {city}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${demand.className}`}
          >
            {demand.label}
          </span>
          <span
            title={confidence.hint}
            className={`cursor-help rounded-full border px-2.5 py-1 text-[10px] font-bold ${confidence.className}`}
          >
            {confidence.label}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border/40 bg-muted/20 p-2.5">
        <div className="flex items-start gap-2">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-snug">{destination.growthSignal}</p>
            <a
              href={destination.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 block truncate text-[10px] text-muted-foreground hover:text-primary"
            >
              Source: {destination.sourceLabel}
            </a>
          </div>
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-border/30 bg-background/60 p-2.5">
        <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          2024 → 2025 → 2026 trajectory
        </p>
        <p className="text-[11px] leading-snug">{destination.trajectory}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        {destination.entry && (
          <div className="flex items-start gap-1.5">
            <Plane className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <span>
              <span className="text-muted-foreground">Entry:</span> <b>{destination.entry}</b>
            </span>
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <CalendarClock className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">Season:</span> <b>{destination.bestMonths}</b>
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <Megaphone className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">Run ads:</span> <b>{destination.adWindow}</b>
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <Wallet className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">Budget:</span> <b>{destination.budget}</b>
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-[11px] leading-snug">
        <p>
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Who buys ·{' '}
          </span>
          {destination.audience}
        </p>
        <p className="rounded-lg border border-border/50 bg-muted/35 p-2">
          <span className="text-[9px] font-bold uppercase tracking-wider">Ad angle · </span>
          {destination.angle}
        </p>
      </div>

      <div className="mt-3 flex-1">
        <div className="flex flex-wrap gap-1.5">
          {destination.googleKeywords.slice(0, 3).map((keyword) => (
            <span
              key={keyword}
              className="rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {keyword}
            </span>
          ))}
          {destination.googleKeywords.length > 3 && (
            <span className="rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              +{destination.googleKeywords.length - 3}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <Button
          size="sm"
          className="h-8 w-full bg-black text-xs font-semibold text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85"
          disabled={isGenerating}
          onClick={() => onGenerate(destination)}
        >
          <Sparkles className={`mr-2 h-3.5 w-3.5 ${isGenerating ? 'animate-pulse' : ''}`} />
          {isGenerating ? 'Maya is drafting...' : 'Ask Maya to build campaigns'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-[10px]"
          onClick={() => copyKeywordPack(destination)}
        >
          <Clipboard className="mr-2 h-3 w-3" /> Copy Google + Meta keyword pack
        </Button>
      </div>
    </article>
  );
}

function DestinationGrid({
  rows,
  query,
  generatingId,
  onGenerate,
}: {
  rows: StrategyDestination[];
  query: string;
  generatingId: string | null;
  onGenerate: (destination: StrategyDestination) => void;
}) {
  const filtered = rows.filter((destination) => destinationMatches(destination, query));
  return (
    <>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((destination, index) => (
          <DestinationCard
            key={destination.id}
            destination={destination}
            index={index}
            onGenerate={onGenerate}
            isGenerating={generatingId === destination.id}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No market matches your search.
        </p>
      )}
    </>
  );
}

function SourceMarketTable({ rows, query }: { rows: MarketRow[]; query: string }) {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => Object.values(row).join(' ').toLowerCase().includes(needle))
    : rows;
  return (
    <div className="mt-4 glass-card overflow-hidden rounded-2xl">
      <div className="border-b border-border/40 bg-muted/30 px-5 py-3">
        <p className="text-xs font-bold">
          Where the buyers live — use these as geo-targets in Google & Meta campaigns
        </p>
        <p className="text-[11px] text-muted-foreground">
          Each row connects a source market to the destinations and campaign angle most likely to
          convert.
        </p>
      </div>
      <div className="divide-y divide-border/40">
        {filtered.map((row) => (
          <div
            key={row.market}
            className="grid gap-2 px-5 py-4 transition-colors hover:bg-muted/20 lg:grid-cols-[190px_1.2fr_1fr_1.2fr] lg:items-start"
          >
            <p className="text-sm font-bold">{row.market}</p>
            <div className="text-[11px]">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Priority destinations
              </p>
              <p className="mt-0.5 leading-snug">{row.destinations}</p>
            </div>
            <div className="text-[11px]">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Best audience
              </p>
              <p className="mt-0.5 leading-snug">{row.audience}</p>
            </div>
            <p className="rounded-lg border border-primary/15 bg-primary/5 p-2 text-[11px] leading-snug">
              <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                Targeting tip ·{' '}
              </span>
              {row.play}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendingStrategyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MainTab>('outbound');
  const [indiaMode, setIndiaMode] = useState<IndiaMode>('inbound');
  const [sourceMode, setSourceMode] = useState<TravelVertical>('outbound');
  const [query, setQuery] = useState('');
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiTrends, setAiTrends] = useState<any[] | null>(null);
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [isVerifyingAccess, setIsVerifyingAccess] = useState(false);

  const allDestinations = useMemo(
    () => [
      ...strategyDestinations.outbound,
      ...strategyDestinations.inbound,
      ...strategyDestinations.domestic,
    ],
    [],
  );
  const explosiveCount = allDestinations.filter(
    (destination) => destination.demand === 'explosive',
  ).length;
  const confidenceCounts = (Object.keys(confidenceMeta) as StrategyConfidence[]).map(
    (confidence) => ({
      confidence,
      count: allDestinations.filter((destination) => destination.confidence === confidence).length,
    }),
  );

  const handleRunAnalysis = async () => {
    if (!user?.email || !user.session_token) return;
    setIsAnalyzing(true);
    try {
      const result = await adminAiAnalyzeTrends({
        data: { auth: { email: user.email, sessionToken: user.session_token } },
      });
      setAiTrends(result.trends || []);
    } catch (error) {
      console.error(error);
      toast.error('Failed to match trends to inventory');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateCampaign = async (destination: StrategyDestination) => {
    if (!user?.email || !user.session_token) {
      toast.error('Sign in again to generate a campaign');
      return;
    }
    setGeneratingId(destination.id);
    try {
      const result = await adminGenerateMayaCampaign({
        data: {
          auth: { email: user.email, sessionToken: user.session_token },
          destinations: [destination.name],
          budget: 50000,
          goal: 'leads',
          platform: 'meta',
          trendContexts: [
            {
              name: destination.name,
              region: destination.region,
              vertical: destination.vertical,
              demand: destination.demand,
              confidence: destination.confidence,
              trajectory: destination.trajectory,
              growthSignal: destination.growthSignal,
              source: destination.sourceLabel,
              entry: destination.entry,
              bestMonths: destination.bestMonths,
              adWindow: destination.adWindow,
              budget: destination.budget,
              audience: destination.audience,
              angle: destination.angle,
              googleKeywords: destination.googleKeywords,
              metaInterests: destination.metaInterests,
              targetLocations: destination.targetMarkets,
              languages: destination.languages,
            },
          ],
        },
      });
      if (!result?.campaignId) throw new Error('Campaign generation returned no campaign ID');
      toast.success(`Campaign blueprint created for ${destination.name}`);
      navigate({ to: `/marketing/campaigns/${result.campaignId}` });
    } catch (error) {
      console.error(error);
      toast.error(`Could not generate the ${destination.name} campaign`);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleVerifyAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccessError('');

    if (!user?.email || !user.session_token) {
      setAccessError('Your session could not be verified. Please sign in again.');
      return;
    }
    if (!/^\d{6}$/.test(accessCode)) {
      setAccessError('Enter the 6-digit access code.');
      return;
    }

    setIsVerifyingAccess(true);
    try {
      const result = await verifyProtectedScreenAccess<{ granted: boolean }>({
        data: {
          auth: { email: user.email, sessionToken: user.session_token },
          screenKey: 'trending-2',
          accessCode,
        },
      });
      if (!result.granted) {
        setAccessCode('');
        setAccessError('Incorrect access code. Please try again.');
        return;
      }

      setAccessCode('');
      setAccessGranted(true);
      toast.success('Trending-2 access granted');
    } catch (error) {
      console.error(error);
      setAccessError('Access could not be verified. Please try again.');
    } finally {
      setIsVerifyingAccess(false);
    }
  };

  if (!accessGranted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center animate-fade-in">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center text-muted-foreground">
          <div className="rounded-full border border-border/60 bg-muted/40 p-4">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold text-foreground">Trending-2 is protected</p>
          <p className="text-xs">Enter the access code to view this research workspace.</p>
        </div>

        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) navigate({ to: '/trending' });
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <DialogTitle>Enter Trending-2 access code</DialogTitle>
              <DialogDescription>
                This strategy workspace is restricted. Your code is securely verified by the server.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleVerifyAccess} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trending-2-access-code">Access code</Label>
                <Input
                  id="trending-2-access-code"
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  type="password"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={accessCode}
                  aria-invalid={Boolean(accessError)}
                  aria-describedby={accessError ? 'trending-2-access-error' : undefined}
                  onChange={(event) => {
                    setAccessCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                    if (accessError) setAccessError('');
                  }}
                />
                {accessError && (
                  <p id="trending-2-access-error" role="alert" className="text-xs text-destructive">
                    {accessError}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => navigate({ to: '/trending' })}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isVerifyingAccess || accessCode.length !== 6}>
                  {isVerifyingAccess && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isVerifyingAccess ? 'Verifying...' : 'Open Trending-2'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <header className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent p-6 animate-slide-up">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-500/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div />
          <Button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="h-9 bg-black text-xs text-white shadow-sm hover:bg-black/85 dark:bg-white dark:text-black"
          >
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            {isAnalyzing ? 'Analyzing market...' : 'Match Trends to My Inventory'}
          </Button>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <Globe2 className="h-3.5 w-3.5 text-orange-500" />{' '}
            <b>{strategyDestinations.outbound.length}</b> outbound markets
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-rose-500" />{' '}
            <b>{strategyDestinations.inbound.length + strategyDestinations.domestic.length}</b>{' '}
            India markets
          </span>
          <span className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-rose-500" /> <b>{explosiveCount}</b> explosive-growth
            picks
          </span>
          <span className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-blue-500" />{' '}
            <b>
              {marketRows.outbound.length + marketRows.inbound.length + marketRows.domestic.length}
            </b>{' '}
            source markets
          </span>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Confidence (2024 → 2025 → 2026):
          </span>
          {confidenceCounts.map(({ confidence, count }) => {
            const item = confidenceMeta[confidence];
            return (
              <span
                key={confidence}
                title={item.hint}
                className={`cursor-help rounded-full border px-2.5 py-1 text-[10px] font-bold ${item.className}`}
              >
                {item.label} · {count}
              </span>
            );
          })}
          <span className="text-muted-foreground">— every card shows its full evidence chain.</span>
        </div>
      </header>

      {aiTrends && (
        <section className="glass-card rounded-2xl border border-primary/20 p-5 animate-scale-in">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold">Maya's Trend → Inventory Matches</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {aiTrends.map((trend, index) => (
              <div
                key={`${trend.destination}-${index}`}
                className="rounded-xl border border-border/40 bg-background p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-primary">{trend.destination}</p>
                  <Badge variant="outline" className="text-[9px]">
                    {trend.search_trend_keyword}
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  {trend.why_its_trending}
                </p>
                <p className="mt-3 rounded-lg bg-muted/40 p-2.5 text-[11px]">
                  <b>Angle · </b>
                  {trend.marketing_angle}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="relative w-full sm:w-96">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search destination, keyword, audience..."
          className="pl-9"
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as MainTab);
          setQuery('');
        }}
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="outbound">✈️ Outbound International</TabsTrigger>
          <TabsTrigger value="india">🇮🇳 Inbound + Domestic</TabsTrigger>
          <TabsTrigger value="seasons">🗓️ Season Planner</TabsTrigger>
          <TabsTrigger value="sources">🎯 Source States</TabsTrigger>
        </TabsList>

        <TabsContent value="outbound">
          <DestinationGrid
            rows={strategyDestinations.outbound}
            query={query}
            generatingId={generatingId}
            onGenerate={handleGenerateCampaign}
          />
        </TabsContent>

        <TabsContent value="india">
          <div className="mt-4 inline-flex rounded-lg bg-muted p-1">
            <button
              onClick={() => {
                setIndiaMode('inbound');
                setQuery('');
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${indiaMode === 'inbound' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              🌍 Inbound India
            </button>
            <button
              onClick={() => {
                setIndiaMode('domestic');
                setQuery('');
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${indiaMode === 'domestic' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              🇮🇳 Domestic India
            </button>
          </div>
          <DestinationGrid
            rows={strategyDestinations[indiaMode]}
            query={query}
            generatingId={generatingId}
            onGenerate={handleGenerateCampaign}
          />
        </TabsContent>

        <TabsContent value="seasons">
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {seasonGroups.map((season, index) => (
              <article
                key={season.label}
                className="glass-card rounded-2xl p-5 animate-slide-up"
                style={{ animationDelay: `${index * 60}ms` }}
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
                      Travel focus
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {season.rows
                        .flatMap((row) => row.focus.split('·').slice(0, 2))
                        .map((item) => (
                          <span
                            key={item.trim()}
                            className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                          >
                            {item.trim()}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      Advertise now
                    </p>
                    <div className="mt-2 space-y-1">
                      {season.rows.map((row) => (
                        <p key={row.month} className="text-[10px]">
                          <b>{row.month}:</b> {row.moment}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-3 rounded-lg border border-border/40 bg-muted/30 p-2.5 text-[11px] leading-snug text-muted-foreground">
                  💡 {season.rows.map((row) => row.action).join(' ')}
                </p>
              </article>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sources">
          <div className="mt-4 inline-flex flex-wrap rounded-lg bg-muted p-1">
            {(['outbound', 'inbound', 'domestic'] as TravelVertical[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setSourceMode(mode);
                  setQuery('');
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${sourceMode === mode ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                {mode}
              </button>
            ))}
          </div>
          <SourceMarketTable rows={marketRows[sourceMode]} query={query} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
