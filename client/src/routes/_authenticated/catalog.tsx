// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useEffect, useMemo, useState } from 'react';
import { Database, Edit, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';
import { parseCsv } from '@/lib/csv';
import { RegionTabs, type RegionTab, matchesRegion } from '@/components/region-tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminArchiveMasterCatalogItem,
  adminGetCatalogPricing,
  adminGetMasterCatalog,
  adminImportMasterCatalog,
  adminSaveCatalogPricing,
  adminSaveVendorCoverage,
  adminUpsertMasterCatalogItem,
  type CatalogRateCard,
  type CatalogType,
  type MasterCatalogItem,
  type RateUnit,
  type VendorCoverage,
  type VendorProfile,
} from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/catalog')({
  component: MasterCatalogPage,
});

const catalogTypes: CatalogType[] = ['stay', 'room', 'activity', 'car'];
const rateUnits: RateUnit[] = [
  'fixed',
  'per_person',
  'per_room_per_night',
  'per_vehicle',
  'per_group',
];

const emptyItem: MasterCatalogItem = {
  catalog_type: 'stay',
  name: '',
  destination: '',
  country: '',
  subtype: 'hotel',
  status: 'active',
};

function MasterCatalogPage() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [activeTab, setActiveTab] = useState<string>('stay');
  const [activeType, setActiveType] = useState<CatalogType>('stay');
  const [activeRegion, setActiveRegion] = useState<RegionTab>('international');
  const [items, setItems] = useState<MasterCatalogItem[]>([]);
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [coverage, setCoverage] = useState<VendorCoverage[]>([]);
  const [editing, setEditing] = useState<MasterCatalogItem | null>(null);
  const [rates, setRates] = useState<CatalogRateCard[]>([]);
  const [query, setQuery] = useState('');
  const [importRows, setImportRows] = useState<Record<string, any>[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!auth) return;
    const res = await adminGetMasterCatalog({ data: { auth, catalogType: 'all', status: 'all' } });
    setItems(res.items);
    setVendors(res.vendors);
    setCoverage(res.coverage);
  }

  useEffect(() => {
    load().catch((err) =>
      toast.error(err instanceof Error ? err.message : 'Failed to load master catalog'),
    );
  }, [user?.session_token]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (item.catalog_type !== activeType) return false;
      if (!matchesRegion(item.country, activeRegion)) return false;
      if (!needle) return true;
      return [item.name, item.destination, item.country, item.subtype, item.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [activeRegion, activeType, items, query]);

  async function openEditor(item?: MasterCatalogItem) {
    const next = item || {
      ...emptyItem,
      catalog_type: activeType,
      subtype: activeType === 'car' ? 'sedan' : activeType === 'room' ? 'standard' : 'hotel',
    };
    setEditing(next);
    if (item?.id && auth) {
      const res = await adminGetCatalogPricing({
        data: { auth, catalogType: item.catalog_type, catalogId: item.id },
      });
      setRates(res.pricing);
    } else {
      setRates([]);
    }
  }

  async function saveItem() {
    if (!auth || !editing) return;
    if (!editing.name || !editing.destination || !editing.country) {
      toast.error('Name, destination, and country are required');
      return;
    }
    setSaving(true);
    try {
      const res = await adminUpsertMasterCatalogItem({ data: { auth, item: editing } });
      if (rates.length) {
        await adminSaveCatalogPricing({
          data: {
            auth,
            catalogType: editing.catalog_type,
            catalogId: res.id,
            rates,
            replaceAll: true,
          },
        });
      }
      toast.success('Catalog item saved');
      setEditing(null);
      setRates([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  async function archiveItem(item: MasterCatalogItem) {
    if (!auth || !item.id) return;
    if (
      !window.confirm(
        `Archive "${item.name}" from ${item.catalog_type}? It will be hidden from active catalog workflows.`,
      )
    )
      return;
    try {
      await adminArchiveMasterCatalogItem({
        data: { auth, catalogType: item.catalog_type, id: item.id },
      });
      toast.success('Catalog item archived');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive catalog item');
    }
  }

  function updateRate(index: number, patch: Partial<CatalogRateCard>) {
    setRates((current) => current.map((rate, i) => (i === index ? { ...rate, ...patch } : rate)));
  }

  function addRate() {
    if (!editing) return;
    setRates((current) => [
      ...current,
      {
        catalog_type: editing.catalog_type,
        catalog_id: editing.id || 0,
        unit_type:
          editing.catalog_type === 'room'
            ? 'per_room_per_night'
            : editing.catalog_type === 'car'
              ? 'per_vehicle'
              : 'fixed',
        vendor_id: null,
        net_cost: 0,
        margin_percent: 25,
        selling_price: 0,
        currency: 'INR',
        is_active: true,
      },
    ]);
  }

  function parseFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Only CSV imports are supported in production.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImportRows(parseCsv(String(reader.result || '')));
    };
    reader.readAsText(file);
  }

  async function previewOrImport(commit: boolean) {
    if (!auth) return;
    const res = await adminImportMasterCatalog({ data: { auth, rows: importRows, commit } });
    if (res.errors.length) {
      toast.error(`${res.errors.length} rows need fixes`);
    } else if (commit) {
      toast.success(`Imported ${res.importedCount} rows`);
      setImportRows([]);
      await load();
    } else {
      toast.success(`${res.validCount} rows ready to import`);
    }
  }

  async function saveCoverage() {
    if (!auth) return;
    await adminSaveVendorCoverage({ data: { auth, coverage } });
    toast.success('Vendor coverage saved');
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div />
        <Button onClick={() => openEditor()}>
          <Plus className="mr-2 h-4 w-4" /> Add Item
        </Button>
      </div>

      <RegionTabs value={activeRegion} onValueChange={setActiveRegion} />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          if (catalogTypes.includes(value as CatalogType)) setActiveType(value as CatalogType);
        }}
      >
        <TabsList>
          {catalogTypes.map((type) => (
            <TabsTrigger key={type} value={type} className="capitalize">
              {type === 'activity' ? 'Activities' : `${type}s`}
            </TabsTrigger>
          ))}
          <TabsTrigger value="coverage">Vendor Coverage</TabsTrigger>
          <TabsTrigger value="import">Bulk Import</TabsTrigger>
        </TabsList>

        {catalogTypes.map((type) => (
          <TabsContent key={type} value={type} className="space-y-4">
            <Input
              className=""
              placeholder="Search catalog..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="rounded-md border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={`${item.catalog_type}-${item.id}`}>
                      <TableCell className="font-medium">
                        {item.name}
                        {(item as any).parent_name && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground whitespace-nowrap">
                            ({(item as any).parent_name})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.destination}, {item.country}
                      </TableCell>
                      <TableCell className="capitalize">
                        {item.subtype || item.catalog_type}
                      </TableCell>
                      <TableCell className="capitalize">{item.status}</TableCell>
                      <TableCell className="p-2 align-middle text-right">
                        <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-muted"
                            onClick={() => openEditor(item)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 rounded-none h-8 text-xs bg-background text-destructive hover:bg-destructive/10"
                            onClick={() => archiveItem(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No catalog items found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}

        <TabsContent value="coverage" className="space-y-4">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ...coverage,
                  {
                    vendor_id: vendors[0]?.id || 0,
                    service_type: 'stay',
                    destination: '',
                    country: '',
                    is_active: true,
                    notes: '',
                  } as VendorCoverage,
                ].map((row, index) => (
                  <TableRow key={row.id || `new-${index}`}>
                    <TableCell>
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={row.vendor_id}
                        onChange={(e) =>
                          setCoverage((current) =>
                            upsertCoverage(current, index, {
                              ...row,
                              vendor_id: Number(e.target.value),
                            }),
                          )
                        }
                      >
                        {vendors.map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.company_name}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={row.service_type}
                        onChange={(e) =>
                          setCoverage((current) =>
                            upsertCoverage(current, index, {
                              ...row,
                              service_type: e.target.value as any,
                            }),
                          )
                        }
                      >
                        {['stay', 'room', 'activity', 'car', 'package'].map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.destination}
                        onChange={(e) =>
                          setCoverage((current) =>
                            upsertCoverage(current, index, { ...row, destination: e.target.value }),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.country || ''}
                        onChange={(e) =>
                          setCoverage((current) =>
                            upsertCoverage(current, index, { ...row, country: e.target.value }),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.notes || ''}
                        onChange={(e) =>
                          setCoverage((current) =>
                            upsertCoverage(current, index, { ...row, notes: e.target.value }),
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button onClick={saveCoverage}>
            <Save className="mr-2 h-4 w-4" /> Save Coverage
          </Button>
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <div className="rounded-md border bg-background p-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
              <FileUp className="h-4 w-4" /> Upload CSV/XLSX
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => parseFile(event.target.files?.[0] || null)}
              />
            </label>
            <p className="mt-3 text-xs text-muted-foreground">
              Expected columns include catalog_type, name, destination, country, vendor_email,
              unit_type, net_cost, markup_percent, selling_price, valid_from, valid_to, image_url.
            </p>
          </div>
          {importRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => previewOrImport(false)}>
                  Validate {importRows.length} rows
                </Button>
                <Button onClick={() => previewOrImport(true)}>Import Valid Rows</Button>
              </div>
              <div className="rounded-md border bg-background p-3 text-xs">
                <pre className="max-h-72 overflow-auto">
                  {JSON.stringify(importRows.slice(0, 10), null, 2)}
                </pre>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-6">
          <div className="mt-10 max-h-[85vh] w-full overflow-y-auto rounded-md border bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editing.id ? 'Edit' : 'Add'} Catalog Item</h3>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Close
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={editing.catalog_type}
                onChange={(e) =>
                  setEditing({ ...editing, catalog_type: e.target.value as CatalogType })
                }
              >
                {catalogTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <Input
                placeholder="Destination"
                value={editing.destination}
                onChange={(e) => setEditing({ ...editing, destination: e.target.value })}
              />
              <Input
                placeholder="Country"
                value={editing.country}
                onChange={(e) => setEditing({ ...editing, country: e.target.value })}
              />
              <Input
                placeholder="Subtype / room type / vehicle type"
                value={editing.subtype || ''}
                onChange={(e) => setEditing({ ...editing, subtype: e.target.value })}
              />
              <Input
                placeholder="Location / place"
                value={editing.location || ''}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              />
              <Input
                placeholder="Capacity/seats"
                type="number"
                value={editing.capacity || editing.seats || ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    capacity: Number(e.target.value),
                    seats: Number(e.target.value),
                  })
                }
              />
              <Input
                placeholder="Image URL"
                value={editing.image_url || ''}
                onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
              />
            </div>
            <textarea
              className="mt-3 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Description"
              value={editing.description || ''}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />

            <div className="mt-5 flex items-center justify-between">
              <h4 className="font-semibold">Rate Cards</h4>
              <Button variant="outline" size="sm" onClick={addRate}>
                <Plus className="mr-2 h-4 w-4" /> Add Rate
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {rates.map((rate, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-md border p-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
                >
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={rate.vendor_id || ''}
                    onChange={(e) =>
                      updateRate(index, {
                        vendor_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">No vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.company_name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={rate.unit_type}
                    onChange={(e) => updateRate(index, { unit_type: e.target.value as RateUnit })}
                  >
                    {rateUnits.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder="Net"
                    value={rate.net_cost}
                    onChange={(e) => updateRate(index, { net_cost: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    placeholder="Margin %"
                    value={rate.margin_percent}
                    onChange={(e) => updateRate(index, { margin_percent: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    placeholder="Selling"
                    value={rate.selling_price}
                    onChange={(e) => updateRate(index, { selling_price: Number(e.target.value) })}
                  />
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setRates((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={saveItem} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save Item
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function upsertCoverage(current: VendorCoverage[], index: number, row: VendorCoverage) {
  const next = [...current];
  if (index >= current.length) {
    if (row.vendor_id && row.destination) next.push(row);
  } else {
    next[index] = row;
  }
  return next;
}
