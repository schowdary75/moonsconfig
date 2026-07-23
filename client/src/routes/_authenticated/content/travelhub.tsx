// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';
import { VisaCMSPage } from './visa';
import {
  adminGetPackingCmsPage,
  adminSavePackingCmsPage,
  PackingCmsPage,
} from '@/lib/api/db.functions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const Route = createFileRoute('/_authenticated/content/travelhub')({
  component: TravelHubCmsPage,
});

type AdminAuth = { email: string; sessionToken: string };
type PackingCategoryKey = PackingCmsPage['categories'][number]['category_key'];

function TravelHubCmsPage() {
  return (
    <div className="space-y-6">
      <div />
      <Tabs defaultValue="visa" className="space-y-5">
        <TabsList>
          <TabsTrigger value="visa">Passport Visa Hub</TabsTrigger>
          <TabsTrigger value="packing">Packing Checklist</TabsTrigger>
        </TabsList>
        <TabsContent value="visa">
          <VisaCMSPage />
        </TabsContent>
        <TabsContent value="packing">
          <PackingCmsEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function emptySeason(order: number): PackingCmsPage['seasons'][number] {
  return { season_key: `season-${order}`, label: 'New Season', sort_order: order, is_active: true };
}

function emptyItem(
  order: number,
  category: PackingCategoryKey = 'clothing',
): PackingCmsPage['items'][number] {
  return {
    item_key: `item-${Date.now()}-${order}`,
    category_key: category,
    item_text: 'New packing item',
    destination_key: null,
    season_key: null,
    sort_order: order,
    is_active: true,
  };
}

function PackingCmsEditor() {
  const { user } = useAuth();
  const auth = useMemo<AdminAuth | null>(
    () => (user?.session_token ? { email: user.email, sessionToken: user.session_token } : null),
    [user?.email, user?.session_token],
  );
  const [page, setPage] = useState<PackingCmsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [destinationFilter, setDestinationFilter] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState(true);
  const [rulesPage, setRulesPage] = useState(1);

  async function loadPage() {
    if (!auth) return;
    setLoading(true);
    try {
      setPage(await adminGetPackingCmsPage({ data: { auth } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Packing CMS');
    } finally {
      setLoading(false);
    }
  }

  async function savePage() {
    if (!auth || !page) return;
    setSaving(true);
    try {
      await adminSavePackingCmsPage({ data: { auth, page } });
      toast.success('Packing CMS saved');
      await loadPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Packing CMS');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [auth?.sessionToken]);

  useEffect(() => {
    setRulesPage(1);
  }, [itemSearch, categoryFilter, destinationFilter, seasonFilter, activeFilter]);

  if (!auth)
    return (
      <p className="text-sm text-muted-foreground">Sign in again to manage Packing CMS content.</p>
    );
  if (loading || !page)
    return <p className="text-sm text-muted-foreground">Loading Packing CMS...</p>;

  const categoryOptions = page.categories.length
    ? page.categories
    : [
        {
          category_key: 'docs' as const,
          label: 'Documents & Wallet',
          sort_order: 1,
          is_active: true,
        },
        {
          category_key: 'clothing' as const,
          label: 'Clothing & Shoes',
          sort_order: 2,
          is_active: true,
        },
        {
          category_key: 'tech' as const,
          label: 'Electronics & Tech',
          sort_order: 3,
          is_active: true,
        },
        {
          category_key: 'health' as const,
          label: 'Health & Wellness',
          sort_order: 4,
          is_active: true,
        },
      ];
  const destinationOptions = Array.from(
    new Set(page.items.map((item) => item.destination_key).filter(Boolean) as string[]),
  ).sort();
  const seasonOptions = page.seasons.filter((season) => season.is_active);
  const activeItems = page.items.filter((item) => item.is_active);
  const targetedItems = activeItems.filter((item) => item.destination_key || item.season_key);
  const filteredItems = page.items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => {
      const matchesSearch =
        !itemSearch.trim() ||
        `${item.item_key} ${item.item_text} ${item.destination_key || ''} ${item.season_key || ''}`
          .toLowerCase()
          .includes(itemSearch.trim().toLowerCase());
      const matchesCategory = categoryFilter === 'all' || item.category_key === categoryFilter;
      const matchesDestination =
        destinationFilter === 'all' ||
        (destinationFilter === 'global'
          ? !item.destination_key
          : item.destination_key === destinationFilter);
      const matchesSeason =
        seasonFilter === 'all' ||
        (seasonFilter === 'global' ? !item.season_key : item.season_key === seasonFilter);
      const matchesActive = !activeFilter || item.is_active;
      return (
        matchesSearch && matchesCategory && matchesDestination && matchesSeason && matchesActive
      );
    });
  const rulesPageSize = 12;
  const rulesTotalPages = Math.max(1, Math.ceil(filteredItems.length / rulesPageSize));
  const safeRulesPage = Math.min(rulesPage, rulesTotalPages);
  const pagedItems = filteredItems.slice(
    (safeRulesPage - 1) * rulesPageSize,
    safeRulesPage * rulesPageSize,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Rules" value={page.items.length} helper={`${activeItems.length} active`} />
        <StatCard
          label="Targeted Rules"
          value={targetedItems.length}
          helper="Destination or season scoped"
        />
        <StatCard
          label="Destinations"
          value={destinationOptions.length}
          helper="Used by checklist rules"
        />
        <StatCard
          label="Seasons"
          value={page.seasons.length}
          helper={`${seasonOptions.length} active`}
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Packing Checklist CMS</h3>
          <p className="text-sm text-muted-foreground">
            Use blank destination/season for global items; fill one or both for targeted rules.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPage} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={savePage} disabled={saving}>
            <Check className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Page Copy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
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
            label="Suggestion Title"
            value={page.suggestion_title}
            onChange={(value) => setPage({ ...page, suggestion_title: value })}
          />
          <TextAreaField
            label="Hero Body"
            value={page.hero_body}
            onChange={(value) => setPage({ ...page, hero_body: value })}
          />
          <TextAreaField
            label="Suggestion Body"
            value={page.suggestion_body}
            onChange={(value) => setPage({ ...page, suggestion_body: value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Seasons</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setPage({ ...page, seasons: [...page.seasons, emptySeason(page.seasons.length + 1)] })
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Add Season
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {page.seasons.map((season, index) => (
            <div
              key={`${season.season_key}-${index}`}
              className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_1.5fr_90px_100px_auto]"
            >
              <TextField
                label="Key"
                value={season.season_key}
                onChange={(value) => updateSeason(index, 'season_key', value)}
              />
              <TextField
                label="Label"
                value={season.label}
                onChange={(value) => updateSeason(index, 'label', value)}
              />
              <TextField
                label="Order"
                value={String(season.sort_order)}
                onChange={(value) => updateSeason(index, 'sort_order', Number(value) || 0)}
              />
              <label className="flex items-end gap-2 text-sm">
                <Switch
                  checked={season.is_active}
                  onCheckedChange={(checked) => updateSeason(index, 'is_active', checked)}
                />
                Active
              </label>
              <Button
                variant="outline"
                size="icon"
                className="self-end"
                onClick={() =>
                  setPage({ ...page, seasons: page.seasons.filter((_, i) => i !== index) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {page.categories.map((category, index) => (
            <div
              key={`${category.category_key}-${index}`}
              className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_1.5fr_90px_100px]"
            >
              <TextField
                label="Key"
                value={category.category_key}
                onChange={(value) =>
                  updateCategory(index, 'category_key', value as PackingCategoryKey)
                }
              />
              <TextField
                label="Label"
                value={category.label}
                onChange={(value) => updateCategory(index, 'label', value)}
              />
              <TextField
                label="Order"
                value={String(category.sort_order)}
                onChange={(value) => updateCategory(index, 'sort_order', Number(value) || 0)}
              />
              <label className="flex items-end gap-2 text-sm">
                <Switch
                  checked={category.is_active}
                  onCheckedChange={(checked) => updateCategory(index, 'is_active', checked)}
                />
                Active
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Checklist Rules</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setPage({ ...page, items: [...page.items, emptyItem(page.items.length + 1)] })
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Add Item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-[2fr_1fr_1fr_1fr_130px]">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Search Rules</span>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search item, key, destination..."
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                />
              </div>
            </label>
            <SelectField
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: 'all', label: 'All categories' },
                ...categoryOptions.map((category) => ({
                  value: category.category_key,
                  label: category.label,
                })),
              ]}
            />
            <SelectField
              label="Destination"
              value={destinationFilter}
              onChange={setDestinationFilter}
              options={[
                { value: 'all', label: 'All destinations' },
                { value: 'global', label: 'Global only' },
                ...destinationOptions.map((destination) => ({
                  value: destination,
                  label: destination,
                })),
              ]}
            />
            <SelectField
              label="Season"
              value={seasonFilter}
              onChange={setSeasonFilter}
              options={[
                { value: 'all', label: 'All seasons' },
                { value: 'global', label: 'No season only' },
                ...page.seasons.map((season) => ({
                  value: season.season_key,
                  label: season.label,
                })),
              ]}
            />
            <label className="flex items-end gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <Switch checked={activeFilter} onCheckedChange={setActiveFilter} />
              Active only
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Filtered {filteredItems.length} of {page.items.length} rules
            </span>
            <Badge variant="outline">Blank destination = global</Badge>
            <Badge variant="outline">Blank season = all seasons</Badge>
          </div>

          {pagedItems.map(({ item, originalIndex }) => (
            <div
              key={`${item.item_key}-${originalIndex}`}
              className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={item.destination_key ? 'default' : 'outline'}>
                    {item.destination_key || 'Global'}
                  </Badge>
                  <Badge variant={item.season_key ? 'secondary' : 'outline'}>
                    {seasonOptions.find((season) => season.season_key === item.season_key)?.label ||
                      item.season_key ||
                      'All seasons'}
                  </Badge>
                  {!item.is_active && <Badge variant="destructive">Inactive</Badge>}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setPage({
                      ...page,
                      items: page.items.filter((_, itemIndex) => itemIndex !== originalIndex),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_2fr]">
                <TextField
                  label="Key"
                  value={item.item_key}
                  onChange={(value) => updateItem(originalIndex, 'item_key', value)}
                />
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Category</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={item.category_key}
                    onChange={(event) =>
                      updateItem(
                        originalIndex,
                        'category_key',
                        event.target.value as PackingCategoryKey,
                      )
                    }
                  >
                    {categoryOptions.map((category) => (
                      <option key={category.category_key} value={category.category_key}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <TextField
                  label="Item Text"
                  value={item.item_text}
                  onChange={(value) => updateItem(originalIndex, 'item_text', value)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_1fr_90px_120px]">
                <SelectField
                  label="Destination Key"
                  value={item.destination_key || ''}
                  onChange={(value) =>
                    updateItem(originalIndex, 'destination_key', value.trim() || null)
                  }
                  options={[
                    { value: '', label: 'Global' },
                    ...destinationOptions.map((destination) => ({
                      value: destination,
                      label: destination,
                    })),
                  ]}
                />
                <SelectField
                  label="Season Key"
                  value={item.season_key || ''}
                  onChange={(value) =>
                    updateItem(originalIndex, 'season_key', value.trim() || null)
                  }
                  options={[
                    { value: '', label: 'All seasons' },
                    ...page.seasons.map((season) => ({
                      value: season.season_key,
                      label: season.label,
                    })),
                  ]}
                />
                <TextField
                  label="Order"
                  value={String(item.sort_order)}
                  onChange={(value) => updateItem(originalIndex, 'sort_order', Number(value) || 0)}
                />
                <label className="flex items-end gap-2 text-sm">
                  <Switch
                    checked={item.is_active}
                    onCheckedChange={(checked) => updateItem(originalIndex, 'is_active', checked)}
                  />
                  Active
                </label>
              </div>
            </div>
          ))}
          {!filteredItems.length && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No checklist rules match these filters.
            </div>
          )}
          <PaginationControls
            page={safeRulesPage}
            totalPages={rulesTotalPages}
            totalItems={filteredItems.length}
            pageSize={rulesPageSize}
            onPageChange={setRulesPage}
          />
        </CardContent>
      </Card>
    </div>
  );

  function updateSeason<K extends keyof PackingCmsPage['seasons'][number]>(
    index: number,
    key: K,
    value: PackingCmsPage['seasons'][number][K],
  ) {
    setPage({
      ...page,
      seasons: page.seasons.map((season, i) =>
        i === index ? { ...season, [key]: value } : season,
      ),
    });
  }

  function updateCategory<K extends keyof PackingCmsPage['categories'][number]>(
    index: number,
    key: K,
    value: PackingCmsPage['categories'][number][K],
  ) {
    setPage({
      ...page,
      categories: page.categories.map((category, i) =>
        i === index ? { ...category, [key]: value } : category,
      ),
    });
  }

  function updateItem<K extends keyof PackingCmsPage['items'][number]>(
    index: number,
    key: K,
    value: PackingCmsPage['items'][number][K],
  ) {
    setPage({
      ...page,
      items: page.items.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
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
    <div className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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

function StatCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
