// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute, Link } from '@/lib/routerCompat';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  LifeBuoy,
  Megaphone,
  MessageSquareText,
  Package,
  Phone,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import {
  adminGetSoloOpsBrief,
  adminAiCopilot,
  SoloOpsBrief,
  SoloOpsMode,
} from '@/lib/api/db.functions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';

export const Route = createFileRoute('/_authenticated/command-center')({
  component: CommandCenter,
});

const MODES: Array<{
  id: SoloOpsMode;
  label: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  active: string;
}> = [
  {
    id: 'sales',
    label: 'Sales',
    description: 'Close enquiries, qualify leads, beat price objections.',
    icon: TrendingUp,
    accent: 'text-blue-500 bg-blue-500/10',
    active: 'border-blue-500/50 bg-blue-500/10',
  },
  {
    id: 'product',
    label: 'Product',
    description: 'Sharpen packages, inclusions, and positioning.',
    icon: Package,
    accent: 'text-violet-500 bg-violet-500/10',
    active: 'border-violet-500/50 bg-violet-500/10',
  },
  {
    id: 'support',
    label: 'Support',
    description: 'Resolve booking, vendor, refund, and trip issues.',
    icon: LifeBuoy,
    accent: 'text-emerald-500 bg-emerald-500/10',
    active: 'border-emerald-500/50 bg-emerald-500/10',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Turn questions into campaigns and follow-ups.',
    icon: Megaphone,
    accent: 'text-orange-500 bg-orange-500/10',
    active: 'border-orange-500/50 bg-orange-500/10',
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Protect margin, deposits, and refund exposure.',
    icon: Wallet,
    accent: 'text-amber-500 bg-amber-500/10',
    active: 'border-amber-500/50 bg-amber-500/10',
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Owners, statuses, next actions, and checklists.',
    icon: Shield,
    accent: 'text-rose-500 bg-rose-500/10',
    active: 'border-rose-500/50 bg-rose-500/10',
  },
];

const QUICK_QUESTIONS: Record<SoloOpsMode, string[]> = {
  sales: [
    'Lead found a cheaper quote online for the exact same hotel. How to handle this?',
    'Honeymoon couple wants Maldives but budget is too low. How do I pivot them to Bali?',
    'Lead has gone silent after receiving the quote. Draft a re-engagement message.',
  ],
  product: [
    'Which inclusions should a premium 5N Bali package highlight to justify the price?',
    'Client is traveling with elderly parents and wants a relaxed itinerary. What do I change?',
    'Turn our top FAQs into package page copy.',
  ],
  support: [
    "Customer's visa got rejected and they want a full refund 5 days before travel.",
    "Vendor is unresponsive about tomorrow's airport transfer. What do I tell the customer?",
    "Guest says the hotel room doesn't match photos. Draft the response and action plan.",
  ],
  marketing: [
    'What should I post today to generate high-intent luxury package enquiries?',
    'Draft a WhatsApp broadcast for our monsoon Kerala offer.',
    'Write a re-engagement campaign for leads lost in the last 90 days.',
  ],
  finance: [
    'Customer wants a 20% discount. How do I protect margin without losing the deal?',
    'How should I structure deposits for a ₹4L group booking?',
    'A refund and a vendor penalty overlap on one booking — walk me through the maths.',
  ],
  admin: [
    'Give me a daily operating checklist for running the agency solo.',
    'Which leads should I prioritise this morning and why?',
    'Draft an escalation note for stale refunds and pending callbacks.',
  ],
};

function money(value: number) {
  return `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
}

const LEAD_STATUS_STYLE: Record<string, string> = {
  new: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  contacted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  quote_sent: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  qualified: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  converted: 'bg-green-500/10 text-green-600 dark:text-green-400',
  lost: 'bg-muted text-muted-foreground',
};

function CommandCenter() {
  const { user } = useAuth();
  const [brief, setBrief] = useState<SoloOpsBrief | null>(null);
  const [mode, setMode] = useState<SoloOpsMode>('sales');
  const [question, setQuestion] = useState(QUICK_QUESTIONS.sales[0]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadBrief() {
    if (!user?.session_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminGetSoloOpsBrief({
        data: { adminEmail: user.email, sessionToken: user.session_token },
      });
      setBrief(res.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load command center');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBrief();
  }, [user?.session_token]);

  const [answer, setAnswer] = useState<{ customerReply: string; internalActions: string[] } | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    if (!user?.session_token || !question.trim()) return;
    setIsGenerating(true);
    try {
      const res = await adminAiCopilot({
        data: { adminEmail: user.email, sessionToken: user.session_token, question, mode },
      });
      setAnswer({ customerReply: res.customerReply, internalActions: res.internalActions || [] });
    } catch (e: any) {
      toast.error('Failed to generate response: ' + e.message);
    } finally {
      setIsGenerating(false);
    }
  }

  const filteredPackages = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = brief?.packages || [];
    if (!needle) return rows.slice(0, 6);
    return rows
      .filter((pkg) =>
        [pkg.name, pkg.destination, pkg.country, pkg.category, ...pkg.themes].some((item) =>
          item.toLowerCase().includes(needle),
        ),
      )
      .slice(0, 6);
  }, [brief, search]);

  async function copyReply() {
    if (!answer) return;
    await navigator.clipboard.writeText(answer.customerReply);
    toast.success('Reply copied to clipboard');
  }

  function injectLeadContext(lead: {
    name: string;
    destination: string | null;
    budget_range: string | null;
    status: string;
  }) {
    setQuestion((current) => {
      const context = `Context — lead: ${lead.name}, destination: ${lead.destination || 'open'}, budget: ${lead.budget_range || 'unknown'}, status: ${lead.status}.\n\n`;
      const stripped = current.replace(/^Context — lead:.*\n\n/, '');
      return context + stripped;
    });
    toast.success(`Added ${lead.name} as context — now ask your question`);
  }

  const activeMode = MODES.find((m) => m.id === mode)!;

  const metricTiles = [
    {
      label: 'Pending Leads',
      value: brief?.counts.pendingLeads || 0,
      to: '/leads',
      icon: Phone,
      accent: 'text-blue-500 bg-blue-500/10',
    },
    {
      label: 'Live Packages',
      value: brief?.counts.activePackages || 0,
      to: '/packages',
      icon: Package,
      accent: 'text-violet-500 bg-violet-500/10',
    },
    {
      label: 'Bookings',
      value: brief?.counts.bookings || 0,
      to: '/bookings/all',
      icon: Wallet,
      accent: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      label: 'Callbacks',
      value: brief?.counts.callbacks || 0,
      to: '/leads',
      icon: Phone,
      accent: 'text-amber-500 bg-amber-500/10',
    },
    {
      label: 'Vendors',
      value: brief?.counts.approvedVendors || 0,
      to: '/vendors',
      icon: Shield,
      accent: 'text-sky-500 bg-sky-500/10',
    },
    {
      label: 'Avg Package',
      value: money(brief?.finance.averagePackagePrice || 0),
      to: '/ppm/analytics',
      icon: TrendingUp,
      accent: 'text-rose-500 bg-rose-500/10',
    },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ─── Hero ─── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-violet-500/5 to-transparent p-6 animate-slide-up">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div />
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={loadBrief}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            Context
          </Button>
        </div>

        {/* Clickable metric tiles */}
        <div className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {metricTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.label}
                to={tile.to as any}
                className="group rounded-xl border border-border/50 bg-card/70 p-3 backdrop-blur-sm transition-all hover:shadow-md hover:border-primary/30"
              >
                <div
                  className={`mb-2 flex h-7 w-7 items-center justify-center rounded-lg ${tile.accent}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="truncate text-lg font-bold leading-none">{tile.value}</div>
                <div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {tile.label}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* ─── Left: Answer Builder ─── */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-5 animate-slide-up">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <MessageSquareText className="h-4 w-4 text-primary" /> Answer Builder
            </h3>

            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {MODES.map((item) => {
                const Icon = item.icon;
                const isActive = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setMode(item.id);
                      setQuestion(QUICK_QUESTIONS[item.id][0]);
                    }}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      isActive
                        ? item.active
                        : 'border-border/40 hover:border-border hover:bg-muted/40'
                    }`}
                  >
                    <div
                      className={`mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg ${item.accent}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="text-xs font-bold">{item.label}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                      {item.description}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Question */}
            <div className="mt-4 space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Customer question or internal problem —{' '}
                <span className="capitalize text-foreground">{activeMode.label} mode</span>
              </label>
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="min-h-24 bg-background"
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS[mode].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuestion(item)}
                    className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {item.length > 64 ? item.slice(0, 64) + '…' : item}
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <Button onClick={handleGenerate} disabled={isGenerating} className="shadow-sm">
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isGenerating ? 'Maya is thinking...' : 'Generate Response'}
                </Button>
              </div>
            </div>
          </div>

          {/* Answer */}
          <div
            className="glass-card rounded-xl p-5 animate-slide-up"
            style={{ animationDelay: '40ms' }}
          >
            <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
              <div className="rounded-xl border border-border/40 bg-background p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">Ready-to-send reply</p>
                    <p className="text-[11px] text-muted-foreground">
                      Grounded in your live packages & leads
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={copyReply}
                      disabled={!answer}
                    >
                      <Clipboard className="mr-1.5 h-3.5 w-3.5" /> Copy
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 bg-green-600 text-xs text-white hover:bg-green-700"
                      disabled={!answer}
                      asChild={!!answer}
                    >
                      {answer ? (
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(answer.customerReply)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                        </a>
                      ) : (
                        <span>
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5 inline" /> WhatsApp
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-xs">Reading your CRM context and drafting…</p>
                  </div>
                ) : answer ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-6">
                    {answer.customerReply}
                  </pre>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                    <Sparkles className="h-6 w-6 opacity-40" />
                    <p className="text-xs">
                      Pick a mode, type your scenario, and hit Generate — the reply lands here.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                <p className="text-sm font-bold">Internal next actions</p>
                <div className="mt-3 space-y-2.5">
                  {(answer?.internalActions || []).length === 0 ? (
                    <p className="text-[11px] italic text-muted-foreground">
                      Maya lists what YOU should do internally — tasks, checks, and follow-ups.
                    </p>
                  ) : (
                    answer!.internalActions.map((item) => (
                      <div key={item} className="flex gap-2 text-xs leading-5">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right: Live Context ─── */}
        <div className="space-y-4">
          {/* Hot leads */}
          <div className="glass-card rounded-xl p-4 animate-slide-up">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-primary" /> Latest Leads
              </h3>
              <Badge variant="outline" className="text-[10px]">
                Tap to use as context
              </Badge>
            </div>
            <div className="space-y-1.5">
              {(brief?.leads || []).slice(0, 5).map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => injectLeadContext(lead)}
                  className="w-full rounded-lg border border-border/40 bg-muted/10 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold">{lead.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold capitalize ${LEAD_STATUS_STYLE[lead.status] || LEAD_STATUS_STYLE.new}`}
                    >
                      {lead.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {lead.destination || 'Open destination'} · {lead.budget_range || 'Budget TBD'}
                  </p>
                </button>
              ))}
              {!loading && (brief?.leads || []).length === 0 && (
                <p className="py-4 text-center text-[11px] italic text-muted-foreground">
                  No leads yet.
                </p>
              )}
            </div>
          </div>

          {/* Package context */}
          <div
            className="glass-card rounded-xl p-4 animate-slide-up"
            style={{ animationDelay: '40ms' }}
          >
            <h3 className="mb-3 text-sm font-bold flex items-center gap-2">
              <Package className="h-3.5 w-3.5 text-primary" /> Live Package Context
            </h3>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search packages"
                className="pl-9 h-9"
              />
            </div>
            <div className="space-y-1.5">
              {filteredPackages.map((pkg) => (
                <div key={pkg.id} className="rounded-lg border border-border/40 bg-muted/10 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{pkg.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {pkg.destination} · {pkg.days}D/{pkg.nights}N · {money(pkg.price)}
                      </p>
                    </div>
                    <Badge
                      variant={pkg.is_active ? 'default' : 'outline'}
                      className="shrink-0 text-[9px]"
                    >
                      {pkg.is_active ? 'Live' : 'Hidden'}
                    </Badge>
                  </div>
                </div>
              ))}
              {!loading && filteredPackages.length === 0 && (
                <p className="py-3 text-center text-[11px] text-muted-foreground">
                  No package match.
                </p>
              )}
            </div>
          </div>

          {/* Playbook */}
          <div
            className="glass-card rounded-xl p-4 animate-slide-up"
            style={{ animationDelay: '80ms' }}
          >
            <h3 className="mb-3 text-sm font-bold flex items-center gap-2">
              <activeMode.icon className="h-3.5 w-3.5 text-primary" />
              <span className="capitalize">{activeMode.label}</span> Playbook
            </h3>
            <div className="space-y-2">
              {(brief?.playbooks?.[mode] || []).map((item, idx) => (
                <div
                  key={item}
                  className="flex gap-2.5 rounded-lg border border-border/40 bg-background p-2.5 text-xs leading-5"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {idx + 1}
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
