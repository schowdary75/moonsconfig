// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useState } from 'react';
import { createFileRoute } from '@/lib/routerCompat';
import { toast } from '@/lib/toast';
import {
  Unlock,
  IndianRupee,
  Lock,
  TrendingUp,
  BarChart3,
  Sparkles,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  getEscrowLedger,
  releaseEscrowMilestone,
  adminAiReconcileEscrow,
  type EscrowRow,
} from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';

export const Route = createFileRoute('/_authenticated/escrow')({
  component: EscrowPage,
});

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
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
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

function EscrowPage() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [ledger, setLedger] = useState<EscrowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReconciling, setIsReconciling] = useState(false);
  const [aiReport, setAiReport] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      setLedger(await getEscrowLedger());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load escrow ledger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function release(ledgerId: number) {
    await releaseEscrowMilestone({ data: { ledgerId } });
    toast.success('Escrow milestone released');
    await load();
  }

  async function handleReconcile() {
    if (!auth || ledger.length === 0) return;
    setIsReconciling(true);
    try {
      const ledgerData = JSON.stringify(
        ledger.map((r) => ({
          id: r.id,
          amount: r.amount,
          status: r.status,
          created: r.created_at,
        })),
      );
      const report = await adminAiReconcileEscrow({ data: { auth, ledgerData } });
      setAiReport(report);
      toast.success('AI Ledger Reconciliation Complete');
    } catch (err) {
      toast.error('Failed to reconcile ledger');
    } finally {
      setIsReconciling(false);
    }
  }

  const heldTotal = ledger
    .filter((row) => row.status === 'held')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const releasedTotal = ledger
    .filter((row) => row.status === 'released')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalAmount = heldTotal + releasedTotal;
  const releasedPercent = totalAmount > 0 ? Math.round((releasedTotal / totalAmount) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div />
        <Button
          onClick={handleReconcile}
          disabled={isReconciling || ledger.length === 0}
          className="bg-primary/10 text-primary hover:bg-primary/20"
        >
          {isReconciling ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          AI Reconcile
        </Button>
      </div>

      {aiReport && (
        <div className="glass-card rounded-xl border border-primary/20 p-5 bg-gradient-to-br from-primary/5 to-transparent animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-lg">AI Financial Controller Report</h3>
          </div>
          <p className="text-zinc-700 font-medium mb-2">{aiReport.summary}</p>
          <div className="bg-white/60 rounded p-3">
            <p className="text-sm font-bold text-primary mb-1">
              Anomalies Detected: {aiReport.anomaliesFound}
            </p>
            <ul className="list-disc list-inside text-sm text-zinc-600">
              {aiReport.recommendations?.map((rec: string, i: number) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Milestones
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={ledger.length} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Held
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            <AnimatedCounter value={heldTotal} prefix="₹" />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Released
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            <AnimatedCounter value={releasedTotal} prefix="₹" />
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {totalAmount > 0 && (
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '180ms' }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-muted-foreground">Release Progress</span>
            <span className="text-xs font-bold">{releasedPercent}% released</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 ease-out"
              style={{ width: `${releasedPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>₹{heldTotal.toLocaleString('en-IN')} held</span>
            <span>₹{releasedTotal.toLocaleString('en-IN')} released</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/30">
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Booking
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Milestone
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Operator
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Amount
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Status
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Scheduled
              </TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />{' '}
                    Loading escrow...
                  </div>
                </TableCell>
              </TableRow>
            ) : ledger.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No escrow milestones found.
                </TableCell>
              </TableRow>
            ) : (
              ledger.map((row, idx) => (
                <TableRow
                  key={row.id}
                  className="transition-all hover:bg-muted/30 animate-slide-up"
                  style={{ animationDelay: `${idx * 25}ms` }}
                >
                  <TableCell className="font-semibold text-sm">{row.booking_reference}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold text-muted-foreground capitalize">
                      {row.milestone_type.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{row.operator_name || 'Not assigned'}</TableCell>
                  <TableCell>
                    <span className="font-mono font-semibold text-sm">
                      ₹{Number(row.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        row.status === 'released'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${row.status === 'released' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}
                      />
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell
                    className={`text-sm ${
                      row.status === 'held' &&
                      row.scheduled_release_date &&
                      new Date(row.scheduled_release_date).getTime() <= Date.now()
                        ? 'text-amber-600 dark:text-amber-400 font-semibold'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {formatDate(row.scheduled_release_date)}
                    {row.status === 'held' &&
                      row.scheduled_release_date &&
                      new Date(row.scheduled_release_date).getTime() <= Date.now() && (
                        <span className="block text-[10px]">Due — Maya releases on next sweep</span>
                      )}
                  </TableCell>
                  <TableCell className="p-2 align-middle text-right">
                    <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                      {row.status === 'held' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted"
                          onClick={() => release(row.id)}
                        >
                          <Unlock className="mr-2 h-3.5 w-3.5" />
                          Release
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
