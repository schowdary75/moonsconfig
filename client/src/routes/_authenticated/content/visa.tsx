// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { adminGetVisaCmsPage, adminSaveVisaCmsPage, VisaCmsPage } from '@/lib/api/db.functions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/toast';

export const Route = createFileRoute('/_authenticated/content/visa')({
  component: VisaCMSPage,
});

type AdminAuth = { email: string; sessionToken: string };

function emptyDestination(order: number): VisaCmsPage['destinations'][number] {
  return {
    destination_key: `Destination${order}`,
    destination_label: 'New Destination',
    status_text: 'Visa Required',
    duration_text: '30 Days',
    processing_time: '3 Working Days',
    average_cost: 'TBD',
    notes: 'Add current policy notes and filing guidance.',
    evisa_available: true,
    sort_order: order,
    requirements: ['Passport copy'],
    conditional_rules: [],
  };
}

function parseConditionalRules(
  value: string,
): VisaCmsPage['destinations'][number]['conditional_rules'] {
  return value
    .split('\n')
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter((parts) => parts.length >= 4 && parts.every(Boolean))
    .map(([trigger_label, status_text, average_cost, ...notes]) => ({
      trigger_label,
      status_text,
      average_cost,
      notes: notes.join(' | '),
    }));
}

export function VisaCMSPage() {
  const { user } = useAuth();
  const auth = useMemo<AdminAuth | null>(
    () => (user?.session_token ? { email: user.email, sessionToken: user.session_token } : null),
    [user?.email, user?.session_token],
  );
  const [page, setPage] = useState<VisaCmsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destinationSearch, setDestinationSearch] = useState('');
  const [selectedDestinationKey, setSelectedDestinationKey] = useState('');
  const [destinationPage, setDestinationPage] = useState(1);

  async function loadPage() {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      setPage(await adminGetVisaCmsPage({ data: { auth } }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Visa CMS';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function savePage() {
    if (!auth || !page) return;
    setSaving(true);
    try {
      await adminSaveVisaCmsPage({ data: { auth, page } });
      toast.success('Visa CMS saved');
      await loadPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Visa CMS');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [auth?.sessionToken]);

  useEffect(() => {
    if (!page?.destinations.length) return;
    if (
      !selectedDestinationKey ||
      !page.destinations.some((dest) => dest.destination_key === selectedDestinationKey)
    ) {
      setSelectedDestinationKey(page.destinations[0].destination_key);
    }
  }, [page?.destinations, selectedDestinationKey]);

  useEffect(() => {
    setDestinationPage(1);
  }, [destinationSearch]);

  if (!auth) {
    return (
      <p className="text-sm text-muted-foreground">Sign in again to manage Visa CMS content.</p>
    );
  }

  if (loading || !page) {
    return <p className="text-sm text-muted-foreground">Loading Visa CMS...</p>;
  }

  const destinationRows = page.destinations
    .map((dest, originalIndex) => ({ dest, originalIndex }))
    .filter(({ dest }) =>
      `${dest.destination_label} ${dest.destination_key} ${dest.status_text}`
        .toLowerCase()
        .includes(destinationSearch.trim().toLowerCase()),
    );
  const destinationPageSize = 8;
  const destinationTotalPages = Math.max(
    1,
    Math.ceil(destinationRows.length / destinationPageSize),
  );
  const safeDestinationPage = Math.min(destinationPage, destinationTotalPages);
  const pagedDestinationRows = destinationRows.slice(
    (safeDestinationPage - 1) * destinationPageSize,
    safeDestinationPage * destinationPageSize,
  );
  const selectedDestinationIndex = Math.max(
    0,
    page.destinations.findIndex((dest) => dest.destination_key === selectedDestinationKey),
  );
  const selectedDestination = page.destinations[selectedDestinationIndex];
  const activeDestinations = page.destinations.filter(
    (dest) => dest.destination_label && dest.status_text,
  ).length;
  const evisaDestinations = page.destinations.filter((dest) => dest.evisa_available).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-gradient-to-br from-background via-background to-muted/40 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl" />
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={loadPage} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button onClick={savePage} disabled={saving}>
              <Check className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label="Destinations" value={page.destinations.length} />
          <Metric label="Ready" value={activeDestinations} />
          <Metric label="eVisa / online" value={evisaDestinations} />
          <Metric label="Service plans" value={page.service_plans.length} />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="text-base">Page Copy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <TextField
            label="Hero Eyebrow"
            value={page.hero_eyebrow}
            onChange={(value) => setPage({ ...page, hero_eyebrow: value })}
          />
          <TextField
            label="Hero Title"
            value={page.hero_title}
            onChange={(value) => setPage({ ...page, hero_title: value })}
          />
          <TextField
            label="Hero Italic Title"
            value={page.hero_italic}
            onChange={(value) => setPage({ ...page, hero_italic: value })}
          />
          <TextField
            label="Form Eyebrow"
            value={page.form_eyebrow}
            onChange={(value) => setPage({ ...page, form_eyebrow: value })}
          />
          <TextField
            label="Form Title"
            value={page.form_title}
            onChange={(value) => setPage({ ...page, form_title: value })}
          />
          <TextField
            label="Guarantee Title"
            value={page.guarantee_title}
            onChange={(value) => setPage({ ...page, guarantee_title: value })}
          />
          <div className="md:col-span-3 grid gap-4 md:grid-cols-3">
            <TextAreaField
              label="Hero Body"
              value={page.hero_body}
              onChange={(value) => setPage({ ...page, hero_body: value })}
            />
            <TextAreaField
              label="Form Body"
              value={page.form_body}
              onChange={(value) => setPage({ ...page, form_body: value })}
            />
            <TextAreaField
              label="Guarantee Body"
              value={page.guarantee_body}
              onChange={(value) => setPage({ ...page, guarantee_body: value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
          <CardTitle className="text-base">Service Plans</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setPage({
                ...page,
                service_plans: [
                  ...page.service_plans,
                  {
                    plan_key: `plan-${page.service_plans.length + 1}`,
                    title: 'New Plan',
                    description: 'Plan description',
                    sort_order: page.service_plans.length + 1,
                    is_active: true,
                  },
                ],
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Add Plan
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-3">
          {page.service_plans.map((plan, index) => (
            <div
              key={`${plan.plan_key}-${index}`}
              className="space-y-3 rounded-xl border bg-card p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <Badge variant="outline">{plan.plan_key}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() =>
                    setPage({
                      ...page,
                      service_plans: page.service_plans.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <TextField
                label="Key"
                value={plan.plan_key}
                onChange={(value) => updatePlan(index, 'plan_key', value)}
              />
              <TextField
                label="Title"
                value={plan.title}
                onChange={(value) => updatePlan(index, 'title', value)}
              />
              <TextField
                label="Description"
                value={plan.description}
                onChange={(value) => updatePlan(index, 'description', value)}
              />
              <TextField
                label="Order"
                value={String(plan.sort_order)}
                onChange={(value) => updatePlan(index, 'sort_order', Number(value) || 0)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="overflow-hidden xl:sticky xl:top-4 xl:self-start">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Destinations</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const nextDestination = emptyDestination(page.destinations.length + 1);
                  setPage({ ...page, destinations: [...page.destinations, nextDestination] });
                  setSelectedDestinationKey(nextDestination.destination_key);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search destinations..."
                value={destinationSearch}
                onChange={(event) => setDestinationSearch(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
              {pagedDestinationRows.map(({ dest, originalIndex }) => {
                const selected = originalIndex === selectedDestinationIndex;
                return (
                  <button
                    key={`${dest.destination_key}-${originalIndex}`}
                    type="button"
                    onClick={() => setSelectedDestinationKey(dest.destination_key)}
                    className={`w-full rounded-xl border p-3 text-left transition hover:border-primary/40 hover:bg-muted/50 ${selected ? 'border-primary bg-primary/5 shadow-sm' : 'bg-card'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium leading-none">{dest.destination_label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{dest.destination_key}</p>
                      </div>
                      <Badge variant={dest.evisa_available ? 'secondary' : 'outline'}>
                        {dest.evisa_available ? 'eVisa' : 'Manual'}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {dest.status_text}
                    </p>
                  </button>
                );
              })}
              {!destinationRows.length && (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No destinations match your search.
                </div>
              )}
            </div>
            <PaginationControls
              page={safeDestinationPage}
              totalPages={destinationTotalPages}
              totalItems={destinationRows.length}
              pageSize={destinationPageSize}
              onPageChange={setDestinationPage}
            />
          </CardContent>
        </Card>

        {selectedDestination ? (
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">
                      {selectedDestination.destination_label}
                    </CardTitle>
                    <Badge variant={selectedDestination.evisa_available ? 'secondary' : 'outline'}>
                      {selectedDestination.evisa_available ? 'eVisa available' : 'Manual / offline'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedDestination.status_text}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextDestination =
                      page.destinations[selectedDestinationIndex + 1] ||
                      page.destinations[selectedDestinationIndex - 1];
                    setPage({
                      ...page,
                      destinations: page.destinations.filter(
                        (_, i) => i !== selectedDestinationIndex,
                      ),
                    });
                    setSelectedDestinationKey(nextDestination?.destination_key || '');
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Remove
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <TextField
                  label="Key"
                  value={selectedDestination.destination_key}
                  onChange={(value) => {
                    updateDestination(selectedDestinationIndex, 'destination_key', value);
                    setSelectedDestinationKey(value);
                  }}
                />
                <TextField
                  label="Label"
                  value={selectedDestination.destination_label}
                  onChange={(value) =>
                    updateDestination(selectedDestinationIndex, 'destination_label', value)
                  }
                />
                <TextField
                  label="Order"
                  value={String(selectedDestination.sort_order)}
                  onChange={(value) =>
                    updateDestination(selectedDestinationIndex, 'sort_order', Number(value) || 0)
                  }
                />
                <label className="flex items-end gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                  <Switch
                    checked={selectedDestination.evisa_available}
                    onCheckedChange={(checked) =>
                      updateDestination(selectedDestinationIndex, 'evisa_available', checked)
                    }
                  />
                  eVisa available
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <TextField
                  label="Duration"
                  value={selectedDestination.duration_text}
                  onChange={(value) =>
                    updateDestination(selectedDestinationIndex, 'duration_text', value)
                  }
                />
                <TextField
                  label="Processing Time"
                  value={selectedDestination.processing_time}
                  onChange={(value) =>
                    updateDestination(selectedDestinationIndex, 'processing_time', value)
                  }
                />
                <TextField
                  label="Average Cost"
                  value={selectedDestination.average_cost}
                  onChange={(value) =>
                    updateDestination(selectedDestinationIndex, 'average_cost', value)
                  }
                />
              </div>

              <TextAreaField
                label="Status"
                value={selectedDestination.status_text}
                onChange={(value) =>
                  updateDestination(selectedDestinationIndex, 'status_text', value)
                }
              />
              <TextAreaField
                label="Notes"
                value={selectedDestination.notes}
                onChange={(value) => updateDestination(selectedDestinationIndex, 'notes', value)}
              />

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border bg-muted/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Requirements</p>
                    <Badge variant="outline">{selectedDestination.requirements.length} items</Badge>
                  </div>
                  <TextAreaField
                    label="One per line"
                    value={selectedDestination.requirements.join('\n')}
                    onChange={(value) =>
                      updateDestination(
                        selectedDestinationIndex,
                        'requirements',
                        value
                          .split('\n')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </div>
                <div className="rounded-xl border bg-muted/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Conditional Rules</p>
                    <Badge variant="outline">
                      {selectedDestination.conditional_rules.length} rules
                    </Badge>
                  </div>
                  <TextAreaField
                    label="trigger | status | cost | notes"
                    value={selectedDestination.conditional_rules
                      .map(
                        (rule) =>
                          `${rule.trigger_label} | ${rule.status_text} | ${rule.average_cost} | ${rule.notes}`,
                      )
                      .join('\n')}
                    onChange={(value) =>
                      updateDestination(
                        selectedDestinationIndex,
                        'conditional_rules',
                        parseConditionalRules(value),
                      )
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Add a destination to start editing visa guidance.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  function updatePlan<K extends keyof VisaCmsPage['service_plans'][number]>(
    index: number,
    key: K,
    value: VisaCmsPage['service_plans'][number][K],
  ) {
    if (!page) return;
    setPage({
      ...page,
      service_plans: page.service_plans.map((plan, i) =>
        i === index ? { ...plan, [key]: value } : plan,
      ),
    });
  }

  function updateDestination<K extends keyof VisaCmsPage['destinations'][number]>(
    index: number,
    key: K,
    value: VisaCmsPage['destinations'][number][K],
  ) {
    if (!page) return;
    setPage({
      ...page,
      destinations: page.destinations.map((dest, i) =>
        i === index ? { ...dest, [key]: value } : dest,
      ),
    });
  }
}

function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const from = totalItems ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        {from}-{to} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </Button>
        <span>
          Page {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card/80 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24"
      />
    </label>
  );
}
