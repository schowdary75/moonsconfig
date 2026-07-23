// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Check, Plus, Save, Users, X, Sparkles, Mail, Edit, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { VerificationChip } from '@/components/verification-chip';
import { GoogleVerifyButton } from '@/components/google-verify-button';
import { RegionTabs, coverageMatchesRegion, type RegionTab } from '@/components/region-tabs';
import { usePagination, DataTablePagination } from '@/components/ui/data-table-pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  adminGetVendorsAll,
  adminUpdateVendorStatus,
  submitVendorApplication,
  type VendorProfile,
  type VendorStatus,
  adminAiDraftRfq,
  adminSendRfqEmail,
  adminBulkProcessVendors,
  adminGetOutreachQueue,
  adminGetVendorCommunications,
  adminReprocessVendorInbox,
  adminProcessVendorRfqBatch,
  adminGetVendorDrafts,
  adminApproveInventoryDraft,
  adminGetEmailTemplates,
  adminUpdateVendor,
  adminReplyToVendorThread,
} from '@/lib/api/db.functions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseCsv } from '@/lib/csv';
import { Send, ChevronLeft, ChevronRight } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/vendors/')({
  component: Vendors,
});

// Convert an email body (HTML or plain text) into readable, structure-preserving
// text. We do NOT render raw HTML (no sanitizer available → XSS risk from vendor
// replies); instead block tags become line breaks and list items become bullets,
// so a formatted email reads properly instead of collapsing into one sentence.
function emailBodyToText(raw: string): string {
  if (!raw) return '';
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(raw);
  let text = raw;
  if (looksLikeHtml) {
    text = text
      .replace(/<\s*(br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|tr|h[1-6]|ul|ol|table)\s*>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"');
  }
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

// An inbound message is a "reply" when its subject is an Re:/Fwd: of ours,
// otherwise the vendor started a new email. Used to label messages in a thread.
function inboundKind(subject: string): 'reply' | 'new' {
  return /^\s*(re|fw|fwd)\s*:/i.test(subject || '') ? 'reply' : 'new';
}

const serviceOptions = ['accommodation', 'car', 'experience', 'package'] as const;

function Vendors() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [communications, setCommunications] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [activeRegion, setActiveRegion] = useState<RegionTab>('international');
  const [editing, setEditing] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    whatsapp: '',
    serviceCategories: ['accommodation'] as ('package' | 'car' | 'experience' | 'accommodation')[],
    coverageAreas: '',
    bio: '',
    logoUrl: '',
    coverImageUrl: '',
    imageKey: 'bali',
  });

  // AI RFQ State
  const [showRfqModal, setShowRfqModal] = useState(false);
  const [rfqVendor, setRfqVendor] = useState<VendorProfile | null>(null);
  const [isDraftingRfq, setIsDraftingRfq] = useState(false);
  const [rfqDraft, setRfqDraft] = useState('');
  const [rfqSubject, setRfqSubject] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);

  // Inbox UI State
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [inboxPage, setInboxPage] = useState(0);
  const INBOX_LIMIT = 50;
  const [totalCommunications, setTotalCommunications] = useState(0);

  const openRfqModal = (vendor: VendorProfile) => {
    setRfqVendor(vendor);
    setShowRfqModal(true);
    setRfqDraft('');
    setRfqSubject(`Request For Quotation - MooNs Enterprise (${vendor.coverage_areas})`);
  };

  const applyTemplate = (templateId: string) => {
    const t = templates.find((x) => x.id.toString() === templateId);
    if (t) {
      setRfqSubject(t.subject);
      setRfqDraft(t.body);
      toast.success('Template applied');
    }
  };

  const handleEditVendor = (vendor: VendorProfile) => {
    setEditingVendorId(vendor.id);
    let parsedServices = vendor.service_categories as any;
    if (typeof parsedServices === 'string') {
      try {
        parsedServices = JSON.parse(parsedServices);
      } catch {
        parsedServices = [parsedServices];
      }
    }
    setForm({
      companyName: vendor.company_name,
      contactName: vendor.contact_name || '',
      email: vendor.email,
      phone: vendor.phone || '',
      whatsapp: vendor.whatsapp || '',
      serviceCategories: (parsedServices || ['accommodation']) as any,
      coverageAreas: vendor.coverage_areas || '',
      bio: vendor.bio || '',
      logoUrl: '',
      coverImageUrl: '',
      imageKey: 'bali',
    });
    setEditing(true);
  };

  const handleDraftRfqAi = async () => {
    if (!auth || !rfqVendor) return;
    setIsDraftingRfq(true);
    try {
      const res = await adminAiDraftRfq({
        data: {
          auth,
          companyName: rfqVendor.company_name,
          services: rfqVendor.service_categories,
          coverage: rfqVendor.coverage_areas,
        },
      });
      setRfqDraft(res);
      toast.success('AI drafted RFQ!');
    } catch (err) {
      toast.error('Failed to draft RFQ');
    } finally {
      setIsDraftingRfq(false);
    }
  };

  const fetchVendors = useCallback(async () => {
    if (!auth) return;
    try {
      const [vRes, qRes, cRes, dRes, tRes] = await Promise.all([
        adminGetVendorsAll({ data: { auth } }),
        adminGetOutreachQueue({ data: { auth } }),
        adminGetVendorCommunications({
          data: { auth, offset: inboxPage * INBOX_LIMIT, limit: INBOX_LIMIT },
        }),
        adminGetVendorDrafts({ data: { auth } }),
        adminGetEmailTemplates({ data: { auth } }),
      ]);
      setVendors(vRes);
      setQueue(qRes);
      setCommunications((cRes as any).data || cRes);
      setTotalCommunications((cRes as any).total || 0);
      setDrafts(dRes);
      setTemplates(tRes || []);
    } catch (e) {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, [auth, inboxPage]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const [isSyncingInbox, setIsSyncingInbox] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Precompute grouped threads + preview text ONCE per data change, so typing in
  // the reply box (which re-renders the component) does not re-run the heavy
  // HTML→text conversion for every message. This is the main lag fix.
  const inboxThreads = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const msg of communications) {
      const key = String(msg.vendor_id ?? msg.thread_id ?? msg.id);
      (grouped[key] ||= []).push(msg);
    }
    return Object.entries(grouped)
      .map(([key, msgs]) => {
        const messages = [...msgs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        const latest = messages[messages.length - 1];
        return {
          key,
          messages,
          latest,
          replyCount: messages.filter((m) => m.direction === 'inbound').length,
          preview: emailBodyToText(String(latest.body_content || '').slice(0, 400)).slice(0, 160),
        };
      })
      .sort(
        (a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime(),
      );
  }, [communications]);

  // Full message bodies for the open thread, converted once per selection.
  const activeThread = useMemo(() => {
    if (!selectedThreadId) return null;
    const thread = inboxThreads.find((t) => t.key === selectedThreadId);
    if (!thread) return null;
    return {
      ...thread,
      rendered: thread.messages.map((m) => ({
        msg: m,
        isOutbound: m.direction === 'outbound',
        kind: m.direction === 'outbound' ? null : inboundKind(m.subject),
        text: emailBodyToText(m.body_content),
      })),
    };
  }, [inboxThreads, selectedThreadId]);

  // Open a thread at its most recent message (like email/chat), not the top.
  useEffect(() => {
    if (activeThread) messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [selectedThreadId, activeThread?.messages.length]);

  const syncInbox = useCallback(async () => {
    if (!auth) return;
    setIsSyncingInbox(true);
    try {
      const res = await adminReprocessVendorInbox({ data: { auth, days: 14 } });
      toast.success(`Inbox synced — ${res?.logged ?? 0} new reply(ies) from INBOX & Spam.`);
      await fetchVendors();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to sync inbox');
    } finally {
      setIsSyncingInbox(false);
    }
  }, [auth, fetchVendors]);

  const processBatch = async () => {
    if (!auth) return;
    setIsProcessingBatch(true);
    toast.info('Maya is processing the batch...');
    try {
      const res = await adminProcessVendorRfqBatch({ data: { auth } });
      toast.success(`Processed ${res.processed} emails successfully.`);
      fetchVendors();
    } catch (err) {
      toast.error('Failed to process batch');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const handleApproveDraft = async (draftId: number) => {
    if (!auth) return;
    toast.info('Approving and publishing to live inventory...');
    try {
      await adminApproveInventoryDraft({ data: { auth, draftId } });
      toast.success('Draft approved and inserted into database!');
      fetchVendors();
    } catch (err) {
      toast.error('Failed to approve draft');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth) return;

    setIsUploading(true);
    toast.info('Parsing CSV file...');

    try {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        toast.error('Only CSV imports are supported in production.');
        return;
      }
      const rows = parseCsv(await file.text());

      // Map rows to expected format based on header fuzzy matching
      const mappedVendors = rows
        .map((r) => {
          return {
            company_name:
              r['Vendor / DMC Name'] || r['Company Name'] || r['Vendor Name'] || r['Name'],
            email: r['Email Address'] || r['Email'] || r['Contact Email'],
            contact_name: r['Contact Name'] || '',
            phone: String(r['Contact Number'] || r['Phone'] || ''),
            service_categories: (r['Service Type'] || '')
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean),
            coverage_areas: r['Destinations'] || r['Coverage'] || '',
            bio: r['Service Description'] || r['Description'] || '',
          };
        })
        .filter((v) => v.email && v.company_name); // Only keep rows with email and name

      if (mappedVendors.length === 0) {
        toast.error(
          "No valid vendors found in the sheet. Ensure 'Vendor / DMC Name' and 'Email Address' columns exist.",
        );
        setIsUploading(false);
        return;
      }

      toast.info(`Found ${mappedVendors.length} vendors. Dispatching bulk RFQs...`);

      const res = await adminBulkProcessVendors({ data: { auth, vendors: mappedVendors } });
      toast.success(
        `Successfully queued ${res.processedCount} vendors for background AI outreach!`,
      );

      await fetchVendors(); // Refresh the list
    } catch (error) {
      console.error(error);
      toast.error('Failed to process CSV file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  async function saveVendor() {
    try {
      if (editingVendorId && auth) {
        await adminUpdateVendor({ data: { auth, vendorId: editingVendorId, ...form } });
        toast.success('Vendor updated successfully');
      } else {
        await submitVendorApplication({ data: form });
        toast.success('Vendor onboarded for review');
      }
      setEditing(false);
      setEditingVendorId(null);
      setForm({
        companyName: '',
        contactName: '',
        email: '',
        phone: '',
        whatsapp: '',
        serviceCategories: ['accommodation'] as (
          'package' | 'car' | 'experience' | 'accommodation'
        )[],
        coverageAreas: '',
        bio: '',
        logoUrl: '',
        coverImageUrl: '',
        imageKey: 'bali',
      });
      await fetchVendors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save vendor');
    }
  }

  async function setStatus(vendorId: number, status: VendorStatus) {
    if (!auth) return;
    await adminUpdateVendorStatus({ data: { auth, vendorId, status } });
    toast.success(`Vendor ${status.replace('_', ' ')}`);
    await fetchVendors();
  }

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filteredVendors = vendors.filter((vendor) => {
    const matchesRegion = coverageMatchesRegion(vendor.coverage_areas, activeRegion);
    const matchesStatus = statusFilter === 'all' || vendor.status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      vendor.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vendor.email && vendor.email.toLowerCase().includes(searchQuery.toLowerCase()));

    let parsedServices = vendor.service_categories as any;
    if (typeof parsedServices === 'string') {
      try {
        parsedServices = JSON.parse(parsedServices);
      } catch {
        parsedServices = [parsedServices];
      }
    }
    const matchesCategory =
      categoryFilter === 'all' || (parsedServices && parsedServices.includes(categoryFilter));

    return matchesRegion && matchesStatus && matchesSearch && matchesCategory;
  });

  const { currentPage, totalPages, setCurrentPage, paginatedItems } = usePagination(
    filteredVendors,
    15,
  );

  if (loading)
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">Loading vendors...</div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div />

        <Button
          onClick={() => {
            setEditingVendorId(null);
            setForm({
              companyName: '',
              contactName: '',
              email: '',
              phone: '',
              whatsapp: '',
              serviceCategories: ['accommodation'] as any,
              coverageAreas: '',
              bio: '',
              logoUrl: '',
              coverImageUrl: '',
              imageKey: 'bali',
            });
            setEditing(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Onboard Vendor
        </Button>
      </div>

      {editing && (
        <div className="rounded-md border bg-background p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Company name"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            />
            <Input
              placeholder="Contact name"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            />
            <Input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              placeholder="WhatsApp"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            />
            <Input
              placeholder="Coverage areas e.g. Dubai, Bali"
              value={form.coverageAreas}
              onChange={(e) => setForm({ ...form, coverageAreas: e.target.value })}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {serviceOptions.map((service) => (
              <label
                key={service}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.serviceCategories.includes(service)}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      serviceCategories: event.target.checked
                        ? [...current.serviceCategories, service]
                        : current.serviceCategories.filter((item) => item !== service),
                    }));
                  }}
                />

                {service}
              </label>
            ))}
          </div>
          <textarea
            className="mt-3 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Vendor bio / notes"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={saveVendor}>
              <Save className="mr-2 h-4 w-4" /> {editingVendorId ? 'Update Vendor' : 'Save Vendor'}
            </Button>
          </div>
        </div>
      )}

      {/* AI RFQ Modal */}
      {showRfqModal && rfqVendor && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border">
            <div className="flex justify-between items-center p-4 border-b bg-primary/5">
              <div className="flex items-center gap-2 text-primary font-display font-bold">
                <Sparkles className="w-5 h-5" /> AI Request For Quotation (RFQ)
              </div>
              <button
                onClick={() => setShowRfqModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="mb-4">
                <h4 className="font-semibold text-zinc-900">
                  To: {rfqVendor.contact_name} ({rfqVendor.company_name})
                </h4>
                <p className="text-xs text-muted-foreground">{rfqVendor.email}</p>
              </div>

              <div className="space-y-4">
                <div className="flex gap-2">
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an Email Template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="secondary"
                    onClick={handleDraftRfqAi}
                    disabled={isDraftingRfq}
                    className="shrink-0 gap-2"
                  >
                    <Sparkles className="w-4 h-4" />{' '}
                    {isDraftingRfq ? 'Drafting...' : 'Draft via AI'}
                  </Button>
                </div>

                <div className="space-y-2 mt-4">
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    value={rfqSubject}
                    onChange={(e) => setRfqSubject(e.target.value)}
                    placeholder="Email Subject..."
                  />
                </div>
                <div className="space-y-2 mt-4">
                  <label className="text-sm font-medium">Message Body</label>
                  <textarea
                    className="w-full min-h-[300px] p-3 text-sm border rounded-md bg-muted/20 whitespace-pre-wrap focus-visible:ring-primary/30"
                    value={rfqDraft}
                    onChange={(e) => setRfqDraft(e.target.value)}
                    placeholder="Dear Partner..."
                  />
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setShowRfqModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!auth || !rfqSubject || !rfqDraft) {
                        return toast.error('Please provide a subject and body.');
                      }
                      try {
                        toast.info('Maya is dispatching RFQ...');
                        await adminSendRfqEmail({
                          data: {
                            auth,
                            vendorEmail: rfqVendor.email,
                            subject: rfqSubject,
                            textBody: rfqDraft,
                          },
                        });
                        toast.success('RFQ Sent! Maya is now listening for a reply.');
                        setShowRfqModal(false);
                      } catch (e) {
                        toast.error('Failed to send RFQ');
                      }
                    }}
                  >
                    <Sparkles className="w-4 h-4 mr-2" /> Send via Maya Pipeline
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="directory" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="campaigns">Outreach Campaigns</TabsTrigger>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
        </TabsList>

        <TabsContent value="directory">
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-4">
                <RegionTabs value={activeRegion} onValueChange={setActiveRegion} />

                <div className="flex bg-muted/50 p-1 rounded-md">
                  {['all', 'pending_review', 'approved', 'rejected'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${statusFilter === status ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {status === 'all'
                        ? 'All Status'
                        : status
                            .split('_')
                            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />

                <Button
                  variant="outline"
                  className="h-9 border-primary/20 text-primary hover:bg-primary/5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <span className="animate-spin mr-2">⟳</span>
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {isUploading ? 'Processing...' : 'Bulk AI Upload'}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Input
                placeholder="Search vendors by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm h-10 bg-background"
              />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px] h-10 bg-background">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {serviceOptions.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell>
                      <div className="font-medium">{vendor.company_name}</div>
                      <div className="text-xs text-muted-foreground">{vendor.slug}</div>
                    </TableCell>
                    <TableCell>
                      <div>{vendor.contact_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {vendor.email} · {vendor.phone}
                      </div>
                    </TableCell>
                    <TableCell>{vendor.service_categories.join(', ')}</TableCell>
                    <TableCell>{vendor.coverage_areas}</TableCell>
                    <TableCell className="capitalize">{vendor.status.replace('_', ' ')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <VerificationChip
                          id={vendor.id}
                          tableName="vendors"
                          initialVerified={Boolean((vendor as any).is_verified)}
                        />
                        <GoogleVerifyButton
                          url={(vendor as any).google_search_url}
                          queryParts={[
                            vendor.company_name,
                            vendor.coverage_areas,
                            'official vendor contact',
                          ]}
                        />
                      </div>
                      {(vendor as any).source_name && (
                        <div
                          className="mt-1 max-w-[220px] truncate text-[10px] text-muted-foreground"
                          title={(vendor as any).research_notes || (vendor as any).source_name}
                        >
                          {(vendor as any).source_name}{' '}
                          {(vendor as any).last_checked_at
                            ? `- checked ${(vendor as any).last_checked_at}`
                            : ''}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="p-2 align-middle text-right">
                      {vendor.status === 'pending_review' ? (
                        <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden mb-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 rounded-none border-r border-border h-7 text-xs bg-background hover:bg-muted text-green-600 dark:text-green-500"
                            onClick={() => setStatus(vendor.id, 'approved')}
                          >
                            <Check className="mr-2 h-3 w-3" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 rounded-none h-7 text-xs bg-background hover:bg-muted text-red-600 dark:text-red-500"
                            onClick={() => setStatus(vendor.id, 'rejected')}
                          >
                            <X className="mr-2 h-3 w-3" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden mb-1">
                          {vendor.status === 'rejected' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 rounded-none h-7 text-xs bg-background hover:bg-muted text-green-600 dark:text-green-500"
                              onClick={() => setStatus(vendor.id, 'approved')}
                            >
                              <Check className="mr-2 h-3 w-3" /> Approve
                            </Button>
                          )}
                          {vendor.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 rounded-none h-7 text-xs bg-background hover:bg-muted text-red-600 dark:text-red-500"
                              onClick={() => setStatus(vendor.id, 'rejected')}
                            >
                              <X className="mr-2 h-3 w-3" /> Suspend
                            </Button>
                          )}
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs mb-1"
                        onClick={() => handleEditVendor(vendor)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs text-primary border-primary/20 hover:bg-primary/5"
                        onClick={() => openRfqModal(vendor)}
                      >
                        <Sparkles className="mr-1.5 h-3 w-3" /> Draft Email
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No vendors found for this region.
                    </TableCell>
                  </TableRow>
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
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Outreach Queue</h3>
            <Button onClick={processBatch} disabled={isProcessingBatch}>
              {isProcessingBatch ? 'Processing...' : 'Run Batch (10 emails)'}
            </Button>
          </div>
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Batch Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>{q.company_name}</TableCell>
                    <TableCell>{q.email}</TableCell>
                    <TableCell>{q.batch_group}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${q.status === 'pending' ? 'bg-zinc-100 text-zinc-700' : q.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                      >
                        {q.status}
                      </span>
                      {q.error_message && (
                        <div className="text-xs text-red-500 mt-1">{q.error_message}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(q.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {queue.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No items in the queue. Upload an Excel file in the Directory tab to get
                      started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="inbox" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Maya's Conversations</h3>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={syncInbox}
                disabled={isSyncingInbox}
                title="Fetch new vendor replies from INBOX and Spam"
              >
                <RefreshCw className={`w-4 h-4 mr-1.5 ${isSyncingInbox ? 'animate-spin' : ''}`} />
                {isSyncingInbox ? 'Syncing…' : 'Sync inbox'}
              </Button>
              <span className="text-sm text-muted-foreground">
                Showing {inboxPage * INBOX_LIMIT + 1}-
                {Math.min((inboxPage + 1) * INBOX_LIMIT, totalCommunications)} of{' '}
                {totalCommunications}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInboxPage((p) => Math.max(0, p - 1))}
                disabled={inboxPage === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInboxPage((p) => p + 1)}
                disabled={(inboxPage + 1) * INBOX_LIMIT >= totalCommunications}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {drafts.length > 0 && (
            <div className="mb-6 rounded-md border border-primary/20 bg-primary/5 p-4">
              <h4 className="text-md font-semibold text-primary mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI Extracted Inventory (Pending Approval)
              </h4>
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex items-center justify-between bg-background p-3 rounded border shadow-sm"
                  >
                    <div>
                      <div className="font-medium">{draft.company_name}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {draft.inventory_type} -{' '}
                        {JSON.stringify(draft.extracted_data).slice(0, 100)}...
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleApproveDraft(draft.id)}>
                      <Check className="mr-2 h-4 w-4" /> Approve & Publish
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Split-Pane Modern Inbox UI */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[700px]">
            {/* Thread List Sidebar */}
            <div className="md:col-span-4 border rounded-xl bg-background/50 backdrop-blur-xl flex flex-col overflow-hidden shadow-sm">
              <div className="p-3 border-b bg-muted/30 font-medium text-sm">Active Threads</div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1">
                {inboxThreads.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No conversations found.
                  </div>
                ) : (
                  inboxThreads.map((thread) => {
                    const { latest, replyCount, preview } = thread;
                    const isSelected = selectedThreadId === thread.key;
                    return (
                      <button
                        key={thread.key}
                        onClick={() => setSelectedThreadId(thread.key)}
                        className={`w-full text-left p-3 rounded-lg transition-all border ${isSelected ? 'bg-primary/5 border-primary/30 shadow-sm' : 'bg-transparent border-transparent hover:bg-muted'}`}
                      >
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="font-semibold text-sm truncate max-w-[70%]">
                            {latest.company_name}
                          </span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {new Date(latest.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs text-foreground font-medium truncate">
                            {latest.subject}
                          </span>
                          {replyCount > 0 && (
                            <span className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold px-1.5 py-0.5">
                              {replyCount} repl{replyCount === 1 ? 'y' : 'ies'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                          {preview}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Conversation View pane */}
            <div className="md:col-span-8 border rounded-xl bg-background/80 backdrop-blur-xl flex flex-col shadow-sm overflow-hidden relative">
              {activeThread ? (
                (() => {
                  const vendor = activeThread.latest;

                  return (
                    <>
                      <div className="p-4 border-b bg-background/95 backdrop-blur z-10 flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{vendor.company_name}</h4>
                          <p className="text-xs text-muted-foreground">{vendor.email}</p>
                        </div>
                        <div className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                          {activeThread.messages.length} message
                          {activeThread.messages.length === 1 ? '' : 's'}
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/50">
                        {activeThread.rendered.map(({ msg, isOutbound, kind, text }) => (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[11px] text-muted-foreground font-medium">
                                {isOutbound ? 'MooNs (Maya)' : msg.company_name}
                              </span>
                              {kind && (
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${kind === 'reply' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'}`}
                                >
                                  {kind === 'reply' ? '↩ replied' : '✉ new email'}
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(msg.created_at).toLocaleString()}
                              </span>
                            </div>
                            <div
                              className={`max-w-[85%] p-4 rounded-2xl ${isOutbound ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-white border shadow-sm rounded-tl-sm text-foreground'}`}
                            >
                              <div className="font-semibold text-xs mb-2 opacity-90">
                                {msg.subject}
                              </div>
                              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {text}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* Quick Reply Box */}
                      <div className="p-4 border-t bg-background">
                        <div className="relative">
                          <textarea
                            placeholder="Type your reply to this thread..."
                            className="w-full rounded-xl border bg-muted/30 p-3 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[80px]"
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                          />

                          <Button
                            size="icon"
                            className="absolute right-2 bottom-2 rounded-full h-8 w-8"
                            disabled={!replyBody.trim() || isReplying}
                            onClick={async () => {
                              if (!auth || !replyBody.trim()) return;
                              setIsReplying(true);
                              try {
                                await adminReplyToVendorThread({
                                  data: {
                                    auth,
                                    vendorId: vendor.vendor_id,
                                    threadId: vendor.thread_id || vendor.id.toString(),
                                    subject: `Re: ${vendor.subject}`,
                                    htmlBody: replyBody,
                                  },
                                });
                                toast.success('Reply sent successfully!');
                                setReplyBody('');
                                await fetchVendors();
                              } catch (e) {
                                toast.error('Failed to send reply');
                              } finally {
                                setIsReplying(false);
                              }
                            }}
                          >
                            {isReplying ? (
                              <Sparkles className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </>
                  );
                })()
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-slate-50/50">
                  <Mail className="w-12 h-12 mb-4 opacity-20" />
                  <p>Select a thread to view the conversation</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
