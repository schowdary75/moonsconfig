// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useState, useEffect, useMemo } from 'react';
import {
  adminGetExperiencesAll,
  adminSetExperienceActive,
  adminUpsertExperienceDetail,
} from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
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
import { VerificationChip } from '@/components/verification-chip';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { RegionTabs, type RegionTab, matchesRegion } from '@/components/region-tabs';
import { Trending2AccessDialog } from '@/components/trending2-access-dialog';
import { usePagination, DataTablePagination } from '@/components/ui/data-table-pagination';
import { Plus, Edit, Eye, Search, Filter } from 'lucide-react';
import { SEASONS, OUTBOUND, DOMESTIC } from '@/lib/travel-trends-data';
import { getTrending2Keywords, matchesTrending2 } from '@/lib/trending-strategy-data';

export const Route = createFileRoute('/_authenticated/experiences')({
  component: ExperiencesPage,
});

function ExperiencesPage() {
  const { user } = useAuth();
  const [experiences, setExperiences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtering state
  const [query, setQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<RegionTab>('international');
  const [trendingSubTab, setTrendingSubTab] = useState<'all' | 'international' | 'india'>('all');
  const [trending2Unlocked, setTrending2Unlocked] = useState(false);
  const [showTrending2Gate, setShowTrending2Gate] = useState(false);

  // Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    destination: '',
    country: '',
    place: '',
    description: '',
    duration: '',
    capacity: 0,
    status: 'active',
    image_url: '',
  });
  const [saving, setSaving] = useState(false);

  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!auth) return;
    try {
      setLoading(true);
      const data = await adminGetExperiencesAll({ data: { auth } });
      setExperiences(data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load experiences');
    } finally {
      setLoading(false);
    }
  };

  // Trending destinations calculation
  const trendingDestinations = useMemo(() => {
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthIndex = new Date().getMonth();
    const currentMonthShort = monthNames[monthIndex];

    let qIndex = 0;
    if (monthIndex >= 3 && monthIndex <= 5) qIndex = 1;
    else if (monthIndex >= 6 && monthIndex <= 8) qIndex = 2;
    else if (monthIndex >= 9) qIndex = 3;

    const currentSeason = SEASONS[qIndex];
    const sellNowTerms = currentSeason.sellNow.map((t) => t.toLowerCase());

    const monthlyTerms = [...OUTBOUND, ...DOMESTIC]
      .filter((d) => d.bestMonths.includes(currentMonthShort))
      .map((d) => d.name.toLowerCase());

    return [...new Set([...sellNowTerms, ...monthlyTerms])];
  }, []);

  const isExperienceTrending = (exp: any) => {
    const termStr = `${exp.destination} ${exp.country} ${exp.name}`.toLowerCase();
    return trendingDestinations.some((td) => {
      const keywords = td
        .replace(/[()·,]/g, ' ')
        .split(' ')
        .filter((k) => k.trim().length > 3);
      return keywords.some((k) => termStr.includes(k));
    });
  };

  // Trending-2 strategy data matching
  const trending2Keywords = useMemo(() => getTrending2Keywords('all'), []);
  const isExperienceTrending2 = (exp: any) =>
    matchesTrending2(`${exp.destination} ${exp.country} ${exp.name}`, trending2Keywords);

  const filtered = useMemo(() => {
    let base = experiences;

    if (activeTab === 'trending' || activeTab === 'trending-2') {
      const isTrendingMatch =
        activeTab === 'trending' ? isExperienceTrending : isExperienceTrending2;
      base = base.filter((exp) => exp.status === 'active' && isTrendingMatch(exp));
      if (trendingSubTab === 'international') {
        base = base.filter((exp) => matchesRegion(exp.country, 'international'));
      } else if (trendingSubTab === 'india') {
        base = base.filter((exp) => matchesRegion(exp.country, 'india'));
      }
    } else {
      base = base.filter((exp) => matchesRegion(exp.country, activeTab));
    }

    const needle = query.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((exp) =>
      [exp.name, exp.destination, exp.country, exp.place, exp.slug]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [activeTab, experiences, query, trendingDestinations, trending2Keywords, trendingSubTab]);

  const { currentPage, totalPages, setCurrentPage, paginatedItems } = usePagination(filtered, 15);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, trendingSubTab, query, setCurrentPage]);

  const openEditor = (exp: any) => {
    if (exp) {
      setEditingId(exp.id);
      setFormData({
        name: exp.name || '',
        destination: exp.destination || '',
        country: exp.country || '',
        place: exp.place || '',
        description: exp.description || '',
        duration: exp.duration || '',
        capacity: exp.capacity || 0,
        status: exp.status || 'active',
        image_url: exp.image_url || '',
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        destination: '',
        country: '',
        place: '',
        description: '',
        duration: '',
        capacity: 0,
        status: 'active',
        image_url: '',
      });
    }
    setIsEditorOpen(true);
  };

  const handleSave = async () => {
    if (!auth) return;
    if (!formData.name || !formData.destination || !formData.country) {
      toast.error('Please fill required fields (Name, Destination, Country)');
      return;
    }

    setSaving(true);
    try {
      const payload = { ...formData };
      if (editingId) (payload as any).id = editingId;

      await adminUpsertExperienceDetail({ data: { auth, experience: payload } });
      toast.success(editingId ? 'Experience updated' : 'Experience created');
      setIsEditorOpen(false);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save experience');
    } finally {
      setSaving(false);
    }
  };

  const toggleExperience = async (exp: any) => {
    if (!auth) return;
    try {
      const newStatus = exp.status === 'active' ? 'inactive' : 'active';
      await adminSetExperienceActive({
        data: { auth, id: exp.id, status: newStatus },
      });
      toast.success(newStatus === 'active' ? 'Experience published' : 'Experience unpublished');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update status');
    }
  };

  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Experiences</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="h-8 text-xs shadow-sm"
          >
            <Filter className="mr-2 h-3.5 w-3.5" /> Filters
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => openEditor(null)} className="h-8 text-xs shadow-sm">
              <Plus className="mr-2 h-3.5 w-3.5" />
              New Experience
            </Button>
          )}
        </div>
      </div>

      {isFilterOpen && (
        <div className="flex gap-4 items-center bg-muted/30 p-3 rounded-md border">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 bg-background h-9"
              placeholder="Search experiences..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      <RegionTabs
        value={activeTab}
        onValueChange={(next) => {
          if (next === 'trending-2' && !trending2Unlocked) {
            setShowTrending2Gate(true);
            return;
          }
          setActiveTab(next);
        }}
      />

      {showTrending2Gate && (
        <Trending2AccessDialog
          onGranted={() => {
            setTrending2Unlocked(true);
            setShowTrending2Gate(false);
            setActiveTab('trending-2');
          }}
          onCancel={() => setShowTrending2Gate(false)}
        />
      )}

      {(activeTab === 'trending' || activeTab === 'trending-2') && (
        <div className="flex gap-2">
          <Button
            variant={trendingSubTab === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTrendingSubTab('all')}
            className="h-8 text-xs shadow-sm rounded-full"
          >
            All Trending
          </Button>
          <Button
            variant={trendingSubTab === 'international' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTrendingSubTab('international')}
            className="h-8 text-xs shadow-sm rounded-full"
          >
            International
          </Button>
          <Button
            variant={trendingSubTab === 'india' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTrendingSubTab('india')}
            className="h-8 text-xs shadow-sm rounded-full"
          >
            India
          </Button>
        </div>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Experience Details</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Loading experiences...
                </TableCell>
              </TableRow>
            ) : paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No experiences found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {exp.image_url && (
                        <div className="h-12 w-20 shrink-0 overflow-hidden rounded border bg-muted">
                          <img
                            src={exp.image_url}
                            alt={exp.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{exp.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {exp.slug}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm">{exp.destination}</span>
                      <span className="text-xs text-muted-foreground">
                        {exp.place ? `${exp.place}, ` : ''}
                        {exp.country}
                      </span>
                      {isExperienceTrending(exp) && (
                        <span className="inline-flex w-fit items-center rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold text-orange-600 dark:text-orange-400 mt-1">
                          🔥 Trending
                        </span>
                      )}
                      {isExperienceTrending2(exp) && (
                        <span className="inline-flex w-fit items-center rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-600 dark:text-violet-400 mt-1">
                          🎯 Trending-2
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{exp.duration || '-'}</span>
                    {exp.capacity > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Cap: {exp.capacity}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={exp.status === 'active' ? 'default' : 'secondary'}>
                      {exp.status === 'active' ? 'Published' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <VerificationChip
                      id={exp.id}
                      tableName="master_activities"
                      initialVerified={Boolean(exp.is_verified)}
                    />
                  </TableCell>
                  <TableCell className="p-2 align-middle">
                    <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted ${canEdit ? 'border-r border-border' : ''}`}
                        onClick={() => toggleExperience(exp)}
                      >
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        {exp.status === 'active' ? 'Unpublish' : 'Publish'}
                      </Button>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted"
                          onClick={() => openEditor(exp)}
                        >
                          <Edit className="mr-2 h-3.5 w-3.5" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
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

      <Sheet open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto w-full">
          <SheetHeader>
            <SheetTitle>{editingId ? 'Edit Experience' : 'Create Experience'}</SheetTitle>
          </SheetHeader>
          <div className="grid gap-4 py-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Desert Safari & BBQ"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination *</label>
                <Input
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  placeholder="e.g. Dubai"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Country *</label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="e.g. United Arab Emirates"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Specific Place (Optional)</label>
                <Input
                  value={formData.place}
                  onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                  placeholder="e.g. Lahbab Desert"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Duration</label>
                <Input
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  placeholder="e.g. 6 Hours"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Capacity</label>
                <Input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Image URL</label>
                <Input
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                />
              </div>
            </div>
          </div>
          <SheetFooter className="pb-8">
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Experience'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
