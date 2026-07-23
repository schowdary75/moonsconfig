// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-context';
import {
  adminGetEmailTemplates,
  adminCreateEmailTemplate,
  adminUpdateEmailTemplate,
  adminDeleteEmailTemplate,
  adminToggleEmailTemplateActive,
} from '@/lib/api/db.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Edit2, Trash2, Info, CheckCircle2, XCircle } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/settings/email-templates')({
  component: EmailTemplatesPage,
});

const SCOPE_OPTIONS = [
  { key: 'full', label: 'Full Package' },
  { key: 'hotels', label: 'Hotels' },
  { key: 'transport', label: 'Transport' },
  { key: 'cruise', label: 'Cruise' },
];

const SCOPE_ORDER = ['full', 'hotels', 'transport', 'cruise'];

const TEMPLATE_VARIABLES = [
  {
    variable: '{{package_name}}',
    description: 'Package name (e.g., Solo Saver Escape to Albania)',
  },
  { variable: '{{destination}}', description: 'Destination with country (e.g., Albania, Albania)' },
  { variable: '{{duration}}', description: 'Trip duration (e.g., 6 Days / 5 Nights)' },
  { variable: '{{days}}', description: 'Number of days' },
  { variable: '{{nights}}', description: 'Number of nights' },
  { variable: '{{category}}', description: 'Package category (e.g., Solo, Friends, Family)' },
  { variable: '{{description}}', description: 'Package description' },
  { variable: '{{itinerary}}', description: 'Day-by-day itinerary with cities and activities' },
  {
    variable: '{{hotels}}',
    description: 'Accommodation details from line items or inferred from itinerary',
  },
  {
    variable: '{{transport}}',
    description: 'Transport/transfer requirements from line items or inferred',
  },
  { variable: '{{activities}}', description: 'Activities and experiences list' },
  {
    variable: '{{inclusions}}',
    description: "What's included in the package, grouped by category",
  },
  { variable: '{{exclusions}}', description: "What's NOT included in the package" },
];

function EmailTemplatesPage() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVariables, setShowVariables] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    type: 'rfq',
    body: '',
    scope_tags: ['full'] as string[],
    is_active: true,
  });

  const fetchTemplates = async () => {
    if (!auth) return;
    setLoading(true);
    try {
      const res = await adminGetEmailTemplates({ data: { auth } });
      setTemplates(res);
    } catch (err: any) {
      console.error('fetchTemplates error:', err);
      toast.error(err?.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [user?.session_token]);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      subject: '',
      type: 'rfq',
      body: '',
      scope_tags: ['full'],
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (t: any) => {
    setEditingTemplate(t);
    const tags = t.scope_tags ? t.scope_tags.split(',').map((s: string) => s.trim()) : ['full'];
    setFormData({
      name: t.name,
      subject: t.subject,
      type: t.type,
      body: t.body,
      scope_tags: tags,
      is_active: t.is_active !== 0,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!auth) return;
    if (!confirm('Delete this template?')) return;
    try {
      await adminDeleteEmailTemplate({ data: { auth, id } });
      toast.success('Template deleted');
      fetchTemplates();
    } catch (err) {
      toast.error('Failed to delete template');
    }
  };

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    if (!auth) return;
    const newActive = !currentActive;
    try {
      await adminToggleEmailTemplateActive({ data: { auth, id, is_active: newActive } });
      toast.success(`Template marked as ${newActive ? 'Active' : 'Inactive'}`);
      // Optimistically update template state to avoid full reload flicker
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_active: newActive ? 1 : 0 } : t)),
      );
    } catch (err) {
      toast.error('Failed to toggle status');
    }
  };

  const toggleScopeTag = (key: string) => {
    setFormData((prev) => {
      const tags = prev.scope_tags.includes(key)
        ? prev.scope_tags.filter((t) => t !== key)
        : [...prev.scope_tags, key];
      // Ensure at least one is selected
      if (tags.length === 0) return prev;
      return { ...prev, scope_tags: tags };
    });
  };

  const insertVariable = (variable: string) => {
    setFormData((prev) => ({ ...prev, body: prev.body + variable }));
  };

  const handleSave = async () => {
    if (!auth) return;
    if (!formData.name || !formData.subject || !formData.body) {
      toast.error('Please fill all fields');
      return;
    }
    const scope_tags = formData.scope_tags
      .sort((a, b) => {
        return SCOPE_ORDER.indexOf(a) - SCOPE_ORDER.indexOf(b);
      })
      .join(',');

    try {
      if (editingTemplate) {
        await adminUpdateEmailTemplate({
          data: { auth, id: editingTemplate.id, ...formData, scope_tags },
        });
        toast.success('Template updated');
      } else {
        await adminCreateEmailTemplate({ data: { auth, ...formData, scope_tags } });
        toast.success('Template created');
      }
      setModalOpen(false);
      fetchTemplates();
    } catch (err) {
      toast.error('Failed to save template');
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (statusFilter === 'active') return t.is_active !== 0;
    if (statusFilter === 'inactive') return t.is_active === 0;
    return true; // "all"
  });

  return (
    <div className="p-8 w-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email Templates</h1>
          <p className="text-slate-500 mt-1">
            Manage reusable email templates for RFQs and outbound communications.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowVariables(!showVariables)}
            className="gap-2"
          >
            <Info className="h-4 w-4" /> {showVariables ? 'Hide' : 'Show'} Variables
          </Button>
          <Button onClick={openCreateModal} className="gap-2">
            <Plus className="h-4 w-4" /> Create Template
          </Button>
        </div>
      </div>

      {/* Variables Reference Panel */}
      {showVariables && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Info className="h-4 w-4" /> Available Template Variables
          </h3>
          <p className="text-sm text-blue-700 mb-3">
            Use these variables in your template subject and body. They will be automatically
            replaced with real package data when the template is applied.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {TEMPLATE_VARIABLES.map((v) => (
              <div key={v.variable} className="flex items-start gap-2 text-sm">
                <code className="font-mono text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                  {v.variable}
                </code>
                <span className="text-blue-700">{v.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active/Inactive Status Filters */}
      <div className="flex border-b border-slate-200">
        {(['active', 'inactive', 'all'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setStatusFilter(filter)}
            className={`px-6 py-2.5 text-sm font-semibold capitalize border-b-2 transition-all ${
              statusFilter === filter
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {filter === 'all' ? 'All Templates' : `${filter} Templates`}
            <span
              className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                statusFilter === filter
                  ? 'bg-primary/10 text-primary'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {filter === 'all'
                ? templates.length
                : templates.filter((t) =>
                    filter === 'active' ? t.is_active !== 0 : t.is_active === 0,
                  ).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading templates...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredTemplates.map((t) => {
            const isActive = t.is_active !== 0;
            return (
              <div
                key={t.id}
                className={`bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col hover:border-slate-300 transition-colors ${
                  isActive ? 'border-slate-200' : 'border-slate-200 bg-slate-50/50 opacity-80'
                }`}
              >
                <div className="p-5 border-b border-slate-100 flex-1">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <h3 className="font-semibold text-slate-900 line-clamp-1 flex-1">{t.name}</h3>
                    <div className="flex gap-1.5 items-center shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase tracking-wider">
                        {t.type}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                          isActive
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {isActive ? (
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                        ) : (
                          <XCircle className="w-3 h-3 text-slate-500" />
                        )}
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  {t.scope_tags && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {t.scope_tags.split(',').map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium capitalize"
                        >
                          {tag.trim() === 'full' ? 'Full Package' : tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-sm font-medium text-slate-700 mb-2 line-clamp-2">
                    <span className="text-slate-400">Subject:</span> {t.subject}
                  </p>
                  <p className="text-sm text-slate-500 line-clamp-4 whitespace-pre-wrap">
                    {t.body}
                  </p>
                </div>
                <div className="px-5 py-3 bg-slate-50 flex justify-between items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(t.id, isActive)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded border transition-colors ${
                      isActive
                        ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        : 'bg-primary text-primary-foreground border-transparent hover:bg-primary/95'
                    }`}
                  >
                    {isActive ? 'Mark Inactive' : 'Mark Active'}
                  </button>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(t)}
                      className="h-8"
                    >
                      <Edit2 className="h-4 w-4 mr-1.5" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(t.id)}
                      className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredTemplates.length === 0 && (
            <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <p className="text-slate-500">
                No {statusFilter === 'all' ? '' : statusFilter} templates found.
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
            <DialogDescription>
              Configure the subject and body for this reusable email template. Use {'{{variables}}'}{' '}
              for dynamic content.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Hotel RFQ - Standard"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={formData.type}
                  onValueChange={(val) => setFormData({ ...formData, type: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rfq">Request For Quotation (RFQ)</SelectItem>
                    <SelectItem value="outreach">Outreach</SelectItem>
                    <SelectItem value="followup">Follow Up</SelectItem>
                    <SelectItem value="welcome">Welcome</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-center">
              {/* Scope Tags */}
              <div className="space-y-2">
                <Label>Scope Tags</Label>
                <div className="flex gap-2">
                  {SCOPE_OPTIONS.map((opt) => {
                    const isSelected = formData.scope_tags.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleScopeTag(opt.key)}
                        className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/40'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Is Active Status checkbox */}
              <div className="space-y-2">
                <Label>Status</Label>
                <label className="flex items-center gap-2 cursor-pointer mt-1 bg-slate-50 border rounded-md p-2 hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-slate-700">Template is Active</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email Subject</Label>
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Subject line... use {{package_name}} for dynamic data"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Email Body</Label>
                <div className="flex flex-wrap gap-1">
                  {[
                    '{{package_name}}',
                    '{{itinerary}}',
                    '{{hotels}}',
                    '{{transport}}',
                    '{{activities}}',
                    '{{inclusions}}',
                    '{{exclusions}}',
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-mono transition-colors"
                      title={`Insert ${v}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                className="h-64 font-mono text-sm"
                placeholder="Dear Partner..."
              />
              <p className="text-xs text-slate-500">
                Use {'{{variables}}'} that will be replaced with real package data when the template
                is applied. Click the variable chips above to insert them.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
