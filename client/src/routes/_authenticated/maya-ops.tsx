// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@/lib/routerCompat';
import { toast } from '@/lib/toast';
import {
  Activity,
  AlertTriangle,
  Clock,
  PlaneTakeoff,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Stamp,
  Check,
  X,
  Bot,
  Workflow,
  Building2,
  Landmark,
  Power,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminGetMayaOpsCenter,
  adminAdvanceVisaCase,
  adminGetTravelCapabilityReadiness,
  adminListMayaActionProposals,
  adminReviewMayaActionProposal,
  adminGetSupplierOperationsBoard,
  adminGetTravelFinanceQueue,
} from '@/lib/api/operations';
import { useAuth } from '@/components/auth-context';
import { apiClient } from '@/api/client';

export const Route = createFileRoute('/_authenticated/maya-ops')({
  component: MayaOpsPage,
});

const SEVERITY_STYLES: Record<string, string> = {
  high: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
  medium: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  low: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
};

// Allowed next steps mirror the server-side visa lifecycle.
const VISA_NEXT: Record<string, string[]> = {
  not_started: ['documents_pending'],
  documents_pending: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected', 'additional_docs_required'],
  additional_docs_required: ['submitted'],
  approved: [],
  rejected: [],
};

function MetricCard({ label, value, icon: Icon, tone, delay }) {
  return (
    <div
      className="glass-card rounded-xl p-4 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <div className="glass-card overflow-hidden rounded-xl">
      <div className="flex items-center gap-2 border-b border-border/30 px-4 py-3">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function MayaOpsPage() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const canManageAutonomy = Boolean(user?.platformUserId);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!auth) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [center, actions, readiness, suppliers, finance, killSwitches] = await Promise.all([
        adminGetMayaOpsCenter({ data: { auth } }),
        adminListMayaActionProposals({ data: { auth, status: 'pending', limit: 100 } }),
        adminGetTravelCapabilityReadiness({ data: { auth } }),
        adminGetSupplierOperationsBoard({ data: { auth } }),
        adminGetTravelFinanceQueue({ data: { auth } }),
        // Both access JWTs and valid legacy CRM sessions are accepted as Bearer
        // credentials for this read. Keep the rest of the dashboard available if
        // governance is temporarily unavailable.
        apiClient
          .get('/travel-governance/kill-switches')
          .then(({ data }) => data.data)
          .catch(() => []),
      ]);
      setData({ ...center, actions, readiness, suppliers, finance, killSwitches });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Maya Ops Center');
    } finally {
      setLoading(false);
    }
  }, [user?.session_token]);

  useEffect(() => {
    load();
  }, [load]);

  async function advanceVisa(caseId: number, to: string) {
    if (!auth) return toast.error('Your session is missing. Please sign in again.');
    try {
      const res = await adminAdvanceVisaCase({ data: { auth, caseId, to } });
      if (res?.ok === false) return toast.error(res.error || 'Could not update visa case');
      toast.success(`Visa case moved to ${to.replace(/_/g, ' ')}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function reviewAction(proposal: any, decision: 'approve' | 'reject') {
    if (!auth) return toast.error('Your session is missing. Please sign in again.');
    try {
      const reason =
        decision === 'approve' ? 'Reviewed in Maya Ops Center' : 'Rejected in Maya Ops Center';
      if (proposal.riskClass === 'high_risk') {
        await apiClient.post(`/travel-governance/actions/${proposal.id}/review`, {
          decision,
          reason,
        });
      } else {
        await adminReviewMayaActionProposal({
          data: { auth, proposalId: proposal.id, decision, reason },
        });
      }
      toast.success(decision === 'approve' ? 'Action approved and queued' : 'Action rejected');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Review failed');
    }
  }

  async function viewIncidentReceipt(proposal: any) {
    try {
      const { data } = await apiClient.get(
        `/travel-governance/actions/${proposal.id}/incident-receipt`,
      );
      window.open(data.data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Receipt is not available');
    }
  }

  async function toggleKillSwitch(item: any) {
    if (!canManageAutonomy) {
      return toast.error('Sign in to a company workspace and complete MFA to change autonomy.');
    }
    const scope =
      item.key === 'autopilot_master'
        ? 'master'
        : item.key.startsWith('maya_channel_')
          ? 'channel'
          : 'tool';
    const key =
      scope === 'master'
        ? undefined
        : item.key.replace(scope === 'channel' ? 'maya_channel_' : 'maya_tool_', '');
    try {
      await apiClient.put('/travel-governance/kill-switches', {
        scope,
        key,
        enabled: !item.enabled,
      });
      toast.success(`${item.key.replace(/_/g, ' ')} turned ${item.enabled ? 'off' : 'on'}`);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Recent MFA and administrator access are required to change autonomy.',
      );
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        Loading traveller-care center…
      </div>
    );
  }

  const refunds = data?.refunds ?? { total: 0, breached: 0, rows: [] };
  const contingencies = data?.contingencies ?? [];
  const flightWatches = data?.flightWatches ?? { active: 0, upcoming: [] };
  const visaCases = data?.visaCases ?? { total: 0, atRisk: 0, rows: [] };
  const activity = data?.activity ?? [];
  const actions = data?.actions ?? [];
  const readiness = data?.readiness ?? { queues: {}, maya: {}, providers: {} };
  const suppliers = data?.suppliers ?? [];
  const finance = data?.finance ?? {
    receivables: [],
    payables: [],
    refunds: [],
    recentTransactions: [],
  };
  const killSwitches = data?.killSwitches ?? [];

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Maya Ops Center</h1>
          <p className="text-sm text-muted-foreground">
            Proactive traveller care — refunds, disruptions, flights and visas Maya is watching.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Refund SLA breaches"
          value={refunds.breached}
          icon={ReceiptText}
          tone="bg-rose-500/10 text-rose-500"
          delay={0}
        />
        <MetricCard
          label="Open disruptions"
          value={contingencies.length}
          icon={ShieldAlert}
          tone="bg-amber-500/10 text-amber-500"
          delay={60}
        />
        <MetricCard
          label="Flights watched"
          value={flightWatches.active}
          icon={PlaneTakeoff}
          tone="bg-blue-500/10 text-blue-500"
          delay={120}
        />
        <MetricCard
          label="Visas at risk"
          value={visaCases.atRisk}
          icon={Stamp}
          tone="bg-purple-500/10 text-purple-500"
          delay={180}
        />
        <MetricCard
          label="Maya approvals"
          value={actions.length}
          icon={Bot}
          tone="bg-cyan-500/10 text-cyan-600"
          delay={240}
        />
        <MetricCard
          label="Dead-letter events"
          value={readiness.queues?.deadLetters ?? 0}
          icon={Workflow}
          tone="bg-orange-500/10 text-orange-600"
          delay={300}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Autonomy kill switches" icon={Power}>
          <div className="max-h-80 divide-y divide-border/30 overflow-auto">
            {killSwitches.map((item: any) => (
              <div key={item.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <div className="text-xs font-semibold capitalize">
                    {item.key.replace(/^maya_(channel|tool)_/, '$1: ').replace(/_/g, ' ')}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {item.updatedAt
                      ? `Changed ${new Date(item.updatedAt).toLocaleString('en-IN')}`
                      : 'Tenant default'}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={item.enabled ? 'outline' : 'destructive'}
                  className="h-7 min-w-16 text-[11px]"
                  disabled={!canManageAutonomy}
                  title={
                    canManageAutonomy
                      ? 'Change this kill switch'
                      : 'Workspace sign-in and recent MFA are required'
                  }
                  onClick={() => toggleKillSwitch(item)}
                >
                  {item.enabled ? 'On' : 'Off'}
                </Button>
              </div>
            ))}
          </div>
          <div className="border-t border-border/30 p-3 text-xs text-muted-foreground">
            {canManageAutonomy
              ? 'Changes require recent MFA. Environment-level kill switches remain the final authority.'
              : 'Viewing is available with your CRM session. Workspace sign-in and recent MFA are required for changes.'}
          </div>
        </Panel>

        <Panel title="Maya approval queue" icon={Bot}>
          <Table>
            <TableHeader>
              <TableRow className="border-border/30">
                <TableHead className="text-[11px] font-bold uppercase">Action</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Evidence</TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No actions waiting for approval.
                  </TableCell>
                </TableRow>
              ) : (
                actions.map((proposal: any) => (
                  <TableRow key={proposal.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="text-sm font-semibold capitalize">
                        {proposal.actionType.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {proposal.riskClass.replace(/_/g, ' ')} · expires{' '}
                        {new Date(proposal.expiresAt).toLocaleTimeString('en-IN')}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs">
                      {proposal.actionType === 'approve_incident_reimbursement' ? (
                        <div>
                          <div className="font-semibold">
                            {proposal.evidence?.currency} {proposal.evidence?.amount}
                            {proposal.evidence?.merchant ? ` · ${proposal.evidence.merchant}` : ''}
                          </div>
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => viewIncidentReceipt(proposal)}
                          >
                            View clean receipt <ExternalLink className="ml-1 h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          {proposal.evidence?.source ?? 'structured evidence'} ·{' '}
                          {proposal.evidence?.channel ?? 'system'}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-emerald-600"
                          onClick={() => reviewAction(proposal, 'approve')}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-rose-600"
                          onClick={() => reviewAction(proposal, 'reject')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="border-t border-border/30 p-3 text-xs text-muted-foreground">
            Maya is <b>{readiness.maya?.policyMode ?? 'read only'}</b>. Flight status:{' '}
            <b>{readiness.providers?.flightStatus?.configured ? 'configured' : 'not configured'}</b>
            ; travel rules:{' '}
            <b>
              {readiness.providers?.travelRules?.configured
                ? readiness.providers.travelRules.provider
                : 'confirmation required'}
            </b>
            .
          </div>
        </Panel>

        <Panel title="Lifecycle automation" icon={Workflow}>
          <div className="grid grid-cols-2 gap-3 p-4">
            {[
              ['Pending events', readiness.queues?.pendingEvents ?? 0],
              ['Dead letters', readiness.queues?.deadLetters ?? 0],
              ['Pending approvals', readiness.queues?.pendingActions ?? 0],
              ['Supplier exceptions', readiness.queues?.unconfirmedServices ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/30 p-3">
                <div className="text-xl font-bold">{value}</div>
                <div className="text-[11px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Supplier operations" icon={Building2}>
          <Table>
            <TableHeader>
              <TableRow className="border-border/30">
                <TableHead className="text-[11px] font-bold uppercase">Trip / service</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Supplier</TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No supplier confirmations need attention.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.slice(0, 12).map((item: any) => (
                  <TableRow key={item.reservation.id}>
                    <TableCell>
                      <div className="text-sm font-semibold">
                        {item.service?.title ?? 'Service'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.trip?.reference ?? 'Unlinked trip'}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.supplier?.company_name ?? 'Manual sourcing required'}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-bold capitalize text-amber-700">
                        {item.reservation.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Travel finance queue" icon={Landmark}>
          <div className="grid grid-cols-2 gap-3 p-4">
            {[
              ['Traveller receivables', finance.receivables.length],
              ['Supplier payables', finance.payables.length],
              ['Refund cases', finance.refunds.length],
              ['Recent transactions', finance.recentTransactions.length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/30 p-3">
                <div className="text-xl font-bold">{value}</div>
                <div className="text-[11px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-border/30 px-4 py-3 text-xs text-muted-foreground">
            Settlement, escrow release and discretionary refunds remain approval-bound.
          </div>
        </Panel>

        <Panel title="Refund SLA board" icon={ReceiptText}>
          <Table>
            <TableHeader>
              <TableRow className="border-border/30">
                <TableHead className="text-[11px] font-bold uppercase">Refund</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Status</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Age</TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase">SLA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No open refunds. 🎉
                  </TableCell>
                </TableRow>
              ) : (
                refunds.rows.slice(0, 12).map((r: any) => (
                  <TableRow key={r.refundId} className="hover:bg-muted/30">
                    <TableCell className="font-semibold text-sm">{r.bookingReference}</TableCell>
                    <TableCell className="text-xs capitalize">
                      {r.status.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell className="text-xs">{r.ageDays}d</TableCell>
                    <TableCell className="text-right">
                      {r.breached ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="h-3 w-3" /> {r.overdueDays}d over
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <Clock className="h-3 w-3" /> within
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Disruption cases" icon={ShieldAlert}>
          <Table>
            <TableHeader>
              <TableRow className="border-border/30">
                <TableHead className="text-[11px] font-bold uppercase">Booking</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Issue</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Recovery</TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase">
                  Severity
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contingencies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No open disruptions.
                  </TableCell>
                </TableRow>
              ) : (
                contingencies.slice(0, 12).map((c: any) => (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    <TableCell className="font-semibold text-sm">#{c.booking_id}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium capitalize">
                        {c.issue_type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[11px] text-muted-foreground line-clamp-1">
                        {c.details}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.recovery ? (
                        <>
                          <div className="font-semibold capitalize">
                            {c.recovery.status.replace(/_/g, ' ')}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {c.recovery.attempts?.length ?? 0} vendor attempt(s) ·{' '}
                            {c.recovery.receipts?.length ?? 0} receipt(s)
                          </div>
                        </>
                      ) : (
                        <span className="text-rose-600">Legacy case · no recovery workflow</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold capitalize ${SEVERITY_STYLES[c.severity] || ''}`}
                      >
                        {c.severity}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Visa cases" icon={Stamp}>
          <Table>
            <TableHeader>
              <TableRow className="border-border/30">
                <TableHead className="text-[11px] font-bold uppercase">Destination</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Status</TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase">
                  Advance
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visaCases.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No visa cases yet.
                  </TableCell>
                </TableRow>
              ) : (
                visaCases.rows.slice(0, 12).map((v: any) => (
                  <TableRow key={v.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {v.destination}
                        {v.atRisk && (
                          <AlertTriangle
                            className="h-3 w-3 text-rose-500"
                            title="At risk — travel is near"
                          />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(v.travelDate).toLocaleDateString('en-IN')}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {v.status.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {(VISA_NEXT[v.status] || []).map((to: string) => (
                          <Button
                            key={to}
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] capitalize hover:bg-primary/10"
                            onClick={() => advanceVisa(v.id, to)}
                          >
                            {to.replace(/_/g, ' ')}
                          </Button>
                        ))}
                        {(VISA_NEXT[v.status] || []).length === 0 && (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Maya activity" icon={Activity}>
          <div className="max-h-[360px] space-y-1 overflow-y-auto p-3">
            {activity.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No recent activity.
              </div>
            ) : (
              activity.map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/30"
                >
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                      a.status === 'error'
                        ? 'bg-rose-500'
                        : a.status === 'attention'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                  />
                  <div>
                    <span className="font-semibold uppercase text-[10px] text-muted-foreground">
                      {a.area}
                    </span>{' '}
                    <span>{a.summary}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
