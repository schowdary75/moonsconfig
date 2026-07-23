import { useState, useEffect } from 'react';
import { Sunrise, BookOpen, Package, Hotel, Car, Ship, CalendarIcon, Plus, X } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/lib/toast';
import {
  adminGetVendorsAll,
  adminAiComposeRfq,
  adminSendRfq,
  adminGetEmailTemplates,
  adminRenderRfqTemplate,
  getAccommodationListings,
} from '@/lib/api/db.functions';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const SCOPE_OPTIONS = [
  {
    key: 'full',
    label: 'Full Package',
    icon: Package,
    description: 'Itinerary, activities, inclusions & exclusions',
  },
  {
    key: 'hotels',
    label: 'Hotels',
    icon: Hotel,
    description: 'Rooms, meal plans, child policy, group rates',
  },
  {
    key: 'transport',
    label: 'Transport',
    icon: Car,
    description: 'Vehicles, transfers, driver & disposal rates',
  },
  {
    key: 'cruise',
    label: 'Cruise',
    icon: Ship,
    description: 'Cabins, fares, ports, gratuities, payment terms',
  },
] as const;

const SCOPE_ORDER = ['full', 'hotels', 'transport', 'cruise'];

export function SendRfqModal({
  isOpen,
  onClose,
  auth,
  packageId,
  destination,
  country,
  packageDurationDays,
}: {
  isOpen: boolean;
  onClose: () => void;
  auth: any;
  packageId: number;
  destination?: string;
  country?: string;
  packageDurationDays?: number;
}) {
  const [vendors, setVendors] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [rfqScope, setRfqScope] = useState<string[]>(['full']);

  // New State for DateRange and Hotels
  const [travelDateRange, setTravelDateRange] = useState<DateRange | undefined>();
  const [masterStays, setMasterStays] = useState<any[]>([]);
  const [selectedHotels, setSelectedHotels] = useState<string[]>([]);
  const [customHotelInput, setCustomHotelInput] = useState('');

  const [rfqSelectedVendors, setRfqSelectedVendors] = useState<number[]>([]);
  const [isRfqComposing, setIsRfqComposing] = useState(false);
  const [isRenderingTemplate, setIsRenderingTemplate] = useState(false);

  // rfqPreview determines if we are in step 2 (composing) or step 1 (selecting vendors)
  const [rfqPreview, setRfqPreview] = useState<{ subject: string; htmlBody: string } | null>(null);

  const [isRfqSending, setIsRfqSending] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRfqSelectedVendors([]);
      setRfqPreview(null);
      if (vendors.length === 0 && auth) {
        setLoadingVendors(true);
        adminGetVendorsAll({ data: { auth } })
          .then((res) => setVendors(res || []))
          .catch((err) => console.error('Failed to fetch vendors', err))
          .finally(() => setLoadingVendors(false));
      }
      if (templates.length === 0 && auth) {
        adminGetEmailTemplates({ data: { auth } }).then((res) => setTemplates(res || []));
      }
      if (masterStays.length === 0 && auth) {
        // Fetch hotels to let the user select from list
        getAccommodationListings()
          .then((res: any[]) => {
            const dest = (destination || country || '').toLowerCase();
            const filtered = res.filter(
              (item) =>
                (item.destination || '').toLowerCase() === dest ||
                (item.country || '').toLowerCase() === dest,
            );
            setMasterStays(filtered);
          })
          .catch((err) => console.error('Failed to fetch accommodations', err));
      }
    }
  }, [isOpen, auth, vendors.length, destination, country]);

  if (!isOpen) return null;

  const toggleScope = (key: string) => {
    setRfqScope((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== key);
      }
      return [...prev, key];
    });
  };

  const sortedScope = [...rfqScope]
    .sort((a, b) => {
      return SCOPE_ORDER.indexOf(a) - SCOPE_ORDER.indexOf(b);
    })
    .join(',');

  const filteredTemplates = templates.filter((t) => {
    if (t.type !== 'rfq') return false;
    if (t.is_active === 0 || t.is_active === false) return false;
    if (!t.scope_tags) return true;
    const templateTags = t.scope_tags
      .split(',')
      .map((s: string) => s.trim())
      .sort((a: string, b: string) => {
        return SCOPE_ORDER.indexOf(a) - SCOPE_ORDER.indexOf(b);
      })
      .join(',');
    return templateTags === sortedScope;
  });

  const getFormattedTravelDates = () => {
    if (travelDateRange?.from && travelDateRange?.to) {
      return `${format(travelDateRange.from, 'LLL dd, y')} - ${format(travelDateRange.to, 'LLL dd, y')}`;
    }
    return undefined;
  };

  const handleComposeRfqAi = async () => {
    if (!auth || !packageId) return toast.error('Invalid package ID.');
    setIsRfqComposing(true);
    try {
      const travelDates = getFormattedTravelDates();
      const res = await adminAiComposeRfq({
        data: { auth, packageId, scope: rfqScope, travelDates, customHotels: selectedHotels },
      });
      setRfqPreview({ subject: res.subject, htmlBody: res.htmlBody });
      toast.success('Draft composed by Maya.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to compose RFQ.');
    } finally {
      setIsRfqComposing(false);
    }
  };

  const proceedToCompose = () => {
    if (rfqSelectedVendors.length === 0) return toast.error('Please select at least one vendor.');
    if (!travelDateRange?.from || !travelDateRange?.to)
      return toast.error('Travel dates are mandatory.');
    setRfqPreview({ subject: '', htmlBody: '' });
  };

  const applyTemplate = async (templateId: string) => {
    if (!auth || !packageId) return;
    setIsRenderingTemplate(true);
    try {
      const travelDates = getFormattedTravelDates();
      const res = await adminRenderRfqTemplate({
        data: {
          auth,
          packageId,
          templateId: parseInt(templateId),
          travelDates,
          customHotels: selectedHotels,
        },
      });
      setRfqPreview({ subject: res.subject, htmlBody: res.body });
      toast.success('Template applied with package data!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to render template.');
    } finally {
      setIsRenderingTemplate(false);
    }
  };

  const handleSendRfq = async () => {
    if (!auth || !packageId || !rfqPreview) return;
    setIsRfqSending(true);
    try {
      const res = await adminSendRfq({
        data: {
          auth,
          packageId,
          vendorIds: rfqSelectedVendors,
          subject: rfqPreview.subject,
          htmlBody: rfqPreview.htmlBody,
        },
      });
      if ((res as any).success) {
        toast.success(`RFQ sent to ${(res as any).sentCount} vendor(s)!`);
        onClose();
      } else {
        toast.error('Failed to send RFQ to some vendors.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send RFQ.');
    } finally {
      setIsRfqSending(false);
    }
  };

  const addCustomHotel = () => {
    if (customHotelInput.trim() && !selectedHotels.includes(customHotelInput.trim())) {
      setSelectedHotels((prev) => [...prev, customHotelInput.trim()]);
    }
    setCustomHotelInput('');
  };

  const removeHotel = (hotel: string) => {
    setSelectedHotels((prev) => prev.filter((h) => h !== hotel));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-4xl rounded-xl shadow-lg border flex flex-col max-h-[95vh]">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-lg">Send Request for Quote via Maya</h3>
        </div>

        <div className="p-4 overflow-y-auto flex-1 grid gap-6">
          {!rfqPreview ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-base">1. Select Quote Scope</Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Select one or more scopes. Templates and AI drafts will adapt to your
                      selection.
                    </p>
                    <div className="flex flex-col gap-2">
                      {SCOPE_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = rfqScope.includes(opt.key);
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => toggleScope(opt.key)}
                            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border-2 transition-all text-left ${
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/50'
                            }`}
                          >
                            <div
                              className={`flex items-center justify-center w-8 h-8 rounded-md ${
                                isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{opt.label}</div>
                              <div className="text-[11px] text-muted-foreground leading-tight">
                                {opt.description}
                              </div>
                            </div>
                            <div
                              className={`ml-auto w-5 h-5 rounded border-2 flex items-center justify-center ${
                                isSelected
                                  ? 'border-primary bg-primary'
                                  : 'border-muted-foreground/30'
                              }`}
                            >
                              {isSelected && (
                                <svg
                                  className="w-3 h-3 text-primary-foreground"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M2 6l3 3 5-5" />
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <Label className="text-base text-red-500">Travel Dates (Required)</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Vendors need specific dates to check availability and rates.
                    </p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="date"
                          variant={'outline'}
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !travelDateRange && 'text-muted-foreground border-red-200 bg-red-50',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {travelDateRange?.from ? (
                            travelDateRange.to ? (
                              <>
                                {format(travelDateRange.from, 'LLL dd, y')} -{' '}
                                {format(travelDateRange.to, 'LLL dd, y')}
                              </>
                            ) : (
                              format(travelDateRange.from, 'LLL dd, y')
                            )
                          ) : (
                            <span>Select travel dates</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={travelDateRange?.from}
                          selected={travelDateRange}
                          onSelect={(range, selectedDay) => {
                            if (range?.from && packageDurationDays) {
                              // Detect if this is the start of a new range selection
                              const isNewRangeStart =
                                !range.to || range.from.getTime() === range.to.getTime();

                              if (
                                isNewRangeStart &&
                                selectedDay.getTime() === range.from.getTime()
                              ) {
                                const daysToAdd = Math.max(0, Number(packageDurationDays) - 1);
                                setTravelDateRange({
                                  from: range.from,
                                  to: addDays(range.from, daysToAdd),
                                });
                                return;
                              }
                            }
                            setTravelDateRange(range);
                          }}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {(rfqScope.includes('hotels') || rfqScope.includes('full')) && (
                    <div className="p-3 bg-muted/30 border rounded-lg space-y-3">
                      <div>
                        <Label className="text-sm">Specific Hotels for Quote (Optional)</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Select or add specific hotels. If provided, these will override the
                          default package hotels in the RFQ email.
                        </p>

                        <div className="flex gap-2">
                          <Select
                            onValueChange={(val) => {
                              if (!selectedHotels.includes(val))
                                setSelectedHotels([...selectedHotels, val]);
                            }}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select from Catalog..." />
                            </SelectTrigger>
                            <SelectContent>
                              {masterStays.length > 0 ? (
                                masterStays.map((stay) => (
                                  <SelectItem key={stay.id} value={stay.name}>
                                    {stay.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none" disabled>
                                  No hotels in catalog for this destination
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex gap-2 mt-2">
                          <Input
                            placeholder="Or type custom hotel name..."
                            value={customHotelInput}
                            onChange={(e) => setCustomHotelInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addCustomHotel();
                              }
                            }}
                          />
                          <Button variant="secondary" onClick={addCustomHotel} type="button">
                            Add
                          </Button>
                        </div>

                        {selectedHotels.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {selectedHotels.map((h) => (
                              <div
                                key={h}
                                className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs"
                              >
                                <span>{h}</span>
                                <button
                                  onClick={() => removeHotel(h)}
                                  className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 flex flex-col h-full">
                  <Label className="text-base">
                    2. Select Vendors in {destination || country || 'Destination'}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Select the suppliers you wish to request a quote from.
                  </p>
                  <div className="flex-1 overflow-y-auto rounded-md border p-2 space-y-2 max-h-[60vh]">
                    {vendors
                      .filter(
                        (v) =>
                          (v.coverage_areas || '').includes(destination || '') ||
                          (v.coverage_areas || '').includes(country || '') ||
                          (!destination && !country),
                      )
                      .map((v) => (
                        <label
                          key={v.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted cursor-pointer border border-transparent hover:border-border transition-colors"
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-primary"
                            checked={rfqSelectedVendors.includes(v.id)}
                            onChange={(e) => {
                              if (e.target.checked)
                                setRfqSelectedVendors((prev) => [...prev, v.id]);
                              else
                                setRfqSelectedVendors((prev) => prev.filter((id) => id !== v.id));
                            }}
                          />
                          <div>
                            <div className="font-medium text-sm">{v.company_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {v.email} • {v.service_categories}
                            </div>
                          </div>
                        </label>
                      ))}
                    {loadingVendors && (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Loading vendors...
                      </div>
                    )}
                    {!loadingVendors &&
                      vendors.filter(
                        (v) =>
                          (v.coverage_areas || '').includes(destination || '') ||
                          (v.coverage_areas || '').includes(country || '') ||
                          (!destination && !country),
                      ).length === 0 && (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No vendors found for this destination.
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4 flex flex-col h-full">
              <div className="flex gap-2">
                <Select onValueChange={applyTemplate} disabled={isRenderingTemplate}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue
                      placeholder={
                        filteredTemplates.length > 0
                          ? `Select a template for ${rfqScope.map((s) => (s === 'full' ? 'Full Package' : s.charAt(0).toUpperCase() + s.slice(1))).join(' + ')}...`
                          : 'No templates for this scope'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        <div className="flex items-center gap-2">
                          <span>{t.name}</span>
                          {t.scope_tags && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {t.scope_tags}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                    {filteredTemplates.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No templates match the selected scope. Use "Draft via AI" or create a
                        template in Settings.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  onClick={handleComposeRfqAi}
                  disabled={isRfqComposing}
                  className="shrink-0 gap-2"
                >
                  <Sunrise className="w-4 h-4" /> {isRfqComposing ? 'Drafting...' : 'Draft via AI'}
                </Button>
              </div>

              {isRenderingTemplate && (
                <div className="text-center py-4 text-sm text-muted-foreground animate-pulse">
                  Rendering template with package data...
                </div>
              )}

              <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 flex-1 flex flex-col min-h-[300px]">
                <h4 className="font-semibold text-primary mb-2 flex items-center gap-2">
                  <BookOpen className="w-5 h-5" /> Email Content
                </h4>
                <div className="space-y-4 flex-1 flex flex-col">
                  <Field label="Subject">
                    <Input
                      className="bg-background"
                      value={rfqPreview.subject}
                      onChange={(e) => setRfqPreview({ ...rfqPreview, subject: e.target.value })}
                    />
                  </Field>
                  <div className="space-y-2 flex-1 flex flex-col">
                    <Label>Message Body</Label>
                    <Textarea
                      value={rfqPreview.htmlBody}
                      onChange={(e) => setRfqPreview({ ...rfqPreview, htmlBody: e.target.value })}
                      className="flex-1 font-mono text-sm bg-background min-h-[250px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-3 bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!rfqPreview ? (
            <Button
              onClick={proceedToCompose}
              disabled={
                rfqSelectedVendors.length === 0 || !travelDateRange?.from || !travelDateRange?.to
              }
            >
              Next: Compose Email
            </Button>
          ) : (
            <Button
              onClick={handleSendRfq}
              disabled={isRfqSending || !rfqPreview.subject || !rfqPreview.htmlBody}
            >
              {isRfqSending ? 'Sending...' : 'Send to Selected Vendors'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
