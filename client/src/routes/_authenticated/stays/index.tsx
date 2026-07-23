// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useState, useEffect, useMemo } from 'react';
import {
  getAccommodationListings,
  adminCreateAccommodation,
  adminUpdateAccommodation,
  adminDeleteAccommodation,
  adminGetVendorsAll,
  adminGetCatalogPricing,
  adminSaveCatalogPricing,
  adminGetCatalogMedia,
  adminSaveCatalogMedia,
  adminGetCatalogFeatures,
  adminSaveCatalogFeatures,
  adminAiGenerateEmail,
  AccommodationListing,
  VendorProfile,
} from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';
import { toast } from '@/lib/toast';
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
import { AdminPriceCell } from '@/components/price-status';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RegionTabs, type RegionTab, matchesRegion } from '@/components/region-tabs';
import { Trending2AccessDialog } from '@/components/trending2-access-dialog';
import { getTrending2Keywords, matchesTrending2 } from '@/lib/trending-strategy-data';
import {
  Plus,
  Edit,
  Trash2,
  Image as ImageIcon,
  MapPin,
  IndianRupee,
  LayoutList,
  Search,
  Filter,
  Mail,
} from 'lucide-react';

export const Route = createFileRoute('/_authenticated/stays/')({
  component: StaysPage,
});

function StaysPage() {
  const { user } = useAuth();

  // List State
  const [stays, setStays] = useState<any[]>([]);
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeRegion, setActiveRegion] = useState<RegionTab>('international');
  const [trending2SubTab, setTrending2SubTab] = useState<'all' | 'international' | 'india'>('all');
  const [trending2Unlocked, setTrending2Unlocked] = useState(false);
  const [showTrending2Gate, setShowTrending2Gate] = useState(false);

  // Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [generatingEmailFor, setGeneratingEmailFor] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [starFilter, setStarFilter] = useState('All');

  // Core Data
  const [formData, setFormData] = useState({
    type: 'hotel' as any,
    name: '',
    destination: '',
    country: '',
    location: '',
    description: '',
    price_inr: 0,
    image_key: '',
    image_url: '',
    phone: '',
    email: '',
  });

  // ERP Extended Data
  const [pricing, setPricing] = useState({
    vendorId: '',
    netCost: 0,
    marginPercent: 25,
    sellingPrice: 0,
  });
  const [media, setMedia] = useState<
    { media_type: string; media_path: string; is_primary: boolean; sort_order: number }[]
  >([]);
  const [features, setFeatures] = useState<
    {
      feature_type: string;
      title: string;
      description: string;
      vendor_id: number | null;
      net_cost: number;
      selling_price: number;
    }[]
  >([]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const auth = { email: user?.email!, sessionToken: user?.session_token! };
      const [staysData, vendorsData] = await Promise.all([
        getAccommodationListings(),
        adminGetVendorsAll({ data: { auth } }),
      ]);
      setStays(staysData || []);
      setVendors(vendorsData || []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const openEditor = async (stay: AccommodationListing | null) => {
    if (stay) {
      setEditingId(stay.id);
      setFormData({
        type: stay.type,
        name: stay.name,
        destination: stay.destination,
        country: stay.country,
        location: stay.location,
        description: stay.description,
        price_inr: stay.price_inr,
        image_key: stay.image_key,
        image_url: stay.image_url || '',
        phone: (stay as any).phone || '',
        email: (stay as any).email || '',
      });

      // Load ERP Data
      try {
        const payload = {
          catalogType: 'stay',
          catalogId: stay.id,
          adminEmail: user?.email!,
          sessionToken: user?.session_token!,
        };
        const [pRes, mRes, fRes] = await Promise.all([
          adminGetCatalogPricing({ data: payload }),
          adminGetCatalogMedia({ data: payload }),
          adminGetCatalogFeatures({ data: payload }),
        ]);

        if (pRes.success && pRes.pricing && pRes.pricing.length > 0) {
          const p = pRes.pricing[0];
          setPricing({
            vendorId: p.vendor_id ? p.vendor_id.toString() : '',
            netCost: p.net_cost,
            marginPercent: p.margin_percent,
            sellingPrice: p.selling_price,
          });
        } else {
          setPricing({ vendorId: '', netCost: 0, marginPercent: 25, sellingPrice: stay.price_inr });
        }

        if (mRes.success)
          setMedia(
            mRes.media
              ? mRes.media.map((m: any) => ({ ...m, is_primary: Boolean(m.is_primary) }))
              : [],
          );
        if (fRes.success) setFeatures(fRes.features || []);
      } catch (e) {
        toast.error('Failed to load ERP extension data');
      }
    } else {
      setEditingId(null);
      setFormData({
        type: 'hotel',
        name: '',
        destination: '',
        country: '',
        location: '',
        description: '',
        price_inr: 0,
        image_key: '',
        image_url: '',
        phone: '',
        email: '',
      });
      setPricing({ vendorId: '', netCost: 0, marginPercent: 25, sellingPrice: 0 });
      setMedia([]);
      setFeatures([]);
    }
    setIsEditorOpen(true);
  };

  const calculateSellingPrice = (net: number, margin: number) => {
    if (margin >= 100) return net;
    return Math.round(net / (1 - margin / 100));
  };

  const handlePricingChange = (field: string, value: number | string) => {
    if (field === 'vendorId') {
      setPricing((p) => ({ ...p, vendorId: value as string }));
      return;
    }

    const newPricing = { ...pricing, [field]: Number(value) };
    if (field === 'netCost' || field === 'marginPercent') {
      newPricing.sellingPrice = calculateSellingPrice(newPricing.netCost, newPricing.marginPercent);
    }
    setPricing(newPricing);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.destination) {
      toast.error('Please fill name and destination');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        adminEmail: user?.email!,
        sessionToken: user?.session_token!,
        vendor_id: pricing.vendorId ? parseInt(pricing.vendorId) : null,
        b2b_price: pricing.netCost || 0,
      };

      let catalogId = editingId;
      if (editingId) {
        await adminUpdateAccommodation({ data: { id: editingId, ...payload } });
      } else {
        const res: any = await adminCreateAccommodation({ data: payload });
        catalogId = res.id;
      }

      if (catalogId) {
        // Save ERP Data
        const erpPayload = {
          catalogType: 'stay',
          catalogId,
          adminEmail: user?.email!,
          sessionToken: user?.session_token!,
        };
        await Promise.all([
          adminSaveCatalogPricing({
            data: {
              ...erpPayload,
              vendorId: pricing.vendorId ? parseInt(pricing.vendorId) : null,
              netCost: pricing.netCost,
              marginPercent: pricing.marginPercent,
              sellingPrice: pricing.sellingPrice,
            },
          }),
          adminSaveCatalogMedia({ data: { ...erpPayload, media } }),
          adminSaveCatalogFeatures({ data: { ...erpPayload, features } }),
        ]);
      }

      toast.success(`Stay ${editingId ? 'updated' : 'created'}`);
      setIsEditorOpen(false);
      loadData();
    } catch (err) {
      toast.error('Failed to save stay');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this stay?')) return;
    try {
      await adminDeleteAccommodation({ data: { id } });
      toast.success('Stay deleted');
      loadData();
    } catch (err) {
      toast.error('Failed to delete stay');
    }
  };

  const handleAiEmailRequest = async (stay: any) => {
    if (!stay.email) {
      toast.error('No email address found for this stay');
      return;
    }
    setGeneratingEmailFor(stay.id);
    try {
      const auth = { email: user?.email!, sessionToken: user?.session_token! };
      const body = await adminAiGenerateEmail({
        data: { auth, hotelName: stay.name, destination: stay.destination },
      });
      const subject = `Partnership & Net Rates Request - MooNs Travel - ${stay.name}`;
      window.location.href = `mailto:${stay.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      toast.success('AI drafted email ready to send!');
    } catch (err) {
      toast.error('Failed to generate AI email');
    } finally {
      setGeneratingEmailFor(null);
    }
  };

  const addMediaRow = () =>
    setMedia([
      ...media,
      {
        media_type: 'image',
        media_path: '',
        is_primary: media.length === 0,
        sort_order: media.length,
      },
    ]);
  const removeMediaRow = (idx: number) => setMedia(media.filter((_, i) => i !== idx));
  const updateMediaRow = (idx: number, field: string, val: any) => {
    const newMedia = [...media];
    newMedia[idx] = { ...newMedia[idx], [field]: val };
    setMedia(newMedia);
  };

  const addFeatureRow = () =>
    setFeatures([
      ...features,
      {
        feature_type: 'inclusion',
        title: '',
        description: '',
        vendor_id: null,
        net_cost: 0,
        selling_price: 0,
      },
    ]);
  const removeFeatureRow = (idx: number) => setFeatures(features.filter((_, i) => i !== idx));
  const updateFeatureRow = (idx: number, field: string, val: any) => {
    const newFeatures = [...features];
    newFeatures[idx] = { ...newFeatures[idx], [field]: val };
    setFeatures(newFeatures);
  };

  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  // Trending-2 strategy data matching
  const trending2Keywords = useMemo(() => getTrending2Keywords('all'), []);

  const filteredStays = stays.filter((s) => {
    const matchesSearch =
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.destination.toLowerCase().includes(searchQuery.toLowerCase());
    // @ts-expect-error star_rating exists from our DB migration
    const matchesStar = starFilter === 'All' || s.star_rating === parseInt(starFilter);
    const matchesRegionTab =
      activeRegion === 'trending-2'
        ? matchesTrending2(`${s.destination} ${s.country} ${s.name}`, trending2Keywords) &&
          (trending2SubTab === 'all' || matchesRegion(s.country, trending2SubTab))
        : matchesRegion(s.country, activeRegion);
    return matchesRegionTab && matchesSearch && matchesStar;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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
          {canEdit && (
            <Button onClick={() => openEditor(null)} size="sm" className="shadow-sm h-8 text-xs">
              <Plus className="mr-2 h-3.5 w-3.5" /> Add Hotel
            </Button>
          )}
        </div>
      </div>

      {isFilterOpen && (
        <div className="flex gap-4 items-center bg-muted/30 p-3 rounded-md border">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or destination..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border rounded-md pl-9 pr-3 py-1.5 text-sm"
            />
          </div>
          <select
            value={starFilter}
            onChange={(e) => setStarFilter(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm bg-background w-32"
          >
            <option value="All">All Stars</option>
            <option value="3">3 Star</option>
            <option value="4">4 Star</option>
            <option value="5">5 Star</option>
          </select>
        </div>
      )}

      <RegionTabs
        value={activeRegion}
        onValueChange={(next) => {
          if (next === 'trending-2' && !trending2Unlocked) {
            setShowTrending2Gate(true);
            return;
          }
          setActiveRegion(next);
        }}
      />

      {showTrending2Gate && (
        <Trending2AccessDialog
          onGranted={() => {
            setTrending2Unlocked(true);
            setShowTrending2Gate(false);
            setActiveRegion('trending-2');
          }}
          onCancel={() => setShowTrending2Gate(false)}
        />
      )}

      {activeRegion === 'trending-2' && (
        <div className="flex gap-2">
          <Button
            variant={trending2SubTab === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTrending2SubTab('all')}
            className="h-8 text-xs shadow-sm rounded-full"
          >
            All Trending
          </Button>
          <Button
            variant={trending2SubTab === 'international' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTrending2SubTab('international')}
            className="h-8 text-xs shadow-sm rounded-full"
          >
            International
          </Button>
          <Button
            variant={trending2SubTab === 'india' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTrending2SubTab('india')}
            className="h-8 text-xs shadow-sm rounded-full"
          >
            India
          </Button>
        </div>
      )}

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Star</TableHead>
              <TableHead>Contact / Supplier</TableHead>
              <TableHead>Pricing (B2B / B2C)</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredStays.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No stays found for this region.
                </TableCell>
              </TableRow>
            ) : (
              filteredStays.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="capitalize">{s.type}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.destination}</TableCell>
                  <TableCell>{s.star_rating || '-'}</TableCell>
                  <TableCell className="text-xs">
                    {s.email && <div>{s.email}</div>}
                    {s.phone && <div className="text-muted-foreground">{s.phone}</div>}
                    {(s as any).vendor_name && (
                      <div className="text-xs font-semibold text-blue-600 mt-1">
                        Supplier: {(s as any).vendor_name}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">
                        Net:{' '}
                        <b className="text-destructive">
                          ₹{Number((s as any).b2b_price || 0).toLocaleString('en-IN')}
                        </b>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Sell:{' '}
                        <b className="text-emerald-600">
                          ₹{Number(s.price_inr || 0).toLocaleString('en-IN')}
                        </b>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <VerificationChip
                        id={s.id}
                        tableName="accommodation_listings"
                        initialVerified={Boolean((s as any).is_verified)}
                      />
                      <GoogleVerifyButton
                        url={(s as any).google_search_url}
                        queryParts={[s.name, s.destination, 'official hotel contact price']}
                      />
                    </div>
                    {(s as any).source_name && (
                      <div
                        className="mt-1 max-w-[220px] truncate text-[10px] text-muted-foreground"
                        title={(s as any).research_notes || (s as any).source_name}
                      >
                        {(s as any).source_name}{' '}
                        {(s as any).last_checked_at
                          ? `- checked ${(s as any).last_checked_at}`
                          : ''}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="p-2 align-middle">
                    <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted ${canEdit ? 'border-r border-border' : ''}`}
                        title="AI Write RFQ Email"
                        onClick={() => handleAiEmailRequest(s)}
                        disabled={generatingEmailFor === s.id}
                      >
                        {generatingEmailFor === s.id ? (
                          <span className="animate-pulse">...</span>
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-muted"
                            onClick={() => openEditor(s)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 rounded-none h-8 text-xs bg-background text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(s.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <SheetContent className="sm:overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>{editingId ? 'Edit Stay Profile' : 'Create Stay Profile'}</SheetTitle>
            <SheetDescription>
              Configure basic details, ERP pricing, media, and features.
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">
                <MapPin className="h-4 w-4 mr-2" /> Basic Info
              </TabsTrigger>
              <TabsTrigger value="pricing">
                <IndianRupee className="h-4 w-4 mr-2" /> Pricing
              </TabsTrigger>
              <TabsTrigger value="media">
                <ImageIcon className="h-4 w-4 mr-2" /> Media
              </TabsTrigger>
              <TabsTrigger value="features">
                <LayoutList className="h-4 w-4 mr-2" /> Features
              </TabsTrigger>
            </TabsList>

            <div className="py-4 space-y-4">
              {/* BASIC TAB */}
              <TabsContent value="basic" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Type</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    >
                      <option value="hotel">Hotel</option>
                      <option value="villa">Villa</option>
                      <option value="resort">Resort</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Atlantis"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Destination</label>
                    <Input
                      value={formData.destination}
                      onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                      placeholder="e.g. Dubai"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Country</label>
                    <Input
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Location Map/Address</label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mobile / Phone</label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+91 / supplier phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="reservations@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm min-h-[100px]"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </TabsContent>

              {/* PRICING TAB */}
              <TabsContent value="pricing" className="space-y-4 mt-0">
                <div className="bg-muted/50 p-4 rounded-md border border-border">
                  <h3 className="font-semibold mb-4 text-sm uppercase text-muted-foreground tracking-wider">
                    Vendor Costing Engine
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Linked Vendor</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={pricing.vendorId}
                        onChange={(e) => handlePricingChange('vendorId', e.target.value)}
                      >
                        <option value="">-- No Vendor Assigned --</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.company_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Net Cost (B2B)</label>
                      <div className="relative">
                        <IndianRupee className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          className="pl-9"
                          value={pricing.netCost}
                          onChange={(e) => handlePricingChange('netCost', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Markup Margin %</label>
                      <Input
                        type="number"
                        value={pricing.marginPercent}
                        onChange={(e) => handlePricingChange('marginPercent', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-green-600 dark:text-green-400">
                        Selling Price (B2C)
                      </label>
                      <div className="relative">
                        <IndianRupee className="absolute left-2.5 top-2.5 h-4 w-4 text-green-600 dark:text-green-400" />
                        <Input
                          type="number"
                          className="pl-9 font-bold text-green-600 dark:text-green-400"
                          readOnly
                          value={pricing.sellingPrice}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Legacy Display Price field will be updated to match the B2C Selling Price
                    automatically.
                  </p>
                </div>
              </TabsContent>

              {/* MEDIA TAB */}
              <TabsContent value="media" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Image URL (Primary background)</label>
                  <Input
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://images.unsplash.com/..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Legacy Primary Image Key</label>
                  <Input
                    value={formData.image_key}
                    onChange={(e) => setFormData({ ...formData, image_key: e.target.value })}
                    placeholder="e.g. atlantis-cover"
                  />
                </div>

                <hr className="my-4" />
                <h3 className="font-semibold text-sm">ERP Multi-Media Gallery</h3>
                {media.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-muted p-2 rounded-md">
                    <select
                      className="h-9 rounded-md border bg-background px-3"
                      value={m.media_type}
                      onChange={(e) => updateMediaRow(idx, 'media_type', e.target.value)}
                    >
                      <option value="image">Image URL</option>
                      <option value="video_url">Video URL</option>
                    </select>
                    <Input
                      className="flex-1"
                      placeholder="https://..."
                      value={m.media_path}
                      onChange={(e) => updateMediaRow(idx, 'media_path', e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeMediaRow(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addMediaRow}
                  className="w-full border-dashed"
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Media Link
                </Button>
              </TabsContent>

              {/* FEATURES TAB */}
              <TabsContent value="features" className="space-y-4 mt-0">
                <h3 className="font-semibold text-sm">Inclusions, Exclusions & Activities</h3>
                {features.map((f, idx) => (
                  <div key={idx} className="bg-muted p-3 rounded-md space-y-3 relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 text-destructive"
                      onClick={() => removeFeatureRow(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="grid grid-cols-3 gap-2 pr-8">
                      <select
                        className="h-9 rounded-md border bg-background px-3 text-sm"
                        value={f.feature_type}
                        onChange={(e) => updateFeatureRow(idx, 'feature_type', e.target.value)}
                      >
                        <option value="inclusion">Inclusion</option>
                        <option value="exclusion">Exclusion</option>
                        <option value="activity">Paid Activity</option>
                      </select>
                      <Input
                        className="col-span-2"
                        placeholder="Title (e.g. Breakfast Included)"
                        value={f.title}
                        onChange={(e) => updateFeatureRow(idx, 'title', e.target.value)}
                      />
                    </div>
                    {f.feature_type === 'activity' && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          placeholder="Net Cost"
                          value={f.net_cost || ''}
                          onChange={(e) =>
                            updateFeatureRow(idx, 'net_cost', Number(e.target.value))
                          }
                        />
                        <Input
                          type="number"
                          placeholder="Selling Price"
                          value={f.selling_price || ''}
                          onChange={(e) =>
                            updateFeatureRow(idx, 'selling_price', Number(e.target.value))
                          }
                        />
                      </div>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addFeatureRow}
                  className="w-full border-dashed"
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Feature
                </Button>
              </TabsContent>
            </div>
          </Tabs>

          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Sync legacy price before save
                if (pricing.sellingPrice)
                  setFormData((prev) => ({ ...prev, price_inr: pricing.sellingPrice }));
                setTimeout(handleSave, 50);
              }}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Stay & Margin Profile'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
