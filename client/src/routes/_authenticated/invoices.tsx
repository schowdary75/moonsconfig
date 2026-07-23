// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useState } from 'react';
import { createFileRoute } from '@/lib/routerCompat';
import { toast } from '@/lib/toast';
import {
  FileText,
  ArrowDownRight,
  IndianRupee,
  CheckCircle2,
  Copy,
  Send,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAdminInvoices, adminResendInvoice, type AdminInvoiceRow } from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';

export const Route = createFileRoute('/_authenticated/invoices')({
  component: InvoicesPage,
});

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

function InvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<AdminInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  async function load() {
    if (!auth) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setInvoices(await getAdminInvoices({ data: { auth } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [user?.session_token]);

  const copyInvoice = (invoiceNumber: string) => {
    navigator.clipboard.writeText(invoiceNumber);
    toast.success('Invoice number copied to clipboard');
  };

  const [resendingId, setResendingId] = useState<number | null>(null);
  const resendInvoice = async (invoice: AdminInvoiceRow) => {
    if (!auth) return;
    setResendingId(invoice.id);
    try {
      await adminResendInvoice({ data: { auth, invoiceId: invoice.id } });
      toast.success(`Invoice ${invoice.invoice_number} sent to ${invoice.customer_email}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invoice');
    } finally {
      setResendingId(null);
    }
  };

  const totalInvoices = invoices.length;
  const sentInvoices = invoices.filter((i) => i.status === 'sent').length;
  const totalAmount = invoices.reduce((sum, i) => sum + Number(i.amount || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div />

      {/* Metric Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Invoices
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={totalInvoices} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sent to Customers
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            <AnimatedCounter value={sentInvoices} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Amount Billed
            </span>
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <IndianRupee className="w-3.5 h-3.5 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">₹{totalAmount.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/30">
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">Date</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Invoice / Booking
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Customer
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Amount
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
                    Loading invoices...
                  </div>
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No invoices generated yet.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice, idx) => (
                <TableRow
                  key={invoice.id}
                  className="transition-all hover:bg-muted/30 animate-slide-up"
                  style={{ animationDelay: `${idx * 25}ms` }}
                >
                  <TableCell>
                    <div className="font-semibold text-sm">
                      {new Date(invoice.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(invoice.created_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {invoice.invoice_number}
                      <Badge
                        variant={invoice.status === 'sent' ? 'default' : 'secondary'}
                        className={`text-[9px] uppercase ${invoice.status === 'sent' ? 'bg-emerald-600' : ''}`}
                      >
                        {invoice.status === 'sent' ? 'Sent' : 'Generated'}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Booking Ref: {invoice.booking_reference}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                        {invoice.customer_name?.[0]?.toUpperCase() || 'C'}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{invoice.customer_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {invoice.customer_email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-semibold text-sm text-primary">
                      ₹{Number(invoice.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </TableCell>
                  <TableCell className="p-2 align-middle text-right">
                    <div className="flex w-full items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs bg-background hover:bg-muted border border-border rounded-md"
                        onClick={() => copyInvoice(invoice.invoice_number)}
                      >
                        <Copy className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        Copy INV
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs bg-background hover:bg-muted border border-border rounded-md"
                        disabled={resendingId === invoice.id}
                        onClick={() => resendInvoice(invoice)}
                      >
                        {resendingId === invoice.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {invoice.status === 'sent' ? 'Resend' : 'Send'}
                      </Button>
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
