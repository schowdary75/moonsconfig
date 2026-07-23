// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { createFileRoute } from '@/lib/routerCompat';
import { toast } from '@/lib/toast';
import {
  Smartphone,
  FileText,
  Settings2,
  Plus,
  Trash2,
  ChevronRight,
  Palette,
  IndianRupee,
  Eye,
  Send,
  Download,
  Mail,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  adminGetLeads,
  adminGetPackagesAll,
  adminGetPackageDetail,
  sendWhatsAppQuote,
  adminAiAutoQuote,
  adminSendQuoteEmail,
  type LeadSubmissionRow,
  type PackageRow,
  type PackageDetail,
} from '@/lib/api/db.functions';
// Types only — erased at build, so this import does NOT pull in @react-pdf.
// The actual PDF engine + templates load lazily via '@/components/QuotePdfPanel'.
import type {
  CustomActivity,
  CustomStay,
  CustomTransfer,
  QuotePDFProps,
} from '@/components/QuotePDFTemplate';
import { Bed, CarFront } from 'lucide-react';

// Lazily-loaded live preview — react-pdf only downloads when this renders.
// The blob generator is imported dynamically inside the handlers for the same
// reason, so nothing in the PDF engine is in the Proposals route chunk.
const QuotePdfPreview = lazy(() => import('@/components/QuotePdfPanel'));

export interface EditableItineraryDay {
  id: string;
  day_number: number;
  title: string;
  description: string;
}

export const Route = createFileRoute('/_authenticated/quotes/')({
  component: QuotesPage,
});

// Theme gallery data
const THEME_OPTIONS = [
  {
    id: 'v12',
    name: 'Premium Field Guide',
    desc: 'Dark beige expedition style',
    colors: ['#2E352B', '#D6A848', '#F1EBD8'],
  },
  {
    id: 'v6',
    name: 'Forest Adventure',
    desc: 'Deep green earth tones',
    colors: ['#0F2818', '#10B981', '#F0FDF4'],
  },
  {
    id: 'v7',
    name: 'Light Elegant',
    desc: 'Clean minimal white',
    colors: ['#FFFFFF', '#059669', '#1F2937'],
  },
  {
    id: 'v8',
    name: 'Dark Gold Premium',
    desc: 'Luxe noir & gold',
    colors: ['#0F1117', '#D4AF37', '#F8F9FA'],
  },
  {
    id: 'v9',
    name: 'Honeymoon Edition',
    desc: 'Blush champagne romance',
    colors: ['#881337', '#FDA4AF', '#FFF8F9'],
  },
  {
    id: 'v10',
    name: 'Family Plan',
    desc: 'Warm teal nature',
    colors: ['#0C4A3E', '#14B8A6', '#F0FDFA'],
  },
  {
    id: 'v11',
    name: 'Couple Passport',
    desc: 'Burgundy & gold elegance',
    colors: ['#3B0A2B', '#FBBF24', '#FDF4FF'],
  },
  {
    id: 'v13',
    name: 'Blue Experiential',
    desc: 'Modern deep blue & orange',
    colors: ['#0F172A', '#F97316', '#EFF6FF'],
  },
];

// Steps for the workflow
const STEPS = [
  { id: 1, label: 'Select Lead', icon: Settings2 },
  { id: 2, label: 'Choose Package', icon: FileText },
  { id: 3, label: 'Customize', icon: Palette },
  { id: 4, label: 'Review & Send', icon: Send },
];

function QuotesPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<LeadSubmissionRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);

  const [leadId, setLeadId] = useState<number | null>(null);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [pkgDetail, setPkgDetail] = useState<PackageDetail | null>(null);

  const [customNotes, setCustomNotes] = useState<string>('');
  const [selectedTheme, setSelectedTheme] = useState<string>('v12');
  const [customItinerary, setCustomItinerary] = useState<EditableItineraryDay[]>([]);

  // Custom Activities & Finance
  const [activities, setActivities] = useState<CustomActivity[]>([]);
  const [customStays, setCustomStays] = useState<CustomStay[]>([]);
  const [customTransfers, setCustomTransfers] = useState<CustomTransfer[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [applyTax, setApplyTax] = useState<boolean>(true); // 5% GST

  const [isSending, setIsSending] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  const handleAiAutoQuote = async () => {
    if (!auth || !leadId) return;
    setIsAiGenerating(true);
    try {
      const result = await adminAiAutoQuote({ data: { auth, leadId } });
      setPackageId(result.packageId);
      setDiscountPercent(result.discountPercent);
      if (result.customItinerary?.length > 0) {
        setCustomItinerary(
          result.customItinerary.map((d: any) => ({
            id: Math.random().toString(36).substr(2, 9),
            day_number: d.day_number,
            title: d.title || '',
            description: d.description || '',
          })),
        );
      }
      setActiveStep(3);
      toast.success('AI successfully generated a custom proposal!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI Auto-Quote failed.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  useEffect(() => {
    async function load() {
      if (!auth) return;
      try {
        const [leadRows, packageRows] = await Promise.all([
          adminGetLeads({ data: { auth } }),
          adminGetPackagesAll({ data: { auth } }),
        ]);
        setLeads(leadRows);
        setPackages(packageRows.filter((p) => p.is_active));

        const urlLeadId = new URLSearchParams(window.location.search).get('leadId');
        if (urlLeadId && leadRows.some((l) => l.id === Number(urlLeadId))) {
          setLeadId(Number(urlLeadId));
        } else if (leadRows.length > 0) {
          setLeadId(leadRows[0].id);
        }
        if (packageRows.length > 0) {
          const firstPkg = packageRows.find((p) => p.is_active) || packageRows[0];
          setPackageId(firstPkg.id);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load quote data');
      }
    }
    load();
  }, [user?.session_token]);

  // Load Full Package Detail when Package ID changes
  useEffect(() => {
    async function loadDetail() {
      if (!auth || !packageId) return;
      try {
        const detail = await adminGetPackageDetail({ data: { auth, id: packageId } });
        setPkgDetail(detail);
        if (detail) {
          autoDetectTheme(detail.themes || []);
          setActivities([]); // Reset custom activities when changing package
          setDiscountPercent(0);

          // Seed custom itinerary from base package
          if (detail.itinerary) {
            setCustomItinerary(
              detail.itinerary.map((d) => ({
                id: Math.random().toString(36).substr(2, 9),
                day_number: d.day_number,
                title: d.title || '',
                description: d.description || '',
              })),
            );
          } else {
            setCustomItinerary([]);
          }
        }
      } catch (err) {
        toast.error('Failed to fetch detailed package info.');
      }
    }
    loadDetail();
  }, [packageId, user?.session_token]);

  function autoDetectTheme(themes: string[]) {
    if (!themes) return;
    const lowerThemes = themes.map((t) => t.toLowerCase());
    if (lowerThemes.includes('honeymoon') || lowerThemes.includes('romantic'))
      setSelectedTheme('v9');
    else if (lowerThemes.includes('adventure') || lowerThemes.includes('trekking'))
      setSelectedTheme('v6');
    else if (lowerThemes.includes('family')) setSelectedTheme('v10');
    else if (lowerThemes.includes('solo')) setSelectedTheme('v8');
    else setSelectedTheme('v12');
  }

  // Derived State
  const lead = leads.find((item) => item.id === leadId) || null;
  const pkg = pkgDetail || packages.find((item) => item.id === packageId) || null;

  // Financial Calculations
  const basePrice = pkg?.price || 0;
  const activitiesCost = activities.reduce((sum, act) => sum + act.price, 0);
  const subtotal = basePrice + activitiesCost;

  // Restrict discount to max 15%
  const safeDiscountPercent = Math.min(Math.max(discountPercent, 0), 15);
  const discountAmount = subtotal * (safeDiscountPercent / 100);

  const postDiscount = subtotal - discountAmount;
  const taxAmount = applyTax ? postDiscount * 0.05 : 0;
  const finalPrice = postDiscount + taxAmount;

  // UI Handlers
  const addActivity = () => {
    if (!pkgDetail?.itinerary || pkgDetail.itinerary.length === 0) {
      toast.error('No itinerary days available to attach activity to.');
      return;
    }
    const newAct: CustomActivity = {
      id: Math.random().toString(36).substr(2, 9),
      dayNumber: pkgDetail.itinerary[0].day_number,
      name: '',
      price: 0,
    };
    setActivities([...activities, newAct]);
  };

  const updateActivity = (id: string, field: keyof CustomActivity, value: any) => {
    setActivities((acts) => acts.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };

  const removeActivity = (id: string) => {
    setActivities((acts) => acts.filter((a) => a.id !== id));
  };

  const updateItineraryDay = (
    id: string,
    field: keyof EditableItineraryDay,
    value: string | number,
  ) => {
    setCustomItinerary((itin) =>
      itin.map((day) => (day.id === id ? { ...day, [field]: value } : day)),
    );
  };

  const removeItineraryDay = (id: string) => {
    setCustomItinerary((itin) =>
      itin.filter((day) => day.id !== id).map((day, idx) => ({ ...day, day_number: idx + 1 })),
    );
  };

  const addItineraryDay = () => {
    const newDay: EditableItineraryDay = {
      id: Math.random().toString(36).substr(2, 9),
      day_number: customItinerary.length + 1,
      title: 'New Day',
      description: '',
    };
    setCustomItinerary([...customItinerary, newDay]);
  };

  const addStay = () =>
    setCustomStays([
      ...customStays,
      {
        id: Math.random().toString(36).substr(2, 9),
        name: '',
        type: 'Hotel',
        stars: 4,
        rooms: 1,
        nights: 1,
      },
    ]);
  const updateStay = (id: string, field: keyof CustomStay, value: any) =>
    setCustomStays((s) => s.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const removeStay = (id: string) => setCustomStays((s) => s.filter((x) => x.id !== id));

  const addTransfer = () =>
    setCustomTransfers([
      ...customTransfers,
      {
        id: Math.random().toString(36).substr(2, 9),
        vehicleType: 'SUV',
        serviceType: 'Airport Transfer',
        pax: 2,
      },
    ]);
  const updateTransfer = (id: string, field: keyof CustomTransfer, value: any) =>
    setCustomTransfers((s) => s.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const removeTransfer = (id: string) => setCustomTransfers((s) => s.filter((x) => x.id !== id));

  const pdfProps: QuotePDFProps = useMemo(
    () => ({
      templateStyle: selectedTheme,
      leadName: lead?.name || 'Client',
      leadDestination: lead?.destination || pkg?.country || 'Destination',
      leadBudget: lead?.budget_range || 'N/A',
      leadNotes: customNotes,
      packageName: pkg?.name || 'Bespoke Package',
      packageCategory: pkgDetail?.category || 'Premium',
      packageDuration: `${pkgDetail?.days || 0}D/${pkgDetail?.nights || 0}N`,
      itinerary: customItinerary,
      stays: customStays,
      transfers: customTransfers,
      inclusions: pkgDetail?.inclusions || [],
      exclusions: pkgDetail?.exclusions || [],
      activities,
      basePrice,
      activitiesCost,
      discountAmount,
      taxAmount,
      finalPrice,
    }),
    [
      selectedTheme,
      lead,
      pkg,
      customNotes,
      pkgDetail,
      customItinerary,
      customStays,
      customTransfers,
      activities,
      basePrice,
      activitiesCost,
      discountAmount,
      taxAmount,
      finalPrice,
    ],
  );

  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownload = async () => {
    if (!lead || !pkgDetail) return;
    setIsDownloading(true);
    try {
      const { generateQuotePdfBlob } = await import('@/components/QuotePdfPanel');
      const blob = await generateQuotePdfBlob(pdfProps);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MooNs-Proposal-${(pkg?.name || 'quote').replace(/[^a-z0-9]+/gi, '-')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Proposal PDF downloaded');
    } catch (err) {
      toast.error('Failed to generate PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const [isEmailing, setIsEmailing] = useState(false);
  const handleEmail = async () => {
    if (!auth || !lead || !pkgDetail) return;
    if (!lead.email) {
      toast.error('This lead has no email address on file.');
      return;
    }
    setIsEmailing(true);
    try {
      const { generateQuotePdfBlob } = await import('@/components/QuotePdfPanel');
      const blob = await generateQuotePdfBlob(pdfProps);
      const buffer = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const pdfBase64 = btoa(binary);
      await adminSendQuoteEmail({
        data: {
          auth,
          leadId: lead.id,
          leadEmail: lead.email,
          leadName: lead.name,
          packageName: pkg?.name || 'Bespoke Package',
          finalPrice,
          pdfBase64,
        },
      });
      toast.success(`Proposal emailed to ${lead.email} — lead moved to Quote Sent`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to email proposal');
    } finally {
      setIsEmailing(false);
    }
  };

  const handleSend = async () => {
    if (!lead || !pkg) return;
    if (
      !window.confirm(`Are you sure you want to send this ${selectedTheme} quote to ${lead.phone}?`)
    )
      return;

    setIsSending(true);
    try {
      await sendWhatsAppQuote({
        data: {
          leadId: lead.id,
          leadPhone: lead.phone,
          leadName: lead.name,
          packageName: pkg.name,
          packagePrice: finalPrice,
        },
      });
      const message = `Hi ${lead.name},\n\nHere is your custom quote for the *${pkg.name}* package.\n\nTotal: Rs ${finalPrice.toLocaleString('en-IN')}\n\nPlease let me know if you have any questions!`;
      const encodedMessage = encodeURIComponent(message);
      const cleanPhone = lead.phone.replace(/\D/g, '');
      window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');

      toast.success(`Quote successfully dispatched to ${lead.name}!`);
    } catch (err) {
      toast.error('Failed to update status and send message.');
    } finally {
      setIsSending(false);
    }
  };

  // Auto-advance step based on selections
  const computedStep = useMemo(() => {
    if (!leadId) return 1;
    if (!packageId || !pkgDetail) return 2;
    if (activeStep < 4) return activeStep;
    return 4;
  }, [leadId, packageId, pkgDetail, activeStep]);

  return (
    <div className="flex flex-col gap-6 pb-12 animate-fade-in">
      {/* ─── HEADER ─── */}
      <div className="flex items-start justify-between">
        <div />
      </div>

      {/* ─── STEP INDICATOR ─── */}
      <div className="flex items-center gap-1 p-1.5 rounded-xl glass-card">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isActive = computedStep >= step.id;
          const isCurrent = computedStep === step.id;
          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => setActiveStep(step.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all w-full ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted/60'
                }`}
              >
                <div
                  className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-all ${
                    isCurrent
                      ? 'bg-primary-foreground text-primary scale-110'
                      : isActive
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step.id}
                </div>
                <StepIcon className="w-3.5 h-3.5 hidden sm:block" />
                <span className="hidden md:inline">{step.label}</span>
              </button>
              {idx < STEPS.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 mx-1 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[480px_1fr] items-start">
        {/* ═══════ LEFT COLUMN: Controls ═══════ */}
        <div className="flex flex-col gap-4">
          {/* Lead Selection */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 font-sans">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                  1
                </div>
                Select Lead
              </CardTitle>
            </CardHeader>
            <CardContent>
              <select
                id="quote-lead-select"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm focus:ring-2 focus:ring-primary transition-shadow"
                value={leadId || ''}
                onChange={(event) => {
                  setLeadId(Number(event.target.value));
                  if (activeStep < 2) setActiveStep(2);
                }}
              >
                {leads.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.destination || 'Open'}
                  </option>
                ))}
              </select>
              {lead && (
                <div className="mt-3 flex flex-col gap-2 p-2.5 rounded-md bg-muted/50 border border-border/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {lead.name?.[0]?.toUpperCase() || 'L'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lead.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.destination || 'No destination'} · {lead.budget_range || 'No budget'}{' '}
                        · {lead.theme || 'General'}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {lead.status || 'New'}
                    </Badge>
                  </div>
                  <Button
                    variant="default"
                    className="w-full text-xs h-8 mt-1 bg-gradient-to-r from-purple-600 to-primary text-white border-0 shadow-sm hover:opacity-90"
                    onClick={handleAiAutoQuote}
                    disabled={isAiGenerating}
                  >
                    {isAiGenerating ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 mr-2" />
                    )}
                    {isAiGenerating ? 'AI Matchmaking & Rewriting...' : 'AI Auto-Quote Generator'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Package Selection */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 font-sans">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                  2
                </div>
                Choose Package
              </CardTitle>
            </CardHeader>
            <CardContent>
              <select
                id="quote-package-select"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm focus:ring-2 focus:ring-primary transition-shadow"
                value={packageId || ''}
                onChange={(event) => {
                  setPackageId(Number(event.target.value));
                  if (activeStep < 3) setActiveStep(3);
                }}
              >
                {packages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.days}D/{item.nights}N
                  </option>
                ))}
              </select>
              {pkgDetail && (
                <div className="mt-3 p-2.5 rounded-md bg-muted/50 border border-border/30">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-medium">{pkgDetail.name}</p>
                    <span className="text-xs font-mono font-semibold text-primary">
                      Rs {(pkgDetail.price || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {pkgDetail.days}D/{pkgDetail.nights}N
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {pkgDetail.category}
                    </Badge>
                    {(pkgDetail.themes || []).slice(0, 2).map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Theme Gallery */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 font-sans">
                <Palette className="w-4 h-4 text-primary" />
                Template Theme
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {THEME_OPTIONS.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSelectedTheme(theme.id)}
                    className={`relative p-3 rounded-xl border text-left transition-all duration-200 ${
                      selectedTheme === theme.id
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/30 shadow-md scale-[1.02]'
                        : 'border-border/40 hover:border-border hover:bg-muted/30 hover:scale-[1.01]'
                    }`}
                  >
                    {/* Color swatches */}
                    <div className="flex gap-1.5 mb-2">
                      {theme.colors.map((c, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-full border border-border/30 shadow-sm"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <p className="text-xs font-bold truncate">{theme.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{theme.desc}</p>
                    {selectedTheme === theme.id && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
                        <Eye className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Custom Activities */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2 font-sans">
                <FileText className="w-4 h-4 text-primary" />
                Add-on Experiences
              </CardTitle>
              <Button size="sm" variant="outline" onClick={addActivity} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {activities.length === 0 ? (
                <div className="text-xs text-muted-foreground italic text-center py-3 border border-dashed rounded-md">
                  No custom experiences added. Click "+ Add" to include extras.
                </div>
              ) : (
                activities.map((act) => (
                  <div
                    key={act.id}
                    className="grid grid-cols-[70px_1fr_80px_auto] gap-2 items-center bg-muted/30 p-2 rounded-md border border-border/30"
                  >
                    <select
                      className="h-7 rounded border bg-background text-[11px] px-1"
                      value={act.dayNumber}
                      onChange={(e) => updateActivity(act.id, 'dayNumber', Number(e.target.value))}
                    >
                      {pkgDetail?.itinerary?.map((d) => (
                        <option key={d.day_number} value={d.day_number}>
                          Day {d.day_number}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="h-7 text-xs"
                      placeholder="e.g. Helicopter Tour"
                      value={act.name}
                      onChange={(e) => updateActivity(act.id, 'name', e.target.value)}
                    />
                    <Input
                      type="number"
                      className="h-7 text-xs font-mono"
                      placeholder="Cost"
                      value={act.price || ''}
                      onChange={(e) => updateActivity(act.id, 'price', Number(e.target.value))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive/80"
                      onClick={() => removeActivity(act.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Custom Itinerary */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2 font-sans">
                <Palette className="w-4 h-4 text-primary" />
                Customize Itinerary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customItinerary.length === 0 ? (
                <div className="text-xs text-muted-foreground italic text-center py-3 border border-dashed rounded-md">
                  No itinerary available to customize.
                </div>
              ) : (
                <div className="space-y-3">
                  {customItinerary.map((day) => (
                    <div
                      key={day.id}
                      className="relative bg-muted/30 p-3 rounded-lg border border-border/50 group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-[10px] bg-background">
                          Day {day.day_number}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeItineraryDay(day.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <Input
                        className="h-8 text-xs font-semibold mb-2 bg-background border-border/50"
                        placeholder="Day Title (e.g., Arrival in Zurich)"
                        value={day.title}
                        onChange={(e) => updateItineraryDay(day.id, 'title', e.target.value)}
                      />
                      <Textarea
                        className="min-h-16 text-xs resize-y bg-background border-border/50 p-2 leading-relaxed"
                        placeholder="Describe the day's activities..."
                        value={day.description}
                        onChange={(e) => updateItineraryDay(day.id, 'description', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={addItineraryDay}
                className="w-full h-8 text-xs mt-2 border-dashed"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add New Day
              </Button>
            </CardContent>
          </Card>

          {/* Custom Stays */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2 font-sans">
                <Bed className="w-4 h-4 text-primary" />
                Accommodations
              </CardTitle>
              <Button size="sm" variant="outline" onClick={addStay} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {customStays.length === 0 ? (
                <div className="text-xs text-muted-foreground italic text-center py-3 border border-dashed rounded-md">
                  No stays added.
                </div>
              ) : (
                customStays.map((stay) => (
                  <div
                    key={stay.id}
                    className="grid grid-cols-[1fr_70px_70px_60px_60px_auto] gap-2 items-center bg-muted/30 p-2 rounded-md border border-border/30"
                  >
                    <Input
                      className="h-7 text-xs"
                      placeholder="Hotel Name"
                      value={stay.name}
                      onChange={(e) => updateStay(stay.id, 'name', e.target.value)}
                    />
                    <select
                      className="h-7 rounded border bg-background text-[10px] px-1"
                      value={stay.type}
                      onChange={(e) => updateStay(stay.id, 'type', e.target.value)}
                    >
                      <option value="Hotel">Hotel</option>
                      <option value="Resort">Resort</option>
                      <option value="Villa">Villa</option>
                      <option value="Boutique">Boutique</option>
                      <option value="Camp">Camp</option>
                    </select>
                    <select
                      className="h-7 rounded border bg-background text-[10px] px-1"
                      value={stay.stars}
                      onChange={(e) => updateStay(stay.id, 'stars', Number(e.target.value))}
                    >
                      <option value={3}>3 Star</option>
                      <option value={4}>4 Star</option>
                      <option value={5}>5 Star</option>
                    </select>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      placeholder="Rooms"
                      value={stay.rooms}
                      onChange={(e) => updateStay(stay.id, 'rooms', Number(e.target.value))}
                    />
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      placeholder="Nights"
                      value={stay.nights}
                      onChange={(e) => updateStay(stay.id, 'nights', Number(e.target.value))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive/80"
                      onClick={() => removeStay(stay.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Custom Transfers */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2 font-sans">
                <CarFront className="w-4 h-4 text-primary" />
                Logistics & Cars
              </CardTitle>
              <Button size="sm" variant="outline" onClick={addTransfer} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {customTransfers.length === 0 ? (
                <div className="text-xs text-muted-foreground italic text-center py-3 border border-dashed rounded-md">
                  No vehicles/transfers added.
                </div>
              ) : (
                customTransfers.map((tf) => (
                  <div
                    key={tf.id}
                    className="grid grid-cols-[110px_1fr_60px_auto] gap-2 items-center bg-muted/30 p-2 rounded-md border border-border/30"
                  >
                    <Input
                      className="h-7 text-xs"
                      placeholder="Vehicle (e.g. SUV)"
                      value={tf.vehicleType}
                      onChange={(e) => updateTransfer(tf.id, 'vehicleType', e.target.value)}
                    />
                    <Input
                      className="h-7 text-xs"
                      placeholder="Service (e.g. Airport Pickup)"
                      value={tf.serviceType}
                      onChange={(e) => updateTransfer(tf.id, 'serviceType', e.target.value)}
                    />
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      placeholder="Pax"
                      value={tf.pax}
                      onChange={(e) => updateTransfer(tf.id, 'pax', Number(e.target.value))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive/80"
                      onClick={() => removeTransfer(tf.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Financials & Send */}
          <Card className="border-border/50 shadow-sm glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 font-sans">
                <IndianRupee className="w-4 h-4 text-primary" />
                Financials & Context
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="space-y-1.5 block">
                <span className="text-xs font-medium text-muted-foreground">
                  Custom Notes / Intro
                </span>
                <Textarea
                  className="min-h-14 text-sm resize-none focus:ring-2 focus:ring-primary border-border/50"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="e.g. As discussed, I've upgraded the villa..."
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="text-xs font-medium text-muted-foreground">
                    Discount % (Max 15)
                  </span>
                  <Input
                    type="number"
                    max="15"
                    min="0"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value))}
                    className="font-mono text-green-600 font-semibold h-9 border-border/50"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-xs font-medium text-muted-foreground">Apply Taxes</span>
                  <select
                    className="h-9 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
                    value={applyTax ? 'yes' : 'no'}
                    onChange={(e) => setApplyTax(e.target.value === 'yes')}
                  >
                    <option value="yes">Yes (+5% GST)</option>
                    <option value="no">No Tax / Included</option>
                  </select>
                </label>
              </div>

              {/* Financial Summary */}
              <div className="pt-3 mt-2 border-t border-border/50 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Base Package:</span>
                  <span className="font-mono font-medium">Rs {basePrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Experiences:</span>
                  <span className="font-mono font-medium text-blue-600">
                    + Rs {activitiesCost.toLocaleString()}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      Discount ({safeDiscountPercent}%):
                    </span>
                    <span className="font-mono font-medium text-green-600">
                      - Rs {Math.round(discountAmount).toLocaleString()}
                    </span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Taxes (5% GST):</span>
                    <span className="font-mono font-medium text-amber-600">
                      + Rs {Math.round(taxAmount).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center font-bold text-sm pt-2 mt-2 border-t border-border/50">
                  <span>Final Total:</span>
                  <span className="font-mono text-primary text-base">
                    Rs {Math.round(finalPrice).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  id="quote-send-whatsapp"
                  onClick={handleSend}
                  disabled={!lead || !pkg || isSending}
                  className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white shadow-md font-semibold transition-all hover:shadow-lg hover:scale-[1.01]"
                >
                  <Smartphone className="mr-2 h-4 w-4" />
                  {isSending ? 'Sending...' : 'WhatsApp'}
                </Button>
                <Button
                  variant="outline"
                  disabled={!lead || !pkgDetail || isDownloading}
                  onClick={handleDownload}
                  className="h-11 px-3 hover:bg-primary/10 hover:text-primary transition-all"
                  title="Download PDF"
                >
                  {isDownloading ? (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  disabled={!lead || !pkgDetail || !lead?.email || isEmailing}
                  onClick={handleEmail}
                  className="h-11 px-3 hover:bg-primary/10 hover:text-primary transition-all"
                  title={lead?.email ? `Email PDF to ${lead.email}` : 'Lead has no email on file'}
                >
                  {isEmailing ? (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══════ RIGHT COLUMN: Live PDF Preview ═══════ */}
        <div
          style={{
            height: `${(3 + (customItinerary.length > 0 ? 1 : 0) + (customStays.length > 0 || customTransfers.length > 0 ? 1 : 0)) * 1170}px`,
          }}
          className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden shadow-lg flex flex-col glass-card"
        >
          <div className="bg-card px-4 py-2.5 border-b flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Live Preview
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-mono">
                {3 +
                  (customItinerary.length > 0 ? 1 : 0) +
                  (customStays.length > 0 || customTransfers.length > 0 ? 1 : 0)}{' '}
                pages · {selectedTheme.toUpperCase()}
              </span>
              <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
          <div className="flex-1 w-full relative">
            {lead && pkgDetail ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground flex-col gap-3 p-12 animate-pulse">
                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                      <FileText className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-center">Loading PDF engine...</p>
                  </div>
                }
              >
                <QuotePdfPreview {...pdfProps} />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground flex-col gap-3 p-12">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-center">
                  {packageId && !pkgDetail
                    ? 'Loading full package details...'
                    : 'Select a lead and package to preview your quote.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
