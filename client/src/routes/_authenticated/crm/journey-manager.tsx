import { createFileRoute } from '@/lib/routerCompat';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Car,
  MapPin,
  Search,
  AlertCircle,
  AlertTriangle,
  Clock,
  Phone,
  MessageSquare,
  ExternalLink,
  Activity,
  RefreshCcw,
  CalendarDays,
  Loader2,
} from 'lucide-react';

import { useAuth } from '@/components/auth-context';
import {
  adminGetJourneyBoard,
  adminGetTripDetail,
  adminUpdateTripActivityStatus,
  adminUpdateTripMilestoneStatus,
  adminCreateIncident,
  sendTeamMessage,
} from '@/lib/api/db.functions';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export const Route = createFileRoute('/_authenticated/crm/journey-manager')({
  component: JourneyManagerPage,
});

const TRIP_STATUS_META: Record<string, { label: string; dot: string }> = {
  on_schedule: { label: 'On Schedule', dot: 'bg-emerald-500 animate-pulse' },
  delayed: { label: 'Delayed', dot: 'bg-amber-500' },
  at_risk: { label: 'At Risk', dot: 'bg-red-500 animate-pulse' },
  upcoming: { label: 'Upcoming', dot: 'bg-blue-500' },
  completed: { label: 'Completed', dot: 'bg-zinc-400' },
};

const ACTIVITY_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const MILESTONE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'delayed', label: 'Delayed' },
];

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

function phoneDigits(phone: string | null | undefined): string {
  return (phone || '').replace(/[^\d]/g, '');
}

function timelineLabel(trip: any): string {
  if (trip.phase === 'upcoming') {
    const days = 1 - trip.dayNumber;
    return days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`;
  }
  if (trip.phase === 'completed') return 'Completed';
  return trip.totalDays ? `Day ${trip.dayNumber} of ${trip.totalDays}` : `Day ${trip.dayNumber}`;
}

function JourneyManagerPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<any>({
    trips: [],
    stats: { activeTrips: 0, atRisk: 0, activeDrivers: 0, sosAlerts: 0 },
  });

  // Trip detail dialog
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingActivityId, setUpdatingActivityId] = useState<number | null>(null);
  const [updatingMilestoneId, setUpdatingMilestoneId] = useState<number | null>(null);

  // Raise incident dialog
  const [incidentTrip, setIncidentTrip] = useState<any>(null);
  const [incidentForm, setIncidentForm] = useState({
    issueType: ISSUE_TYPES[0],
    severity: 'high',
    details: '',
    requestedAmount: '',
  });
  const [savingIncident, setSavingIncident] = useState(false);

  // Broadcast dialog
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const auth = useMemo(
    () => ({ email: user?.email || '', sessionToken: user?.session_token || '' }),
    [user],
  );

  const loadBoard = useCallback(
    async (silent = false) => {
      if (!user) return;
      if (!silent) setLoading(true);
      try {
        const res = await adminGetJourneyBoard({ data: { auth } });
        setBoard(res);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load journey board');
      } finally {
        setLoading(false);
      }
    },
    [user, auth],
  );

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const loadDetail = useCallback(
    async (bookingId: number) => {
      setDetailLoading(true);
      try {
        const res = await adminGetTripDetail({ data: { auth, bookingId } });
        setDetail(res);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load trip details');
      } finally {
        setDetailLoading(false);
      }
    },
    [auth],
  );

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (!socket) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const onInvalidate = (event: { bookingId: number }) => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void loadBoard(true);
        if (detailBookingId === event.bookingId) void loadDetail(event.bookingId);
      }, 200);
    };
    socket.on('trip:invalidate', onInvalidate);
    socket.connect();
    return () => {
      clearTimeout(refreshTimer);
      socket.off('trip:invalidate', onInvalidate);
    };
  }, [detailBookingId, loadBoard, loadDetail, user]);

  const openDetail = (bookingId: number) => {
    setDetailBookingId(bookingId);
    setDetail(null);
    loadDetail(bookingId);
  };

  const handleActivityStatus = async (activityId: number, status: string) => {
    setUpdatingActivityId(activityId);
    try {
      await adminUpdateTripActivityStatus({ data: { auth, activityId, status } });
      toast.success('Activity updated');
      if (detailBookingId) await loadDetail(detailBookingId);
      loadBoard(true);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update activity');
    } finally {
      setUpdatingActivityId(null);
    }
  };

  const handleMilestoneStatus = async (milestoneId: number, status: string) => {
    setUpdatingMilestoneId(milestoneId);
    try {
      await adminUpdateTripMilestoneStatus({ data: { auth, milestoneId, status } });
      toast.success('Milestone updated');
      if (detailBookingId) await loadDetail(detailBookingId);
      void loadBoard(true);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update milestone');
    } finally {
      setUpdatingMilestoneId(null);
    }
  };

  const openIncidentDialog = (trip: any) => {
    setIncidentForm({
      issueType: ISSUE_TYPES[0],
      severity: 'high',
      details: '',
      requestedAmount: '',
    });
    setIncidentTrip(trip);
  };

  const handleRaiseIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentTrip) return;
    setSavingIncident(true);
    try {
      await adminCreateIncident({
        data: {
          auth,
          bookingId: incidentTrip.bookingId,
          issueType: incidentForm.issueType,
          severity: incidentForm.severity,
          details: incidentForm.details || undefined,
          requestedAmount: incidentForm.requestedAmount
            ? parseFloat(incidentForm.requestedAmount)
            : undefined,
        },
      });
      toast.success(`Incident raised for ${incidentTrip.reference}`);
      setIncidentTrip(null);
      loadBoard(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to raise incident');
    } finally {
      setSavingIncident(false);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    setSendingBroadcast(true);
    try {
      await sendTeamMessage({
        data: { auth, content: `📢 [Journey Ops Broadcast] ${broadcastText.trim()}` },
      });
      toast.success('Broadcast sent to the team channel');
      setBroadcastOpen(false);
      setBroadcastText('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to send broadcast');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const contactGuest = (trip: any, channel: 'whatsapp' | 'call') => {
    const digits = phoneDigits(trip.guestPhone);
    if (!digits) {
      toast.error(`No phone number on file for ${trip.guestName}`);
      return;
    }
    if (channel === 'whatsapp') {
      window.open(
        `https://wa.me/${digits}?text=${encodeURIComponent(`Hi ${trip.guestName}, this is MooNs Travel operations regarding your trip ${trip.reference}.`)}`,
        '_blank',
      );
    } else {
      window.open(`tel:+${digits}`, '_self');
    }
  };

  const filteredTrips = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (board.trips || []).filter((trip: any) => {
      if (phaseFilter !== 'all' && trip.phase !== phaseFilter) return false;
      if (!term) return true;
      return [trip.reference, trip.guestName, trip.destination].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(term),
      );
    });
  }, [board.trips, searchTerm, phaseFilter]);

  const stats = board.stats || {};

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading live journeys...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Live Journey Operations</h2>
          <p className="text-muted-foreground mt-1">
            Monitor and manage all travelers currently on-trip.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search ref, guest, destination..."
              className="pl-8 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trips</SelectItem>
              <SelectItem value="active">On Trip</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" title="Refresh" onClick={() => loadBoard()}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button className="flex items-center gap-2" onClick={() => setBroadcastOpen(true)}>
            <Activity className="h-4 w-4" /> Global Broadcast
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Trips</CardTitle>
            <MapPin className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeTrips ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk / Delayed</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.atRisk ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
            <Car className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeDrivers ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SOS Alerts</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.sosAlerts ? 'text-destructive' : ''}`}>
              {stats.sosAlerts ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trip Context</TableHead>
              <TableHead>Timeline</TableHead>
              <TableHead>Current Activity</TableHead>
              <TableHead>Transport / Driver</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTrips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {board.trips?.length
                    ? 'No trips match your filters.'
                    : 'No confirmed trips yet. Trips appear here once bookings are confirmed.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredTrips.map((trip: any) => {
                const meta = TRIP_STATUS_META[trip.status] || TRIP_STATUS_META.on_schedule;
                return (
                  <TableRow key={trip.bookingId}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {trip.guestName}
                        {trip.openIncidents > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            {trip.openIncidents} incident{trip.openIncidents > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {trip.destination} • {trip.reference}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        <CalendarDays className="mr-1 h-3 w-3" /> {timelineLabel(trip)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {trip.currentActivity
                          ? trip.currentActivity.title
                          : trip.phase === 'active'
                            ? 'No activity scheduled today'
                            : '—'}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                        {trip.currentActivity?.timeSlot
                          ? ` • ${trip.currentActivity.timeSlot}`
                          : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      {trip.driver ? (
                        <>
                          <div className="flex items-center gap-1.5 font-medium">
                            <Car className="h-4 w-4 text-muted-foreground" /> {trip.driver.name}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {trip.driver.contact} • {trip.driver.phone}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">No driver assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="WhatsApp Guest"
                          onClick={() => contactGuest(trip, 'whatsapp')}
                        >
                          <MessageSquare className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Call Guest"
                          onClick={() => contactGuest(trip, 'call')}
                        >
                          <Phone className="h-4 w-4 text-emerald-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Raise Incident"
                          onClick={() => openIncidentDialog(trip)}
                        >
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Open Details"
                          onClick={() => openDetail(trip.bookingId)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ═══ Trip Detail Dialog ═══ */}
      <Dialog
        open={detailBookingId != null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailBookingId(null);
            setDetail(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail
                ? `${detail.booking.destination} • ${detail.booking.reference}`
                : 'Trip Details'}
            </DialogTitle>
            <DialogDescription>
              {detail?.guest
                ? `${detail.guest.name} (${detail.guest.email || 'no email'})`
                : 'Day-by-day schedule and live milestones.'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading itinerary...
            </div>
          ) : (
            <div className="space-y-5">
              {detail.milestones.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Trip Milestones
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {detail.milestones.map((m: any) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-2"
                      >
                        <span className="truncate text-sm font-medium">{m.phaseName}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          {updatingMilestoneId === m.id && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                          <Select
                            value={m.status}
                            onValueChange={(status) => handleMilestoneStatus(m.id, status)}
                          >
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MILESTONE_STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Daily Schedule
                </p>
                {detail.schedules.length === 0 ? (
                  <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
                    No daily schedule captured for this trip yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.schedules.map((item: any) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2 ${item.dayNumber === detail.booking.dayNumber ? 'border-primary/50 bg-primary/5' : ''}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            <span className="text-muted-foreground font-mono text-xs mr-2">
                              Day {item.dayNumber} • {item.timeSlot}
                            </span>
                            {item.title}
                          </div>
                          {item.driver && (
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Car className="h-3 w-3" /> {item.driver.company_name} (
                              {item.driver.phone})
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {updatingActivityId === item.id && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                          <Select
                            value={item.status}
                            onValueChange={(status) => handleActivityStatus(item.id, status)}
                          >
                            <SelectTrigger className="w-32 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ACTIVITY_STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detail.incidents.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Incidents
                  </p>
                  <div className="space-y-1.5">
                    {detail.incidents.map((incident: any) => (
                      <div
                        key={incident.id}
                        className="flex items-center justify-between text-sm border rounded-lg px-3 py-2"
                      >
                        <span className="font-medium">
                          INC-{incident.id} • {incident.issueType}
                        </span>
                        <Badge variant={incident.status === 'resolved' ? 'default' : 'destructive'}>
                          {incident.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Raise Incident Dialog ═══ */}
      <Dialog
        open={incidentTrip != null}
        onOpenChange={(open) => {
          if (!open) setIncidentTrip(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Raise Incident
            </DialogTitle>
            <DialogDescription>
              {incidentTrip ? `${incidentTrip.guestName} • ${incidentTrip.reference}` : ''}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRaiseIncident} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue Type</Label>
                <Select
                  value={incidentForm.issueType}
                  onValueChange={(v) => setIncidentForm({ ...incidentForm, issueType: v })}
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
                  value={incidentForm.severity}
                  onValueChange={(v) => setIncidentForm({ ...incidentForm, severity: v })}
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
                value={incidentForm.details}
                onChange={(e) => setIncidentForm({ ...incidentForm, details: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Requested Plan B Amount (₹, optional)</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 5000"
                value={incidentForm.requestedAmount}
                onChange={(e) =>
                  setIncidentForm({ ...incidentForm, requestedAmount: e.target.value })
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIncidentTrip(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingIncident}>
                {savingIncident && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Raise Incident
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ═══ Global Broadcast Dialog ═══ */}
      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Global Broadcast
            </DialogTitle>
            <DialogDescription>
              Sends an operations notice to the internal team channel.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBroadcast} className="space-y-4">
            <Textarea
              rows={4}
              placeholder="e.g. Heavy rain expected in Interlaken — check in with all Swiss Alps travelers."
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setBroadcastOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={sendingBroadcast || !broadcastText.trim()}>
                {sendingBroadcast && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send Broadcast
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
