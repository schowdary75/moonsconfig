// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useState } from 'react';
import { createFileRoute } from '@/lib/routerCompat';
import { toast } from '@/lib/toast';
import {
  CheckCircle2,
  SearchCheck,
  ArrowDownRight,
  AlertTriangle,
  Clock,
  IndianRupee,
  Sparkles,
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
  adminGetPendingRefunds,
  adminMoveRefundToReview,
  adminSettleRefund,
  type AdminRefundRow,
} from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';

export const Route = createFileRoute('/_authenticated/refunds')({
  component: RefundsPage,
});

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  initiated: {
    dot: 'bg-amber-500 animate-pulse',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Initiated',
  },
  admin_review: {
    dot: 'bg-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-600 dark:text-blue-400',
    label: 'In Review',
  },
  settled: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: 'Settled',
  },
};

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

function RefundStepper({ status }: { status: string }) {
  const steps = ['initiated', 'admin_review', 'settled'];
  const currentIdx = steps.indexOf(status);

  return (
    <div className="flex items-center gap-0.5">
      {steps.map((step, idx) => {
        const isActive = idx <= currentIdx;
        const isCurrent = idx === currentIdx;
        const style = STATUS_STYLES[step] || STATUS_STYLES.initiated;
        return (
          <div key={step} className="flex items-center">
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-all ${
                isCurrent
                  ? `${style.bg} ${style.text}`
                  : isActive
                    ? `${style.text} opacity-50`
                    : 'text-muted-foreground/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isActive ? style.dot : 'bg-muted-foreground/20'}`}
              />
              {style.label}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`w-3 h-px mx-0.5 ${isActive ? 'bg-primary/30' : 'bg-muted-foreground/15'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RefundsPage() {
  const { user } = useAuth();
  const [refunds, setRefunds] = useState<AdminRefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  async function load() {
    if (!auth) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRefunds(await adminGetPendingRefunds({ data: { auth } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load refunds');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [user?.session_token]);

  async function moveToReview(refundId: number) {
    if (!auth) return toast.error('Your session is missing. Please sign in again.');
    await adminMoveRefundToReview({ data: { auth, refundId } });
    toast.success('Refund moved to admin review');
    await load();
  }

  async function settle(refundId: number) {
    if (!auth) return toast.error('Your session is missing. Please sign in again.');
    await adminSettleRefund({ data: { auth, refundId } });
    toast.success('Refund settled');
    await load();
  }

  const initiatedCount = refunds.filter((r) => r.status === 'initiated').length;
  const reviewCount = refunds.filter((r) => r.status === 'admin_review').length;
  const settledCount = refunds.filter((r) => r.status === 'settled').length;
  const totalAmount = refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div />

      {/* Metric Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Initiated
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            <AnimatedCounter value={initiatedCount} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              In Review
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={reviewCount} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Settled
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            <AnimatedCounter value={settledCount} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '180ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Amount
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <IndianRupee className="w-3.5 h-3.5 text-rose-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">₹{totalAmount.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Refunds Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/30">
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Booking
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Customer
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Amount
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Status
              </TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />{' '}
                    Loading refunds...
                  </div>
                </TableCell>
              </TableRow>
            ) : refunds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No refunds found.
                </TableCell>
              </TableRow>
            ) : (
              refunds.map((refund, idx) => (
                <TableRow
                  key={refund.id}
                  className="transition-all hover:bg-muted/30 animate-slide-up"
                  style={{ animationDelay: `${idx * 25}ms` }}
                >
                  <TableCell>
                    <div className="font-semibold text-sm">{refund.booking_reference}</div>
                    <div className="text-[11px] text-muted-foreground">{refund.item_type}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                        {refund.user_name?.[0]?.toUpperCase() || 'C'}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{refund.user_name}</div>
                        <div className="text-[11px] text-muted-foreground">{refund.user_email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-semibold text-sm text-rose-600 dark:text-rose-400">
                      ₹{Number(refund.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <RefundStepper status={refund.status} />
                  </TableCell>
                  <TableCell className="p-2 align-middle text-right">
                    <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                      {refund.status === 'initiated' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 transition-colors"
                          onClick={() => moveToReview(refund.id)}
                        >
                          <SearchCheck className="mr-2 h-3.5 w-3.5" />
                          Review
                        </Button>
                      )}
                      {refund.status !== 'settled' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted"
                          onClick={() => settle(refund.id)}
                        >
                          <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                          Settle
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
