// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createFileRoute } from '@/lib/routerCompat';
import {
  CalendarDays,
  Search,
  Printer,
  X,
  FileSpreadsheet,
  IndianRupee,
  TrendingUp,
  ShoppingCart,
  XCircle,
  ScanText,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminGetBookingsAll,
  adminGetPendingPayments,
  adminVerifyPaymentOrder,
  adminRejectPaymentOrder,
  adminAiOcrParsePdf,
  type AdminBookingRow,
  type AdminPaymentOrderRow,
} from '@/lib/api/db.functions';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authenticated/bookings/all')({
  component: BookingsPage,
});

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  confirmed: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  pending: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-600 dark:text-amber-400',
  },
  cancelled: {
    dot: 'bg-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-600 dark:text-rose-400',
  },
};

function AnimatedCounter({ value, prefix = '' }: { value: number | string; prefix?: string }) {
  const numValue = typeof value === 'string' ? 0 : value;
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (numValue === 0) {
      setDisplay(0);
      return;
    }
    const duration = 600;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(Math.round(numValue * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [numValue]);
  if (typeof value === 'string') return <span>{value}</span>;
  return (
    <span>
      {prefix}
      {display.toLocaleString('en-IN')}
    </span>
  );
}

function BookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentOrderRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [parsingBookingId, setParsingBookingId] = useState<number | null>(null);

  const reloadData = async () => {
    if (!auth) return;
    try {
      const [bookingRows, paymentRows] = await Promise.all([
        adminGetBookingsAll({ data: { auth } }),
        adminGetPendingPayments({ data: { auth } }),
      ]);
      setBookings(bookingRows);
      setPayments(paymentRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reload data');
    }
  };

  // DMC Handoff Sheet customization states
  const [selectedDmcBooking, setSelectedDmcBooking] = useState<AdminBookingRow | null>(null);
  const [guideName, setGuideName] = useState('');
  const [guidePhone, setGuidePhone] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [dmcNotes, setDmcNotes] = useState('');

  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  const handlePdfUpload = async (e: any, bookingId: number) => {
    const file = e.target.files?.[0];
    if (!file || !auth) return;

    const mimeType = file.type;
    if (!mimeType.includes('pdf') && !mimeType.includes('image')) {
      toast.error('Please upload a PDF or Image');
      return;
    }

    setParsingBookingId(bookingId);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const res = await adminAiOcrParsePdf({ data: { auth, base64Data, mimeType } });
          toast.success(
            `OCR Extracted! Vendor: ${res.vendorName} | Ref: ${res.bookingReference} | Status: ${res.status}`,
          );
          console.log('OCR Result:', res);
        } catch (err) {
          toast.error('OCR API failed: ' + (err instanceof Error ? err.message : 'Unknown'));
        } finally {
          setParsingBookingId(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error('File processing failed');
      setParsingBookingId(null);
    }
  };

  useEffect(() => {
    async function load() {
      if (!auth) return;
      setLoading(true);
      await reloadData();
      setLoading(false);
    }
    load();
  }, [user?.session_token]);

  const handleVerify = async (id: number) => {
    if (!auth) return;
    try {
      setIsMutating(true);
      await adminVerifyPaymentOrder({ data: { auth, id } });
      toast.success('Payment verified and booking confirmed!');
      await reloadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to verify payment');
    } finally {
      setIsMutating(false);
    }
  };

  const handleReject = async (id: number) => {
    if (!auth) return;
    const reason = window.prompt('Reason for rejection (this will be logged):');
    if (reason === null) return;
    try {
      setIsMutating(true);
      await adminRejectPaymentOrder({ data: { auth, id, reason: reason.trim() || undefined } });
      toast.success('Payment rejected.');
      await reloadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject payment');
    } finally {
      setIsMutating(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return bookings;
    return bookings.filter((booking) =>
      [
        booking.booking_reference,
        booking.item_name,
        booking.item_type,
        booking.status,
        booking.user_name,
        booking.user_email,
        booking.operator_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [bookings, query]);

  const revenue = bookings
    .filter((booking) => booking.status === 'confirmed')
    .reduce((sum, booking) => sum + Number(booking.amount || 0), 0);
  const pendingPayments = payments.filter((payment) => payment.status === 'pending_verification');

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
              Total Bookings
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <ShoppingCart className="w-3.5 h-3.5 text-blue-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={bookings.length} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '60ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Confirmed Revenue
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            <AnimatedCounter value={revenue} prefix="₹" />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pending Payments
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={pendingPayments.length} />
          </div>
        </div>
        <div
          className="glass-card rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: '180ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cancelled
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            <AnimatedCounter value={bookings.filter((b) => b.status === 'cancelled').length} />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative ">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 border-border/40 focus:ring-2 focus:ring-primary"
          placeholder="Search booking, customer, package..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {/* Bookings Table */}
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
                Travel
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Amount
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider">
                Operator
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
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />{' '}
                    Loading bookings...
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No bookings found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((booking, idx) => {
                const statusStyle = STATUS_STYLES[booking.status] || STATUS_STYLES.pending;
                return (
                  <TableRow
                    key={booking.id}
                    className="transition-all hover:bg-muted/30 animate-slide-up"
                    style={{ animationDelay: `${idx * 25}ms` }}
                  >
                    <TableCell>
                      <div className="font-semibold text-sm">{booking.booking_reference}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {booking.item_type} · {booking.item_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                          {booking.user_name?.[0]?.toUpperCase() || 'C'}
                        </div>
                        <div>
                          <div className="text-sm font-medium">
                            {booking.user_name || 'Customer'}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {booking.user_email || ''}{' '}
                            {booking.user_phone ? `· ${booking.user_phone}` : ''}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{' '}
                        {formatDate(booking.travel_date)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-semibold text-sm">
                        ₹{Number(booking.amount || 0).toLocaleString('en-IN')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{booking.operator_name || 'Not assigned'}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                        {booking.status}
                      </span>
                    </TableCell>
                    <TableCell className="p-2 align-middle text-right">
                      <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted font-semibold gap-1 hover:text-primary transition-colors"
                          onClick={() => {
                            setSelectedDmcBooking(booking);
                            setGuideName('');
                            setGuidePhone('');
                            setVehicleReg('');
                            setDmcNotes('');
                          }}
                        >
                          <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                          DMC Sheet
                        </Button>
                        <div className="w-px h-4 bg-border/50" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted font-semibold gap-1 hover:text-primary transition-colors"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'application/pdf,image/*';
                            input.onchange = (e) => handlePdfUpload(e, booking.id);
                            input.click();
                          }}
                          disabled={parsingBookingId === booking.id}
                        >
                          {parsingBookingId === booking.id ? (
                            <div className="mr-1 w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          ) : (
                            <ScanText className="mr-1 h-3.5 w-3.5" />
                          )}
                          OCR Sync
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pending Payments */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="mb-3 text-sm font-bold flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <IndianRupee className="w-3.5 h-3.5 text-amber-500" />
          </div>
          Pending Payment Verification
        </h3>
        <div className="space-y-2">
          {pendingPayments.slice(0, 8).map((payment, idx) => (
            <div
              key={payment.id}
              className="flex flex-col justify-between gap-2 rounded-lg border border-border/30 p-3 text-sm md:flex-row md:items-center bg-muted/10 animate-slide-up"
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              <div>
                <div className="font-semibold">
                  {payment.user_name} · {payment.booking_reference || 'Unlinked order'}
                </div>
                <div className="text-muted-foreground text-xs">
                  ₹{Number(payment.amount || 0).toLocaleString('en-IN')} · UTR{' '}
                  {payment.utr_reference}
                </div>
              </div>
              <div className="flex items-center gap-2 self-start">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {payment.status}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700 border-none"
                  disabled={isMutating}
                  onClick={() => handleVerify(payment.id)}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 hover:text-rose-700 border-none"
                  disabled={isMutating}
                  onClick={() => handleReject(payment.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {pendingPayments.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No payment claims waiting.</p>
          )}
        </div>
      </div>

      {/* ─── DMC Handoff Sheet Modal ─── */}
      {selectedDmcBooking &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:p-0 print:bg-white">
            <div className="bg-card w-full rounded-2xl border border-border/80 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden print:border-none print:shadow-none print:max-h-none print:overflow-visible">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-muted/20 print:hidden">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-sm">Local Operator DMC Handoff Workspace</h3>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print DMC Sheet
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedDmcBooking(null)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 grid gap-6 md:grid-cols-[280px_1fr] print:overflow-visible print:p-0 print:block">
                {/* Left Column: Interactive Inputs (Hidden in Print) */}
                <div className="space-y-4 border-r border-border/60 pr-6 print:hidden">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Ground Dispatch Details
                  </h4>
                  <div className="space-y-3.5">
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Assigned Guide Name
                      </span>
                      <Input
                        placeholder="e.g. Ramesh Kumar"
                        value={guideName}
                        onChange={(e) => setGuideName(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Guide Phone
                      </span>
                      <Input
                        placeholder="e.g. +91 98765 43210"
                        value={guidePhone}
                        onChange={(e) => setGuidePhone(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Vehicle Reg Number
                      </span>
                      <Input
                        placeholder="e.g. DL 3C AY 4567"
                        value={vehicleReg}
                        onChange={(e) => setVehicleReg(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Special DMV / DMC Notes
                      </span>
                      <Textarea
                        placeholder="e.g. Premium VIP pickup, request garland..."
                        value={dmcNotes}
                        onChange={(e) => setDmcNotes(e.target.value)}
                        className="min-h-[100px] resize-none"
                      />
                    </label>
                  </div>
                </div>

                {/* Right Column: Dynamic Document Print Area */}
                <div
                  id="dmc-print-area"
                  className="bg-white text-black p-8 rounded-lg border shadow-sm font-sans print:border-none print:shadow-none print:p-0"
                >
                  <style>{`
                  @media print {
                    body * { visibility: hidden; }
                    #dmc-print-area, #dmc-print-area * { visibility: visible; }
                    #dmc-print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
                  }
                `}</style>

                  {/* Document Header */}
                  <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                    <div>
                      <h1 className="text-xl font-bold uppercase tracking-wider">MooNs</h1>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
                        Ground Dispatch & Voucher Sheet
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold px-2.5 py-1 border border-black rounded">
                        CONFIDENTIAL GROUND DOC
                      </span>
                    </div>
                  </div>

                  {/* Booking Info Grid */}
                  <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 text-xs border-b pb-6 mb-6">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                        Booking Reference
                      </span>
                      <span className="font-mono font-bold text-sm text-black">
                        {selectedDmcBooking.booking_reference}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                        Local Operator
                      </span>
                      <span className="font-semibold text-black">
                        {selectedDmcBooking.operator_name || 'MooN DMC Partner'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                        Lead Guest
                      </span>
                      <span className="font-semibold text-black">
                        {selectedDmcBooking.user_name || 'Valued Guest'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                        Contact Number
                      </span>
                      <span className="font-mono text-black">
                        {selectedDmcBooking.user_phone || 'Not Shared'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                        Travel Commencement Date
                      </span>
                      <span className="font-semibold text-black">
                        {formatDate(selectedDmcBooking.travel_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                        Inventory Category
                      </span>
                      <span className="font-semibold text-black capitalize">
                        {selectedDmcBooking.item_type}
                      </span>
                    </div>
                  </div>

                  {/* Booking Item & Target Plan */}
                  <div className="border border-black/20 rounded-lg p-4 mb-6 bg-gray-50/50">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                      Service description / Room Type / Package Name
                    </span>
                    <p className="text-sm font-bold text-black">{selectedDmcBooking.item_name}</p>
                  </div>

                  {/* Driver / Guide Details (Real-time filled) */}
                  <div className="grid grid-cols-3 gap-4 mb-6 border-b pb-6">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                        Assigned Guide/Driver
                      </span>
                      <span className="text-xs font-semibold text-black">
                        {guideName || '____________________'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                        Contact Number
                      </span>
                      <span className="text-xs font-mono text-black">
                        {guidePhone || '____________________'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                        Vehicle Plate
                      </span>
                      <span className="text-xs font-mono text-black">
                        {vehicleReg || '____________________'}
                      </span>
                    </div>
                  </div>

                  {/* Operations Ground Checklist */}
                  <div className="space-y-4 mb-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider border-b pb-1.5">
                      Ground Operator Tasks
                    </h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border border-black/40 rounded flex-shrink-0" />{' '}
                        Airport meet-and-greet support
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border border-black/40 rounded flex-shrink-0" />{' '}
                        Room configuration alignment
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border border-black/40 rounded flex-shrink-0" />{' '}
                        Supplier voucher validation
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border border-black/40 rounded flex-shrink-0" />{' '}
                        Local SIM/Wi-Fi dispatch alignment
                      </div>
                    </div>
                  </div>

                  {/* Dispatch Notes */}
                  {dmcNotes && (
                    <div className="border border-black p-4 rounded-lg bg-gray-50 mb-6">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                        Special Operator Instructions
                      </span>
                      <p className="text-xs leading-relaxed text-black font-medium">{dmcNotes}</p>
                    </div>
                  )}

                  {/* Confidentiality Warning Footer */}
                  <div className="text-[9px] text-gray-400 border-t pt-4 text-center mt-12">
                    <p>
                      This is a confidential ground operation worksheet. Omit client markup rates,
                      margins, and private pricing logs during DMC handoff.
                    </p>
                    <p className="mt-0.5">© MooNs · Local Operator Network</p>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
