// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useMemo, useState, useEffect } from 'react';
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
import { Ship, Plus, Search, Edit, Trash2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RegionTabs, type RegionTab, matchesRegion } from '@/components/region-tabs';
import { Trending2AccessDialog } from '@/components/trending2-access-dialog';
import { getTrending2Keywords, matchesTrending2 } from '@/lib/trending-strategy-data';
import {
  adminCreateCruiseListing,
  adminDeleteCruiseListing,
  adminGetCruiseListings,
  adminUpdateCruiseListing,
  adminAiSearchCruises,
  adminGetVendorsAll,
} from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';
import { VerificationChip } from '@/components/verification-chip';
import { GoogleVerifyButton } from '@/components/google-verify-button';
import { formatInr } from '@/components/price-status';
import { toast } from '@/lib/toast';

export const Route = createFileRoute('/_authenticated/cruises/')({
  component: CruisesPage,
});

type CruiseStatus = 'Available' | 'Limited' | 'Sold Out';

type CruiseSailing = {
  id: number;
  line: string;
  ship: string;
  itinerary: string;
  country: string;
  date_sailing: string;
  inside_price: number;
  balcony_price: number;
  suite_price: number;
  status: CruiseStatus;
  phone?: string;
  email?: string;
  is_verified?: boolean;
  google_search_url?: string;
  source_name?: string;
  vendor_id?: number;
  b2b_price?: number;
  vendor_name?: string;
};

const emptySailing: CruiseSailing = {
  id: 0,
  line: '',
  ship: '',
  itinerary: '',
  country: 'India',
  date_sailing: '',
  inside_price: 0,
  balcony_price: 0,
  suite_price: 0,
  status: 'Available',
  phone: '',
  email: '',
  b2b_price: 0,
};

function CruisesPage() {
  const [search, setSearch] = useState('');
  const [activeRegion, setActiveRegion] = useState<RegionTab>('international');
  const [trending2SubTab, setTrending2SubTab] = useState<'all' | 'international' | 'india'>('all');
  const [trending2Unlocked, setTrending2Unlocked] = useState(false);
  const [showTrending2Gate, setShowTrending2Gate] = useState(false);
  const [sailings, setSailings] = useState<CruiseSailing[]>([]);
  const [form, setForm] = useState<CruiseSailing | null>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;

  // AI Cruise Search State
  const [aiPort, setAiPort] = useState('');
  const [aiRegion, setAiRegion] = useState('Caribbean');
  const [aiMonth, setAiMonth] = useState('');
  const [aiLine, setAiLine] = useState('');
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiCruises, setAiCruises] = useState<any[]>([]);

  const handleAiSearch = async () => {
    if (!aiPort || !aiRegion || !aiMonth || !auth) return;
    setIsAiSearching(true);
    setAiCruises([]);
    try {
      const res = await adminAiSearchCruises({
        data: { auth, port: aiPort, region: aiRegion, month: aiMonth, line: aiLine || 'Any' },
      });
      setAiCruises(res);
      toast.success('AI found cruise options!');
    } catch (err) {
      toast.error('AI Search failed');
    } finally {
      setIsAiSearching(false);
    }
  };

  async function loadSailings() {
    if (!auth) return;
    setLoading(true);
    try {
      const [res, vens] = await Promise.all([
        adminGetCruiseListings({ data: { auth } }),
        adminGetVendorsAll({ data: { auth } }),
      ]);
      setSailings(res as CruiseSailing[]);
      setVendors(vens);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    loadSailings();
  }, [user?.session_token]);

  // Trending-2 strategy data matching
  const trending2Keywords = useMemo(() => getTrending2Keywords('all'), []);

  const filteredSailings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sailings.filter((sailing) => {
      if (activeRegion === 'trending-2') {
        const haystack = `${sailing.itinerary} ${sailing.country} ${sailing.ship} ${sailing.line}`;
        if (!matchesTrending2(haystack, trending2Keywords)) return false;
        if (trending2SubTab !== 'all' && !matchesRegion(sailing.country, trending2SubTab))
          return false;
      } else if (!matchesRegion(sailing.country, activeRegion)) return false;
      if (!needle) return true;
      return [sailing.line, sailing.ship, sailing.itinerary, sailing.country, sailing.status].some(
        (value) => value.toLowerCase().includes(needle),
      );
    });
  }, [activeRegion, sailings, search, trending2Keywords, trending2SubTab]);

  async function saveSailing() {
    if (!auth) return toast.error('Missing admin session');
    if (!form?.line || !form.ship || !form.itinerary || !form.country)
      return toast.error('Cruise line, ship, itinerary, and country are required');
    setSaving(true);
    try {
      const payload = { ...form, auth, is_verified: Boolean(form.is_verified) };
      if (form.id) await adminUpdateCruiseListing({ data: payload });
      else await adminCreateCruiseListing({ data: payload });
      toast.success(form.id ? 'Sailing updated' : 'Sailing created');
      setForm(null);
      await loadSailings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save sailing');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSailing(id: number) {
    if (!auth) return;
    const sailing = sailings.find((item) => item.id === id);
    if (!window.confirm(`Delete sailing "${sailing?.ship || id}"? This cannot be undone.`)) return;
    try {
      await adminDeleteCruiseListing({ data: { auth, id } });
      toast.success('Sailing deleted');
      await loadSailings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete sailing');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div />
        <div className="flex gap-2">
          <Button onClick={() => setForm(emptySailing)}>
            <Plus className="mr-2 h-4 w-4" /> Add Sailing
          </Button>
        </div>
      </div>

      {/* ✨ AI Cruise Finder Console */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4 text-primary font-bold">
          <Sparkles className="w-5 h-5" /> AI Cruise Finder
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Input
            placeholder="Departure Port"
            value={aiPort}
            onChange={(e) => setAiPort(e.target.value)}
            className="bg-background border-primary/30"
          />
          <select
            className="h-9 rounded-md border border-primary/30 bg-background px-3 text-sm"
            value={aiRegion}
            onChange={(e) => setAiRegion(e.target.value)}
          >
            <option value="Caribbean">Caribbean</option>
            <option value="Mediterranean">Mediterranean</option>
            <option value="Alaska">Alaska</option>
            <option value="Asia">Asia</option>
            <option value="Northern Europe">Northern Europe</option>
          </select>
          <Input
            type="month"
            value={aiMonth}
            onChange={(e) => setAiMonth(e.target.value)}
            className="bg-background border-primary/30"
          />
          <Input
            placeholder="Preferred Line (Optional)"
            value={aiLine}
            onChange={(e) => setAiLine(e.target.value)}
            className="bg-background border-primary/30"
          />
          <Button onClick={handleAiSearch} disabled={isAiSearching || !aiPort || !aiMonth}>
            {isAiSearching ? 'Searching GDS...' : 'Find Cruises'}
          </Button>
        </div>

        {aiCruises.length > 0 && (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            {aiCruises.map((cruise, idx) => (
              <a
                key={idx}
                href={`https://www.cruisecritic.com/search?q=${encodeURIComponent(cruise.line + ' ' + cruise.itinerary)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <div className="bg-background border border-primary/20 rounded-lg p-4 hover:shadow-md hover:border-primary/50 transition-all cursor-pointer h-full">
                  <div className="font-bold text-zinc-900 mb-1">{cruise.itinerary}</div>
                  <div className="text-sm text-muted-foreground mb-3">
                    {cruise.line} · {cruise.ship} · {cruise.date}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-muted rounded p-1.5 border">
                      <div className="text-muted-foreground mb-0.5">Inside</div>
                      <div className="font-bold text-emerald-600">
                        ₹{cruise.inside_price.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-muted rounded p-1.5 border">
                      <div className="text-muted-foreground mb-0.5">Balcony</div>
                      <div className="font-bold text-emerald-600">
                        ₹{cruise.balcony_price.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-muted rounded p-1.5 border">
                      <div className="text-muted-foreground mb-0.5">Suite</div>
                      <div className="font-bold text-emerald-600">
                        ₹{cruise.suite_price.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {form && (
        <div className="rounded-md border bg-background p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Cruise line"
              value={form.line}
              onChange={(e) => setForm({ ...form, line: e.target.value })}
            />
            <Input
              placeholder="Ship"
              value={form.ship}
              onChange={(e) => setForm({ ...form, ship: e.target.value })}
            />
            <Input
              placeholder="Itinerary"
              value={form.itinerary}
              onChange={(e) => setForm({ ...form, itinerary: e.target.value })}
            />
            <Input
              placeholder="Country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
            <Input
              placeholder="Sailing date"
              value={form.date_sailing}
              onChange={(e) => setForm({ ...form, date_sailing: e.target.value })}
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
              placeholder="Inside cabin INR"
              value={form.inside_price}
              onChange={(e) => setForm({ ...form, inside_price: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="Balcony INR"
              value={form.balcony_price}
              onChange={(e) => setForm({ ...form, balcony_price: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="Suite INR"
              value={form.suite_price}
              onChange={(e) => setForm({ ...form, suite_price: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="B2B Net Price"
              value={form.b2b_price || ''}
              onChange={(e) => setForm({ ...form, b2b_price: Number(e.target.value) })}
            />
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
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
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CruiseStatus })}
            >
              <option value="Available">Available</option>
              <option value="Limited">Limited</option>
              <option value="Sold Out">Sold Out</option>
            </select>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={saveSailing} disabled={saving}>
              {saving ? 'Saving...' : 'Save Sailing'}
            </Button>
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

      <div className="flex items-center gap-2 ">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ship or itinerary..."
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="border border-border/50 rounded-lg bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-[220px]">Cruise Line, Ship & Supplier</TableHead>
              <TableHead>Itinerary & Date</TableHead>
              <TableHead className="text-right">Inside Cabin</TableHead>
              <TableHead className="text-right">Balcony</TableHead>
              <TableHead className="text-right">Suite</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSailings.map((c) => (
              <TableRow key={c.id} className="group">
                <TableCell>
                  <div className="font-semibold text-foreground">{c.line}</div>
                  <div className="text-xs text-muted-foreground">{c.ship}</div>
                  {c.vendor_name && (
                    <div className="text-xs font-semibold text-blue-600 mt-1">
                      Supplier: {c.vendor_name}
                    </div>
                  )}
                  {c.b2b_price ? (
                    <div className="text-[10px] font-mono text-destructive mt-0.5">
                      Net: ₹{c.b2b_price.toLocaleString()}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{c.itinerary}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {c.country} - {c.date_sailing}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  <span className="block text-[10px] uppercase tracking-wider">RFQ</span>
                  <span>Ref {formatInr(c.inside_price)}</span>
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-foreground">
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    RFQ
                  </span>
                  <span>Ref {formatInr(c.balcony_price)}</span>
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-primary">
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    RFQ
                  </span>
                  <span>Ref {formatInr(c.suite_price)}</span>
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={
                      c.status === 'Available'
                        ? 'default'
                        : c.status === 'Limited'
                          ? 'secondary'
                          : 'destructive'
                    }
                    className="text-[10px]"
                  >
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <VerificationChip
                      id={c.id}
                      tableName="cruise_listings"
                      initialVerified={Boolean(c.is_verified)}
                    />
                    <GoogleVerifyButton
                      url={c.google_search_url}
                      queryParts={[c.line, c.ship, c.itinerary, 'official cruise price']}
                    />
                  </div>
                  {(c as any).source_name && (
                    <div
                      className="mt-1 max-w-[220px] truncate text-[10px] text-muted-foreground"
                      title={(c as any).research_notes || (c as any).source_name}
                    >
                      {(c as any).source_name}{' '}
                      {(c as any).last_checked_at ? `- checked ${(c as any).last_checked_at}` : ''}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setForm(c)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deleteSailing(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!loading && filteredSailings.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No cruise sailings found for this region.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
