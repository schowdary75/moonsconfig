// @ts-nocheck -- customer payload is versioned independently from staff API types.
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@/lib/routerCompat';
import { customerClient, customerSession } from '@/api/customerClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  LogOut,
  MapPin,
  MessageCircle,
  Plane,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
  UploadCloud,
  ExternalLink,
} from 'lucide-react';

export const Route = createFileRoute('/traveller-hub')({ component: TravellerHubPage });

const money = (amount: unknown, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount ?? 0));

function Readiness({ readiness }) {
  const checks = [
    ['Participants', readiness.participantFormsComplete],
    ['Services', readiness.servicesConfirmed],
    ['Documents', readiness.documentsClean],
    ['Payments', readiness.paymentsCurrent],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {checks.map(([label, complete]) => (
        <div
          key={label}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
        >
          {complete ? (
            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          )}
          {label}
        </div>
      ))}
    </div>
  );
}

function QuoteCard({ quote, traveller, reload }) {
  const [signerName, setSignerName] = useState(traveller.displayName ?? '');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const accepted = quote.status === 'accepted' || quote.acceptance;

  useEffect(() => {
    if (['sent', 'viewed'].includes(quote.status)) {
      customerClient.post(`/customer/quotes/${quote.id}/view`).catch(() => undefined);
    }
  }, [quote.id]);

  async function submitComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await customerClient.post(`/customer/quotes/${quote.id}/comments`, { body: comment });
      setComment('');
      await reload();
    } catch (error) {
      toast.error(error.response?.data?.error?.message ?? 'Could not send your comment');
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!signerName.trim()) return toast.error('Enter the signer name');
    setBusy(true);
    try {
      await customerClient.post(`/customer/quotes/${quote.id}/accept`, {
        signerName,
        termsVersion: quote.termsVersion,
      });
      toast.success('Proposal accepted and recorded');
      await reload();
    } catch (error) {
      toast.error(error.response?.data?.error?.message ?? 'This proposal cannot be accepted yet');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-sky-700">
            Proposal v{quote.version}
          </div>
          <h3 className="mt-1 text-lg font-bold text-slate-950">{quote.title}</h3>
          <p className="text-sm text-slate-500">
            Valid until{' '}
            {quote.validUntil
              ? new Date(quote.validUntil).toLocaleDateString('en-IN')
              : 'confirmed by your planner'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-black text-slate-950">
            {money(quote.totalSell, quote.currency)}
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${quote.confidence === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
          >
            {quote.confidence}
          </span>
        </div>
      </div>
      {quote.comments?.length > 0 && (
        <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3">
          {quote.comments.map((item) => (
            <p key={item.id} className="text-sm text-slate-700">
              <b>{item.authorType === 'traveller' ? 'You' : 'Planner'}:</b> {item.body}
            </p>
          ))}
        </div>
      )}
      {!accepted && (
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Ask your planner to adjust this proposal"
          />
          <Button variant="outline" disabled={busy || !comment.trim()} onClick={submitComment}>
            <MessageCircle className="mr-2 h-4 w-4" />
            Comment
          </Button>
          <Input
            value={signerName}
            onChange={(event) => setSignerName(event.target.value)}
            placeholder="Full legal name"
          />
          <Button disabled={busy || quote.confidence !== 'confirmed'} onClick={accept}>
            <FileCheck2 className="mr-2 h-4 w-4" />
            Accept & sign
          </Button>
        </div>
      )}
      {accepted && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />
          Accepted by {quote.acceptance?.signerName}
        </div>
      )}
    </article>
  );
}

function DocumentUploader({ trips, reload }) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('passport');
  const [tripId, setTripId] = useState('');
  const [busy, setBusy] = useState(false);
  async function upload() {
    if (!file) return toast.error('Choose a PDF or image');
    setBusy(true);
    try {
      const { data } = await customerClient.post('/customer/documents/presign', {
        tripId: tripId || undefined,
        documentType,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      const presign = data.data;
      const response = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: presign.requiredHeaders,
        body: file,
      });
      if (!response.ok) throw new Error('Object storage rejected the upload');
      toast.success('Uploaded to quarantine. It will appear as usable after malware scanning.');
      setFile(null);
      await reload();
    } catch (error) {
      toast.error(error.response?.data?.error?.message ?? error.message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-sky-300 bg-sky-50 p-4">
      <div className="flex items-center gap-2 font-bold text-sky-950">
        <UploadCloud className="h-5 w-5" />
        Secure document upload
      </div>
      <p className="mt-1 text-xs text-sky-800">
        Files go to tenant-isolated quarantine and are unavailable until the malware scan reports
        clean.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <select
          className="rounded-md border bg-white px-3 text-sm"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
        >
          {['passport', 'visa', 'id', 'insurance', 'ticket', 'voucher', 'medical', 'other'].map(
            (type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ),
          )}
        </select>
        <select
          className="rounded-md border bg-white px-3 text-sm"
          value={tripId}
          onChange={(event) => setTripId(event.target.value)}
        >
          <option value="">General wallet</option>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.name}
            </option>
          ))}
        </select>
        <Input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button disabled={busy || !file} onClick={upload}>
          {busy ? 'Uploading…' : 'Upload securely'}
        </Button>
      </div>
    </div>
  );
}

function IncidentReceiptUploader({ recovery, reload }) {
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [busy, setBusy] = useState(false);
  async function upload() {
    if (!file || !Number(amount)) return toast.error('Choose a receipt and enter its amount');
    setBusy(true);
    try {
      const { data } = await customerClient.post(
        `/customer/bookings/${recovery.bookingId}/incidents/${recovery.incidentId}/receipts/presign`,
        {
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          expenseType: recovery.issueType === 'hotel_issue' ? 'hotel' : 'transport',
          amount: Number(amount),
          currency: 'INR',
          merchant: merchant || undefined,
        },
      );
      const presign = data.data;
      const response = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: presign.requiredHeaders,
        body: file,
      });
      if (!response.ok) throw new Error('Object storage rejected the receipt');
      toast.success('Receipt uploaded for malware scan and staff reimbursement review.');
      setFile(null);
      setAmount('');
      setMerchant('');
      await reload();
    } catch (error) {
      toast.error(error.response?.data?.error?.message ?? error.message ?? 'Receipt upload failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="text-sm font-bold text-amber-950">Upload replacement receipt</div>
      <p className="mt-1 text-xs text-amber-800">
        Uploading starts a verification and staff review. It does not guarantee or immediately pay a
        reimbursement.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <Input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Input
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Amount (INR)"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <Input
          placeholder="Merchant / provider"
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
        />
        <Button disabled={busy || !file || !Number(amount)} onClick={upload}>
          {busy ? 'Uploading…' : 'Submit receipt'}
        </Button>
      </div>
    </div>
  );
}

function IncidentRecoveryCard({ recovery, reload }) {
  const alternatives = recovery.alternatives ?? [];
  const [resolving, setResolving] = useState(false);
  async function resolveIncident() {
    setResolving(true);
    try {
      await customerClient.post(
        `/customer/bookings/${recovery.bookingId}/incidents/${recovery.incidentId}/resolve`,
      );
      toast.success('SOS case closed. Any receipt review will continue separately.');
      await reload();
    } catch (error) {
      toast.error(error.response?.data?.error?.message ?? 'Could not close the SOS case');
    } finally {
      setResolving(false);
    }
  }
  return (
    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-black text-rose-950">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          Maya SOS · {recovery.issueType.replace(/_/g, ' ')}
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase text-rose-700">
          {recovery.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {(recovery.updates ?? []).slice(0, 4).map((update) => (
          <div key={update.id} className="rounded-xl bg-white p-3 text-sm text-slate-700">
            {update.message}
            <div className="mt-1 text-[10px] text-slate-400">
              {new Date(update.createdAt).toLocaleString('en-IN')}
            </div>
          </div>
        ))}
      </div>
      {alternatives.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {alternatives.map((option) => (
            <div key={option.id} className="rounded-xl border border-rose-100 bg-white p-3 text-sm">
              <div className="font-bold">{option.name}</div>
              <div className="text-xs capitalize text-slate-500">
                {option.availabilityStatus.replace(/_/g, ' ')}
              </div>
              {option.availabilityStatus === 'available' && (
                <div className="mt-1 text-xs text-slate-700">
                  {[option.contactName, option.phone, option.email].filter(Boolean).join(' · ')}
                </div>
              )}
              {option.bookingUrl && (
                <a
                  className="mt-2 inline-flex items-center text-xs font-bold text-sky-700 underline"
                  href={option.bookingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open official service <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      {(recovery.receipts ?? []).map((receipt) => (
        <div key={receipt.id} className="mt-3 rounded-xl bg-white p-3 text-sm">
          Receipt: {money(receipt.amount, receipt.currency)} ·{' '}
          <b>{receipt.status.replace(/_/g, ' ')}</b>
        </div>
      ))}
      {recovery.status === 'self_booking_advised' && (
        <IncidentReceiptUploader recovery={recovery} reload={reload} />
      )}
      {recovery.status !== 'resolved' && (
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={resolving}
          onClick={resolveIncident}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {resolving ? 'Closing…' : 'Service received — close SOS'}
        </Button>
      )}
    </div>
  );
}

function Hub({ data, reload, logout }) {
  const futureTrips = useMemo(() => data.trips ?? [], [data.trips]);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-lg font-black">MooNs Traveller Hub</div>
            <div className="text-xs text-slate-500">Welcome, {data.traveller.displayName}</div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={reload}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-7">
        <section className="rounded-3xl bg-gradient-to-br from-sky-950 to-sky-700 p-6 text-white shadow-xl">
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.25em] text-sky-200">
                Everything for the journey
              </p>
              <h1 className="mt-2 text-3xl font-black">
                Trips, payments and travel documents in one wallet.
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-sky-100">
                Live service status stays available here. In an emergency, use Maya chat and ask for
                a human immediately.
              </p>
            </div>
            <ShieldCheck className="h-20 w-20 text-sky-200" />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Plane className="h-5 w-5 text-sky-700" />
            <h2 className="text-xl font-black">My trips</h2>
          </div>
          <div className="space-y-4">
            {futureTrips.length ? (
              futureTrips.map((trip) => (
                <article
                  key={trip.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold">{trip.name}</h3>
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold uppercase text-sky-700">
                          {trip.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        <MapPin className="mr-1 inline h-4 w-4" />
                        {trip.destination ?? 'Custom journey'} ·{' '}
                        <CalendarDays className="ml-2 mr-1 inline h-4 w-4" />
                        {trip.startDate
                          ? new Date(trip.startDate).toLocaleDateString('en-IN')
                          : 'Dates being confirmed'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      Reference
                      <br />
                      <b className="text-slate-900">{trip.reference}</b>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Readiness readiness={trip.readiness} />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3 text-sm">
                      <Users className="mr-2 inline h-4 w-4 text-sky-700" />
                      {trip.party.length} participant(s)
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 text-sm">
                      <Plane className="mr-2 inline h-4 w-4 text-sky-700" />
                      {trip.services.length} service(s)
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 text-sm">
                      <WalletCards className="mr-2 inline h-4 w-4 text-sky-700" />
                      {trip.paymentSchedule.length} instalment(s)
                    </div>
                  </div>
                  {(trip.recoveries ?? []).map((recovery) => (
                    <IncidentRecoveryCard key={recovery.id} recovery={recovery} reload={reload} />
                  ))}
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                No trips are linked to this account yet.
              </div>
            )}
          </div>
        </section>

        {data.quotes?.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-sky-700" />
              <h2 className="text-xl font-black">Proposals</h2>
            </div>
            <div className="space-y-4">
              {data.quotes.map((quote) => (
                <QuoteCard
                  key={quote.id}
                  quote={quote}
                  traveller={data.traveller}
                  reload={reload}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-sky-700" />
            <h2 className="text-xl font-black">Travel wallet</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Documents', data.wallet.documents.length, FileCheck2],
              ['Payments', data.wallet.payments.length, WalletCards],
              ['Refunds', data.wallet.refunds.length, RefreshCw],
              ['Invoices', data.wallet.invoices.length, ReceiptText],
            ].map(([label, count, Icon]) => (
              <div key={label} className="rounded-2xl border bg-white p-4">
                <Icon className="h-5 w-5 text-sky-700" />
                <div className="mt-3 text-2xl font-black">{count}</div>
                <div className="text-sm text-slate-500">{label}</div>
              </div>
            ))}
          </div>
          <DocumentUploader trips={data.trips} reload={reload} />
        </section>

        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="font-black text-rose-900">Offline emergency information</h2>
          <p className="mt-1 text-sm text-rose-800">
            If you are in immediate danger, contact local emergency services first. Then open Maya
            chat and write “emergency” or “lost passport” for immediate human escalation. Save your
            embassy and insurer numbers before departure.
          </p>
        </section>
      </main>
    </div>
  );
}

function TravellerHubPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      setData((await customerClient.get('/customer/hub')).data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    navigator.serviceWorker?.register('/traveller-sw.js').catch(() => undefined);
    customerSession.restore().then((restored) => (restored ? load() : setLoading(false)));
  }, []);
  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [Boolean(data)]);
  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await customerSession.login(email, password);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.error?.message ?? 'Sign in failed');
      setLoading(false);
    }
  }
  async function logout() {
    await customerSession.logout();
    setData(null);
  }
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <RefreshCw className="mr-3 h-5 w-5 animate-spin" />
        Preparing your trips…
      </div>
    );
  if (data) return <Hub data={data} reload={load} logout={logout} />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-950 to-slate-950 p-4">
      <form onSubmit={login} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <div className="text-xs font-bold uppercase tracking-[.25em] text-sky-700">
          MooNs Travel
        </div>
        <h1 className="mt-2 text-3xl font-black">Traveller Hub</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in to view trips, proposals, documents, payments and live support.
        </p>
        <div className="mt-6 space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
          <Button className="w-full" type="submit">
            Sign in securely
          </Button>
        </div>
      </form>
    </div>
  );
}
