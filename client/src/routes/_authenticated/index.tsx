// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute, Link } from '@/lib/routerCompat';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminGetDashboardMetrics, adminAiAnalyticsChat } from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  IndianRupee,
  FileText,
  Minus,
  Phone,
  Plus,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from '@/lib/toast';

// Heavy libs deferred off the initial dashboard chunk (recharts ~382KB, react-markdown).
const DashboardPulseChart = lazy(() => import('@/components/dashboard/DashboardPulseChart'));
const LazyMarkdown = lazy(() => import('@/components/LazyMarkdown'));

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardIndex,
});

const CHART_BLUE = '#3b82f6';

// Fills the chart's fixed height while recharts streams in, so the card doesn't
// reflow when the chart appears.
function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse rounded-md bg-muted/30" />;
}

function compact(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}k`;
  return `₹${Math.round(value)}`;
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

function DeltaPill({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground">
        <Minus className="w-3 h-3" /> flat
      </span>
    );
  }
  const delta = previous === 0 ? 100 : Math.round(((current - previous) / previous) * 100);
  if (delta >= 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
        <ArrowUpRight className="w-3 h-3" /> {delta}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
      <ArrowDownRight className="w-3 h-3" /> {delta}%
    </span>
  );
}

const ACTIVITY_META: Record<string, { icon: React.ElementType; accent: string; badge: string }> = {
  lead: { icon: Phone, accent: 'bg-blue-500/10 text-blue-500', badge: 'New' },
  booking: { icon: ShoppingCart, accent: 'bg-emerald-500/10 text-emerald-500', badge: 'Paid' },
  maya: { icon: Sparkles, accent: 'bg-violet-500/10 text-violet-500', badge: 'Auto' },
};

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function DashboardIndex() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['dashboard_metrics'],
    queryFn: () =>
      adminGetDashboardMetrics({
        data: { adminEmail: user?.email!, sessionToken: user?.session_token! },
      }),
    enabled: !!user?.session_token,
    refetchInterval: 60000,
  });
  const m: any = data?.metrics || {};
  const pulse: Array<{ day: string; leads: number; revenue: number }> = m.pulse || [];

  const [chatQuery, setChatQuery] = useState('');
  const [chatAnswer, setChatAnswer] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleAnalyticsChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || !user?.session_token) return;
    setIsChatLoading(true);
    try {
      const res = await adminAiAnalyticsChat({
        data: { auth: { email: user.email, sessionToken: user.session_token }, query: chatQuery },
      });
      setChatAnswer(res.answer);
    } catch (err) {
      toast.error('Failed to fetch analytical insights.');
    } finally {
      setIsChatLoading(false);
    }
  };

  const attention = [
    {
      label: 'New leads today',
      count: m.todayLeads || 0,
      icon: Phone,
      to: '/leads',
      accent: 'text-blue-500 bg-blue-500/10',
      ring: 'hover:border-blue-500/40',
    },
    {
      label: 'Overdue follow-ups',
      count: m.overdueFollowups || 0,
      icon: CalendarClock,
      to: '/leads/followups',
      accent: 'text-rose-500 bg-rose-500/10',
      ring: 'hover:border-rose-500/40',
    },
    {
      label: 'Payments to verify',
      count: m.pendingPayments || 0,
      icon: CreditCard,
      to: '/bookings/all',
      accent: 'text-amber-500 bg-amber-500/10',
      ring: 'hover:border-amber-500/40',
    },
    {
      label: 'Quotes awaiting reply',
      count: m.totalQuotes || 0,
      icon: FileText,
      to: '/leads',
      accent: 'text-violet-500 bg-violet-500/10',
      ring: 'hover:border-violet-500/40',
    },
  ];
  const attentionTotal = attention.reduce((sum, item) => sum + item.count, 0);

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ─── Greeting Hero ─── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-sky-500/5 to-transparent p-6 animate-slide-up">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-sky-500/10 blur-2xl" />
        <div className="absolute right-32 -bottom-16 h-44 w-44 rounded-full bg-violet-500/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div />
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" className="h-9 text-xs shadow-sm">
              <Link to="/leads">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> New Lead
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-9 text-xs shadow-sm">
              <Link to="/quotes">
                <FileText className="w-3.5 h-3.5 mr-1.5" /> New Quote
              </Link>
            </Button>
            <Button asChild size="sm" className="h-9 text-xs shadow-sm">
              <Link to="/mission-control">
                <Activity className="w-3.5 h-3.5 mr-1.5" /> Mission Control
              </Link>
            </Button>
          </div>
        </div>

        {/* Attention chips inside hero */}
        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {attention.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.to as any}
                className={`group flex items-center gap-3 rounded-xl border border-border/50 bg-card/70 backdrop-blur-sm p-3 transition-all hover:shadow-md ${item.ring}`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.accent}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-bold leading-none">{item.count}</div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {item.label}
                  </div>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* ─── KPI Row with week-over-week deltas ─── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card rounded-xl p-4 animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Revenue · 7 days
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <IndianRupee className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold">
              <AnimatedNumber value={m.weekRevenue || 0} prefix="₹" />
            </div>
            <DeltaPill current={m.weekRevenue || 0} previous={m.prevWeekRevenue || 0} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            vs {compact(m.prevWeekRevenue || 0)} last week · {compact(m.grossRevenue || 0)} lifetime
          </p>
        </div>

        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '40ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Leads · 7 days
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Phone className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold">
              <AnimatedNumber value={m.weekLeads || 0} />
            </div>
            <DeltaPill current={m.weekLeads || 0} previous={m.prevWeekLeads || 0} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {m.activeLeads || 0} active in pipeline right now
          </p>
        </div>

        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Open Pipeline
            </span>
            <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedNumber value={m.openPipelineValue || 0} prefix="₹" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {m.openDeals || 0} open deal{(m.openDeals || 0) === 1 ? '' : 's'} on the Sales board
          </p>
        </div>

        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Conversion
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Target className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedNumber value={m.conversionRate || 0} suffix="%" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {m.convertedLeads || 0} of {m.totalLeads || 0} leads converted · {m.totalBookings || 0}{' '}
            bookings
          </p>
        </div>
      </div>

      {/* ─── 14-day pulse: revenue + leads (small multiples) ─── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card rounded-xl p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold">Revenue Pulse</h3>
              <p className="text-[11px] text-muted-foreground">
                Confirmed revenue per day · last 14 days
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </Badge>
          </div>
          <div className="h-40">
            <Suspense fallback={<ChartSkeleton />}>
              <DashboardPulseChart
                kind="revenue"
                data={pulse}
                color={CHART_BLUE}
                compact={compact}
              />
            </Suspense>
          </div>
        </div>

        <div
          className="glass-card rounded-xl p-5 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold">Lead Pulse</h3>
              <p className="text-[11px] text-muted-foreground">New leads per day · last 14 days</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 text-[11px] text-primary">
              <Link to="/leads">
                Open Leads <ArrowUpRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </div>
          <div className="h-40">
            <Suspense fallback={<ChartSkeleton />}>
              <DashboardPulseChart kind="lead" data={pulse} color={CHART_BLUE} compact={compact} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* ─── AI CFO + Activity ─── */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="glass-card rounded-xl p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-sky-500 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Ask Maya about your numbers</h3>
              <p className="text-[11px] text-muted-foreground">
                Your AI CFO — she reads the live booking and lead tables
              </p>
            </div>
          </div>
          <form onSubmit={handleAnalyticsChat} className="flex gap-2">
            <Input
              placeholder="e.g. Which package earns the most? Where are leads dropping off?"
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              className="bg-background"
              disabled={isChatLoading}
            />
            <Button
              type="submit"
              disabled={isChatLoading || !chatQuery.trim()}
              className="shrink-0"
            >
              {isChatLoading ? 'Thinking...' : 'Ask'}
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              "Break down this month's revenue",
              'Which destination should I push?',
              'Why is conversion low?',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setChatQuery(q)}
                className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
          {chatAnswer && (
            <div className="mt-4 rounded-lg border border-border/40 bg-muted/20 p-4 text-sm leading-relaxed">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Suspense fallback={<div className="whitespace-pre-wrap">{chatAnswer}</div>}>
                  <LazyMarkdown>{chatAnswer}</LazyMarkdown>
                </Suspense>
              </div>
            </div>
          )}
        </div>

        <div
          className="glass-card rounded-xl p-5 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold">Live Activity</h3>
              <p className="text-[11px] text-muted-foreground">
                Leads, bookings & Maya — newest first
              </p>
            </div>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {(m.recentActivity || []).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                No activity yet — it shows up here the moment leads or bookings land.
              </div>
            ) : (
              (m.recentActivity || []).map((item: any, i: number) => {
                const meta = ACTIVITY_META[item.kind] || ACTIVITY_META.lead;
                const Icon = meta.icon;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/40 transition-colors"
                  >
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.accent}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold">{item.title}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {timeAgo(item.at)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="mt-2 h-7 w-full justify-between text-[11px] text-primary hover:bg-primary/5"
          >
            <Link to="/mission-control">
              Full picture in Mission Control <ArrowUpRight className="w-3 h-3" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
