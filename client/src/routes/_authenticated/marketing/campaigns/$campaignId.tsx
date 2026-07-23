// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute, Link, useNavigate } from '@/lib/routerCompat';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-context';
import {
  adminGetMayaCampaign,
  adminImportCampaignMetrics,
  adminAnalyzeCampaignPerformance,
  adminUpdateCampaignAction,
  adminSaveAudienceFromAdSet,
  adminGenerateMayaCampaign,
  adminGetAdPlatformConnections,
  adminSaveAdPlatformConnection,
  adminTestAdPlatformConnection,
  adminPublishCampaign,
} from '@/lib/api/db.functions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Copy,
  ArrowLeft,
  BrainCircuit,
  Users,
  CopyPlus,
  Upload,
  FileDown,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Loader2,
  Save,
  Rocket,
  Plug,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/_authenticated/marketing/campaigns/$campaignId')({
  component: CampaignDetailView,
});

function copyToClipboard(text: string, label: string = 'Value') {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied to clipboard!`);
}

function parseJson(text: string | null | undefined, fallback: any) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function downloadCsv(rows: string[][], filename: string) {
  const csvContent = rows
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function CopyRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-4 bg-muted/20 p-2 rounded-lg hover:bg-muted/40 transition-colors">
      <span className="text-sm font-semibold text-muted-foreground">{label}</span>
      <span className="font-mono text-sm truncate" title={value}>
        {value}
      </span>
      <Button variant="outline" size="sm" onClick={() => copyToClipboard(value, label)}>
        <Copy className="h-3 w-3 mr-1" /> Copy
      </Button>
    </div>
  );
}

function CharCounted({ text, max }: { text: string; max: number }) {
  const over = text.length > max;
  return (
    <div className="text-xs p-2 bg-muted/30 rounded border mt-1 flex justify-between items-start gap-2 group">
      <span>{text}</span>
      <span className="flex items-center gap-2 shrink-0">
        <span
          className={`text-[10px] font-mono ${over ? 'text-red-600 font-bold' : 'text-muted-foreground'}`}
        >
          {text.length}/{max}
        </span>
        <button
          onClick={() => copyToClipboard(text)}
          className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Copy className="h-3 w-3" />
        </button>
      </span>
    </div>
  );
}

function CampaignDetailView() {
  const { campaignId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const auth = user?.session_token
    ? { email: user.email!, sessionToken: user.session_token! }
    : null;

  const [metricsCsv, setMetricsCsv] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [connForm, setConnForm] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['maya_campaign', campaignId],
    queryFn: async () =>
      adminGetMayaCampaign({ data: { auth: auth!, campaignId: Number(campaignId) } }),
    enabled: !!auth && !!campaignId,
  });

  const { data: connections = [] } = useQuery({
    queryKey: ['ad_platform_connections'],
    queryFn: async () => adminGetAdPlatformConnections({ data: { auth: auth! } }),
    enabled: !!auth,
  });

  const importMetricsMutation = useMutation({
    mutationFn: async (csvText: string) => {
      if (!auth) throw new Error('No auth');
      const rows = csvText.split('\n').map((r) => r.split(','));
      const parsedMetrics = rows
        .slice(1)
        .filter((r) => r.length >= 6)
        .map((r) => ({
          date: r[0].trim(),
          level: 'campaign' as const,
          impressions: parseInt(r[1] || '0', 10),
          clicks: parseInt(r[2] || '0', 10),
          spend: parseFloat(r[3] || '0'),
          leads: parseInt(r[4] || '0', 10),
          bookings: parseInt(r[5] || '0', 10),
        }));
      return adminImportCampaignMetrics({
        data: { auth, campaignId: Number(campaignId), metrics: parsedMetrics },
      });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['maya_campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['ad_campaigns'] });
      toast.success(`Imported ${res.count} metric rows.`);
      setMetricsCsv('');
    },
    onError: (err) => toast.error(err.message),
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!auth) throw new Error('No auth');
      setIsAnalyzing(true);
      return adminAnalyzeCampaignPerformance({ data: { auth, campaignId: Number(campaignId) } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maya_campaign', campaignId] });
      toast.success('Maya finished her diagnosis.');
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setIsAnalyzing(false),
  });

  const updateActionMutation = useMutation({
    mutationFn: async ({
      actionId,
      status,
    }: {
      actionId: number;
      status: 'accepted' | 'rejected';
    }) => {
      if (!auth) throw new Error('No auth');
      return adminUpdateCampaignAction({ data: { auth, actionId, status } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maya_campaign', campaignId] }),
  });

  const saveAudienceMutation = useMutation({
    mutationFn: async ({ adSetId, name }: { adSetId: number; name: string }) => {
      if (!auth) throw new Error('No auth');
      return adminSaveAudienceFromAdSet({ data: { auth, adSetId, name } });
    },
    onSuccess: () => toast.success('Saved to Audience Library!'),
    onError: (err) => toast.error(err.message),
  });

  const cloneMutation = useMutation({
    mutationFn: async (destination: string) => {
      if (!auth || !data) throw new Error('No auth');
      return adminGenerateMayaCampaign({
        data: {
          auth,
          destinations: [destination],
          budget: Number(data.campaign.budgetAmount || 50000),
          goal: data.campaign.objective || 'leads',
          platform: data.campaign.platform,
        },
      });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['ad_campaigns'] });
      toast.success(
        `Maya built the new campaign${res.aiGenerated ? ' with fresh AI research' : ''}!`,
      );
      navigate({
        to: '/marketing/campaigns/$campaignId',
        params: { campaignId: String(res.campaignId) },
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const saveConnMutation = useMutation({
    mutationFn: async () => {
      if (!auth || !data) throw new Error('No auth');
      return adminSaveAdPlatformConnection({
        data: { auth, platform: data.campaign.platform, credentials: connForm },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad_platform_connections'] });
      toast.success('Connection saved. Now run Test connection.');
      setConnForm({});
    },
    onError: (err) => toast.error(err.message),
  });

  const testConnMutation = useMutation({
    mutationFn: async () => {
      if (!auth || !data) throw new Error('No auth');
      return adminTestAdPlatformConnection({ data: { auth, platform: data.campaign.platform } });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['ad_platform_connections'] });
      toast.success(res.detail || 'Connection verified!');
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['ad_platform_connections'] });
      toast.error(err.message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      if (!auth) throw new Error('No auth');
      return adminPublishCampaign({ data: { auth, campaignId: Number(campaignId), dryRun } });
    },
    onSuccess: (res: any) => {
      if (res.dryRun) {
        setDryRunResult(res);
        toast.info(`Dry run complete — ${res.steps.length} API steps prepared.`);
      } else {
        queryClient.invalidateQueries({ queryKey: ['maya_campaign', campaignId] });
        toast.success(`Published! ${res.published.length} objects created (all PAUSED).`);
        setDryRunResult(null);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading)
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        Loading Maya Blueprint...
      </div>
    );
  if (error || !data)
    return <div className="p-8 text-center text-red-500">Failed to load campaign.</div>;

  const { campaign, adSets, creatives, actions, metrics = [] } = data;
  const research = parseJson(campaign.researchJson, {});
  const settings = parseJson(campaign.settingsJson, {});
  const isMeta = campaign.platform === 'meta';
  const connection = connections.find((c: any) => c.platform === campaign.platform);

  // ---------- exports ----------
  const handleExportGoogleAdsEditor = () => {
    const dailyBudget = (Number(campaign.budgetAmount || 0) / 30).toFixed(0);
    const header = [
      'Campaign',
      'Campaign Type',
      'Campaign Daily Budget',
      'Campaign Status',
      'Ad Group',
      'Ad Group Status',
      'Keyword',
      'Criterion Type',
      'Final URL',
      ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
    ];
    const rows: string[][] = [header];
    adSets.forEach((set: any) => {
      const kws = parseJson(set.keywordsJson, []);
      kws.forEach((k: any) => {
        rows.push([
          campaign.name,
          'Search',
          dailyBudget,
          'Paused',
          set.name,
          'Paused',
          k.keyword,
          k.matchType === 'exact' ? 'Exact' : k.matchType === 'phrase' ? 'Phrase' : 'Broad',
          '',
          ...Array(19).fill(''),
        ]);
      });
      (settings.negativeKeywords || []).forEach((k: string) => {
        rows.push([
          campaign.name,
          'Search',
          dailyBudget,
          'Paused',
          set.name,
          'Paused',
          k,
          'Campaign Negative Broad',
          '',
          ...Array(19).fill(''),
        ]);
      });
      creatives
        .filter((c: any) => c.adSetId === set.id)
        .forEach((c: any) => {
          const heads = parseJson(c.headlinesJson, []).slice(0, 15);
          const descs = parseJson(c.descriptionsJson, []).slice(0, 4);
          rows.push([
            campaign.name,
            'Search',
            dailyBudget,
            'Paused',
            set.name,
            'Paused',
            '',
            '',
            `${c.finalUrl}?${c.utmString || ''}`,
            ...Array.from({ length: 15 }, (_, i) => heads[i] || ''),
            ...Array.from({ length: 4 }, (_, i) => descs[i] || ''),
          ]);
        });
    });
    downloadCsv(rows, `google_ads_editor_${campaignId}.csv`);
  };

  const handleExportMetaBulk = () => {
    const header = [
      'Campaign Name',
      'Campaign Objective',
      'Buying Type',
      'Campaign Status',
      'Campaign Daily Budget',
      'Ad Set Name',
      'Ad Set Daily Budget',
      'Countries',
      'Age Min',
      'Age Max',
      'Interests',
      'Optimization Goal',
      'Ad Name',
      'Body',
      'Title',
      'Link Description',
      'Call to Action',
      'Link',
      'URL Tags',
    ];
    const rows: string[][] = [header];
    adSets.forEach((set: any) => {
      const aud = parseJson(set.audienceJson, {});
      const setCreatives = creatives.filter((c: any) => c.adSetId === set.id);
      setCreatives.forEach((c: any) => {
        const prim = parseJson(c.primaryTextsJson, []);
        const heads = parseJson(c.headlinesJson, []);
        const descs = parseJson(c.descriptionsJson, []);
        rows.push([
          campaign.name,
          settings.campaignObjective || 'OUTCOME_LEADS',
          'AUCTION',
          'PAUSED',
          campaign.budgetType === 'cbo' ? String(campaign.budgetAmount || '') : '',
          set.name,
          campaign.budgetType !== 'cbo' ? String(set.budget || '') : '',
          (aud.locations || ['India']).join('; '),
          String(aud.age_min || 22),
          String(aud.age_max || 60),
          (aud.detailed_targeting || []).join('; '),
          set.performanceGoal || 'OFFSITE_CONVERSIONS',
          c.name,
          prim[0] || '',
          heads[0] || '',
          descs[0] || '',
          c.cta || '',
          c.finalUrl || '',
          c.utmString || '',
        ]);
      });
    });
    downloadCsv(rows, `meta_bulk_${campaignId}.csv`);
  };

  return (
    <div className="space-y-6 w-full animate-fade-in pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link to="/marketing/campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            Platform: <span className="uppercase font-semibold">{campaign.platform}</span>· Status:{' '}
            <Badge variant="outline" className="uppercase text-[10px]">
              {campaign.status}
            </Badge>
            {campaign.externalId && (
              <Badge className="bg-emerald-600 text-[10px]">
                Published · ID {campaign.externalId}
              </Badge>
            )}
            {research.aiGenerated === false && (
              <Badge variant="secondary" className="text-[10px]">
                Template copy (AI unavailable at generation)
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={cloneMutation.isPending}
          onClick={() => {
            const dest = prompt(
              'Destination name from the Trending screen (e.g. Vietnam, Baku, Bali):',
            );
            if (dest?.trim()) cloneMutation.mutate(dest.trim());
          }}
        >
          {cloneMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CopyPlus className="w-4 h-4 mr-2" />
          )}
          Clone for New Destination
        </Button>
      </div>

      <Tabs defaultValue="clone">
        <TabsList className="w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="adsets">{isMeta ? 'Ad Sets' : 'Ad Groups'}</TabsTrigger>
          <TabsTrigger value="ads">Ads & Creatives</TabsTrigger>
          <TabsTrigger
            value="performance"
            className="text-emerald-600 data-[state=active]:bg-emerald-100"
          >
            <TrendingUp className="w-4 h-4 mr-1" /> Performance
          </TabsTrigger>
          <TabsTrigger
            value="clone"
            className="bg-primary/5 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            📋 Exports & Clone
          </TabsTrigger>
          <TabsTrigger
            value="publish"
            className="text-violet-600 data-[state=active]:bg-violet-600 data-[state=active]:text-white"
          >
            <Rocket className="w-4 h-4 mr-1" /> Publish
          </TabsTrigger>
        </TabsList>

        {/* ============ OVERVIEW ============ */}
        <TabsContent value="overview" className="mt-4">
          <div className="glass-card p-6 rounded-2xl">
            <h3 className="font-bold text-lg mb-4">Campaign Overview</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground font-semibold">Destination:</span>{' '}
                {campaign.destination}
              </div>
              <div>
                <span className="text-muted-foreground font-semibold">Objective:</span>{' '}
                {campaign.objective} ({settings.campaignObjective})
              </div>
              <div>
                <span className="text-muted-foreground font-semibold">Budget:</span> ₹
                {Number(campaign.budgetAmount).toLocaleString('en-IN')}/mo (
                {campaign.budgetType?.toUpperCase()})
              </div>
              <div>
                <span className="text-muted-foreground font-semibold">Bid Strategy:</span>{' '}
                {campaign.bidStrategy}
              </div>
              <div>
                <span className="text-muted-foreground font-semibold">Special Ad Category:</span>{' '}
                {campaign.specialAdCategory || 'NONE'}
              </div>
              <div>
                <span className="text-muted-foreground font-semibold">
                  {isMeta ? 'Ad Sets' : 'Ad Groups'}:
                </span>{' '}
                {adSets.length} · Ads: {creatives.length}
              </div>
            </div>
            {research.thesis && (
              <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border/50">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Maya's Thesis
                </p>
                <p className="text-sm">{research.thesis}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============ RESEARCH ============ */}
        <TabsContent value="research" className="mt-4 space-y-4">
          {research.personas?.some((p: any) => p.needsVerification) && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Interest and in-market segment names are AI-suggested. Verify each exists in the
                real Ads Manager targeting picker before cloning — Maya occasionally suggests
                plausible-sounding names that don't exist.
              </span>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {research.personas?.map((p: any, i: number) => (
              <div key={i} className="glass-card p-5 rounded-2xl">
                <h4 className="font-bold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> {p.name}
                </h4>
                {p.destination && (
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {p.destination}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                {p.metaInterests?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Detailed Targeting (Meta)
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.metaInterests.map((int: string) => (
                        <Badge key={int} variant="secondary" className="text-[10px]">
                          {int}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {p.googleInMarket?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      In-Market Segments (Google)
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.googleInMarket.map((int: string) => (
                        <Badge key={int} variant="outline" className="text-[10px]">
                          {int}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {research.sources?.length > 0 && (
            <div className="glass-card p-4 rounded-2xl text-xs text-muted-foreground">
              <p className="font-bold uppercase tracking-wider mb-1">Demand Signal Sources</p>
              {research.sources.map((s: string, i: number) => (
                <p key={i}>· {s}</p>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============ AD SETS ============ */}
        <TabsContent value="adsets" className="mt-4">
          <div className="grid gap-4">
            {adSets.map((set: any) => {
              const aud = parseJson(set.audienceJson, {});
              const kws = parseJson(set.keywordsJson, []);
              const opt = parseJson(set.optimizationDeliveryJson, {});
              const placements = parseJson(set.placementsJson, {});
              return (
                <div key={set.id} className="glass-card p-5 rounded-2xl relative group">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold flex items-center gap-2">
                      {set.name}{' '}
                      {set.externalId && (
                        <Badge className="bg-emerald-600 text-[9px]">Published</Badge>
                      )}
                    </h4>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-7 text-[10px]"
                      onClick={() =>
                        saveAudienceMutation.mutate({
                          adSetId: set.id,
                          name: `${campaign.destination} — ${set.name}`,
                        })
                      }
                    >
                      <Save className="w-3 h-3 mr-1" /> Save to Audience Library
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="font-semibold text-muted-foreground">Budget:</span> ₹
                      {Number(set.budget).toLocaleString('en-IN')}
                      {campaign.budgetType === 'cbo' ? ' (suggested split — CBO)' : '/day'}
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground">Conversion:</span>{' '}
                      {set.conversionLocation}
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground">Goal:</span>{' '}
                      {set.performanceGoal}
                    </div>
                    {set.pixelEvent && (
                      <div>
                        <span className="font-semibold text-muted-foreground">Pixel Event:</span>{' '}
                        {set.pixelEvent}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 p-3 bg-muted/20 rounded-lg">
                    <p className="font-bold text-[10px] uppercase tracking-wider mb-2">
                      Targeting Configuration
                    </p>
                    <div className="text-xs space-y-1">
                      {aud.locations && (
                        <p>
                          <b>Locations:</b> {aud.locations.join(', ')}
                        </p>
                      )}
                      {aud.age_min && (
                        <p>
                          <b>Age:</b> {aud.age_min} – {aud.age_max || '65+'} · <b>Gender:</b>{' '}
                          {aud.genders || 'All'}
                        </p>
                      )}
                      {aud.detailed_targeting?.length > 0 && (
                        <p>
                          <b>Interests:</b> {aud.detailed_targeting.join(', ')}
                        </p>
                      )}
                      {aud.advantage_audience && (
                        <p>
                          <b>Advantage+ Audience:</b> ON (broad, algorithm-led)
                        </p>
                      )}
                      {aud.custom_audiences?.length > 0 && (
                        <p>
                          <b>Custom Audiences:</b> {aud.custom_audiences.join(', ')}
                        </p>
                      )}
                      {aud.audience_signals?.length > 0 && (
                        <p>
                          <b>Audience Signals:</b> {aud.audience_signals.join(', ')}
                        </p>
                      )}
                      {placements.type && (
                        <p>
                          <b>Placements:</b>{' '}
                          {placements.type === 'advantage_plus'
                            ? 'Advantage+ (automatic)'
                            : placements.type}
                        </p>
                      )}
                      {opt.attribution && (
                        <p>
                          <b>Attribution:</b> {opt.attribution}
                        </p>
                      )}
                    </div>
                  </div>
                  {kws.length > 0 && (
                    <div className="mt-3">
                      <p className="font-bold text-[10px] uppercase tracking-wider mb-1">
                        Keywords ({kws.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {kws.map((k: any) => (
                          <Badge variant="outline" key={k.keyword} title={`${k.matchType} match`}>
                            {k.matchType === 'exact'
                              ? `[${k.keyword}]`
                              : k.matchType === 'phrase'
                                ? `"${k.keyword}"`
                                : k.keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ============ ADS & CREATIVES ============ */}
        <TabsContent value="ads" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {creatives.map((creative: any) => {
              const prim = parseJson(creative.primaryTextsJson, []);
              const heads = parseJson(creative.headlinesJson, []);
              const desc = parseJson(creative.descriptionsJson, []);
              const brief = parseJson(creative.briefJson, {});
              const isRsa = creative.format === 'rsa';
              return (
                <div key={creative.id} className="glass-card p-5 rounded-2xl flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-sm">{creative.name}</h4>
                    <Badge variant="secondary" className="uppercase text-[9px]">
                      {creative.format}
                    </Badge>
                  </div>
                  <div className="space-y-3 mt-2 flex-1">
                    {prim.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Primary Text ({prim.length})
                        </p>
                        {prim.map((t: string, i: number) => (
                          <CharCounted key={i} text={t} max={125} />
                        ))}
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {isRsa
                          ? `RSA Headlines (${heads.length}/15)`
                          : `Headlines (${heads.length})`}
                      </p>
                      {heads.map((t: string, i: number) => (
                        <CharCounted key={i} text={t} max={isRsa ? 30 : 40} />
                      ))}
                    </div>
                    {desc.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {isRsa ? `RSA Descriptions (${desc.length}/4)` : 'Link Descriptions'}
                        </p>
                        {desc.map((t: string, i: number) => (
                          <CharCounted key={i} text={t} max={isRsa ? 90 : 30} />
                        ))}
                      </div>
                    )}
                    {brief.visuals && (
                      <div className="p-2 rounded bg-indigo-50/50 border border-indigo-100 text-[11px]">
                        <p className="font-bold text-[10px] uppercase tracking-wider text-indigo-500">
                          Creative Brief
                        </p>
                        <p className="mt-1">{brief.visuals}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/50 text-[11px] grid gap-1">
                    {creative.cta && (
                      <p>
                        <b>CTA:</b> {creative.cta}
                      </p>
                    )}
                    <p className="truncate">
                      <b>URL:</b> {creative.finalUrl}
                    </p>
                    <p className="truncate">
                      <b>UTMs:</b> {creative.utmString}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ============ PERFORMANCE ============ */}
        <TabsContent value="performance" className="mt-4 space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="glass-card p-5 rounded-2xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" /> Campaign Metrics
                  </h3>
                </div>
                {metrics.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground uppercase bg-muted/20">
                        <tr>
                          <th className="px-4 py-2">Date</th>
                          <th className="px-4 py-2">Spend</th>
                          <th className="px-4 py-2">Impr.</th>
                          <th className="px-4 py-2">Clicks</th>
                          <th className="px-4 py-2">CTR</th>
                          <th className="px-4 py-2">Leads</th>
                          <th className="px-4 py-2">CPL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.map((m: any, i: number) => {
                          const ctr =
                            m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(2) : '-';
                          return (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
                              <td className="px-4 py-2">{new Date(m.date).toLocaleDateString()}</td>
                              <td className="px-4 py-2 font-medium">
                                ₹{Number(m.spend).toLocaleString('en-IN')}
                              </td>
                              <td className="px-4 py-2">{m.impressions?.toLocaleString()}</td>
                              <td className="px-4 py-2">{m.clicks?.toLocaleString()}</td>
                              <td className="px-4 py-2">{ctr}%</td>
                              <td className="px-4 py-2 text-emerald-600 font-semibold">
                                {m.leads}
                              </td>
                              <td className="px-4 py-2">
                                {m.leads > 0 ? `₹${(m.spend / m.leads).toFixed(0)}` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl">
                    <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No metrics imported yet.</p>
                    <p className="text-xs mt-1">
                      Paste a CSV export from Ads Manager to see performance.
                    </p>
                  </div>
                )}
                <div className="mt-6 pt-4 border-t">
                  <p className="text-xs font-bold uppercase mb-2">Manual CSV Import</p>
                  <div className="flex gap-2">
                    <textarea
                      className="flex-1 text-xs border rounded p-2 bg-muted/10 min-h-[60px]"
                      placeholder="Date,Impressions,Clicks,Spend,Leads,Bookings&#10;2026-07-01,15000,320,4500,12,1"
                      value={metricsCsv}
                      onChange={(e) => setMetricsCsv(e.target.value)}
                    />
                    <Button
                      onClick={() => importMetricsMutation.mutate(metricsCsv)}
                      disabled={!metricsCsv.trim() || importMetricsMutation.isPending}
                      className="self-end"
                    >
                      Import
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="glass-card p-5 rounded-2xl bg-gradient-to-b from-indigo-50/50 to-white">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-600" /> Maya Diagnosis
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs bg-white"
                    onClick={() => analyzeMutation.mutate()}
                    disabled={isAnalyzing || metrics.length === 0}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <BrainCircuit className="w-3 h-3 mr-1" />
                    )}
                    Analyze
                  </Button>
                </div>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {actions.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic text-center py-6">
                      Import metrics, then run diagnosis for optimization recommendations.
                    </p>
                  ) : (
                    [...actions].reverse().map((action: any) => (
                      <div
                        key={action.id}
                        className={`p-4 rounded-xl border text-sm ${action.status === 'accepted' ? 'bg-emerald-50 border-emerald-200' : action.status === 'rejected' ? 'bg-red-50 border-red-200 opacity-60' : 'bg-white shadow-sm'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="secondary" className="text-[10px] uppercase">
                            {action.confidenceLevel} confidence
                          </Badge>
                          <span className="text-xs text-muted-foreground capitalize">
                            {action.status}
                          </span>
                        </div>
                        <p className="font-semibold mb-1">{action.what}</p>
                        <p className="text-xs text-muted-foreground mb-1">{action.why}</p>
                        {action.expectedImpact && (
                          <p className="text-xs text-indigo-600 mb-3">
                            Expected: {action.expectedImpact}
                          </p>
                        )}
                        {action.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="w-full text-xs h-7 bg-emerald-600 hover:bg-emerald-700"
                              onClick={() =>
                                updateActionMutation.mutate({
                                  actionId: action.id,
                                  status: 'accepted',
                                })
                              }
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs h-7"
                              onClick={() =>
                                updateActionMutation.mutate({
                                  actionId: action.id,
                                  status: 'rejected',
                                })
                              }
                            >
                              Dismiss
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ============ EXPORTS & CLONE ============ */}
        <TabsContent value="clone" className="mt-4">
          <div className="glass-card p-6 rounded-2xl border-primary/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <BrainCircuit className="h-32 w-32" />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Exports & Ads Manager Clone</h2>
                  <p className="text-sm text-muted-foreground">
                    Open this side-by-side with {isMeta ? 'Meta Ads Manager' : 'Google Ads'}, or
                    download an import sheet.
                  </p>
                </div>
                <div className="flex gap-2">
                  {isMeta ? (
                    <Button variant="outline" onClick={handleExportMetaBulk}>
                      <FileDown className="w-4 h-4 mr-2 text-[#0668E1]" /> Meta Bulk Sheet
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={handleExportGoogleAdsEditor}>
                      <FileDown className="w-4 h-4 mr-2 text-[#FBBC04]" /> Google Ads Editor CSV
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-8">
                <section>
                  <h3 className="font-bold text-lg border-b pb-2 mb-4">1. Campaign Level</h3>
                  <div className="grid gap-3 max-w-3xl">
                    <CopyRow label="Campaign Name" value={campaign.name} />
                    <CopyRow
                      label="Objective"
                      value={settings.campaignObjective || campaign.objective}
                    />
                    <CopyRow label="Buying Type" value={campaign.buyingType?.toUpperCase()} />
                    <CopyRow
                      label="Special Ad Category"
                      value={campaign.specialAdCategory || 'None'}
                    />
                    <CopyRow label="Bid Strategy" value={campaign.bidStrategy} />
                    <CopyRow
                      label={
                        isMeta && campaign.budgetType === 'cbo'
                          ? 'Advantage+ Campaign Budget (₹/mo)'
                          : 'Budget (₹/mo)'
                      }
                      value={String(campaign.budgetAmount || '')}
                    />
                    {!isMeta && (
                      <CopyRow
                        label="Daily Budget (₹)"
                        value={(Number(campaign.budgetAmount || 0) / 30).toFixed(0)}
                      />
                    )}
                    {!isMeta && settings.networks && (
                      <CopyRow
                        label="Networks"
                        value="Google Search only (no partners, no display)"
                      />
                    )}
                    {settings.languages && (
                      <CopyRow label="Languages" value={settings.languages.join(', ')} />
                    )}
                    {!isMeta && settings.negativeKeywords?.length > 0 && (
                      <CopyRow
                        label="Negative Keywords"
                        value={settings.negativeKeywords.join(', ')}
                      />
                    )}
                  </div>
                </section>

                {adSets.map((adSet: any, idx: number) => {
                  const aud = parseJson(adSet.audienceJson, {});
                  const kws = parseJson(adSet.keywordsJson, []);
                  const placements = parseJson(adSet.placementsJson, {});
                  return (
                    <section key={adSet.id}>
                      <h3 className="font-bold text-lg border-b pb-2 mb-4">
                        2.{idx + 1} {isMeta ? 'Ad Set' : 'Ad Group'}:{' '}
                        <span className="font-normal text-muted-foreground">{adSet.name}</span>
                      </h3>
                      <div className="grid gap-3 max-w-3xl">
                        <CopyRow
                          label={isMeta ? 'Ad Set Name' : 'Ad Group Name'}
                          value={adSet.name}
                        />
                        {campaign.budgetType !== 'cbo' && (
                          <CopyRow label="Daily Budget (₹)" value={String(adSet.budget || '')} />
                        )}
                        <CopyRow label="Conversion Location" value={adSet.conversionLocation} />
                        <CopyRow label="Performance Goal" value={adSet.performanceGoal} />
                        {adSet.pixelEvent && (
                          <CopyRow label="Pixel / Conversion Event" value={adSet.pixelEvent} />
                        )}
                        {aud.locations && (
                          <CopyRow label="Locations" value={aud.locations.join(', ')} />
                        )}
                        {aud.age_min && (
                          <CopyRow label="Age" value={`${aud.age_min} – ${aud.age_max || '65+'}`} />
                        )}
                        {aud.genders && <CopyRow label="Gender" value={aud.genders} />}
                        {aud.detailed_targeting?.length > 0 && (
                          <CopyRow
                            label="Detailed Targeting"
                            value={aud.detailed_targeting.join(', ')}
                          />
                        )}
                        {aud.advantage_audience && (
                          <CopyRow label="Advantage+ Audience" value="ON" />
                        )}
                        {aud.custom_audiences?.length > 0 && (
                          <CopyRow
                            label="Custom Audiences"
                            value={aud.custom_audiences.join(', ')}
                          />
                        )}
                        {aud.audience_signals?.length > 0 && (
                          <CopyRow
                            label="Audience Signals"
                            value={aud.audience_signals.join(', ')}
                          />
                        )}
                        {placements.type && (
                          <CopyRow
                            label="Placements"
                            value={
                              placements.type === 'advantage_plus'
                                ? 'Advantage+ (automatic)'
                                : String(placements.type)
                            }
                          />
                        )}
                        {kws.length > 0 && (
                          <CopyRow
                            label="Keywords"
                            value={kws
                              .map((k: any) =>
                                k.matchType === 'exact'
                                  ? `[${k.keyword}]`
                                  : k.matchType === 'phrase'
                                    ? `"${k.keyword}"`
                                    : k.keyword,
                              )
                              .join(', ')}
                          />
                        )}
                      </div>
                    </section>
                  );
                })}

                <section>
                  <h3 className="font-bold text-lg border-b pb-2 mb-4">3. Ads</h3>
                  <div className="space-y-6">
                    {creatives.map((creative: any) => {
                      const prim = parseJson(creative.primaryTextsJson, []);
                      const heads = parseJson(creative.headlinesJson, []);
                      const descs = parseJson(creative.descriptionsJson, []);
                      return (
                        <div
                          key={creative.id}
                          className="grid gap-3 max-w-3xl border p-4 rounded-xl"
                        >
                          <h4 className="font-semibold text-sm mb-2">{creative.name}</h4>
                          <CopyRow label="Ad Name" value={creative.name} />
                          {prim.map((t: string, i: number) => (
                            <CopyRow key={`p${i}`} label={`Primary Text ${i + 1}`} value={t} />
                          ))}
                          {heads.map((t: string, i: number) => (
                            <CopyRow key={`h${i}`} label={`Headline ${i + 1}`} value={t} />
                          ))}
                          {descs.map((t: string, i: number) => (
                            <CopyRow key={`d${i}`} label={`Description ${i + 1}`} value={t} />
                          ))}
                          {creative.cta && <CopyRow label="Call to Action" value={creative.cta} />}
                          <CopyRow label="Display URL" value={creative.displayUrl} />
                          <CopyRow label="Destination URL" value={creative.finalUrl} />
                          <CopyRow label="URL Parameters" value={creative.utmString} />
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ============ PUBLISH (Phase 4) ============ */}
        <TabsContent value="publish" className="mt-4 space-y-6">
          <div className="glass-card p-6 rounded-2xl">
            <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
              <Plug className="w-5 h-5" /> {isMeta ? 'Meta Marketing API' : 'Google Ads API'}{' '}
              Connection
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Stored locally in your MooNsConfig database. Everything publishes as <b>PAUSED</b> —
              money never moves until you enable it inside Ads Manager.
            </p>

            {connection ? (
              <div
                className={`flex items-center gap-2 text-sm mb-4 p-3 rounded-lg border ${connection.status === 'connected' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : connection.status === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="capitalize font-semibold">{connection.status}</span>
                {connection.lastError && (
                  <span className="text-xs truncate">— {connection.lastError}</span>
                )}
                {connection.lastValidatedAt && (
                  <span className="text-xs ml-auto">
                    verified {new Date(connection.lastValidatedAt).toLocaleString()}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-amber-600 mb-4">
                No {campaign.platform} connection yet — add credentials below.
              </p>
            )}

            <div className="grid gap-2 md:grid-cols-2 max-w-3xl">
              {(isMeta
                ? [
                    {
                      key: 'accessToken',
                      label: 'Access Token (System User, ads_management scope)',
                    },
                    { key: 'adAccountId', label: 'Ad Account ID (numbers only, no act_)' },
                    { key: 'pageId', label: 'Facebook Page ID' },
                    { key: 'pixelId', label: 'Pixel ID (optional)' },
                  ]
                : [
                    { key: 'developerToken', label: 'Developer Token' },
                    { key: 'clientId', label: 'OAuth Client ID' },
                    { key: 'clientSecret', label: 'OAuth Client Secret' },
                    { key: 'refreshToken', label: 'OAuth Refresh Token' },
                    { key: 'customerId', label: 'Customer ID (123-456-7890)' },
                    { key: 'loginCustomerId', label: 'MCC / Login Customer ID (optional)' },
                  ]
              ).map((f) => (
                <div key={f.key}>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    {f.label}
                  </label>
                  <Input
                    className="h-9 text-xs font-mono"
                    type={/token|secret/i.test(f.key) ? 'password' : 'text'}
                    placeholder={connection?.credentials?.[f.key] || ''}
                    value={connForm[f.key] || ''}
                    onChange={(e) => setConnForm({ ...connForm, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                onClick={() => saveConnMutation.mutate()}
                disabled={saveConnMutation.isPending || Object.values(connForm).every((v) => !v)}
              >
                {saveConnMutation.isPending ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Save className="w-3 h-3 mr-1" />
                )}{' '}
                Save Credentials
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testConnMutation.mutate()}
                disabled={!connection || testConnMutation.isPending}
              >
                {testConnMutation.isPending ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3 h-3 mr-1" />
                )}{' '}
                Test Connection
              </Button>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl">
            <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
              <Rocket className="w-5 h-5 text-violet-600" /> Publish Blueprint
            </h3>
            {campaign.externalId ? (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                <p className="font-semibold">
                  ✅ Published on{' '}
                  {campaign.publishedAt ? new Date(campaign.publishedAt).toLocaleString() : '—'}
                </p>
                <p className="text-xs mt-1">
                  External campaign ID: <span className="font-mono">{campaign.externalId}</span>. It
                  was created PAUSED — review and enable in{' '}
                  {isMeta ? 'Meta Ads Manager' : 'Google Ads'}.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Run a dry run first to inspect the exact API payloads, then publish. All objects
                  are created <b>PAUSED</b>.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => publishMutation.mutate(true)}
                    disabled={publishMutation.isPending}
                  >
                    {publishMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}{' '}
                    Dry Run (preview payloads)
                  </Button>
                  <Button
                    className="bg-violet-600 hover:bg-violet-700"
                    disabled={publishMutation.isPending || connection?.status !== 'connected'}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Publish "${campaign.name}" to ${isMeta ? 'Meta' : 'Google Ads'}? Everything will be created PAUSED — no spend starts until you enable it in Ads Manager.`,
                        )
                      ) {
                        publishMutation.mutate(false);
                      }
                    }}
                  >
                    <Rocket className="w-4 h-4 mr-2" /> Publish (as Paused)
                  </Button>
                </div>
                {connection?.status !== 'connected' && (
                  <p className="text-xs text-amber-600 mt-2">
                    Publish unlocks after a successful connection test.
                  </p>
                )}
              </>
            )}

            {dryRunResult && (
              <div className="mt-6 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {dryRunResult.steps.length} API steps · {dryRunResult.note}
                </p>
                {dryRunResult.steps.map((s: any, i: number) => (
                  <details key={i} className="border rounded-lg bg-muted/10">
                    <summary className="p-3 text-sm font-semibold cursor-pointer hover:bg-muted/20 rounded-lg">
                      {i + 1}. {s.step}{' '}
                      <span className="text-[10px] font-mono text-muted-foreground ml-2">
                        {s.endpoint}
                      </span>
                    </summary>
                    <pre className="p-3 text-[11px] overflow-x-auto border-t bg-zinc-950 text-zinc-100 rounded-b-lg">
                      {JSON.stringify(s.payload, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
