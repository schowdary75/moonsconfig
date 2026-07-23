// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useMemo, useState, useRef } from 'react';
import { createFileRoute, Link } from '@/lib/routerCompat';
import { toast } from '@/lib/toast';
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Lock,
  Mail,
  MessageSquare,
  FileText,
  IndianRupee,
  Phone,
  PhoneCall,
  Plus,
  Search,
  Send,
  Sparkles,
  UserRound,
  X,
  TrendingUp,
  Users,
  ArrowRight,
  ExternalLink,
  Mic,
} from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePagination, DataTablePagination } from '@/components/ui/data-table-pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminCreateLead,
  adminCreateLeadFollowup,
  adminGetInquiries,
  adminGetLeadAssignees,
  adminGetLeadCrmBoard,
  adminUpdateCallbackStatus,
  adminUpdateLeadDetails,
  type AdminInquiriesResponse,
  type LeadFollowupRow,
  type LeadFollowupType,
  type LeadStatus,
  type LeadSubmissionRow,
  adminAiAnalyzeLeadPriority,
  triggerAILeadWorkerManually,
  adminUploadLeadAudio,
  triggerMayaAudioProcessing,
} from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/leads/')({
  component: LeadsPage,
});

const statuses: LeadStatus[] = ['new', 'contacted', 'quote_sent', 'qualified', 'converted', 'lost'];
const priorities = ['low', 'medium', 'high', 'urgent'] as const;
const followupTypes: LeadFollowupType[] = [
  'call',
  'whatsapp',
  'email',
  'quote',
  'meeting',
  'other',
];

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ElementType; dotColor: string }
> = {
  new: {
    label: 'New',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    icon: Sparkles,
    dotColor: 'bg-rose-500',
  },
  contacted: {
    label: 'Contacted',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    icon: PhoneCall,
    dotColor: 'bg-blue-500',
  },
  quote_sent: {
    label: 'Quote Sent',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    icon: Send,
    dotColor: 'bg-amber-500',
  },
  qualified: {
    label: 'Qualified',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    icon: CheckCircle2,
    dotColor: 'bg-emerald-500',
  },
  converted: {
    label: 'Converted',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-950/40',
    icon: TrendingUp,
    dotColor: 'bg-green-500',
  },
  lost: {
    label: 'Lost',
    color: 'text-zinc-500 dark:text-zinc-400',
    bg: 'bg-zinc-100 dark:bg-zinc-800/40',
    icon: X,
    dotColor: 'bg-zinc-400',
  },
};

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function displayDate(value?: string | null) {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function priorityBadge(priority?: string | null) {
  if (priority === 'urgent') return 'destructive';
  if (priority === 'high') return 'destructive';
  return 'secondary';
}

function getBannerStatus(status: string) {
  if (status === 'new') return 'Lead Created';
  if (status === 'contacted') return 'Initiated (Probe)';
  if (status === 'quote_sent') return 'Quote Sent';
  if (status === 'qualified') return 'Completed (Probe)';
  return 'All';
}

function AnimatedCounter({ value, prefix = '' }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = 600;
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

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.color} ${config.bg} transition-all`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${config.dotColor} ${status === 'new' ? 'animate-pulse' : ''}`}
      />
      {config.label}
    </span>
  );
}

const emptyLeadForm = {
  name: '',
  phone: '',
  email: '',
  destination: '',
  travelMonth: '',
  travelersCount: 2,
  budgetRange: '',
  notes: '',
  leadSource: 'manual',
  priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
  assignedOwner: '',
  nextFollowUpAt: '',
  followUpNotes: '',
};

function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<LeadSubmissionRow[]>([]);
  const [followups, setFollowups] = useState<LeadFollowupRow[]>([]);
  const [assignees, setAssignees] = useState<
    Array<{ id: number; name: string | null; email: string; mobile: string | null; role: string }>
  >([]);
  const [inquiries, setInquiries] = useState<AdminInquiriesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  const [leadForm, setLeadForm] = useState(emptyLeadForm);
  const [editNotes, setEditNotes] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editAiMode, setEditAiMode] = useState<'autonomous' | 'requires_approval'>('autonomous');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [schedule, setSchedule] = useState({
    followUpDate: '',
    followUpType: 'call' as LeadFollowupType,
    channel: 'phone',
    notes: '',
  });
  const [callMade, setCallMade] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [showCallOutcomeModal, setShowCallOutcomeModal] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState<any>(null);

  // AI Triage State
  const [isAiTriaging, setIsAiTriaging] = useState(false);
  const [aiTriageResult, setAiTriageResult] = useState<any>(null);

  // Audio Upload State
  const [isAudioProcessing, setIsAudioProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAudioUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file || !auth || !selected) return;

    setIsAudioProcessing(true);
    toast.info('Uploading audio file...');

    try {
      // 1. Read file as base64 (Browser compatible)
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      );

      // 2. Upload to local server
      const uploadRes = await adminUploadLeadAudio({
        data: {
          auth,
          leadId: selected.id,
          mimeType: file.type as any,
          base64,
        },
      });

      toast.success('Audio uploaded! Maya is listening...');

      // 3. Trigger Gemini Audio Processing
      await triggerMayaAudioProcessing({
        data: {
          auth,
          leadId: selected.id,
          absolutePath: uploadRes.absolutePath,
          mimeType: file.type,
        },
      });

      toast.success('Maya has finished processing the call!');
      setTimeout(() => load(), 2000);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to process audio');
    } finally {
      setIsAudioProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAiTriage = async () => {
    if (!selected || !auth) return;
    setIsAiTriaging(true);
    setAiTriageResult(null);
    try {
      const res = await adminAiAnalyzeLeadPriority({
        data: {
          auth,
          leadName: selected.name,
          inquiryMessage: selected.notes || selected.destination || 'No message provided',
        },
      });
      setAiTriageResult(res);
      toast.success('AI Triage Complete!');
    } catch (err) {
      toast.error('AI Triage failed');
    } finally {
      setIsAiTriaging(false);
    }
  };

  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  async function load() {
    if (!auth) return;
    setLoading(true);
    try {
      const [board, inquiryRows] = await Promise.all([
        adminGetLeadCrmBoard({ data: { auth } }),
        adminGetInquiries({ data: { auth } }),
      ]);
      const staffRows = await adminGetLeadAssignees({ data: { auth } });
      setLeads(board.leads || []);
      setFollowups(board.followups || []);
      setAssignees(staffRows || []);
      setInquiries(inquiryRows);
      const current = selectedId && board.leads.find((lead) => lead.id === selectedId);
      const nextLead = current || board.leads[0] || null;
      setSelectedId(nextLead?.id || null);
      if (nextLead) {
        setEditNotes(nextLead.admin_notes || '');
        setEditOwner(
          nextLead.assigned_owner || staffRows[0]?.name || user?.name || user?.email || '',
        );
        setEditAiMode(nextLead.ai_mode || 'autonomous');
        setEditPriority((nextLead.priority as any) || 'medium');
        setCallMade(nextLead.status !== 'new');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [user?.session_token]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchesQuery =
        !needle ||
        [
          lead.name,
          lead.email,
          lead.phone,
          lead.destination,
          lead.budget_range,
          lead.status,
          lead.lead_source,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      return matchesStatus && matchesQuery;
    });
  }, [leads, query, statusFilter]);

  const { currentPage, totalPages, setCurrentPage, paginatedItems } = usePagination(filtered, 20);

  const selected = leads.find((lead) => lead.id === selectedId) || null;
  const selectedFollowups = followups.filter((item) => item.lead_id === selectedId);
  const openCount = leads.filter((lead) =>
    ['new', 'contacted', 'quote_sent', 'qualified'].includes(lead.status),
  ).length;
  const overdueCount = followups.filter(
    (item) => new Date(item.follow_up_date).getTime() < Date.now(),
  ).length;
  const conversionRate =
    leads.length > 0
      ? Math.round((leads.filter((l) => l.status === 'converted').length / leads.length) * 100)
      : 0;

  function selectLead(lead: LeadSubmissionRow) {
    setSelectedId(lead.id);
    setEditNotes(lead.admin_notes || '');
    setEditOwner(lead.assigned_owner || assignees[0]?.name || user?.name || user?.email || '');
    setEditAiMode(lead.ai_mode || 'autonomous');
    setEditPriority((lead.priority as any) || 'medium');
    setSchedule({
      followUpDate: toLocalInput(lead.next_follow_up_at),
      followUpType: 'call',
      channel: 'phone',
      notes: '',
    });
    setCallMade(lead.status !== 'new');
  }

  async function createLead() {
    if (!auth || !leadForm.name.trim() || !leadForm.phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    setSaving(true);
    try {
      const result = await adminCreateLead({ data: { auth, ...leadForm } });
      toast.success('Lead created & auto-assigned');
      setLeadForm(emptyLeadForm);
      setShowNewLead(false);
      setSelectedId(result.id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create lead');
    } finally {
      setSaving(false);
    }
  }

  async function updateSelected(fields: Partial<LeadSubmissionRow> & { status?: LeadStatus }) {
    if (!auth || !selected) return;
    setSaving(true);
    try {
      await adminUpdateLeadDetails({
        data: {
          auth,
          id: selected.id,
          status: fields.status || selected.status,
          adminNotes: editNotes,
          assignedOwner: editOwner,
          priority: editPriority,
          aiMode: editAiMode,
          aiManaged: editOwner === '🤖 Maya (AI Auto-Pilot)',
        },
      });
      toast.success('Lead updated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update lead');
    } finally {
      setSaving(false);
    }
  }

  function handleMakeCall() {
    if (!selected) return;
    window.open(`tel:${selected.phone}`, '_self');
    if (selected.status === 'new') {
      setShowCallOutcomeModal(true);
    } else {
      setCallMade(true);
      toast.success('Call initiated');
    }
  }

  async function handleTriggerMaya() {
    try {
      toast.info('Waking up Maya...');
      await triggerAILeadWorkerManually({ data: { auth: auth! } });
      toast.success('Maya has finished her checks! Refreshing board...');
      setTimeout(() => load(), 1500);
    } catch (e) {
      toast.error('Failed to trigger Maya');
    }
  }

  async function handleStatusChange(newStatus: LeadStatus) {
    if (!selected) return;
    // Call-gating: must call before marking contacted
    if (newStatus === 'contacted' && selected.status === 'new' && !callMade) {
      toast.error('You must make a call before marking as Contacted');
      return;
    }
    await updateSelected({ status: newStatus });
  }

  async function addFollowup() {
    if (!auth || !selected || !schedule.followUpDate) {
      toast.error('Choose a follow-up date and time');
      return;
    }
    setSaving(true);
    try {
      await adminCreateLeadFollowup({
        data: {
          auth,
          leadId: selected.id,
          followUpDate: schedule.followUpDate,
          followUpType: schedule.followUpType,
          channel: schedule.channel,
          notes: schedule.notes,
        },
      });
      toast.success('Follow-up scheduled');
      setSchedule({ followUpDate: '', followUpType: 'call', channel: 'phone', notes: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not schedule follow-up');
    } finally {
      setSaving(false);
    }
  }

  async function markCallbackCalled(id: number) {
    await adminUpdateCallbackStatus({ data: { id, status: 'called' } });
    toast.success('Callback marked called');
    await load();
  }

  // Pipeline step index for visual stepper
  const pipelineOrder = ['new', 'contacted', 'quote_sent', 'qualified', 'converted'];
  const selectedStepIdx = selected ? pipelineOrder.indexOf(selected.status) : -1;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div />
        <div className="flex gap-2">
          <Button
            variant="outline"
            asChild
            className="h-9 text-xs font-semibold border-border/60 hover:bg-muted/80"
          >
            <Link to="/leads/followups">
              <CalendarClock className="mr-2 h-3.5 w-3.5" /> Follow-ups
            </Link>
          </Button>
          <Button
            onClick={() => setShowNewLead((value) => !value)}
            className="h-9 text-xs font-semibold shadow-sm"
          >
            <Plus className="mr-2 h-3.5 w-3.5" /> New Lead
          </Button>
        </div>
      </div>

      {/* ─── Metric Cards ─── */}
      <div className="grid gap-3 md:grid-cols-4">
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Leads
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-blue-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={leads.length} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Active Pipeline
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={openCount} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Conversion Rate
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={conversionRate} />%
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '180ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Overdue
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-rose-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
            <AnimatedCounter value={overdueCount} />
          </div>
        </div>
      </div>

      {/* ─── Pipeline Chips ─── */}
      <div className="flex gap-2 overflow-x-auto pb-1 w-full">
        <button
          onClick={() => setStatusFilter('all')}
          className={`pipeline-chip flex-1 min-w-[100px] ${statusFilter === 'all' ? 'active' : ''}`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
            All
          </div>
          <div className="text-lg font-bold">{leads.length}</div>
        </button>
        {statuses.map((status) => {
          const config = STATUS_CONFIG[status];
          const count = leads.filter((l) => l.status === status).length;
          const Icon = config.icon;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`pipeline-chip chip-${status} flex-1 min-w-[120px] ${statusFilter === status ? 'active' : ''}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon className={`w-3 h-3 ${config.color}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
                  {config.label}
                </span>
              </div>
              <div className="text-lg font-bold">{count}</div>
            </button>
          );
        })}
      </div>

      {/* ─── New Lead Form ─── */}
      {showNewLead && (
        <div className="glass-card rounded-xl p-5 animate-scale-in">
          <div className="mb-3 flex items-center gap-2 font-semibold text-sm">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserRound className="h-3.5 w-3.5 text-primary" />
            </div>
            Onboard Lead
            <Badge variant="outline" className="text-[10px] ml-auto">
              Auto-assigns to sales team
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Name *"
              value={leadForm.name}
              onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
              className="border-border/50 focus:ring-2 focus:ring-primary"
            />
            <Input
              placeholder="Phone *"
              value={leadForm.phone}
              onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
              className="border-border/50 focus:ring-2 focus:ring-primary"
            />
            <Input
              placeholder="Email"
              value={leadForm.email}
              onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
              className="border-border/50"
            />
            <Input
              placeholder="Destination"
              value={leadForm.destination}
              onChange={(e) => setLeadForm({ ...leadForm, destination: e.target.value })}
              className="border-border/50"
            />
            <Input
              placeholder="Travel month"
              value={leadForm.travelMonth}
              onChange={(e) => setLeadForm({ ...leadForm, travelMonth: e.target.value })}
              className="border-border/50"
            />
            <Input
              type="number"
              placeholder="Travellers"
              value={leadForm.travelersCount}
              onChange={(e) => setLeadForm({ ...leadForm, travelersCount: Number(e.target.value) })}
              className="border-border/50"
            />
            <Input
              placeholder="Budget range"
              value={leadForm.budgetRange}
              onChange={(e) => setLeadForm({ ...leadForm, budgetRange: e.target.value })}
              className="border-border/50"
            />
            <select
              className="h-9 rounded-md border border-border/50 bg-background px-3 text-sm"
              value={leadForm.priority}
              onChange={(e) => setLeadForm({ ...leadForm, priority: e.target.value as any })}
            >
              {priorities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <Input
              placeholder="Source: website/meta/whatsapp"
              value={leadForm.leadSource}
              onChange={(e) => setLeadForm({ ...leadForm, leadSource: e.target.value })}
              className="border-border/50"
            />
            <select
              className="h-9 rounded-md border border-border/50 bg-background px-3 text-sm"
              value={leadForm.assignedOwner}
              onChange={(e) => setLeadForm({ ...leadForm, assignedOwner: e.target.value })}
            >
              <option value="">Auto-assign (sales team)</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.name || person.email}>
                  {person.name || person.email} - {person.role}
                  {person.mobile ? ` - ${person.mobile}` : ''}
                </option>
              ))}
            </select>
            <Input
              type="datetime-local"
              value={leadForm.nextFollowUpAt}
              onChange={(e) => setLeadForm({ ...leadForm, nextFollowUpAt: e.target.value })}
              className="border-border/50"
            />
            <Input
              placeholder="Follow-up note"
              value={leadForm.followUpNotes}
              onChange={(e) => setLeadForm({ ...leadForm, followUpNotes: e.target.value })}
              className="border-border/50"
            />
          </div>
          <Textarea
            className="mt-3 border-border/50"
            placeholder="Requirement, source context, objection, quoted package..."
            value={leadForm.notes}
            onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewLead(false)} className="h-9 text-xs">
              Cancel
            </Button>
            <Button onClick={createLead} disabled={saving} className="h-9 text-xs shadow-sm">
              Create Lead
            </Button>
          </div>
        </div>
      )}

      {/* ─── Main Grid ─── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.9fr)]">
        {/* ─── Left: Table ─── */}
        <div className="space-y-3">
          <div className="flex flex-col gap-2 glass-card rounded-xl p-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 border-border/40 focus:ring-2 focus:ring-primary"
                placeholder="Search name, destination, phone, source..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-md border border-border/40 bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {STATUS_CONFIG[status]?.label || status}
                </option>
              ))}
            </select>
          </div>

          <div className="glass-card rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border/30">
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                    Lead
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                    Trip
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                    Owner
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                    Next Follow-up
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />{' '}
                        Loading leads...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No leads found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedItems.map((lead, idx) => (
                    <TableRow
                      key={lead.id}
                      onClick={() => selectLead(lead)}
                      className={`cursor-pointer transition-all duration-150 animate-slide-up ${
                        lead.id === selectedId
                          ? 'bg-primary/5 dark:bg-primary/10 border-l-2 border-l-primary'
                          : 'hover:bg-muted/40 border-l-2 border-l-transparent'
                      }`}
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                            {lead.name?.[0]?.toUpperCase() || 'L'}
                          </div>
                          <div>
                            <div className="font-semibold text-sm">{lead.name}</div>
                            <div className="text-[11px] text-muted-foreground">{lead.phone}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge
                                variant={priorityBadge(lead.priority) as any}
                                className="text-[9px] px-1.5 py-0 h-4 capitalize"
                              >
                                {lead.priority || 'medium'}
                              </Badge>
                              {lead.theme && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] px-1.5 py-0 h-4 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800 capitalize"
                                >
                                  {lead.theme}
                                </Badge>
                              )}
                              {lead.lead_source && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 h-4 capitalize"
                                >
                                  {lead.lead_source}
                                </Badge>
                              )}
                              {lead.ai_managed && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20"
                                >
                                  <Sparkles className="w-2.5 h-2.5 mr-1" />
                                  AI Mode
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{lead.destination || 'Open'}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {lead.travel_month || 'Flexible'} · {lead.travelers_count || 2} pax ·{' '}
                          {lead.budget_range || 'TBD'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{lead.assigned_owner || 'Unassigned'}</div>
                      </TableCell>
                      <TableCell
                        className={`text-sm ${lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() < Date.now() ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-muted-foreground'}`}
                      >
                        {displayDate(lead.next_follow_up_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="p-4 border-t">
              <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>
        </div>

        {/* ─── Right: Detail Panel ─── */}
        <div className="space-y-4">
          {selected ? (
            <div className="glass-card rounded-xl overflow-hidden animate-slide-in-right">
              {/* Header with gradient */}
              <div className="relative px-5 pt-5 pb-4 border-b border-border/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/25 to-primary/5 flex items-center justify-center text-primary font-bold text-base shadow-sm">
                      {selected.name?.[0]?.toUpperCase() || 'L'}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{selected.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {selected.destination || 'Open destination'} ·{' '}
                        {selected.budget_range || 'Budget TBD'}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                {/* Contact Quick Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={callMade || selected.status !== 'new' ? 'outline' : 'default'}
                    className={`h-8 text-xs gap-1.5 ${!callMade && selected.status === 'new' ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm animate-glow' : ''}`}
                    onClick={handleMakeCall}
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    {callMade || selected.status !== 'new' ? 'Call Again' : 'Make Call'}
                  </Button>
                  {selected.email && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild>
                      <a href={`mailto:${selected.email}`}>
                        <Mail className="w-3.5 h-3.5" /> Email
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild>
                    <a
                      href={`https://wa.me/${selected.phone?.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 border-primary/30 hover:bg-primary/5 text-primary"
                    onClick={handleAiTriage}
                    disabled={isAiTriaging}
                  >
                    {isAiTriaging ? (
                      <span className="animate-pulse">Triaging...</span>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" /> AI Triage
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 border-primary/30 hover:bg-primary/5"
                    onClick={() => setShowBannerModal(true)}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> Send Banner
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 border-primary/50 bg-primary/10 hover:bg-primary/20 text-primary font-semibold"
                    onClick={handleTriggerMaya}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Wake Maya Up!
                  </Button>
                  <div className="relative">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="audio/*,video/webm"
                      className="hidden"
                      onChange={handleAudioUpload}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-8 text-xs gap-1.5 border-purple-500/50 hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 ${isAudioProcessing ? 'animate-pulse' : ''}`}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isAudioProcessing}
                    >
                      <Mic className="w-3.5 h-3.5" />{' '}
                      {isAudioProcessing ? 'Maya is listening...' : 'Upload Call Recording'}
                    </Button>
                  </div>
                  {selected.status !== 'new' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 border-amber-500/50 hover:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      asChild
                    >
                      <Link to="/quotes" search={{ leadId: selected.id }}>
                        <FileText className="w-3.5 h-3.5" /> Send Quote
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {aiTriageResult && (
                <div className="px-5 py-4 border-b border-border/30 bg-primary/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h4 className="font-bold text-sm text-primary">AI Triage Guardian</h4>
                  </div>
                  <div className="space-y-3">
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline" className="bg-background">
                        {aiTriageResult.urgency_score}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        <span className="font-semibold text-rose-500">Missing:</span>{' '}
                        {aiTriageResult.missing_info}
                      </span>
                    </div>
                    <div className="bg-background rounded-md p-3 border border-border/50 text-sm shadow-inner">
                      <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                        Suggested Reply Draft
                      </div>
                      <p className="whitespace-pre-wrap">{aiTriageResult.draft_reply}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Progression Bar */}
              <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
                <div className="flex items-center gap-1">
                  {pipelineOrder.map((step, idx) => {
                    const config = STATUS_CONFIG[step];
                    const isActive = idx <= selectedStepIdx;
                    const isCurrent = step === selected.status;
                    const isLocked = step === 'contacted' && selected.status === 'new' && !callMade;
                    return (
                      <div key={step} className="flex items-center flex-1">
                        <button
                          onClick={() => !isLocked && handleStatusChange(step as LeadStatus)}
                          disabled={isLocked || saving}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold w-full transition-all ${
                            isCurrent
                              ? `${config.bg} ${config.color} ring-1 ring-current/20`
                              : isActive
                                ? `${config.color} opacity-60`
                                : 'text-muted-foreground/40'
                          } ${isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-100 cursor-pointer'}`}
                          title={isLocked ? 'Make a call first' : `Set status to ${config.label}`}
                        >
                          {isLocked ? <Lock className="w-2.5 h-2.5" /> : null}
                          <span className="truncate">{config.label}</span>
                        </button>
                        {idx < pipelineOrder.length - 1 && (
                          <ArrowRight
                            className={`w-3 h-3 mx-0.5 flex-shrink-0 ${isActive ? 'text-primary/40' : 'text-muted-foreground/20'}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {selected.status === 'new' && !callMade && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Make a call to unlock the pipeline
                  </p>
                )}
                {selected.status === 'qualified' && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      size="sm"
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      onClick={() => handleStatusChange('converted')}
                      disabled={saving}
                    >
                      <IndianRupee className="w-4 h-4" /> Mark as Paid (Cash)
                    </Button>
                  </div>
                )}
              </div>

              {/* Lead Details */}
              <div className="px-5 py-4 space-y-4">
                <div className="grid gap-2 text-sm">
                  <a
                    className="flex items-center gap-2 text-primary hover:underline"
                    href={`tel:${selected.phone}`}
                  >
                    <Phone className="h-3.5 w-3.5" /> {selected.phone}
                  </a>
                  {selected.email && (
                    <a
                      className="flex items-center gap-2 text-primary hover:underline"
                      href={`mailto:${selected.email}`}
                    >
                      <Mail className="h-3.5 w-3.5" /> {selected.email}
                    </a>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Created {displayDate(selected.created_at)}
                  </div>
                </div>
                {selected.notes && (
                  <p className="rounded-lg bg-muted/50 p-3 text-sm border border-border/30">
                    {selected.notes}
                  </p>
                )}

                {/* Editable fields */}
                <div className="grid gap-3 pt-2 border-t border-border/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                        Priority
                      </label>
                      <select
                        className="h-8 w-full rounded-md border border-border/40 bg-background px-2.5 text-xs"
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as any)}
                      >
                        {priorities.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                        Owner
                      </label>
                      <select
                        className="h-8 w-full rounded-md border border-border/40 bg-background px-2.5 text-xs"
                        value={editOwner}
                        onChange={(e) => setEditOwner(e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        <option value="🤖 Maya (AI Auto-Pilot)">🤖 Maya (AI Auto-Pilot)</option>
                        {assignees.map((person) => (
                          <option key={person.id} value={person.name || person.email}>
                            {person.name || person.email} ({person.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {editOwner === '🤖 Maya (AI Auto-Pilot)' && (
                    <div className="bg-primary/5 border border-primary/20 p-3 rounded-md mb-2">
                      <label className="text-[11px] font-semibold text-primary flex items-center gap-1 mb-1.5 block">
                        <Sparkles className="w-3 h-3" /> AI Mode
                      </label>
                      <select
                        className="h-8 w-full rounded-md border border-primary/30 bg-background px-2.5 text-xs text-primary font-medium"
                        value={editAiMode}
                        onChange={(e) => setEditAiMode(e.target.value as any)}
                      >
                        <option value="autonomous">Fully Autonomous (Send automatically)</option>
                        <option value="requires_approval">
                          Drafts Only (Require manual approval)
                        </option>
                      </select>
                      <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
                        {editAiMode === 'autonomous'
                          ? 'Maya will automatically email/quote this lead when the time is right.'
                          : 'Maya will generate drafts and save them to internal notes for you to review.'}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                      Internal Notes
                    </label>
                    <Textarea
                      className="min-h-20 text-sm border-border/40"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Call notes, objection, proposal promise..."
                    />
                  </div>
                  <Button
                    onClick={() => updateSelected({})}
                    disabled={saving}
                    size="sm"
                    className="h-8 text-xs shadow-sm"
                  >
                    Save Changes
                  </Button>
                </div>

                {/* Schedule Follow-up */}
                <div className="pt-3 border-t border-border/30">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <CalendarClock className="h-3.5 w-3.5 text-primary" /> Schedule Follow-up
                  </div>
                  <div className="grid gap-2">
                    <Input
                      type="datetime-local"
                      className="h-8 text-xs border-border/40"
                      value={schedule.followUpDate}
                      onChange={(e) => setSchedule({ ...schedule, followUpDate: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="h-8 rounded-md border border-border/40 bg-background px-2.5 text-xs"
                        value={schedule.followUpType}
                        onChange={(e) =>
                          setSchedule({
                            ...schedule,
                            followUpType: e.target.value as LeadFollowupType,
                          })
                        }
                      >
                        {followupTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <Input
                        className="h-8 text-xs border-border/40"
                        placeholder="Channel"
                        value={schedule.channel}
                        onChange={(e) => setSchedule({ ...schedule, channel: e.target.value })}
                      />
                    </div>
                    <Textarea
                      className="text-xs border-border/40"
                      placeholder="What needs to happen?"
                      value={schedule.notes}
                      onChange={(e) => setSchedule({ ...schedule, notes: e.target.value })}
                    />
                    <Button
                      variant="outline"
                      onClick={addFollowup}
                      disabled={saving}
                      size="sm"
                      className="h-8 text-xs"
                    >
                      <Plus className="mr-1.5 h-3 w-3" /> Add Follow-up
                    </Button>
                  </div>
                </div>

                {/* Open Follow-ups */}
                <div className="pt-3 border-t border-border/30">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" /> Follow-ups (
                    {selectedFollowups.length})
                  </div>
                  <div className="space-y-2">
                    {selectedFollowups.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No pending follow-ups.</p>
                    ) : (
                      selectedFollowups.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border/30 p-2.5 text-xs bg-muted/20"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold capitalize">{item.follow_up_type}</span>
                            <span
                              className={`text-[10px] ${new Date(item.follow_up_date).getTime() < Date.now() ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-muted-foreground'}`}
                            >
                              {displayDate(item.follow_up_date)}
                            </span>
                          </div>
                          {item.notes && <p className="mt-1 text-muted-foreground">{item.notes}</p>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-xl p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-muted/50 mb-3 flex items-center justify-center">
                <Phone className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Select a lead to work it.</p>
            </div>
          )}

          {/* Callback Requests */}
          <div className="glass-card rounded-xl p-4">
            <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
              <PhoneCall className="h-3.5 w-3.5 text-primary" /> Callback Requests
            </h3>
            <div className="space-y-2">
              {(inquiries?.callbacks || []).slice(0, 5).map((callback) => (
                <div
                  key={callback.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/30 p-2.5 text-xs bg-muted/10"
                >
                  <div>
                    <div className="font-semibold">
                      {callback.name} · {callback.destination || 'General'}
                    </div>
                    <div className="text-muted-foreground">
                      {callback.phone} · {callback.status}
                    </div>
                  </div>
                  {callback.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => markCallbackCalled(callback.id)}
                    >
                      <CheckCircle2 className="mr-1.5 h-3 w-3" /> Called
                    </Button>
                  )}
                </div>
              ))}
              {(!inquiries || inquiries.callbacks.length === 0) && (
                <p className="text-xs text-muted-foreground italic">No callback requests yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Banner Modal ─── */}
      {showBannerModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8">
          <div className="bg-card w-full max-w-6xl h-full max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/30">
              <div>
                <h2 className="text-lg font-bold">Select WhatsApp Banner</h2>
                <p className="text-xs text-muted-foreground">
                  Filtered for {selected.name} (Status:{' '}
                  {STATUS_CONFIG[selected.status]?.label || selected.status})
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowBannerModal(false)}
                className="rounded-full hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 w-full bg-[#f3f4f6]">
              <iframe
                src={`/banners.html?status=${encodeURIComponent(getBannerStatus(selected.status))}&name=${encodeURIComponent(selected.name || '')}&phone=${encodeURIComponent(selected.phone || '')}&dest=${encodeURIComponent(selected.destination || '')}`}
                className="w-full h-full border-none"
                title="Send Banner"
              />
            </div>
          </div>
        </div>
      )}

      {/* Call Outcome Modal */}
      {showCallOutcomeModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
          <div className="bg-background w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-border/50 animate-in zoom-in-95">
            <div className="p-5 border-b border-border/40 flex justify-between items-center bg-muted/20">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-primary" />
                  Call Outcome
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Calling {selected.name} ({selected.phone})
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setShowCallOutcomeModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-5 space-y-4">
              <Button
                className="w-full justify-start h-12 bg-green-600 hover:bg-green-700 text-white font-medium"
                onClick={async () => {
                  setCallMade(true);
                  setShowCallOutcomeModal(false);
                  await updateSelected({ status: 'contacted' });
                  toast.success('Lead marked as Contacted!');
                }}
              >
                <CheckCircle2 className="w-5 h-5 mr-3" />
                Call Answered (Move to Contacted)
              </Button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-border/50"></div>
                <span className="flex-shrink-0 mx-4 text-xs text-muted-foreground uppercase font-semibold">
                  Or
                </span>
                <div className="flex-grow border-t border-border/50"></div>
              </div>

              <div className="space-y-3 bg-muted/30 p-4 rounded-lg border border-border/50">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  No Answer - Schedule Retry
                </h4>
                <div className="space-y-2">
                  <Input
                    type="datetime-local"
                    value={schedule.followUpDate}
                    onChange={(e) => setSchedule({ ...schedule, followUpDate: e.target.value })}
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    className="w-full justify-start h-10 font-medium border-amber-200 hover:bg-amber-50 dark:border-amber-900/50 dark:hover:bg-amber-900/20"
                    onClick={() => {
                      if (!schedule.followUpDate) {
                        toast.error('Please select a date and time');
                        return;
                      }
                      addFollowup();
                      setShowCallOutcomeModal(false);
                    }}
                  >
                    <CalendarClock className="w-4 h-4 mr-2 text-amber-600 dark:text-amber-400" />
                    Save Retry Schedule
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
