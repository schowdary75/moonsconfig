// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
//
// Recharts is ~382KB. Isolating it here lets the dashboard (the post-login
// landing page) render immediately and stream the charts in afterwards, instead
// of shipping the whole charting engine before first paint.
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type PulseRow = { day: string; revenue: number; leads: number };

export default function DashboardPulseChart({
  kind,
  data,
  color,
  compact,
}: {
  kind: 'revenue' | 'lead';
  data: PulseRow[];
  color: string;
  compact: (v: number) => string;
}) {
  if (kind === 'revenue') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="dashRevFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            interval={3}
            tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.55 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.55 }}
            tickFormatter={(v: number) => compact(v).replace('₹', '')}
          />
          <Tooltip
            cursor={{ stroke: color, strokeOpacity: 0.3 }}
            formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Revenue']}
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
            stroke={color}
            strokeWidth={2}
            fill="url(#dashRevFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="currentColor"
          strokeOpacity={0.08}
        />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          interval={3}
          tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.55 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
          tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.55 }}
        />
        <Tooltip
          cursor={{ fill: 'currentColor', opacity: 0.05 }}
          formatter={(value: any) => [value, 'Leads']}
          contentStyle={{
            borderRadius: 8,
            fontSize: 12,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          }}
        />
        <Bar dataKey="leads" fill={color} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
