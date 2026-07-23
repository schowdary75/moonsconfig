// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  BarChart4,
  Download,
  IndianRupee,
  Package,
  ShoppingCart,
  TrendingUp,
  XCircle,
  Crown,
  Medal,
  Award,
  Flame,
  MapPin,
  Sparkles,
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
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { adminGetPpmAnalytics } from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/ppm/analytics')({
  component: AnalyticsDashboardPage,
});

const CHART_BLUE = '#3b82f6';

function money(value: number) {
  return `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function compact(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}k`;
  return `₹${value}`;
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
      <div className="text-2xl font-bold truncate">{value}</div>
      {sub && <p className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</p>}
    </div>
  );
}

const RANK_BADGES = [
  { icon: Crown, class: 'bg-amber-400/15 text-amber-500' },
  { icon: Medal, class: 'bg-zinc-400/15 text-zinc-400' },
  { icon: Award, class: 'bg-orange-400/15 text-orange-500' },
];

const TYPE_LABELS: Record<string, string> = {
  package: 'Packages',
  stay: 'Hotels & Stays',
  experience: 'Experiences',
  other: 'Other',
};

function AnalyticsDashboardPage() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const { data, isLoading } = useQuery({
    queryKey: ['ppm-analytics', user?.session_token],
    queryFn: () => adminGetPpmAnalytics({ data: { auth: auth! } }),
    enabled: !!auth,
    refetchInterval: 120000,
  });

  const summary = data?.summary || { bookingCount: 0, confirmedRevenue: 0, grossBookingValue: 0 };
  const packagePerformance = data?.packagePerformance || [];
  const monthlyTrend = data?.monthlyTrend || [];
  const statusMix = data?.statusMix || {
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    confirmedValue: 0,
    pendingValue: 0,
    cancelledValue: 0,
  };
  const typeMix = data?.typeMix || [];
  const demandSignals = data?.demandSignals || [];

  const avgBookingValue =
    summary.bookingCount > 0 ? summary.grossBookingValue / summary.bookingCount : 0;
  const totalStatus = statusMix.confirmed + statusMix.pending + statusMix.cancelled;
  const cancelRate = totalStatus > 0 ? Math.round((statusMix.cancelled / totalStatus) * 100) : 0;
  const topRevenue = packagePerformance[0]?.revenue || 1;
  const maxTypeRevenue = Math.max(1, ...typeMix.map((t: any) => t.revenue));
  const maxLeads = Math.max(1, ...demandSignals.map((d: any) => d.leads));

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1 h-8 px-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live · All
            Time
          </Badge>
          <Button
            onClick={() => exportAnalytics(summary, packagePerformance, monthlyTrend)}
            className="h-8 text-xs shadow-sm"
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            Export Report
          </Button>
        </div>
      </div>

      {/* ─── KPI Row ─── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile
          label="Confirmed Revenue"
          value={<AnimatedNumber value={summary.confirmedRevenue} prefix="₹" />}
          sub="Money actually earned"
          icon={IndianRupee}
          accent="bg-emerald-500/10 text-emerald-500"
          delay={0}
        />
        <KpiTile
          label="Gross Booking Value"
          value={<AnimatedNumber value={summary.grossBookingValue} prefix="₹" />}
          sub="All bookings incl. pending"
          icon={TrendingUp}
          accent="bg-blue-500/10 text-blue-500"
          delay={40}
        />
        <KpiTile
          label="Total Bookings"
          value={<AnimatedNumber value={summary.bookingCount} />}
          sub={`${statusMix.confirmed} confirmed · ${statusMix.pending} pending`}
          icon={ShoppingCart}
          accent="bg-violet-500/10 text-violet-500"
          delay={80}
        />
        <KpiTile
          label="Avg Booking Value"
          value={compact(avgBookingValue)}
          sub="Per booking, gross"
          icon={Sparkles}
          accent="bg-amber-500/10 text-amber-500"
          delay={120}
        />
        <KpiTile
          label="Cancellation Rate"
          value={<AnimatedNumber value={cancelRate} suffix="%" />}
          sub={`${statusMix.cancelled} cancelled (${compact(statusMix.cancelledValue)})`}
          icon={XCircle}
          accent="bg-rose-500/10 text-rose-500"
          delay={160}
        />
      </div>

      {/* ─── Revenue Trend + Status Mix ─── */}
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="glass-card rounded-xl p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold">Revenue Trend — last 12 months</h3>
              <p className="text-[11px] text-muted-foreground">
                Confirmed revenue by booking month
              </p>
            </div>
          </div>
          {monthlyTrend.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg">
              No booking data in the last 12 months yet.
            </div>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ppmRevenueFill" x1="0" y1="0" x2="0" y2="1">
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
                    tickFormatter={(v: number) => compact(v).replace('₹', '')}
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
                    fill="url(#ppmRevenueFill)"
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
          <h3 className="text-sm font-bold mb-1">Booking Health</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Where every booking stands</p>
          {/* Stacked status bar */}
          {totalStatus > 0 && (
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted/50 mb-4 gap-[2px]">
              <div
                className="bg-emerald-500 rounded-l-full"
                style={{ width: `${(statusMix.confirmed / totalStatus) * 100}%` }}
              />
              <div
                className="bg-amber-500"
                style={{ width: `${(statusMix.pending / totalStatus) * 100}%` }}
              />
              <div
                className="bg-rose-500 rounded-r-full"
                style={{ width: `${(statusMix.cancelled / totalStatus) * 100}%` }}
              />
            </div>
          )}
          <div className="space-y-2.5">
            {[
              {
                label: 'Confirmed',
                count: statusMix.confirmed,
                value: statusMix.confirmedValue,
                dot: 'bg-emerald-500',
                text: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                label: 'Pending',
                count: statusMix.pending,
                value: statusMix.pendingValue,
                dot: 'bg-amber-500',
                text: 'text-amber-600 dark:text-amber-400',
              },
              {
                label: 'Cancelled',
                count: statusMix.cancelled,
                value: statusMix.cancelledValue,
                dot: 'bg-rose-500',
                text: 'text-rose-600 dark:text-rose-400',
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${row.dot}`} />
                  <span className="text-xs font-semibold">{row.label}</span>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${row.text}`}>{row.count}</div>
                  <div className="text-[10px] text-muted-foreground">{compact(row.value)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Product mix */}
          <h3 className="text-sm font-bold mt-5 mb-3">Revenue by Product</h3>
          <div className="space-y-2.5">
            {typeMix.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No confirmed revenue yet.</p>
            ) : (
              typeMix.map((row: any) => (
                <div key={row.type}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-muted-foreground">
                      {TYPE_LABELS[row.type] || row.type} · {row.bookings} booking(s)
                    </span>
                    <span className="font-mono font-semibold">{compact(row.revenue)}</span>
                  </div>
                  <div className="h-2 bg-muted/60 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.max(row.revenue > 0 ? 4 : 0, (row.revenue / maxTypeRevenue) * 100)}%`,
                        background: CHART_BLUE,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ─── Package Leaderboard + Demand Signals ─── */}
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="glass-card rounded-xl p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" /> Package Leaderboard
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Top sellers ranked by confirmed revenue
              </p>
            </div>
          </div>
          {isLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />{' '}
              Loading analytics...
            </div>
          ) : packagePerformance.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
              No confirmed package bookings yet — your leaderboard fills up as sales close.
            </div>
          ) : (
            <div className="space-y-2">
              {packagePerformance.map((row: any, idx: number) => {
                const rank = RANK_BADGES[idx];
                const RankIcon = rank?.icon;
                return (
                  <div
                    key={row.name}
                    className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/10 p-3 hover:bg-muted/30 transition-colors animate-slide-up"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${rank ? rank.class : 'bg-muted text-muted-foreground'}`}
                    >
                      {RankIcon ? <RankIcon className="w-4.5 h-4.5" /> : `#${idx + 1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-semibold truncate">{row.name}</p>
                        <span className="font-mono font-bold text-sm shrink-0">
                          {money(row.revenue)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex-1 h-1.5 bg-muted/60 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.max(4, (row.revenue / topRevenue) * 100)}%`,
                              background: CHART_BLUE,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {row.bookings} booking(s)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="glass-card rounded-xl p-5 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <h3 className="text-sm font-bold flex items-center gap-2 mb-1">
            <Flame className="w-4 h-4 text-orange-500" /> Demand Signals
          </h3>
          <p className="text-[11px] text-muted-foreground mb-4">
            Destinations your leads are asking for — stock inventory here first
          </p>
          <div className="space-y-2.5">
            {demandSignals.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic py-6 text-center">
                No destination data from leads yet.
              </p>
            ) : (
              demandSignals.map((row: any, idx: number) => (
                <div
                  key={row.destination}
                  className="flex items-center gap-3 animate-slide-up"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-semibold truncate">{row.destination}</span>
                      <span className="text-muted-foreground shrink-0">
                        {row.leads} lead(s) · {row.converted} won
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-500 transition-all duration-700"
                        style={{ width: `${Math.max(4, (row.leads / maxLeads) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function exportAnalytics(summary: any, rows: any[], trend: any[]) {
  const csv = [
    ['metric', 'value'].join(','),
    ['confirmedRevenue', summary.confirmedRevenue].join(','),
    ['grossBookingValue', summary.grossBookingValue].join(','),
    ['bookingCount', summary.bookingCount].join(','),
    '',
    ['month', 'revenue', 'bookings'].join(','),
    ...trend.map((row) => [row.month, row.revenue, row.bookings].join(',')),
    '',
    ['package', 'bookings', 'revenue'].join(','),
    ...rows.map((row) =>
      [row.name, row.bookings, row.revenue]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ppm-analytics.csv';
  link.click();
  URL.revokeObjectURL(url);
  toast.success('Analytics exported');
}
