// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute, Link } from '@/lib/routerCompat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  IndianRupee,
  FileText,
  Lock,
  Phone,
  Play,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  adminGetMissionControl,
  adminGetMayaStatus,
  adminSetMayaAutopilot,
  adminRunMayaAutopilotNow,
  type MayaActivityRow,
} from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/mission-control')({
  component: MissionControlPage,
});

const CHART_BLUE = '#3b82f6';

const AREA_META: Record<string, { label: string; icon: React.ElementType; blurb: string }> = {
  leads: {
    label: 'Leads',
    icon: Phone,
    blurb: 'Emails new leads, sends quotes after 24h, follows up after 3 days.',
  },
  followups: {
    label: 'Follow-ups',
    icon: CalendarClock,
    blurb: 'Clears overdue items on Maya-owned leads, flags the rest for you.',
  },
  clients: {
    label: 'Clients',
    icon: Users,
    blurb: 'Creates client profiles from converted leads, syncs lifetime value, promotes VIPs.',
  },
  escrow: {
    label: 'Escrow',
    icon: Lock,
    blurb: 'Releases milestones automatically when their scheduled date arrives.',
  },
  refunds: {
    label: 'Refunds',
    icon: ArrowDownRight,
    blurb: 'Escalates stale refunds into review. Settlement stays manual.',
  },
  careers: {
    label: 'Careers',
    icon: Briefcase,
    blurb: 'Auto-shortlists candidates scoring 80%+ and emails interview invites.',
  },
  payments: {
    label: 'Payments',
    icon: CreditCard,
    blurb: 'Watches the verification queue and alerts you when claims go stale.',
  },
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  leads: Phone,
  followups: CalendarClock,
  clients: Users,
  escrow: Lock,
  refunds: ArrowDownRight,
  careers: Briefcase,
  payments: CreditCard,
  quotes: FileText,
  system: Zap,
};

function timeAgo(value: string | null) {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return 'unknown';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function money(value: number) {
  return `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
}: {
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = 700;
    const startTime = Date.now();
    const animate = () => {
      const progress = Math.min((Date.now() - startTime) / duration, 1);
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return (
    <span>
      {prefix}
      {display.toLocaleString('en-IN')}
      {suffix}
    </span>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  delay,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ElementType;
  accent: string;
  delay: number;
}) {
  return (
    <div
      className="glass-card rounded-xl p-4 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className={`w-7 h-7 rounded-lg ${accent} flex items-center justify-center`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

const FUNNEL_STAGES: Array<{ key: string; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'quote_sent', label: 'Quote Sent' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'converted', label: 'Converted' },
];

function MissionControlPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  const {
    data: mc,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['mission_control'],
    queryFn: () => adminGetMissionControl({ data: { auth: auth! } }),
    enabled: !!auth,
    refetchInterval: 60000,
  });

  const { data: maya } = useQuery({
    queryKey: ['maya_status'],
    queryFn: () => adminGetMayaStatus({ data: { auth: auth! } }),
    enabled: !!auth,
    refetchInterval: 45000,
  });

  const toggleArea = useMutation({
    mutationFn: (input: { area: string; enabled: boolean }) =>
      adminSetMayaAutopilot({
        data: { auth: auth!, area: input.area as any, enabled: input.enabled },
      }),
    onSuccess: (_res, input) => {
      toast.success(
        `Maya ${input.area === 'master' ? 'autopilot' : `"${AREA_META[input.area]?.label || input.area}" automation`} ${input.enabled ? 'enabled' : 'paused'}`,
      );
      queryClient.invalidateQueries({ queryKey: ['maya_status'] });
    },
    onError: () => toast.error('Could not update autopilot setting'),
  });

  const [isRunningNow, setIsRunningNow] = useState(false);
  const runNow = async () => {
    if (!auth) return;
    setIsRunningNow(true);
    toast.info('Maya is sweeping every operations area...');
    try {
      await adminRunMayaAutopilotNow({ data: { auth } });
      toast.success('Maya finished her sweep!');
      queryClient.invalidateQueries({ queryKey: ['maya_status'] });
      queryClient.invalidateQueries({ queryKey: ['mission_control'] });
    } catch {
      toast.error('Autopilot run failed — check server logs');
    } finally {
      setIsRunningNow(false);
    }
  };

  const leadsByStatus = mc?.leadsByStatus || {};
  const activeLeads = ['new', 'contacted', 'quote_sent', 'qualified'].reduce(
    (sum, key) => sum + (leadsByStatus[key] || 0),
    0,
  );
  const funnelMax = Math.max(1, ...FUNNEL_STAGES.map((stage) => leadsByStatus[stage.key] || 0));
  const attentionCount =
    (mc?.overdueFollowups || 0) +
    (mc?.pendingPaymentsCount || 0) +
    (mc?.refundsOpen || 0) +
    (leadsByStatus['new'] || 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div />
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              maya?.masterEnabled !== false
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${maya?.masterEnabled !== false ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}
            />
            Maya Autopilot {maya?.masterEnabled !== false ? 'active' : 'paused'} · ran{' '}
            {timeAgo(maya?.lastRun || null)}
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs shadow-sm"
            onClick={runNow}
            disabled={isRunningNow}
          >
            {isRunningNow ? (
              <span className="animate-pulse">Sweeping...</span>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 mr-1.5" /> Run Maya Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ─── KPI Row ─── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Gross Revenue"
          value={<AnimatedNumber value={mc?.bookings.grossRevenue || 0} prefix="₹" />}
          sub="Confirmed bookings"
          icon={IndianRupee}
          accent="bg-emerald-500/10 text-emerald-500"
          delay={0}
        />
        <KpiTile
          label="Escrow Held"
          value={<AnimatedNumber value={mc?.escrow.held || 0} prefix="₹" />}
          sub={`${money(mc?.escrow.released || 0)} released`}
          icon={Lock}
          accent="bg-amber-500/10 text-amber-500"
          delay={40}
        />
        <KpiTile
          label="Pipeline Value"
          value={<AnimatedNumber value={mc?.deals.openValue || 0} prefix="₹" />}
          sub={`${mc?.deals.open || 0} open · ${mc?.deals.won || 0} won`}
          icon={TrendingUp}
          accent="bg-blue-500/10 text-blue-500"
          delay={80}
        />
        <KpiTile
          label="Active Leads"
          value={<AnimatedNumber value={activeLeads} />}
          sub={`${leadsByStatus['converted'] || 0} converted so far`}
          icon={Phone}
          accent="bg-violet-500/10 text-violet-500"
          delay={120}
        />
        <KpiTile
          label="Bookings"
          value={<AnimatedNumber value={mc?.bookings.total || 0} />}
          sub={`${mc?.bookings.pending || 0} awaiting payment`}
          icon={ShoppingCart}
          accent="bg-sky-500/10 text-sky-500"
          delay={160}
        />
        <KpiTile
          label="Clients"
          value={<AnimatedNumber value={mc?.clients.total || 0} />}
          sub={`${mc?.clients.vip || 0} VIP · Maya-synced`}
          icon={Users}
          accent="bg-rose-500/10 text-rose-500"
          delay={200}
        />
      </div>

      {/* ─── Revenue Trend + Funnel ─── */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="glass-card rounded-xl p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold">Confirmed Revenue — last 6 months</h3>
              <p className="text-[11px] text-muted-foreground">Booked revenue by month</p>
            </div>
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </Badge>
          </div>
          {(mc?.revenueTrend || []).length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg">
              No confirmed bookings in the last 6 months yet.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={mc?.revenueTrend || []}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="mcRevenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_BLUE} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={CHART_BLUE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                  />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.55 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.55 }}
                    tickFormatter={(v: number) =>
                      v >= 100000
                        ? `${(v / 100000).toFixed(1)}L`
                        : v >= 1000
                          ? `${Math.round(v / 1000)}k`
                          : String(v)
                    }
                  />
                  <Tooltip
                    cursor={{ stroke: CHART_BLUE, strokeOpacity: 0.3 }}
                    formatter={(value: any, name: any) =>
                      name === 'revenue' ? [money(Number(value)), 'Revenue'] : [value, 'Bookings']
                    }
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 12,
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={CHART_BLUE}
                    strokeWidth={2}
                    fill="url(#mcRevenueFill)"
                    dot={{ r: 3, strokeWidth: 2, fill: 'var(--card)' }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div
          className="glass-card rounded-xl p-5 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold">Lead Funnel</h3>
              <p className="text-[11px] text-muted-foreground">Where every lead stands right now</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 text-[11px] text-primary">
              <Link to="/leads">
                Open Leads <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </div>
          <div className="space-y-3">
            {FUNNEL_STAGES.map((stage) => {
              const count = leadsByStatus[stage.key] || 0;
              return (
                <div key={stage.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{stage.label}</span>
                    <span className="font-mono font-semibold">{count}</span>
                  </div>
                  <div className="h-2.5 bg-muted/60 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(count > 0 ? 4 : 0, (count / funnelMax) * 100)}%`,
                        background: CHART_BLUE,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="pt-2 mt-1 border-t border-border/40 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Lead → Converted</span>
              <span className="font-bold font-mono text-primary">
                {activeLeads + (leadsByStatus['converted'] || 0) + (leadsByStatus['lost'] || 0) > 0
                  ? Math.round(
                      ((leadsByStatus['converted'] || 0) /
                        (activeLeads +
                          (leadsByStatus['converted'] || 0) +
                          (leadsByStatus['lost'] || 0))) *
                        100,
                    )
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Attention Center ─── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <QueueCard
          title="Overdue Follow-ups"
          icon={AlertTriangle}
          accent="text-rose-500 bg-rose-500/10"
          count={mc?.overdueFollowups || 0}
          to="/leads/followups"
          cta="Work the queue"
          items={(mc?.attentionQueues.followups || []).map((f: any) => ({
            id: f.id,
            primary: f.lead_name,
            secondary: `${f.follow_up_type} · ${f.destination || 'Open'} · due ${timeAgo(f.follow_up_date)}`,
          }))}
        />
        <QueueCard
          title="Payments to Verify"
          icon={CreditCard}
          accent="text-amber-500 bg-amber-500/10"
          count={mc?.pendingPaymentsCount || 0}
          to="/bookings/all"
          cta="Verify payments"
          items={(mc?.attentionQueues.payments || []).map((p: any) => ({
            id: p.id,
            primary: `${p.user_name || 'Customer'} · ${money(Number(p.amount || 0))}`,
            secondary: `UTR ${p.utr_reference} · ${timeAgo(p.created_at)}`,
          }))}
        />
        <QueueCard
          title="Open Refunds"
          icon={ArrowDownRight}
          accent="text-blue-500 bg-blue-500/10"
          count={mc?.refundsOpen || 0}
          to="/refunds"
          cta="Review refunds"
          items={(mc?.attentionQueues.refunds || []).map((r: any) => ({
            id: r.id,
            primary: `${r.booking_reference} · ${money(Number(r.amount || 0))}`,
            secondary: `${String(r.status).replace(/_/g, ' ')} · ${timeAgo(r.created_at)}`,
          }))}
        />
        <QueueCard
          title="Fresh Leads"
          icon={Sparkles}
          accent="text-violet-500 bg-violet-500/10"
          count={leadsByStatus['new'] || 0}
          to="/leads"
          cta="Open leads"
          items={(mc?.attentionQueues.newLeads || []).map((l: any) => ({
            id: l.id,
            primary: l.name,
            secondary: `${l.destination || 'Open destination'} · ${l.budget_range || 'Budget TBD'} · ${timeAgo(l.created_at)}`,
          }))}
        />
      </div>

      {/* ─── Maya Autopilot Panel ─── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="glass-card rounded-xl p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Maya Autopilot</h3>
                <p className="text-[11px] text-muted-foreground">
                  {maya?.actionsToday ?? 0} actions completed today
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground">Master</span>
              <Switch
                checked={maya?.masterEnabled !== false}
                onCheckedChange={(checked) =>
                  toggleArea.mutate({ area: 'master', enabled: checked })
                }
              />
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {Object.entries(AREA_META).map(([area, meta]) => {
              const Icon = meta.icon;
              const enabled = maya?.areas?.[area] !== false;
              return (
                <div
                  key={area}
                  className={`flex items-center gap-3 rounded-lg border border-border/40 p-2.5 transition-opacity ${maya?.masterEnabled === false ? 'opacity-50' : ''}`}
                >
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{meta.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{meta.blurb}</p>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={maya?.masterEnabled === false}
                    onCheckedChange={(checked) => toggleArea.mutate({ area, enabled: checked })}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="glass-card rounded-xl p-5 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold">Maya's Activity Feed</h3>
              <p className="text-[11px] text-muted-foreground">
                Everything she's done autonomously, newest first
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </Badge>
          </div>
          <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
            {(maya?.activity || []).length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                No autonomous actions yet. Assign a lead to "🤖 Maya (AI Auto-Pilot)" or click "Run
                Maya Now".
              </div>
            ) : (
              (maya?.activity || []).map((item: MayaActivityRow) => {
                const Icon = ACTIVITY_ICONS[item.area] || Zap;
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg p-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        item.status === 'attention'
                          ? 'bg-amber-500/10 text-amber-500'
                          : item.status === 'error'
                            ? 'bg-rose-500/10 text-rose-500'
                            : 'bg-emerald-500/10 text-emerald-500'
                      }`}
                    >
                      {item.status === 'done' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-snug">{item.summary}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                        {item.area} · {timeAgo(item.created_at)}
                      </p>
                    </div>
                    {item.status === 'attention' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-400"
                      >
                        Needs you
                      </Badge>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── Quick Ops Strip ─── */}
      <div className="glass-card rounded-xl p-4 animate-slide-up">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-2">
            Jump to
          </span>
          {[
            { label: 'Sales Board', to: '/crm/pipeline', icon: TrendingUp },
            { label: 'Clients', to: '/crm/clients', icon: Users },
            { label: 'Leads', to: '/leads', icon: Phone },
            { label: 'Follow-ups', to: '/leads/followups', icon: CalendarClock },
            { label: 'Quote Studio', to: '/quotes', icon: FileText },
            { label: 'Bookings', to: '/bookings/all', icon: Wallet },
            { label: 'Escrow', to: '/escrow', icon: Lock },
            { label: 'Refunds', to: '/refunds', icon: ArrowDownRight },
            { label: 'Careers', to: '/careers', icon: Briefcase },
          ].map((item) => (
            <Button key={item.to} asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link to={item.to as any}>
                <item.icon className="w-3.5 h-3.5 mr-1.5" /> {item.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />{' '}
          Syncing Mission Control...
        </div>
      )}
    </div>
  );
}

function QueueCard({
  title,
  icon: Icon,
  accent,
  count,
  items,
  to,
  cta,
}: {
  title: string;
  icon: React.ElementType;
  accent: string;
  count: number;
  items: Array<{ id: number; primary: string; secondary: string }>;
  to: string;
  cta: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4 flex flex-col animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-xs font-bold">{title}</h3>
        </div>
        <span className={`text-lg font-bold ${count > 0 ? '' : 'text-muted-foreground/50'}`}>
          {count}
        </span>
      </div>
      <div className="space-y-1.5 flex-1">
        {items.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic py-3 text-center">All clear ✨</p>
        ) : (
          items.slice(0, 4).map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-border/30 bg-muted/20 px-2.5 py-1.5"
            >
              <p className="text-[11px] font-semibold truncate">{item.primary}</p>
              <p className="text-[10px] text-muted-foreground truncate">{item.secondary}</p>
            </div>
          ))
        )}
      </div>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-7 mt-2 text-[11px] justify-between text-primary hover:bg-primary/5"
      >
        <Link to={to as any}>
          {cta} <ArrowRight className="w-3 h-3" />
        </Link>
      </Button>
    </div>
  );
}
