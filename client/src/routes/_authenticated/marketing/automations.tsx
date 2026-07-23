// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  Workflow,
  Mail,
  Clock,
  Zap,
  Plus,
  Pencil,
  Trash2,
  X,
  Sparkles,
  UserPlus,
  FileText,
  ShoppingCart,
  Plane,
  BellRing,
  Star,
  RefreshCw,
  HeartHandshake,
  Megaphone,
  CreditCard,
  PhoneMissed,
  ShieldAlert,
  MessageSquare,
  Gift,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  adminCreateAutomation,
  adminDeleteAutomation,
  adminGetAutomations,
  adminToggleAutomation,
  adminUpdateAutomation,
  adminAiGenerateAutomation,
} from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';

export const Route = createFileRoute('/_authenticated/marketing/automations')({
  component: AutomationsPage,
});

function AutomationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    triggerEvent: 'lead.created',
    steps: 2,
    isActive: true,
  });

  // AI Generator State
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPromptText, setAiPromptText] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const handleAiGenerate = async () => {
    if (!aiPromptText.trim() || !auth) return;
    setIsAiGenerating(true);
    try {
      const res = await adminAiGenerateAutomation({ data: { auth, prompt: aiPromptText } });
      setForm({
        name: res.name || 'AI Generated Workflow',
        triggerEvent: res.triggerEvent || 'lead.created',
        steps: res.steps || 3,
        isActive: true,
      });
      toast.success('AI generated workflow payload!');
      setShowAiPrompt(false);
      setAiPromptText('');
      setShowForm(true); // Open the form with the new data
    } catch (err) {
      toast.error('Failed to generate workflow via AI');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['mktg_automations', user?.session_token],
    queryFn: async () => {
      return await adminGetAutomations({ data: { auth: auth! } });
    },
    enabled: !!auth,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!auth) throw new Error('Missing session');
      return adminCreateAutomation({
        data: {
          auth,
          automation: {
            name: form.name,
            triggerEvent: form.triggerEvent,
            isActive: form.isActive,
            workflowJson: JSON.stringify({
              steps: Array.from({ length: form.steps }, (_, index) => ({
                order: index + 1,
                type: index === 0 ? 'email' : 'task',
              })),
            }),
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mktg_automations'] });
      setShowForm(false);
      setForm({ name: '', triggerEvent: 'lead.created', steps: 2, isActive: true });
      toast.success('Workflow created');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create workflow'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!auth) throw new Error('Missing session');
      if (!editingId) throw new Error('No workflow selected');
      return adminUpdateAutomation({
        data: {
          auth,
          id: editingId,
          automation: {
            name: form.name,
            triggerEvent: form.triggerEvent,
            isActive: form.isActive,
            workflowJson: JSON.stringify({
              steps: Array.from({ length: form.steps }, (_, index) => ({
                order: index + 1,
                type: index === 0 ? 'email' : 'task',
              })),
            }),
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mktg_automations'] });
      resetForm();
      toast.success('Workflow updated');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update workflow'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      if (!auth) throw new Error('Missing session');
      return adminToggleAutomation({ data: { auth, id, isActive } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mktg_automations'] });
      toast.success('Workflow status updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!auth) throw new Error('Missing session');
      return adminDeleteAutomation({ data: { auth, id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mktg_automations'] });
      toast.success('Workflow deleted');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete workflow'),
  });

  const templateMutation = useMutation({
    mutationFn: async (tpl: AutomationTemplate) => {
      if (!auth) throw new Error('Missing session');
      return adminCreateAutomation({
        data: {
          auth,
          automation: {
            name: tpl.name,
            triggerEvent: tpl.triggerEvent,
            isActive: false,
            workflowJson: JSON.stringify({ steps: tpl.steps }),
          },
        },
      });
    },
    onSuccess: (_res, tpl) => {
      queryClient.invalidateQueries({ queryKey: ['mktg_automations'] });
      toast.success(`"${tpl.name}" added — review and activate it below.`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Failed to add automation from template'),
  });

  const existingTriggers = new Set(automations.map((a: any) => a.triggerEvent));

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', triggerEvent: 'lead.created', steps: 2, isActive: true });
  }

  function editWorkflow(auto: any) {
    const workflow = parseWorkflow(auto.workflowJson);
    setEditingId(auto.id);
    setForm({
      name: auto.name || '',
      triggerEvent: auto.triggerEvent || 'lead.created',
      steps: workflow.steps || 1,
      isActive: Boolean(auto.isActive),
    });
    setShowForm(true);
  }

  function deleteWorkflow(auto: any) {
    if (!window.confirm(`Delete workflow "${auto.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(auto.id);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="text-primary border-primary/20 hover:bg-primary/10"
              onClick={() => setShowAiPrompt(true)}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate with AI
            </Button>
            <Button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Workflow
            </Button>
          </div>
        </div>

        {/* AI Prompt Modal */}
        {showAiPrompt && (
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-lg overflow-hidden border">
              <div className="flex justify-between items-center p-4 border-b bg-primary/5">
                <div className="flex items-center gap-2 text-primary font-display font-bold">
                  <Sparkles className="w-5 h-5" /> AI Automation Architect
                </div>
                <button
                  onClick={() => setShowAiPrompt(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                <p className="text-sm text-muted-foreground mb-4">
                  Describe what you want this automation to do in plain english, and Gemini will
                  automatically structure the triggers and logic steps for you.
                </p>
                <Textarea
                  placeholder="e.g. When a new lead arrives, wait 1 day, send a welcome email, and then assign a follow-up task to the sales agent."
                  value={aiPromptText}
                  onChange={(e) => setAiPromptText(e.target.value)}
                  className="min-h-24 mb-4 border-primary/20 focus-visible:ring-primary/30"
                  disabled={isAiGenerating}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAiPrompt(false)}
                    disabled={isAiGenerating}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAiGenerate}
                    disabled={isAiGenerating || !aiPromptText.trim()}
                  >
                    {isAiGenerating ? 'Generating...' : 'Generate Workflow'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <form
            className="rounded-lg border bg-card p-5 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              if (editingId) {
                updateMutation.mutate();
              } else {
                createMutation.mutate();
              }
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900">
                {editingId ? 'Edit workflow' : 'Create workflow'}
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                <X className="mr-2 h-4 w-4" /> Close
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                placeholder="Workflow name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                placeholder="Trigger event"
                value={form.triggerEvent}
                onChange={(e) => setForm({ ...form, triggerEvent: e.target.value })}
                required
              />
              <Input
                type="number"
                placeholder="Steps"
                min={1}
                max={20}
                value={form.steps}
                onChange={(e) => setForm({ ...form, steps: Number(e.target.value) })}
              />
              <select
                className="h-9 rounded-md border bg-white px-3 text-sm"
                value={String(form.isActive)}
                onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}
              >
                <option value="true">Active</option>
                <option value="false">Paused</option>
              </select>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving...'
                  : editingId
                    ? 'Update Workflow'
                    : 'Save Workflow'}
              </Button>
            </div>
          </form>
        )}

        {/* ===================== Automation Library ===================== */}
        <div className="bg-card rounded-lg border shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b bg-card">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" /> Automation Library
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Add a ready-made playbook in one click. Every template is created{' '}
              <span className="font-semibold">paused</span> so you can review the steps and channels
              before activating.
            </p>
          </div>

          {(['travel', 'system'] as const).map((category) => {
            const templates = AUTOMATION_TEMPLATES.filter((t) => t.category === category);
            return (
              <div key={category} className="p-6 border-b last:border-b-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">
                  {category === 'travel'
                    ? 'Travel Business Playbooks'
                    : 'Application & System Automations'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((tpl) => {
                    const Icon = tpl.icon;
                    const alreadyAdded = existingTriggers.has(tpl.triggerEvent);
                    return (
                      <div
                        key={tpl.key}
                        className="border rounded-lg p-5 flex flex-col hover:shadow-md hover:border-violet-200 transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                            <Icon className="w-5 h-5" />
                          </div>
                          <code className="text-[10px] font-mono text-violet-600 bg-violet-50 px-2 py-0.5 rounded">
                            {tpl.triggerEvent}
                          </code>
                        </div>
                        <h4 className="font-bold text-zinc-900 text-sm mb-1">{tpl.name}</h4>
                        <p className="text-xs text-zinc-500 mb-3 flex-1">{tpl.description}</p>
                        <div className="flex flex-wrap gap-1 mb-4">
                          {tpl.steps.map((s) => (
                            <span
                              key={s.order}
                              title={s.detail}
                              className="text-[10px] font-medium text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded"
                            >
                              {STEP_LABELS[s.type]}
                            </span>
                          ))}
                        </div>
                        <Button
                          variant={alreadyAdded ? 'outline' : 'default'}
                          size="sm"
                          className="w-full"
                          disabled={templateMutation.isPending}
                          onClick={() => templateMutation.mutate(tpl)}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          {alreadyAdded ? 'Add Again' : 'Add Automation'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-card rounded-lg border shadow-sm overflow-hidden mb-8 relative">
          <div className="p-6 border-b flex items-center justify-between relative z-10 bg-card">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Workflow className="w-5 h-5 text-violet-500" /> Active Workflows
            </h2>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
            {isLoading ? (
              <div className="col-span-full text-center text-zinc-500">Loading workflows...</div>
            ) : automations.length === 0 ? (
              <div className="col-span-full text-center text-zinc-500">No workflows found.</div>
            ) : (
              automations.map((auto: any) => {
                const workflow = parseWorkflow(auto.workflowJson);

                return (
                  <div
                    key={auto.id}
                    className="bg-card border rounded-lg p-6 hover:shadow-md transition-all group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                        <Zap className="w-5 h-5" />
                      </div>
                      {auto.isActive ? (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100">
                          Active
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-100">
                          Paused
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-zinc-900 text-lg mb-1">{auto.name}</h3>
                    <p className="text-xs font-medium text-violet-600 mb-4 bg-violet-50 inline-block px-2 py-0.5 rounded">
                      Trigger: {auto.triggerEvent}
                    </p>

                    <div className="flex items-center gap-2 text-sm text-zinc-500 mb-6">
                      <div className="flex items-center gap-1 bg-zinc-50 px-2 py-1 rounded-md">
                        <Mail className="w-3.5 h-3.5" /> {workflow.steps || 0} Steps
                      </div>
                      <div className="flex items-center gap-1 bg-zinc-50 px-2 py-1 rounded-md">
                        <Clock className="w-3.5 h-3.5" /> Set up
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-4 border-t border-zinc-100">
                      <Button
                        variant="ghost"
                        className="flex-1 text-zinc-600 bg-muted/40"
                        onClick={() =>
                          toggleMutation.mutate({ id: auto.id, isActive: !auto.isActive })
                        }
                      >
                        {auto.isActive ? 'Pause' : 'Activate'}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => editWorkflow(auto)}
                        title="Edit workflow"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => deleteWorkflow(auto)}
                        title="Delete workflow"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}

            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="bg-muted/20 border border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center h-full min-h-[240px] hover:bg-muted/40 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-violet-500 mb-3">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-zinc-800">Start from Scratch</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">
                Create a saved trigger workflow for CRM events.
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automation Library — ready-made playbooks the admin can add in one click.
// Each template maps to a real domain event in the CRM. Steps are stored as a
// workflow_json array; delays/channels are advisory metadata for the runner.
// ---------------------------------------------------------------------------
type TemplateStep = {
  order: number;
  type: 'delay' | 'email' | 'sms' | 'whatsapp' | 'task' | 'notify';
  detail: string;
};

type AutomationTemplate = {
  key: string;
  name: string;
  triggerEvent: string;
  category: 'travel' | 'system';
  icon: any;
  description: string;
  steps: TemplateStep[];
};

const STEP_LABELS: Record<TemplateStep['type'], string> = {
  delay: 'Wait',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  task: 'Task',
  notify: 'Notify',
};

const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // ----------------------- Travel business playbooks -----------------------
  {
    key: 'lead-welcome',
    name: 'Lead Welcome & Nurture',
    triggerEvent: 'lead.created',
    category: 'travel',
    icon: UserPlus,
    description:
      'Greet a fresh enquiry instantly, share top destinations, and hand a warm follow-up task to a travel consultant.',
    steps: [
      { order: 1, type: 'email', detail: 'Send "Welcome to MooNs" intro + brochure' },
      { order: 2, type: 'delay', detail: 'Wait 2 hours' },
      { order: 3, type: 'whatsapp', detail: 'WhatsApp: "A consultant will call you shortly"' },
      { order: 4, type: 'task', detail: 'Assign first-response call to sales consultant' },
    ],
  },
  {
    key: 'quote-chaser',
    name: 'Quote Follow-Up Chaser',
    triggerEvent: 'quote.sent',
    category: 'travel',
    icon: FileText,
    description:
      'Nudge travelers who received an itinerary quote but have not booked, across a 5-day sequence.',
    steps: [
      { order: 1, type: 'delay', detail: 'Wait 1 day' },
      { order: 2, type: 'email', detail: 'Reminder: "Your itinerary is still available"' },
      { order: 3, type: 'delay', detail: 'Wait 2 days' },
      { order: 4, type: 'sms', detail: 'SMS with limited-time hold on pricing' },
      { order: 5, type: 'task', detail: 'Consultant call if still unbooked' },
    ],
  },
  {
    key: 'abandoned-booking',
    name: 'Abandoned Booking Recovery',
    triggerEvent: 'booking.abandoned',
    category: 'travel',
    icon: ShoppingCart,
    description:
      'Recover travelers who started a booking but dropped off before payment, with a gentle incentive.',
    steps: [
      { order: 1, type: 'delay', detail: 'Wait 1 hour' },
      { order: 2, type: 'email', detail: 'Resume booking link + trip summary' },
      { order: 3, type: 'delay', detail: 'Wait 1 day' },
      { order: 4, type: 'whatsapp', detail: 'WhatsApp nudge with small discount code' },
    ],
  },
  {
    key: 'booking-confirmed',
    name: 'Booking Confirmation & Trip Prep',
    triggerEvent: 'booking.confirmed',
    category: 'travel',
    icon: Plane,
    description:
      'Confirm the booking, deliver documents, and start pre-trip preparation once payment succeeds.',
    steps: [
      { order: 1, type: 'email', detail: 'Confirmation + e-tickets / vouchers' },
      { order: 2, type: 'sms', detail: 'SMS: booking reference + support number' },
      { order: 3, type: 'task', detail: 'Ops: verify visa / documents checklist' },
    ],
  },
  {
    key: 'pre-departure',
    name: 'Pre-Departure Reminder',
    triggerEvent: 'trip.upcoming',
    category: 'travel',
    icon: BellRing,
    description:
      'Countdown reminders before the travel date: packing tips, weather, check-in and pickup details.',
    steps: [
      { order: 1, type: 'email', detail: '7 days before: packing & weather guide' },
      { order: 2, type: 'delay', detail: 'Wait until 2 days before travel' },
      { order: 3, type: 'whatsapp', detail: 'Pickup, check-in and emergency contacts' },
    ],
  },
  {
    key: 'post-trip-review',
    name: 'Post-Trip Review Request',
    triggerEvent: 'trip.completed',
    category: 'travel',
    icon: Star,
    description:
      'Thank returning travelers and collect a review / testimonial while the trip is fresh.',
    steps: [
      { order: 1, type: 'delay', detail: 'Wait 1 day after return' },
      { order: 2, type: 'email', detail: 'Thank you + review request link' },
      { order: 3, type: 'delay', detail: 'Wait 3 days' },
      { order: 4, type: 'sms', detail: 'Referral offer if no review yet' },
    ],
  },
  {
    key: 'win-back',
    name: 'Win-Back Dormant Traveler',
    triggerEvent: 'customer.dormant',
    category: 'travel',
    icon: HeartHandshake,
    description:
      'Re-engage past customers who have not booked in a while with a personalized new-destination offer.',
    steps: [
      { order: 1, type: 'email', detail: '"We miss you" + trending destinations' },
      { order: 2, type: 'delay', detail: 'Wait 4 days' },
      { order: 3, type: 'whatsapp', detail: 'Exclusive returning-guest discount' },
    ],
  },
  {
    key: 'seasonal-promo',
    name: 'Seasonal Destination Promo',
    triggerEvent: 'segment.promo',
    category: 'travel',
    icon: Megaphone,
    description:
      'Broadcast a seasonal campaign to a saved audience segment across email, SMS and WhatsApp.',
    steps: [
      { order: 1, type: 'email', detail: 'Seasonal offer announcement' },
      { order: 2, type: 'sms', detail: 'Short teaser with landing-page link' },
      { order: 3, type: 'whatsapp', detail: 'Rich card with hero image + CTA' },
    ],
  },
  // ------------------------- App / system automations -------------------------
  {
    key: 'payment-failed',
    name: 'Payment Failed Recovery',
    triggerEvent: 'payment.failed',
    category: 'system',
    icon: CreditCard,
    description:
      'When a payment is rejected or fails, prompt the traveler to retry and alert the finance desk.',
    steps: [
      { order: 1, type: 'email', detail: 'Retry payment link + reason' },
      { order: 2, type: 'delay', detail: 'Wait 6 hours' },
      { order: 3, type: 'sms', detail: 'SMS retry reminder' },
      { order: 4, type: 'notify', detail: 'Alert finance desk of failed booking' },
    ],
  },
  {
    key: 'missed-call-callback',
    name: 'Missed Call Auto-SMS Callback',
    triggerEvent: 'call.missed',
    category: 'system',
    icon: PhoneMissed,
    description:
      'Auto-reply to missed inbound calls with an SMS and queue a callback task for an agent.',
    steps: [
      { order: 1, type: 'sms', detail: 'SMS: "Sorry we missed you — we\'ll call back"' },
      { order: 2, type: 'task', detail: 'Queue callback for next available agent' },
    ],
  },
  {
    key: 'otp-fallback',
    name: 'OTP Delivery Fallback',
    triggerEvent: 'otp.requested',
    category: 'system',
    icon: MessageSquare,
    description:
      'If an OTP SMS is not delivered promptly, retry via an alternate channel so login never stalls.',
    steps: [
      { order: 1, type: 'sms', detail: 'Send OTP via primary SMS gateway' },
      { order: 2, type: 'delay', detail: 'Wait 45 seconds for delivery receipt' },
      { order: 3, type: 'whatsapp', detail: 'Resend OTP via WhatsApp if undelivered' },
    ],
  },
  {
    key: 'sla-breach',
    name: 'Lead SLA Breach Alert',
    triggerEvent: 'lead.unassigned',
    category: 'system',
    icon: ShieldAlert,
    description:
      'Escalate to a manager when a new lead sits unassigned or without first response past the SLA window.',
    steps: [
      { order: 1, type: 'delay', detail: 'Wait 30 minutes without first response' },
      { order: 2, type: 'notify', detail: 'Notify team lead of SLA breach' },
      { order: 3, type: 'task', detail: 'Force-assign to on-shift consultant' },
    ],
  },
  {
    key: 'refund-keepwarm',
    name: 'Refund Status Keep-Warm',
    triggerEvent: 'refund.requested',
    category: 'system',
    icon: RefreshCw,
    description:
      'Keep customers informed while a refund is processed to reduce anxious support tickets.',
    steps: [
      { order: 1, type: 'email', detail: 'Acknowledge refund request + timeline' },
      { order: 2, type: 'delay', detail: 'Wait until refund.settled' },
      { order: 3, type: 'sms', detail: 'SMS: refund completed confirmation' },
    ],
  },
  {
    key: 'birthday-offer',
    name: 'Birthday / Anniversary Offer',
    triggerEvent: 'customer.milestone',
    category: 'system',
    icon: Gift,
    description:
      'Automatically send a celebratory travel voucher on a customer birthday or anniversary.',
    steps: [
      { order: 1, type: 'email', detail: 'Personalized greeting + voucher code' },
      { order: 2, type: 'whatsapp', detail: 'WhatsApp celebration card' },
    ],
  },
];

function parseWorkflow(value: unknown): { steps: number } {
  if (!value || typeof value !== 'string') return { steps: 0 };
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed?.steps)) return { steps: parsed.steps.length };
    return { steps: Number(parsed?.steps || 0) };
  } catch {
    return { steps: 0 };
  }
}
