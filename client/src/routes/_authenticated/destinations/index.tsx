// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useState, useEffect } from 'react';
import {
  getDestinations,
  adminCreateDestination,
  adminUpdateDestination,
  adminDeleteDestination,
  adminGetVendorsAll,
  adminGetCatalogPricing,
  adminSaveCatalogPricing,
  adminGetCatalogMedia,
  adminSaveCatalogMedia,
  adminGetCatalogFeatures,
  adminSaveCatalogFeatures,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Image as ImageIcon,
  MapPin,
  IndianRupee,
  LayoutList,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const Route = createFileRoute('/_authenticated/destinations/')({
  component: DestinationsPage,
});

function DestinationsPage() {
  const { user } = useAuth();
  const [destinations, setDestinations] = useState<any[]>([]);
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterNights, setFilterNights] = useState('all');
  const [filterPrice, setFilterPrice] = useState('all');

  // Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Core Data
  const [formData, setFormData] = useState({
    type: 'sedan' as any,
    name: '',
    destination: '',
    country: '',
    location: '',
    description: '',
    price_inr: 0,
    image_key: '',
    doors: 4,
    seats: 4,
    transmission: 'Automatic',
    fuel_type: 'Petrol',
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
      const [destData, vendorsData] = await Promise.all([
        getDestinations(),
        adminGetVendorsAll({ data: { auth } }),
      ]);
      setDestinations(destData || []);
      setVendors(vendorsData || []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const openEditor = async (dest: any | null) => {
    if (dest) {
      setEditingId(dest.id);
      setFormData({
        type: 'destination',
        name: dest.name,
        destination: dest.country,
        country: dest.country,
        location: '',
        description: dest.tag || '',
        price_inr: Number(String(dest.price || '').replace(/[^0-9.]/g, '')) || 0,
        image_key: dest.image_key,
        doors: 4,
        seats: dest.nights || 1,
        transmission: 'Automatic',
        fuel_type: 'Petrol',
      });

      // Load ERP Data
      try {
        const payload = {
          catalogType: 'destination',
          catalogId: dest.id,
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
          setPricing({
            vendorId: '',
            netCost: 0,
            marginPercent: 25,
            sellingPrice: Number(String(dest.price || '').replace(/[^0-9.]/g, '')) || 0,
          });
        }

        if (mRes.success)
          setMedia(
            (mRes.media || []).map((m: any) => ({ ...m, is_primary: Boolean(m.is_primary) })),
          );
        if (fRes.success) setFeatures(fRes.features || []);
      } catch (e) {
        toast.error('Failed to load ERP extension data');
      }
    } else {
      setEditingId(null);
      setFormData({
        type: 'sedan',
        name: '',
        destination: '',
        country: '',
        location: '',
        description: '',
        price_inr: 0,
        image_key: '',
        doors: 4,
        seats: 4,
        transmission: 'Automatic',
        fuel_type: 'Petrol',
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
    if (!formData.name || !formData.country) {
      toast.error('Please fill name and country');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        country: formData.country,
        price: pricing.sellingPrice ? `₹${pricing.sellingPrice}` : String(formData.price_inr || 0),
        nights: Number(formData.seats) || 1,
        image_key: formData.image_key || 'bali',
        tag: formData.description || formData.country,
      };

      let catalogId = editingId;
      if (editingId) {
        await adminUpdateDestination({ data: { id: editingId, ...payload } });
      } else {
        const res: any = await adminCreateDestination({ data: payload });
        catalogId = res.id;
      }

      if (catalogId) {
        // Save ERP Data
        const erpPayload = {
          catalogType: 'destination',
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

      toast.success(`Destination ${editingId ? 'updated' : 'created'}`);
      setIsEditorOpen(false);
      loadData();
    } catch (err) {
      toast.error('Failed to save destination');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this destination?')) return;
    try {
      await adminDeleteDestination({ data: { id } });
      toast.success('Destination deleted');
      loadData();
    } catch (err) {
      toast.error('Failed to delete destination');
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div />
        {canEdit && (
          <Button onClick={() => openEditor(null)}>
            <Plus className="mr-2 h-4 w-4" /> Add Destination
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-end bg-card p-4 rounded-md border">
        <div className="flex-1 w-full space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Search className="w-3 h-3" /> Search
          </label>
          <Input
            placeholder="Search by name or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background"
          />
        </div>
        <div className="w-full sm:w-[200px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Filter className="w-3 h-3" /> Region
          </label>
          <Select value={filterRegion} onValueChange={setFilterRegion}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="All Regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              <SelectItem value="india">India</SelectItem>
              <SelectItem value="international">International</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-[150px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Filter className="w-3 h-3" /> Duration
          </label>
          <Select value={filterNights} onValueChange={setFilterNights}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Any Duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Duration</SelectItem>
              <SelectItem value="short">Short (1-3 Nights)</SelectItem>
              <SelectItem value="medium">Medium (4-6 Nights)</SelectItem>
              <SelectItem value="long">Long (7+ Nights)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-[150px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <IndianRupee className="w-3 h-3" /> Price
          </label>
          <Select value={filterPrice} onValueChange={setFilterPrice}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Any Price" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Price</SelectItem>
              <SelectItem value="budget">Under ₹25k</SelectItem>
              <SelectItem value="mid">₹25k - ₹40k</SelectItem>
              <SelectItem value="premium">Over ₹40k</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Nights</TableHead>
              <TableHead>Listed Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading destinations...
                </TableCell>
              </TableRow>
            ) : (
              (() => {
                const filtered = destinations.filter((c) => {
                  // Search query filter
                  if (searchQuery) {
                    const query = searchQuery.toLowerCase();
                    const matchName = String(c.name || '')
                      .toLowerCase()
                      .includes(query);
                    const matchCountry = String(c.country || '')
                      .toLowerCase()
                      .includes(query);
                    if (!matchName && !matchCountry) return false;
                  }

                  // Region filter
                  if (filterRegion !== 'all') {
                    const isIndia = String(c.country || '').toLowerCase() === 'india';
                    if (filterRegion === 'india' && !isIndia) return false;
                    if (filterRegion === 'international' && isIndia) return false;
                  }

                  // Nights filter
                  if (filterNights !== 'all') {
                    const n = Number(c.nights) || 0;
                    if (filterNights === 'short' && n > 3) return false;
                    if (filterNights === 'medium' && (n < 4 || n > 6)) return false;
                    if (filterNights === 'long' && n < 7) return false;
                  }

                  // Price filter
                  if (filterPrice !== 'all') {
                    const p = Number(String(c.price || '').replace(/[^0-9.]/g, '')) || 0;
                    if (filterPrice === 'budget' && p >= 25000) return false;
                    if (filterPrice === 'mid' && (p < 25000 || p > 40000)) return false;
                    if (filterPrice === 'premium' && p <= 40000) return false;
                  }

                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No destinations found matching your filters.
                      </TableCell>
                    </TableRow>
                  );
                }

                return filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.country}</TableCell>
                    <TableCell>{c.nights}</TableCell>
                    <TableCell>{c.price}</TableCell>
                    <TableCell className="p-2 align-middle text-right">
                      {canEdit && (
                        <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-muted"
                            onClick={() => openEditor(c)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 rounded-none h-8 text-xs bg-background text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ));
              })()
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <SheetContent className="sm:overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>
              {editingId ? 'Edit Destination Profile' : 'Create Destination Profile'}
            </SheetTitle>
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
                      <option value="sedan">Sedan</option>
                      <option value="suv">SUV</option>
                      <option value="van">Van</option>
                      <option value="bus">Bus</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Toyota Innova"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Destination</label>
                    <Input
                      value={formData.destination}
                      onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Transmission & Fuel</label>
                    <div className="flex gap-2">
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={formData.transmission}
                        onChange={(e) => setFormData({ ...formData, transmission: e.target.value })}
                      >
                        <option value="Automatic">Automatic</option>
                        <option value="Manual">Manual</option>
                      </select>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={formData.fuel_type}
                        onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value })}
                      >
                        <option value="Petrol">Petrol</option>
                        <option value="Diesel">Diesel</option>
                        <option value="Electric">Electric</option>
                      </select>
                    </div>
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
                </div>
              </TabsContent>

              {/* MEDIA TAB */}
              <TabsContent value="media" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Legacy Primary Image Key</label>
                  <Input
                    value={formData.image_key}
                    onChange={(e) => setFormData({ ...formData, image_key: e.target.value })}
                    placeholder="e.g. car-cover"
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
                        placeholder="Title (e.g. Chauffeur included)"
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
                if (pricing.sellingPrice)
                  setFormData((prev) => ({ ...prev, price_inr: pricing.sellingPrice }));
                setTimeout(handleSave, 50);
              }}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Destination & Margin Profile'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
