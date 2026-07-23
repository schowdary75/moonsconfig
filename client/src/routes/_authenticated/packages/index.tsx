// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@/lib/routerCompat';
import { Edit, Eye, Filter, Plus, Search, Share2, Sparkles, X, Sunrise } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';
import { SendRfqModal } from '@/components/send-rfq-modal';
import { Badge } from '@/components/ui/badge';
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
import { RegionTabs, type RegionTab, matchesRegion } from '@/components/region-tabs';
import { Trending2AccessDialog } from '@/components/trending2-access-dialog';
import { usePagination, DataTablePagination } from '@/components/ui/data-table-pagination';
import {
  adminGetPackagesAll,
  adminSetPackageActive,
  adminUpsertPackageDetail,
  type PackageRow,
  adminAiBuildPackage,
} from '@/lib/api/db.functions';
import { SEASONS, OUTBOUND, DOMESTIC } from '@/lib/travel-trends-data';
import { getTrending2Keywords, matchesTrending2 } from '@/lib/trending-strategy-data';
export const Route = createFileRoute('/_authenticated/packages/')({
  component: PackagesPage,
});

function PackagesPage() {
  const { user } = useAuth();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [query, setQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<RegionTab>('international');
  const [trendingSubTab, setTrendingSubTab] = useState<'all' | 'international' | 'india'>('all');
  const [trending2Unlocked, setTrending2Unlocked] = useState(false);
  const [showTrending2Gate, setShowTrending2Gate] = useState(false);
  const [loading, setLoading] = useState(true);
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const navigate = Route.useNavigate();
  const [rfqPackage, setRfqPackage] = useState<PackageRow | null>(null);

  // AI Builder State
  const [showAiBuilder, setShowAiBuilder] = useState(false);
  const [aiDestination, setAiDestination] = useState('');
  const [aiDays, setAiDays] = useState(5);
  const [isAiBuilding, setIsAiBuilding] = useState(false);

  const handleAiBuildPackage = async () => {
    if (!aiDestination || !aiDays || !auth) return;
    setIsAiBuilding(true);
    try {
      const res = await adminAiBuildPackage({
        data: { auth, destination: aiDestination, days: aiDays },
      });

      // We parse the generated JSON and redirect to new with prefilled query state or we create it in DB first
      // The easiest way is to create it in the DB and then navigate to it.
      const payload = {
        name: res.title,
        slug: res.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        description: res.overview,
        destination: aiDestination,
        country: aiDestination,
        days: aiDays,
        nights: aiDays - 1,
        price: res.estimated_base_cost_inr,
        category: 'Premium' as const,
        is_active: false,
        themes: ['AI Generated'],
        itinerary: res.itinerary.map((day: any) => ({
          day_number: day.day,
          title: day.title,
          description: day.description,
          city: aiDestination,
          route_location: aiDestination,
          route_lat: null,
          route_lng: null,
        })),
        inclusions: [
          { category: 'Accommodation', item: 'Hotel stay' },
          { category: 'Activities', item: 'Sightseeing as per itinerary' },
        ],
        exclusions: [{ item: 'International Flights' }, { item: 'Visa Fees' }],
        line_items: [],
        image_url: '',
        image_key: '',
      };

      const created = await adminUpsertPackageDetail({ data: { auth, package: payload } });
      toast.success('AI Package Built!');
      setShowAiBuilder(false);
      navigate({ to: '/packages/$id', params: { id: String(created.id) } });
    } catch (err) {
      toast.error('Failed to build package');
    } finally {
      setIsAiBuilding(false);
    }
  };

  async function loadPackages() {
    if (!auth) return;
    setLoading(true);
    try {
      setPackages(await adminGetPackagesAll({ data: { auth } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPackages();
  }, [user?.session_token]);

  // Trending packages logic
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

    // Only include destinations where the `bestMonths` string contains the current month short name
    const monthlyTerms = [...OUTBOUND, ...DOMESTIC]
      .filter((d) => d.bestMonths.includes(currentMonthShort))
      .map((d) => d.name.toLowerCase());

    return [...new Set([...sellNowTerms, ...monthlyTerms])];
  }, []);

  const isPackageTrending = (pkg: PackageRow) => {
    const termStr = `${pkg.destination} ${pkg.country} ${pkg.name}`.toLowerCase();
    // Check if any of our trending destination strings match the package string
    // e.g. if sellNow has "Kashmir", and package has "Srinagar, Kashmir"
    return trendingDestinations.some((td) => {
      // split complex names from the trends data like "Thailand (Phuket · Krabi · Bangkok)"
      const keywords = td
        .replace(/[()·,]/g, ' ')
        .split(' ')
        .filter((k) => k.trim().length > 3);
      return keywords.some((k) => termStr.includes(k));
    });
  };

  // Trending-2 strategy data matching
  const trending2Keywords = useMemo(() => getTrending2Keywords('all'), []);
  const isPackageTrending2 = (pkg: PackageRow) =>
    matchesTrending2(`${pkg.destination} ${pkg.country} ${pkg.name}`, trending2Keywords);

  const filtered = useMemo(() => {
    let base = packages;

    if (activeTab === 'trending' || activeTab === 'trending-2') {
      const isTrendingMatch = activeTab === 'trending' ? isPackageTrending : isPackageTrending2;
      base = base.filter((pkg) => Boolean(pkg.is_active) && isTrendingMatch(pkg));
      if (trendingSubTab === 'international') {
        base = base.filter((pkg) => matchesRegion(pkg.country, 'international'));
      } else if (trendingSubTab === 'india') {
        base = base.filter((pkg) => matchesRegion(pkg.country, 'india'));
      }
    } else {
      base = base.filter((pkg) => matchesRegion(pkg.country, activeTab));
    }

    const needle = query.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((pkg) =>
      [pkg.name, pkg.destination, pkg.country, pkg.category, pkg.slug, ...(pkg.themes || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [activeTab, packages, query, trendingDestinations, trending2Keywords, trendingSubTab]);

  const { currentPage, totalPages, setCurrentPage, paginatedItems } = usePagination(filtered, 15);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, trendingSubTab, query, setCurrentPage]);

  async function togglePackage(pkg: PackageRow) {
    if (!auth) return;
    try {
      await adminSetPackageActive({
        data: { auth, id: pkg.id, is_active: !pkg.is_active },
      });
      toast.success(pkg.is_active ? 'Package unpublished' : 'Package published');
      await loadPackages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update package');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="h-8 text-xs shadow-sm"
          >
            <Filter className="mr-2 h-3.5 w-3.5" /> Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAiBuilder(true)}
            className="h-8 text-xs shadow-sm text-primary border-primary/20 hover:bg-primary/5"
          >
            <Sparkles className="mr-2 h-3.5 w-3.5" /> AI Package Wizard
          </Button>
          <Button size="sm" asChild className="h-8 text-xs shadow-sm">
            <Link to="/packages/$id" params={{ id: 'new' }}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New Package
            </Link>
          </Button>
        </div>
      </div>

      {/* AI Package Builder Modal */}
      {showAiBuilder && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md overflow-hidden border">
            <div className="flex justify-between items-center p-4 border-b bg-primary/5">
              <div className="flex items-center gap-2 text-primary font-display font-bold">
                <Sparkles className="w-5 h-5" /> AI Package Architect
              </div>
              <button
                onClick={() => setShowAiBuilder(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-4">
                Tell Gemini where you want to build a package, and it will generate the entire
                itinerary and realistic base pricing instantly.
              </p>
              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-xs font-semibold mb-1 block text-muted-foreground">
                    Destination / Country
                  </label>
                  <Input
                    placeholder="e.g. Bali, Indonesia"
                    value={aiDestination}
                    onChange={(e) => setAiDestination(e.target.value)}
                    disabled={isAiBuilding}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block text-muted-foreground">
                    Duration (Days)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={aiDays}
                    onChange={(e) => setAiDays(Number(e.target.value))}
                    disabled={isAiBuilding}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAiBuilder(false)}
                  disabled={isAiBuilding}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAiBuildPackage}
                  disabled={isAiBuilding || !aiDestination || !aiDays}
                >
                  {isAiBuilding ? 'Architecting Package...' : 'Build Package'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isFilterOpen && (
        <div className="flex gap-4 items-center bg-muted/30 p-3 rounded-md border">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 bg-background h-9"
              placeholder="Search destination, theme, package..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
              <TableHead>Package & Supplier</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Pricing (B2B / B2C)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>SEO Slug</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Loading packages...
                </TableCell>
              </TableRow>
            ) : paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No packages found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {pkg.image_url && (
                        <div className="h-12 w-20 shrink-0 overflow-hidden rounded border bg-muted">
                          <img
                            src={pkg.image_url}
                            alt={pkg.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src =
                                'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=800&auto=format&fit=crop';
                            }}
                          />
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{pkg.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {pkg.days}D / {pkg.nights}N · {pkg.category}
                        </div>
                        {(pkg as any).vendor_name && (
                          <div className="text-xs font-semibold text-blue-600 mt-1">
                            Supplier: {(pkg as any).vendor_name}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>
                        {pkg.destination}, {pkg.country}
                      </span>
                      {isPackageTrending(pkg) && (
                        <span className="inline-flex items-center rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold text-orange-600 dark:text-orange-400">
                          🔥 Trending
                        </span>
                      )}
                      {isPackageTrending2(pkg) && (
                        <span className="inline-flex items-center rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-600 dark:text-violet-400">
                          🎯 Trending-2
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">
                        Net:{' '}
                        <b className="text-destructive">
                          ₹{Number((pkg as any).b2b_price || 0).toLocaleString('en-IN')}
                        </b>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Sell:{' '}
                        <b className="text-emerald-600">
                          ₹{Number(pkg.price || 0).toLocaleString('en-IN')}
                        </b>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                      {pkg.is_active ? 'Published' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <VerificationChip
                      id={pkg.id}
                      tableName="packages"
                      initialVerified={Boolean((pkg as any).is_verified)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{pkg.slug}</TableCell>
                  <TableCell className="p-2 align-middle">
                    <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-muted"
                        onClick={() => setRfqPackage(pkg)}
                        title="Send RFQ to Vendors"
                      >
                        <Sunrise className="mr-2 h-3.5 w-3.5" />
                        Send RFQ
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-muted"
                        onClick={() => {
                          const link = `${window.location.origin}/lounge?packageId=${pkg.id}`;
                          navigator.clipboard.writeText(link);
                          toast.success('Bespoke Lounge link copied to clipboard!');
                        }}
                        title="Copy Client Lounge Link"
                      >
                        <Share2 className="mr-2 h-3.5 w-3.5" />
                        Share
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-muted"
                        onClick={() => togglePackage(pkg)}
                      >
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        {pkg.is_active ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted"
                        asChild
                      >
                        <Link to="/packages/$id" params={{ id: String(pkg.id) }}>
                          <Edit className="mr-2 h-3.5 w-3.5" />
                          Edit
                        </Link>
                      </Button>
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

      <SendRfqModal
        isOpen={!!rfqPackage}
        onClose={() => setRfqPackage(null)}
        auth={auth}
        packageId={rfqPackage?.id || 0}
        destination={rfqPackage?.destination}
        country={rfqPackage?.country}
        packageDurationDays={rfqPackage?.days}
      />
    </div>
  );
}
