// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/auth-context';
import {
  adminGetPipelines,
  adminGetDeals,
  adminUpdateDealStatus,
  adminCreateDeal,
  adminAiCoachDeal,
} from '@/lib/api/db.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  X,
  Sparkles,
  Zap,
  ArrowRight,
  TrendingUp,
  Users,
  Target,
  BarChart3,
  Clock,
  IndianRupee,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  Legend,
} from 'recharts';

export const Route = createFileRoute('/_authenticated/crm/pipeline')({
  component: PipelinePage,
});

/* ═══ Stage Color Map ═══ */
const STAGE_COLORS_HEX: Record<string, string> = {
  'New Lead': '#e05252',
  Qualified: '#4a8fd9',
  'Quote Sent': '#d4a843',
  Negotiation: '#3cb371',
  Won: '#2e9e5e',
  Lost: '#8c8c8c',
};

function getStageColor(name: string): string {
  return STAGE_COLORS_HEX[name] || '#4a8fd9';
}

/* ═══ Animated Counter ═══ */
function AnimatedCounter({ value, prefix = '' }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = 700;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return (
    <span>
      {prefix}
      {display.toLocaleString('en-IN')}
    </span>
  );
}

/* ═══ Custom Recharts Tooltip ═══ */
function FunnelTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-lg px-3 py-2 shadow-lg border text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-muted-foreground">
          {entry.name}: <span className="font-bold text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/* ═══ Main Page ═══ */
function PipelinePage() {
  const { user } = useAuth();
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>('all');

  const [isNewDealModalOpen, setIsNewDealModalOpen] = useState(false);
  const [newDealForm, setNewDealForm] = useState({ title: '', customerName: '', value: '' });

  // AI Coach State
  const [coachingDealId, setCoachingDealId] = useState<number | null>(null);
  const [coachResult, setCoachResult] = useState<any>(null);

  const handleCoachDeal = async (deal: any, pipelineName: string) => {
    if (!user) return;
    setCoachingDealId(deal.id);
    setCoachResult(null);
    try {
      const auth = { email: user.email!, sessionToken: user.session_token! };
      const res = await adminAiCoachDeal({
        data: {
          auth,
          dealTitle: deal.title,
          customerName: deal.customerName || 'Unknown',
          dealValue: deal.value ? parseFloat(deal.value) : 0,
          pipelineStage: pipelineName,
        },
      });
      setCoachResult({ deal, res });
    } catch (err) {
      toast.error('Failed to load AI Coach');
      setCoachingDealId(null);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const p = await adminGetPipelines({
        data: { auth: { email: user?.email || '', sessionToken: user?.session_token || '' } },
      });
      const d = await adminGetDeals({
        data: { auth: { email: user?.email || '', sessionToken: user?.session_token || '' } },
      });
      setPipelines(p);
      setDeals(d);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load pipeline data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDealForm.title) return toast.error('Title is required');
    try {
      let availablePipelines = pipelines;
      if (!availablePipelines.length) {
        availablePipelines = await adminGetPipelines({
          data: { auth: { email: user?.email || '', sessionToken: user?.session_token || '' } },
        });
        setPipelines(availablePipelines);
      }
      if (!availablePipelines.length) return toast.error('Pipeline stages could not be restored.');
      await adminCreateDeal({
        data: {
          auth: { email: user?.email || '', sessionToken: user?.session_token || '' },
          title: newDealForm.title,
          customerName: newDealForm.customerName,
          value: newDealForm.value ? parseFloat(newDealForm.value) : undefined,
          pipelineId: availablePipelines[0].id,
        },
      });
      toast.success('Deal created!');
      setIsNewDealModalOpen(false);
      setNewDealForm({ title: '', customerName: '', value: '' });
      loadData();
    } catch (e) {
      toast.error('Failed to create deal');
    }
  };

  /* ═══ Derived Data ═══ */

  // Funnel stages (exclude Lost from main funnel)
  const funnelStages = useMemo(() => {
    return pipelines.filter((p) => p.name !== 'Lost');
  }, [pipelines]);

  // Funnel chart data: count per stage
  const funnelChartData = useMemo(() => {
    return funnelStages.map((stage) => ({
      name: stage.name,
      deals: deals.filter((d) => d.pipelineId === stage.id).length,
      color: getStageColor(stage.name),
    }));
  }, [funnelStages, deals]);

  // Horizontal bar: all stages including Lost
  const stageBarData = useMemo(() => {
    return pipelines.map((stage) => ({
      name: stage.name,
      count: deals.filter((d) => d.pipelineId === stage.id).length,
      color: getStageColor(stage.name),
    }));
  }, [pipelines, deals]);

  // Scatter data: days in pipeline per deal
  const scatterData = useMemo(() => {
    const now = Date.now();
    return deals
      .filter((d) => d.status !== 'lost')
      .map((deal) => {
        const created = new Date(deal.createdAt).getTime();
        const days = Math.max(1, Math.round((now - created) / (1000 * 60 * 60 * 24)));
        const stage = pipelines.find((p) => p.id === deal.pipelineId);
        return {
          stageName: stage?.name || 'Unknown',
          stageOrder: stage?.order || 0,
          days,
          value: deal.value ? parseFloat(deal.value) : 0,
          title: deal.title,
          color: getStageColor(stage?.name || ''),
        };
      });
  }, [deals, pipelines]);

  // Group scatter data by stage for multi-series rendering
  const scatterByStage = useMemo(() => {
    const groups: Record<string, typeof scatterData> = {};
    scatterData.forEach((d) => {
      if (!groups[d.stageName]) groups[d.stageName] = [];
      groups[d.stageName].push(d);
    });
    return groups;
  }, [scatterData]);

  // KPI metrics
  const totalDeals = deals.length;
  const pipelineValue = deals.reduce((sum, d) => sum + (d.value ? parseFloat(d.value) : 0), 0);
  const wonDeals = deals.filter((d) => d.status === 'won').length;
  const activeDeals = deals.filter((d) => d.status === 'open').length;

  // Filtered deals for table
  const filteredDeals = useMemo(() => {
    if (stageFilter === 'all') return deals;
    const stage = pipelines.find((p) => p.name === stageFilter);
    if (!stage) return deals;
    return deals.filter((d) => d.pipelineId === stage.id);
  }, [deals, stageFilter, pipelines]);

  // Stage name lookup
  const getStageName = (pipelineId: number) => {
    return pipelines.find((p) => p.id === pipelineId)?.name || 'Unknown';
  };

  // Days since creation
  const getDaysInPlay = (createdAt: string) => {
    const days = Math.round((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading pipeline overview...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ═══ Header ═══ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div />
        <div className="flex gap-2">
          <div className="relative">
            <select
              className="h-9 rounded-lg border border-border/50 bg-card px-3 pr-8 text-xs font-medium appearance-none cursor-pointer hover:bg-muted/50 transition-colors"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
            >
              <option value="all">All Stages</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <Button
            onClick={() => setIsNewDealModalOpen(true)}
            className="h-9 text-xs font-semibold shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Deal
          </Button>
        </div>
      </div>

      {/* ═══ KPI Cards ═══ */}
      <div className="grid gap-3 md:grid-cols-4">
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Deals
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-blue-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={totalDeals} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{activeDeals} active in pipeline</p>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pipeline Value
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={pipelineValue} prefix="₹" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Total deal value across stages</p>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Won Deals
            </span>
            <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            <AnimatedCounter value={wonDeals} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Converted to bookings</p>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '180ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Win Rate
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Target className="w-3.5 h-3.5 text-amber-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter
              value={totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0}
            />
            %
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {wonDeals} of {totalDeals} deals won
          </p>
        </div>
      </div>

      {/* ═══ Main Charts Row ═══ */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.65fr)_minmax(0,1fr)]">
        {/* Left: Accounts in Stage (horizontal bars) */}
        <div
          className="glass-card rounded-xl p-5 animate-slide-up"
          style={{ animationDelay: '240ms' }}
        >
          <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-primary" />
            Accounts in Stage
          </h3>
          <p className="text-[11px] text-muted-foreground mb-4">Deals currently in each stage</p>
          <div style={{ height: Math.max(180, pipelines.length * 38) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stageBarData}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                />
                <Tooltip content={<FunnelTooltip />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={22}>
                  {stageBarData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Funnel Pipeline (vertical bars) */}
        <div
          className="glass-card rounded-xl p-5 animate-slide-up"
          style={{ animationDelay: '300ms' }}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-blue-500" />
              Funnel Pipeline
            </h3>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Deals that completed each stage</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Number of deals per pipeline stage
          </p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} />
                <Tooltip content={<FunnelTooltip />} />
                <Bar
                  dataKey="deals"
                  radius={[6, 6, 0, 0]}
                  barSize={48}
                  label={{
                    position: 'top',
                    fontSize: 13,
                    fontWeight: 700,
                    fill: 'var(--color-foreground)',
                  }}
                >
                  {funnelChartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ═══ Bottom Row: Scatter + Table ═══ */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Left: Days in Pipeline scatter */}
        <div
          className="glass-card rounded-xl p-5 animate-slide-up"
          style={{ animationDelay: '360ms' }}
        >
          <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-amber-500" />
            Days in Pipeline
          </h3>
          <p className="text-[11px] text-muted-foreground mb-4">
            How long deals sit in each stage (dot size = deal value)
          </p>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="stageOrder"
                  name="Stage"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  type="number"
                  domain={[0, 'dataMax + 1']}
                  tickFormatter={(val) => {
                    const stage = pipelines.find((p) => p.order === val);
                    return stage?.name?.split(' ')[0] || '';
                  }}
                />
                <YAxis
                  dataKey="days"
                  name="Days"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  label={{
                    value: 'Days',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 11, fill: 'var(--color-muted-foreground)' },
                  }}
                />
                <ZAxis dataKey="value" range={[40, 300]} name="Value" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="glass-card rounded-lg px-3 py-2 shadow-lg border text-xs">
                        <p className="font-semibold text-foreground">{data.title}</p>
                        <p className="text-muted-foreground">
                          Stage: <span className="font-bold text-foreground">{data.stageName}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Days: <span className="font-bold text-foreground">{data.days}</span>
                        </p>
                        {data.value > 0 && (
                          <p className="text-muted-foreground">
                            Value:{' '}
                            <span className="font-bold text-emerald-600">
                              ₹{data.value.toLocaleString('en-IN')}
                            </span>
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                {Object.entries(scatterByStage).map(([stageName, data]) => (
                  <Scatter
                    key={stageName}
                    name={stageName}
                    data={data}
                    fill={getStageColor(stageName)}
                    fillOpacity={0.7}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Active Deals Table */}
        <div
          className="glass-card rounded-xl overflow-hidden animate-slide-up"
          style={{ animationDelay: '420ms' }}
        >
          <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <div className="w-1.5 h-4 rounded-full bg-emerald-500" />
                Active Deals
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {filteredDeals.length} deals · Click for AI Coach
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] font-semibold">
              {stageFilter === 'all' ? 'All Stages' : stageFilter}
            </Badge>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/30">
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">
                    Deal
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">
                    Customer
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">
                    Stage
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
                    Value
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
                    Days
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeals.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground text-sm"
                    >
                      No deals found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDeals.map((deal) => {
                    const stageName = getStageName(deal.pipelineId);
                    const days = getDaysInPlay(deal.createdAt);
                    return (
                      <TableRow
                        key={deal.id}
                        className="cursor-pointer hover:bg-muted/40 transition-all duration-150 group"
                        onClick={() => handleCoachDeal(deal, stageName)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-1 h-8 rounded-full"
                              style={{ backgroundColor: getStageColor(stageName) }}
                            />
                            <div>
                              <div className="font-semibold text-[13px] group-hover:text-primary transition-colors">
                                {deal.title}
                              </div>
                              <div className="text-[10px] text-muted-foreground">#{deal.id}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{deal.customerName || '\u2014'}</TableCell>
                        <TableCell>
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{
                              backgroundColor: getStageColor(stageName) + '18',
                              color: getStageColor(stageName),
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: getStageColor(stageName) }}
                            />
                            {stageName}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {deal.value ? (
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                              {'\u20B9'}
                              {parseFloat(deal.value).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`text-sm font-medium ${days > 30 ? 'text-rose-600 dark:text-rose-400' : days > 14 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                          >
                            {days}d
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* ═══ AI Coach Modal ═══ */}
      {coachingDealId && (
        <div
          className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-6 animate-in fade-in"
          onClick={() => {
            setCoachingDealId(null);
            setCoachResult(null);
          }}
        >
          <div
            className="bg-card rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b bg-primary/5 sticky top-0 z-10 bg-card">
              <div className="flex items-center gap-2 text-primary font-display font-bold">
                <Sparkles className="w-5 h-5" /> AI Deal Coach
              </div>
              <button
                onClick={() => {
                  setCoachingDealId(null);
                  setCoachResult(null);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              {!coachResult ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground space-y-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm">Analyzing deal probability...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center pb-2 border-b">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Win Probability
                    </p>
                    <p className="text-3xl font-bold text-emerald-600">
                      {coachResult.res.win_probability}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-primary font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Next Best Action
                    </p>
                    <p className="text-sm bg-muted/50 p-3 rounded-lg border">
                      {coachResult.res.next_best_action}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" /> Upsell Opportunity
                    </p>
                    <p className="text-sm bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 p-3 rounded-lg border border-amber-200 dark:border-amber-800/50">
                      {coachResult.res.upsell_opportunity}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ New Deal Modal ═══ */}
      {isNewDealModalOpen && (
        <div
          className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-6"
          onClick={() => setIsNewDealModalOpen(false)}
        >
          <div
            className="bg-card rounded-lg shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold text-foreground">Create New Deal</h2>
              <button
                onClick={() => setIsNewDealModalOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDeal} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Deal Title *
                </label>
                <Input
                  value={newDealForm.title}
                  onChange={(e) => setNewDealForm({ ...newDealForm, title: e.target.value })}
                  placeholder="e.g. Summer in Santorini"
                  className="w-full bg-muted/40 border-border"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Customer Name
                </label>
                <Input
                  value={newDealForm.customerName}
                  onChange={(e) => setNewDealForm({ ...newDealForm, customerName: e.target.value })}
                  placeholder="e.g. Eleanor Vance"
                  className="w-full bg-muted/40 border-border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Value (₹)</label>
                <Input
                  type="number"
                  value={newDealForm.value}
                  onChange={(e) => setNewDealForm({ ...newDealForm, value: e.target.value })}
                  placeholder="e.g. 12500"
                  className="w-full bg-muted/40 border-border"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsNewDealModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Deal</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function getPipelineStatus(stageName: string): 'open' | 'won' | 'lost' {
  const normalized = stageName.trim().toLowerCase();
  if (normalized.includes('won')) return 'won';
  if (normalized.includes('lost')) return 'lost';
  return 'open';
}
