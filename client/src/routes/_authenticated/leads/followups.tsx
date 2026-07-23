// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@/lib/routerCompat';
import { toast } from '@/lib/toast';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Mail,
  MessageCircle,
  Phone,
  XCircle,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  adminGetLeadFollowups,
  adminUpdateLeadFollowupStatus,
  adminAiGenerateFollowupScript,
  type LeadFollowupRow,
  type LeadStatus,
} from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/leads/followups')({
  component: FollowUpsPage,
});

function displayDate(value?: string | null) {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = 500;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <span>{display}</span>;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'border-l-rose-500',
  high: 'border-l-orange-500',
  medium: 'border-l-blue-500',
  low: 'border-l-zinc-400',
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  whatsapp: ExternalLink,
  email: Mail,
  quote: TrendingUp,
  meeting: CalendarClock,
  other: MessageCircle,
};

function FollowUpCard({
  item,
  onComplete,
  onCancel,
}: {
  item: LeadFollowupRow;
  onComplete: (item: LeadFollowupRow, outcome: string, nextStatus?: LeadStatus) => void;
  onCancel: (item: LeadFollowupRow) => void;
}) {
  const [outcome, setOutcome] = useState('');
  const [nextStatus, setNextStatus] = useState<LeadStatus | ''>('');
  const [expanded, setExpanded] = useState(false);
  const overdue = new Date(item.follow_up_date).getTime() < Date.now();
  const priorityBorder = PRIORITY_COLORS[item.priority || 'medium'] || PRIORITY_COLORS.medium;
  const TypeIcon = TYPE_ICONS[item.follow_up_type] || MessageCircle;
  const { user } = useAuth();

  // AI Script State
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [aiScript, setAiScript] = useState<string | null>(null);

  const handleGenerateScript = async () => {
    if (!user?.session_token) return;
    setIsGeneratingScript(true);
    setAiScript(null);
    try {
      const auth = { email: user.email!, sessionToken: user.session_token! };
      const script = await adminAiGenerateFollowupScript({
        data: {
          auth,
          customerName: item.lead_name || 'Customer',
          followupType: item.follow_up_type,
          notes: item.notes || 'Follow up on inquiry',
        },
      });
      setAiScript(script);
      toast.success('Script generated!');
      setExpanded(true);
    } catch (err) {
      toast.error('Failed to generate script');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  return (
    <div
      className={`glass-card rounded-xl overflow-hidden border-l-[3px] ${priorityBorder} transition-all duration-200 hover:shadow-md`}
    >
      <div className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {item.lead_name?.[0]?.toUpperCase() || 'L'}
              </div>
              <h3 className="font-bold text-sm">{item.lead_name}</h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  overdue
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                    : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${overdue ? 'bg-rose-500 animate-pulse' : 'bg-blue-500'}`}
                />
                {item.status}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground capitalize">
                <TypeIcon className="w-2.5 h-2.5" />
                {item.follow_up_type}
              </span>
              {item.priority && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    item.priority === 'urgent' || item.priority === 'high'
                      ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {item.priority}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground ml-10">
              {item.destination || 'Open destination'} · Owner:{' '}
              {item.assigned_owner || 'Unassigned'}
            </p>
            <div className="mt-2 ml-10 flex flex-wrap gap-3 text-xs">
              {item.phone && (
                <a
                  href={`tel:${item.phone}`}
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Phone className="h-3 w-3" /> {item.phone}
                </a>
              )}
              {item.email && (
                <a
                  href={`mailto:${item.email}`}
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Mail className="h-3 w-3" /> {item.email}
                </a>
              )}
              <span
                className={`flex items-center gap-1 ${overdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-muted-foreground'}`}
              >
                <Clock className="h-3 w-3" /> {displayDate(item.follow_up_date)}
              </span>
            </div>

            {aiScript && (
              <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-md">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-primary uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" /> Generated Script
                </div>
                <p className="text-sm whitespace-pre-wrap">{aiScript}</p>
              </div>
            )}

            {item.notes && (
              <p className="mt-2.5 ml-10 rounded-lg bg-muted/50 p-2.5 text-xs border border-border/30">
                {item.notes}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
              <Link to="/leads">
                <MessageCircle className="mr-1.5 h-3 w-3" /> Open Lead
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Collapse' : 'Resolve'}
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-0 animate-slide-up">
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_160px_auto_auto] md:items-start">
              <Textarea
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                placeholder="Outcome: spoke to customer, sent quote, no answer..."
                className="min-h-16 text-xs border-border/40"
              />
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
                  onClick={handleGenerateScript}
                  disabled={isGeneratingScript}
                >
                  {isGeneratingScript ? (
                    <span className="animate-pulse">Generating...</span>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> AI Script
                    </>
                  )}
                </Button>
                <select
                  className="h-8 rounded-md border border-border/40 bg-background px-2.5 text-xs"
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value as any)}
                >
                  <option value="">Keep lead status</option>
                  <option value="contacted">contacted</option>
                  <option value="quote_sent">quote sent</option>
                  <option value="qualified">qualified</option>
                  <option value="converted">converted</option>
                  <option value="lost">lost</option>
                </select>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs shadow-sm"
                onClick={() => onComplete(item, outcome, nextStatus || undefined)}
              >
                <CheckCircle2 className="mr-1.5 h-3 w-3" /> Complete
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => onCancel(item)}
              >
                <XCircle className="mr-1.5 h-3 w-3" /> Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FollowUpsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<LeadFollowupRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  async function load() {
    if (!auth) return;
    setLoading(true);
    try {
      setItems(await adminGetLeadFollowups({ data: { auth, status: statusFilter } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [user?.session_token, statusFilter]);

  const grouped = useMemo(() => {
    const now = new Date();
    return {
      overdue: items.filter(
        (item) =>
          item.status === 'pending' &&
          new Date(item.follow_up_date).getTime() < now.getTime() &&
          !isSameDay(new Date(item.follow_up_date), now),
      ),
      today: items.filter(
        (item) => item.status === 'pending' && isSameDay(new Date(item.follow_up_date), now),
      ),
      upcoming: items.filter(
        (item) =>
          item.status === 'pending' &&
          new Date(item.follow_up_date).getTime() > now.getTime() &&
          !isSameDay(new Date(item.follow_up_date), now),
      ),
      closed: items.filter((item) => item.status !== 'pending'),
    };
  }, [items]);

  async function complete(item: LeadFollowupRow, outcome: string, nextStatus?: LeadStatus) {
    if (!auth) return;
    try {
      await adminUpdateLeadFollowupStatus({
        data: {
          auth,
          id: item.id,
          status: 'completed',
          outcome: outcome || 'Completed',
          updateLeadStatus: nextStatus,
        },
      });
      toast.success('Follow-up completed');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not complete follow-up');
    }
  }

  async function cancel(item: LeadFollowupRow) {
    if (!auth) return;
    try {
      await adminUpdateLeadFollowupStatus({
        data: { auth, id: item.id, status: 'cancelled', outcome: 'Cancelled' },
      });
      toast.success('Follow-up cancelled');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel follow-up');
    }
  }

  const sections = [
    {
      key: 'overdue',
      title: 'Overdue',
      icon: AlertTriangle,
      rows: grouped.overdue,
      color: 'text-rose-600 dark:text-rose-400',
      dotColor: 'bg-rose-500',
    },
    {
      key: 'today',
      title: 'Due Today',
      icon: Sparkles,
      rows: grouped.today,
      color: 'text-amber-600 dark:text-amber-400',
      dotColor: 'bg-amber-500',
    },
    {
      key: 'upcoming',
      title: 'Upcoming',
      icon: CalendarClock,
      rows: grouped.upcoming,
      color: 'text-blue-600 dark:text-blue-400',
      dotColor: 'bg-blue-500',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
              <Link to="/leads">
                <ArrowLeft className="mr-1.5 h-3 w-3" /> Leads
              </Link>
            </Button>
          </div>
          <div />
        </div>
        <select
          className="h-9 rounded-md border border-border/50 bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as any)}
        >
          <option value="pending">Pending only</option>
          <option value="all">All follow-ups</option>
        </select>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Overdue
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
            <AnimatedCounter value={grouped.overdue.length} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Today
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={grouped.today.length} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Upcoming
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <CalendarClock className="w-3.5 h-3.5 text-blue-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={grouped.upcoming.length} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '180ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Resolved
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={grouped.closed.length} />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Loading follow-ups...
        </div>
      )}

      {/* Timeline Sections */}
      <div className="relative">
        {/* Vertical timeline connector */}
        <div className="absolute left-[17px] top-2 bottom-2 w-px bg-border/50 hidden md:block" />

        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.key} className="mb-8 last:mb-0">
              <div className="flex items-center gap-3 mb-3 relative">
                <div
                  className={`w-9 h-9 rounded-xl ${section.rows.length > 0 ? 'bg-gradient-to-br from-primary/15 to-primary/5' : 'bg-muted/50'} flex items-center justify-center z-10`}
                >
                  <Icon
                    className={`h-4 w-4 ${section.rows.length > 0 ? section.color : 'text-muted-foreground/40'}`}
                  />
                </div>
                <h3
                  className={`font-bold text-sm ${section.rows.length > 0 ? '' : 'text-muted-foreground/60'}`}
                >
                  {section.title}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    section.rows.length > 0
                      ? `${section.color.replace('text-', 'bg-').split(' ')[0].replace('bg-', 'bg-')}/10 ${section.color}`
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${section.rows.length > 0 ? section.dotColor : 'bg-muted-foreground/30'}`}
                  />
                  {section.rows.length}
                </span>
              </div>
              <div className="grid gap-3 md:ml-12">
                {section.rows.map((item, idx) => (
                  <div
                    key={item.id}
                    className="animate-slide-up"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <FollowUpCard item={item} onComplete={complete} onCancel={cancel} />
                  </div>
                ))}
                {!loading && section.rows.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 p-6 text-center text-xs text-muted-foreground">
                    Nothing in {section.title.toLowerCase()}.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Closed */}
      {statusFilter === 'all' && grouped.closed.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Completed / Cancelled
          </h3>
          {grouped.closed.slice(0, 30).map((item) => (
            <div key={item.id} className="glass-card rounded-lg p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                    {item.lead_name?.[0]?.toUpperCase()}
                  </div>
                  <span className="font-semibold">{item.lead_name}</span>
                  <span className="text-muted-foreground">· {item.destination || 'Open'}</span>
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    item.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground ml-8">
                {displayDate(item.follow_up_date)} ·{' '}
                {item.outcome || item.notes || 'No outcome recorded'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
