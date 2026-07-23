// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@/lib/routerCompat';
import { Edit, Filter, Plus, Search, Trash2, Sparkles } from 'lucide-react';
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
import { AdminPriceCell } from '@/components/price-status';
import { RegionTabs, type RegionTab, matchesRegion } from '@/components/region-tabs';
import { Trending2AccessDialog } from '@/components/trending2-access-dialog';
import { getTrending2Keywords, matchesTrending2 } from '@/lib/trending-strategy-data';
import {
  adminCreateCarListing,
  adminDeleteCarListing,
  adminGetCarListingsAll,
  adminUpdateCarListing,
  type CarListing,
  adminAiSearchCars,
  adminGetVendorsAll,
} from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/cars/')({
  component: CarsPage,
});

const emptyForm = {
  id: 0,
  name: '',
  destination: '',
  country: '',
  vehicle_type: 'sedan',
  seats: 4,
  luggage: 2,
  transmission: 'Automatic',
  fuel_type: 'Petrol',
  phone: '',
  email: '',
  price_inr: 0,
  image_url: '',
  image_key: 'bali',
};

function CarsPage() {
  const { user } = useAuth();
  const [cars, setCars] = useState<CarListing[]>([]);
  const [query, setQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeRegion, setActiveRegion] = useState<RegionTab>('international');
  const [trending2SubTab, setTrending2SubTab] = useState<'all' | 'international' | 'india'>('all');
  const [trending2Unlocked, setTrending2Unlocked] = useState(false);
  const [showTrending2Gate, setShowTrending2Gate] = useState(false);
  const [form, setForm] = useState<any | null>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  // AI Car Search State
  const [aiPickup, setAiPickup] = useState('');
  const [aiDropoff, setAiDropoff] = useState('');
  const [aiDate, setAiDate] = useState('');
  const [aiClass, setAiClass] = useState('SUV');
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiCars, setAiCars] = useState<any[]>([]);

  const handleAiSearch = async () => {
    if (!aiPickup || !aiDropoff || !aiDate || !auth) return;
    setIsAiSearching(true);
    setAiCars([]);
    try {
      const res = await adminAiSearchCars({
        data: { auth, pickup: aiPickup, dropoff: aiDropoff, date: aiDate, vehicleClass: aiClass },
      });
      setAiCars(res);
      toast.success('AI found car rentals!');
    } catch (err) {
      toast.error('AI Search failed');
    } finally {
      setIsAiSearching(false);
    }
  };

  async function load() {
    if (!auth) return;
    const [carList, vens] = await Promise.all([
      adminGetCarListingsAll({ data: { auth } }),
      adminGetVendorsAll({ data: { auth } }),
    ]);
    setCars(carList);
    setVendors(vens);
  }

  useEffect(() => {
    load().catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load cars'));
  }, [user?.session_token]);

  // Trending-2 strategy data matching
  const trending2Keywords = useMemo(() => getTrending2Keywords('all'), []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cars.filter((car) => {
      if (activeRegion === 'trending-2') {
        if (!matchesTrending2(`${car.destination} ${car.country} ${car.name}`, trending2Keywords))
          return false;
        if (trending2SubTab !== 'all' && !matchesRegion(car.country, trending2SubTab)) return false;
      } else if (!matchesRegion(car.country, activeRegion)) return false;
      if (!needle) return true;
      return [
        car.name,
        car.destination,
        car.country,
        car.vehicle_type,
        car.transmission,
        car.fuel_type,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [activeRegion, cars, query, trending2Keywords, trending2SubTab]);

  async function save() {
    if (!auth || !form) return;
    setSaving(true);
    try {
      const payload = { ...form, auth };
      if (form.id) await adminUpdateCarListing({ data: payload });
      else await adminCreateCarListing({ data: payload });
      toast.success('Car saved');
      setForm(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save car');
    } finally {
      setSaving(false);
    }
  }

  async function remove(car: CarListing) {
    if (!auth) return;
    if (!window.confirm(`Archive car "${car.name}"? This will hide it from active inventory.`))
      return;
    setArchivingId(car.id);
    try {
      await adminDeleteCarListing({ data: { auth, id: car.id } });
      toast.success('Car archived');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive car');
    } finally {
      setArchivingId(null);
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
          <Button size="sm" onClick={() => setForm(emptyForm)} className="h-8 text-xs shadow-sm">
            <Plus className="mr-2 h-3.5 w-3.5" /> Add Car
          </Button>
        </div>
      </div>

      {/* ✨ AI Car Search Console */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4 text-primary font-bold">
          <Sparkles className="w-5 h-5" /> AI Car Rental Aggregator
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Input
            placeholder="Pick-up Location"
            value={aiPickup}
            onChange={(e) => setAiPickup(e.target.value)}
            className="bg-background border-primary/30"
          />
          <Input
            placeholder="Drop-off Location"
            value={aiDropoff}
            onChange={(e) => setAiDropoff(e.target.value)}
            className="bg-background border-primary/30"
          />
          <Input
            type="date"
            value={aiDate}
            onChange={(e) => setAiDate(e.target.value)}
            className="bg-background border-primary/30"
          />
          <select
            className="h-9 rounded-md border border-primary/30 bg-background px-3 text-sm"
            value={aiClass}
            onChange={(e) => setAiClass(e.target.value)}
          >
            <option value="Economy">Economy</option>
            <option value="Sedan">Sedan</option>
            <option value="SUV">SUV</option>
            <option value="Luxury">Luxury</option>
            <option value="Van">Van</option>
          </select>
          <Button
            onClick={handleAiSearch}
            disabled={isAiSearching || !aiPickup || !aiDropoff || !aiDate}
          >
            {isAiSearching ? 'Searching GDS...' : 'Search Cars'}
          </Button>
        </div>

        {aiCars.length > 0 && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {aiCars.map((car, idx) => {
              const bookingUrl = `https://www.rentalcars.com/search?pickup=${encodeURIComponent(aiPickup)}&dropoff=${encodeURIComponent(aiDropoff)}&date=${aiDate}`;
              return (
                <a
                  key={idx}
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <div className="bg-background border border-primary/20 rounded-lg p-4 hover:shadow-md hover:border-primary/50 transition-all cursor-pointer">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold text-zinc-900">{car.supplier}</div>
                      <div className="text-emerald-600 font-bold">
                        ₹{car.price_inr.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-sm font-semibold mb-1 text-primary">{car.vehicle}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{car.seats} Seats</span>
                      <span>•</span>
                      <span>{car.transmission}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {form && (
        <div className="rounded-md border bg-background p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Vehicle name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="Destination"
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
            />
            <Input
              placeholder="Country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
            <Input
              placeholder="Vehicle type"
              value={form.vehicle_type}
              onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
            />
            <Input
              placeholder="Mobile / Phone"
              value={form.phone || ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              type="email"
              placeholder="Email"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Seats"
              value={form.seats}
              onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="Luggage"
              value={form.luggage}
              onChange={(e) => setForm({ ...form, luggage: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="B2B Net Price"
              value={form.b2b_price || ''}
              onChange={(e) => setForm({ ...form, b2b_price: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="B2C Selling Price"
              value={form.price_inr}
              onChange={(e) => setForm({ ...form, price_inr: Number(e.target.value) })}
            />
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm md:text-sm"
              value={form.vendor_id || ''}
              onChange={(e) => setForm({ ...form, vendor_id: Number(e.target.value) })}
            >
              <option value="">Select Supplier...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.company_name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Image URL"
              value={form.image_url || ''}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Car'}
            </Button>
          </div>
        </div>
      )}

      {isFilterOpen && (
        <div className="flex gap-4 items-center bg-muted/30 p-3 rounded-md border">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 bg-background h-9"
              placeholder="Search car, destination..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
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

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle & Supplier</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Pricing (B2B / B2C)</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((car: any) => (
              <TableRow key={car.id}>
                <TableCell>
                  <div className="font-medium">{car.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {car.vehicle_type} - {car.transmission}
                  </div>
                  {car.vendor_name && (
                    <div className="text-xs font-semibold text-blue-600 mt-1">
                      Supplier: {car.vendor_name}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {car.destination}, {car.country}
                </TableCell>
                <TableCell>
                  {car.seats} seats - {car.luggage} bags
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      Net:{' '}
                      <b className="text-destructive">₹{car.b2b_price?.toLocaleString() || 0}</b>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Sell:{' '}
                      <b className="text-emerald-600">₹{car.price_inr?.toLocaleString() || 0}</b>
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <VerificationChip
                      id={car.id}
                      tableName="car_listings"
                      initialVerified={Boolean((car as any).is_verified)}
                    />
                    <GoogleVerifyButton
                      url={(car as any).google_search_url}
                      queryParts={[car.name, car.destination, 'official taxi transfer tariff']}
                    />
                  </div>
                  {(car as any).source_name && (
                    <div
                      className="mt-1 max-w-[220px] truncate text-[10px] text-muted-foreground"
                      title={(car as any).research_notes || (car as any).source_name}
                    >
                      {(car as any).source_name}{' '}
                      {(car as any).last_checked_at
                        ? `- checked ${(car as any).last_checked_at}`
                        : ''}
                    </div>
                  )}
                </TableCell>
                <TableCell className="p-2 align-middle text-right">
                  <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-muted"
                      onClick={() => setForm({ ...emptyForm, ...car })}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 rounded-none h-8 text-xs bg-background text-destructive hover:bg-destructive/10"
                      onClick={() => remove(car)}
                      disabled={archivingId === car.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No cars found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
