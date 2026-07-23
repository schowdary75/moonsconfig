import { createFileRoute } from '@/lib/routerCompat';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Search,
  Plus,
  RotateCcw,
  ShieldAlert,
  RefreshCcw,
  HandCoins,
  MessageSquare,
  Phone,
  Loader2,
  Wrench,
} from 'lucide-react';

import { useAuth } from '@/components/auth-context';
import {
  adminGetIncidentDesk,
  adminCreateIncident,
  adminUpdateIncidentStatus,
  adminGetBookingsAll,
} from '@/lib/api/db.functions';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSocket } from '@/socket/socketClient';

export const Route = createFileRoute('/_authenticated/crm/incident-desk')({
  component: IncidentDeskPage,
});

const ISSUE_TYPES = [
  'Transport No-Show',
  'Hotel Overbooked',
  'Activity Cancelled',
  'Flight Disruption',
  'Medical Emergency',
  'Lost Documents',
  'SOS Alert',
  'Other',
];

const STATUS_META: Record<string, { label: string; border: string; badge: string }> = {
  awaiting_authorization: {
    label: 'Requires Authorization',
    border: '#f59e0b',
    badge: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  in_progress: {
    label: 'In Progress',
    border: '#3b82f6',
    badge: 'bg-blue-500 hover:bg-blue-600 text-white',
  },
  resolved: {
    label: 'Resolved',
    border: '#10b981',
    badge: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  },
};

const SEVERITY_META: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-amber-500 text-white',
  medium: 'bg-blue-500 text-white',
  low: 'bg-zinc-400 text-white',
};

function timeAgo(value: string | Date): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function phoneDigits(phone: string | null | undefined): string {
  return (phone || '').replace(/[^\d]/g, '');
}

function formatAmount(amount: number | null): string {
  return amount == null ? 'N/A' : `₹${amount.toLocaleString('en-IN')}`;
}

const EMPTY_FORM = {
  bookingId: '',
  issueType: ISSUE_TYPES[0],
  severity: 'high',
  details: '',
  requestedAmount: '',
};

function IncidentDeskPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [desk, setDesk] = useState<any>({
    incidents: [],
    stats: { activeEscalations: 0, awaitingAuthorization: 0, resolvedToday: 0 },
  });
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [payoutDrafts, setPayoutDrafts] = useState<Record<number, string>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const auth = useMemo(
    () => ({ email: user?.email || '', sessionToken: user?.session_token || '' }),
    [user],
  );

  const loadDesk = useCallback(
    async (silent = false) => {
      if (!user) return;
      if (!silent) setLoading(true);
      try {
        const res = await adminGetIncidentDesk({ data: { auth } });
        setDesk(res);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load incident desk');
      } finally {
        setLoading(false);
      }
    },
    [user, auth],
  );

  useEffect(() => {
    loadDesk();
  }, [loadDesk]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (!socket) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const onInvalidate = (event: { reason: string }) => {
      if (!event.reason.startsWith('incident_')) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadDesk(true), 200);
    };
    socket.on('trip:invalidate', onInvalidate);
    socket.connect();
    return () => {
      clearTimeout(refreshTimer);
      socket.off('trip:invalidate', onInvalidate);
    };
  }, [loadDesk, user]);

  const openCreate = async () => {
    setForm({ ...EMPTY_FORM });
    setCreateOpen(true);
    if (bookings.length === 0) {
      setBookingsLoading(true);
      try {
        const rows = await adminGetBookingsAll({ data: { auth } });
        setBookings(rows || []);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load bookings list');
      } finally {
        setBookingsLoading(false);
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bookingId) {
      toast.error('Select a booking first');
      return;
    }
    setCreating(true);
    try {
      await adminCreateIncident({
        data: {
          auth,
          bookingId: Number(form.bookingId),
          issueType: form.issueType,
          severity: form.severity,
          details: form.details || undefined,
          requestedAmount: form.requestedAmount ? parseFloat(form.requestedAmount) : undefined,
        },
      });
      toast.success('Incident logged');
      setCreateOpen(false);
      loadDesk(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create incident');
    } finally {
      setCreating(false);
    }
  };

  const runAction = async (
    incident: any,
    action: 'start_progress' | 'authorize_plan_b' | 'resolve' | 'reopen',
  ) => {
    setActioningId(incident.id);
    try {
      const draft = payoutDrafts[incident.id];
      const refundAmount =
        action === 'authorize_plan_b' && draft !== undefined && draft !== ''
          ? parseFloat(draft)
          : undefined;
      await adminUpdateIncidentStatus({
        data: { auth, incidentId: incident.id, action, refundAmount },
      });
      const messages: Record<string, string> = {
        start_progress: `INC-${incident.id} moved to In Progress`,
        authorize_plan_b: `Plan B funds authorized for INC-${incident.id}`,
        resolve: `INC-${incident.id} resolved`,
        reopen: `INC-${incident.id} reopened`,
      };
      toast.success(messages[action]);
      loadDesk(true);
    } catch (err) {
      console.error(err);
      toast.error('Action failed');
    } finally {
      setActioningId(null);
    }
  };

  const contactGuest = (incident: any, channel: 'whatsapp' | 'call') => {
    const digits = phoneDigits(incident.guestPhone);
    if (!digits) {
      toast.error(`No phone number on file for ${incident.guestName}`);
      return;
    }
    if (channel === 'whatsapp') {
      window.open(
        `https://wa.me/${digits}?text=${encodeURIComponent(`Hi ${incident.guestName}, this is MooNs Travel support regarding your booking ${incident.reference}.`)}`,
        '_blank',
      );
    } else {
      window.open(`tel:+${digits}`, '_self');
    }
  };

  const filteredIncidents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (desk.incidents || []).filter((incident: any) => {
      if (statusFilter !== 'all' && incident.status !== statusFilter) return false;
      if (!term) return true;
      return [
        `inc-${incident.id}`,
        incident.reference,
        incident.guestName,
        incident.issueType,
        incident.destination,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(term),
      );
    });
  }, [desk.incidents, searchTerm, statusFilter]);

  const stats = desk.stats || {};

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading incident desk...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-8 w-8 text-destructive" />
            Incident Desk & Plan B
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage SOS escalations and authorize financial contingencies instantly.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search ID, guest, booking..."
              className="pl-8 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="awaiting_authorization">Requires Authorization</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" title="Refresh" onClick={() => loadDesk()}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Incident
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Escalations</CardTitle>
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats.activeEscalations ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Authorization</CardTitle>
            <HandCoins className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {stats.awaitingAuthorization ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.resolvedToday ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {filteredIncidents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {desk.incidents?.length
                ? 'No incidents match your filters.'
                : 'No incidents logged. Raise one here or from the Journey Manager when a trip goes sideways.'}
            </CardContent>
          </Card>
        ) : (
          filteredIncidents.map((incident: any) => {
            const meta = STATUS_META[incident.status] || STATUS_META.awaiting_authorization;
            const busy = actioningId === incident.id;
            return (
              <Card
                key={incident.id}
                className="overflow-hidden flex flex-col md:flex-row border-l-4"
                style={{ borderLeftColor: meta.border }}
              >
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant="outline" className="font-mono">
                          INC-{incident.id}
                        </Badge>
                        <span className="text-sm font-medium text-muted-foreground">
                          {incident.reference} • {incident.guestName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3" /> {timeAgo(incident.createdAt)}
                      </div>
                    </div>
                    <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                      {incident.issueType}
                      <Badge
                        className={`uppercase tracking-wider text-[10px] ${SEVERITY_META[incident.severity] || SEVERITY_META.medium}`}
                      >
                        {incident.severity}
                      </Badge>
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                      {incident.details ||
                        (incident.destination
                          ? `Reported against ${incident.destination}.`
                          : 'No additional details recorded.')}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center gap-3 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => contactGuest(incident, 'whatsapp')}
                    >
                      <MessageSquare className="h-4 w-4" /> Message Guest
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => contactGuest(incident, 'call')}
                    >
                      <Phone className="h-4 w-4" /> Call Guest
                    </Button>
                  </div>
                </div>

                <div className="bg-muted/50 p-6 md:w-72 flex flex-col justify-center border-t md:border-t-0 md:border-l">
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                      Status
                    </p>
                    <Badge className={meta.badge}>{meta.label}</Badge>
                  </div>

                  {incident.status === 'awaiting_authorization' && (
                    <div className="space-y-3">
                      <div className="bg-background border rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">
                          Requested Plan B Wallet Credit
                        </p>
                        {incident.requestedAmount != null ? (
                          <p className="text-xl font-bold">
                            {formatAmount(incident.requestedAmount)}
                          </p>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            placeholder="Enter amount (₹)"
                            className="h-8 text-center"
                            value={payoutDrafts[incident.id] ?? ''}
                            onChange={(e) =>
                              setPayoutDrafts({ ...payoutDrafts, [incident.id]: e.target.value })
                            }
                          />
                        )}
                      </div>
                      <Button
                        onClick={() => runAction(incident, 'authorize_plan_b')}
                        disabled={busy}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <HandCoins className="h-4 w-4" />
                        )}
                        Authorize Payout
                      </Button>
                      <Button
                        onClick={() => runAction(incident, 'start_progress')}
                        disabled={busy}
                        variant="outline"
                        className="w-full gap-2"
                      >
                        <Wrench className="h-4 w-4" /> Start Working
                      </Button>
                    </div>
                  )}

                  {incident.status === 'in_progress' && (
                    <div className="space-y-3">
                      {incident.requestedAmount != null && (
                        <div className="bg-background border rounded-lg p-3 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">
                            Requested Plan B Wallet Credit
                          </p>
                          <p className="text-xl font-bold">
                            {formatAmount(incident.requestedAmount)}
                          </p>
                        </div>
                      )}
                      <Button
                        onClick={() => runAction(incident, 'resolve')}
                        disabled={busy}
                        className="w-full gap-2"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        Mark Resolved
                      </Button>
                      <Button
                        onClick={() => runAction(incident, 'authorize_plan_b')}
                        disabled={busy}
                        variant="outline"
                        className="w-full gap-2"
                      >
                        <HandCoins className="h-4 w-4" /> Authorize Payout
                      </Button>
                    </div>
                  )}

                  {incident.status === 'resolved' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/30 py-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900">
                        <CheckCircle className="h-4 w-4" />
                        {incident.planBAuthorized
                          ? `Paid ${formatAmount(incident.requestedAmount)}`
                          : 'Resolved'}
                      </div>
                      <Button
                        onClick={() => runAction(incident, 'reopen')}
                        disabled={busy}
                        variant="ghost"
                        size="sm"
                        className="w-full gap-2 text-muted-foreground"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reopen
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* ═══ New Incident Dialog ═══ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" /> Log New Incident
            </DialogTitle>
            <DialogDescription>Record an escalation against a booking.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Booking</Label>
              <Select
                value={form.bookingId}
                onValueChange={(v) => setForm({ ...form, bookingId: v })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={bookingsLoading ? 'Loading bookings...' : 'Select a booking'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {bookings.map((booking: any) => (
                    <SelectItem key={booking.id} value={String(booking.id)}>
                      {booking.booking_reference} • {booking.user_name || 'Guest'} •{' '}
                      {booking.item_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue Type</Label>
                <Select
                  value={form.issueType}
                  onValueChange={(v) => setForm({ ...form, issueType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ISSUE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select
                  value={form.severity}
                  onValueChange={(v) => setForm({ ...form, severity: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Details</Label>
              <Textarea
                rows={3}
                placeholder="What happened? What does the guest need?"
                value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Requested Plan B Amount (₹, optional)</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 5000"
                value={form.requestedAmount}
                onChange={(e) => setForm({ ...form, requestedAmount: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || bookingsLoading}>
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Log Incident
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
