// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Edit, Plane, Plus, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { adminAiSearchFlights } from '@/lib/api/db.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminCreateFlightAllotment,
  adminDeleteFlightAllotment,
  adminGetFlightAllotments,
  adminUpdateFlightAllotment,
  type FlightAllotmentRow,
} from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/flights/')({
  component: FlightsPage,
});

const emptyFlight = {
  airline: '',
  flightNo: '',
  origin: '',
  destination: '',
  departureTime: '',
  arrivalTime: '',
  cabinClass: 'Economy',
  netFare: 0,
  sellingPrice: 0,
  seatsTotal: 0,
  seatsAvailable: 0,
  supplierName: '',
  status: 'available' as 'available' | 'limited' | 'sold_out',
};

function FlightsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<FlightAllotmentRow | null>(null);
  const [form, setForm] = useState(emptyFlight);

  // AI Flight Search State
  const [aiSearchForm, setAiSearchForm] = useState({
    origin: '',
    destination: '',
    date: '',
    pax: 1,
    cabinClass: 'Economy',
  });
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiFlights, setAiFlights] = useState<any[]>([]);

  const handleAiSearch = async () => {
    if (!auth || !aiSearchForm.origin || !aiSearchForm.destination || !aiSearchForm.date)
      return toast.error('Please fill all fields');
    setIsAiSearching(true);
    try {
      const res = await adminAiSearchFlights({ data: { auth, ...aiSearchForm } });
      setAiFlights(res.flights);
    } catch (err) {
      toast.error('AI Search Failed');
    } finally {
      setIsAiSearching(false);
    }
  };

  const directFlights = aiFlights.filter((f) => f.stops === 0);
  const haltFlights = aiFlights.filter((f) => f.stops > 0);

  const getBookingUrl = (origin: string, destination: string, date: string, pax: number) => {
    // Kayak uses YYYY-MM-DD which matches the HTML5 date input format
    return `https://www.kayak.co.in/flights/${origin}-${destination}/${date}/${pax}adults?sort=bestflight_a`;
  };

  const { data: flights = [], isLoading } = useQuery({
    queryKey: ['flight-allotments', user?.session_token],
    queryFn: () => adminGetFlightAllotments({ data: { auth: auth! } }),
    enabled: !!auth,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!auth) throw new Error('Missing session');
      if (editing)
        return adminUpdateFlightAllotment({ data: { auth, id: editing.id, flight: form } });
      return adminCreateFlightAllotment({ data: { auth, flight: form } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flight-allotments'] });
      setEditing(null);
      setForm(emptyFlight);
      toast.success('Flight allotment saved');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save flight'),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!auth) throw new Error('Missing session');
      return adminDeleteFlightAllotment({ data: { auth, id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flight-allotments'] });
      toast.success('Flight allotment archived');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to archive flight'),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return flights.filter((flight) => flight.status !== 'inactive');
    return flights.filter(
      (flight) =>
        [
          flight.airline,
          flight.flight_no,
          flight.origin,
          flight.destination,
          flight.cabin_class,
          flight.supplier_name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)) &&
        flight.status !== 'inactive',
    );
  }, [flights, search]);

  function startEdit(flight: FlightAllotmentRow) {
    setEditing(flight);
    setForm({
      airline: flight.airline,
      flightNo: flight.flight_no,
      origin: flight.origin,
      destination: flight.destination,
      departureTime: flight.departure_time,
      arrivalTime: flight.arrival_time,
      cabinClass: flight.cabin_class,
      netFare: Number(flight.net_fare || 0),
      sellingPrice: Number(flight.selling_price || 0),
      seatsTotal: Number(flight.seats_total || 0),
      seatsAvailable: Number(flight.seats_available || 0),
      supplierName: flight.supplier_name || '',
      status: flight.status === 'inactive' ? 'available' : flight.status,
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.seatsAvailable > form.seatsTotal)
      return toast.error('Available seats cannot exceed total seats');
    saveMutation.mutate();
  }

  function archiveFlight(flight: FlightAllotmentRow) {
    const label = `${flight.airline} ${flight.flight_no}`;
    if (
      !window.confirm(
        `Archive flight allotment "${label}"? This will remove it from active inventory.`,
      )
    )
      return;
    archiveMutation.mutate(flight.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div />
        <Button
          size="sm"
          className="h-8 text-xs shadow-sm"
          onClick={() => {
            setEditing(null);
            setForm(emptyFlight);
          }}
        >
          <Plus className="mr-2 h-3.5 w-3.5" /> New Allotment
        </Button>
      </div>

      {/* AI Flight Search Console */}
      <div className="rounded-lg border bg-gradient-to-r from-primary/10 to-primary/5 p-4 shadow-sm mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-lg font-display text-primary">✨ AI Flight Search</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-6 mb-4">
          <Input
            placeholder="From (e.g. DEL)"
            value={aiSearchForm.origin}
            onChange={(e) =>
              setAiSearchForm({ ...aiSearchForm, origin: e.target.value.toUpperCase() })
            }
          />
          <Input
            placeholder="To (e.g. LHR)"
            value={aiSearchForm.destination}
            onChange={(e) =>
              setAiSearchForm({ ...aiSearchForm, destination: e.target.value.toUpperCase() })
            }
          />
          <Input
            type="date"
            value={aiSearchForm.date}
            onChange={(e) => setAiSearchForm({ ...aiSearchForm, date: e.target.value })}
          />
          <Input
            type="number"
            placeholder="Pax"
            min={1}
            value={aiSearchForm.pax}
            onChange={(e) => setAiSearchForm({ ...aiSearchForm, pax: Number(e.target.value) })}
          />
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={aiSearchForm.cabinClass}
            onChange={(e) => setAiSearchForm({ ...aiSearchForm, cabinClass: e.target.value })}
          >
            <option>Economy</option>
            <option>Premium Economy</option>
            <option>Business</option>
            <option>First</option>
          </select>
          <Button onClick={handleAiSearch} disabled={isAiSearching} className="w-full">
            {isAiSearching ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {aiFlights.length > 0 && (
          <Tabs defaultValue="direct" className="mt-6">
            <TabsList className="mb-4">
              <TabsTrigger value="direct">Direct ({directFlights.length})</TabsTrigger>
              <TabsTrigger value="halts">With Halts ({haltFlights.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="direct">
              <div className="space-y-3">
                {directFlights.map((f, i) => (
                  <a
                    key={i}
                    href={getBookingUrl(
                      aiSearchForm.origin,
                      aiSearchForm.destination,
                      aiSearchForm.date,
                      aiSearchForm.pax,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-bold text-lg">
                            {f.airline}{' '}
                            <span className="text-muted-foreground text-sm font-normal">
                              {f.flightNo}
                            </span>
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {f.departureTime} - {f.arrivalTime} • {f.duration}
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-xl text-primary">
                            ₹{f.totalPriceINR.toLocaleString('en-IN')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Total for {aiSearchForm.pax} Pax
                          </span>
                          <span className="text-[10px] text-primary mt-1 underline">
                            Book on Kayak ↗
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                ))}
                {directFlights.length === 0 && (
                  <p className="text-sm text-muted-foreground">No direct flights found.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="halts">
              <div className="space-y-3">
                {haltFlights.map((f, i) => (
                  <a
                    key={i}
                    href={getBookingUrl(
                      aiSearchForm.origin,
                      aiSearchForm.destination,
                      aiSearchForm.date,
                      aiSearchForm.pax,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-bold text-lg">
                            {f.airline}{' '}
                            <span className="text-muted-foreground text-sm font-normal">
                              {f.flightNo}
                            </span>
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {f.departureTime} - {f.arrivalTime} • {f.duration}
                          </span>
                          <Badge variant="outline" className="mt-1 w-fit bg-muted/50">
                            {f.stops} Stop • {f.layoverCity}
                          </Badge>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-xl text-primary">
                            ₹{f.totalPriceINR.toLocaleString('en-IN')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Total for {aiSearchForm.pax} Pax
                          </span>
                          <span className="text-[10px] text-primary mt-1 underline">
                            Book on Kayak ↗
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                ))}
                {haltFlights.length === 0 && (
                  <p className="text-sm text-muted-foreground">No flights with halts found.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <form onSubmit={submit} className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">
            {editing ? 'Edit flight allotment' : 'Add flight allotment'}
          </h3>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(null);
                setForm(emptyFlight);
              }}
            >
              <X className="mr-1 h-4 w-4" /> Cancel edit
            </Button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            placeholder="Airline"
            value={form.airline}
            onChange={(e) => setForm({ ...form, airline: e.target.value })}
            required
          />
          <Input
            placeholder="Flight no."
            value={form.flightNo}
            onChange={(e) => setForm({ ...form, flightNo: e.target.value })}
            required
          />
          <Input
            placeholder="Origin"
            value={form.origin}
            onChange={(e) => setForm({ ...form, origin: e.target.value.toUpperCase() })}
            required
          />
          <Input
            placeholder="Destination"
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value.toUpperCase() })}
            required
          />
          <Input
            placeholder="Departure time"
            value={form.departureTime}
            onChange={(e) => setForm({ ...form, departureTime: e.target.value })}
            required
          />
          <Input
            placeholder="Arrival time"
            value={form.arrivalTime}
            onChange={(e) => setForm({ ...form, arrivalTime: e.target.value })}
            required
          />
          <Input
            placeholder="Cabin class"
            value={form.cabinClass}
            onChange={(e) => setForm({ ...form, cabinClass: e.target.value })}
            required
          />
          <Input
            placeholder="Supplier"
            value={form.supplierName}
            onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
          />
          <Input
            type="number"
            placeholder="Net fare"
            value={form.netFare}
            onChange={(e) => setForm({ ...form, netFare: Number(e.target.value) })}
            min={0}
          />
          <Input
            type="number"
            placeholder="Selling price"
            value={form.sellingPrice}
            onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
            min={0}
          />
          <Input
            type="number"
            placeholder="Total seats"
            value={form.seatsTotal}
            onChange={(e) => setForm({ ...form, seatsTotal: Number(e.target.value) })}
            min={0}
          />
          <Input
            type="number"
            placeholder="Available seats"
            value={form.seatsAvailable}
            onChange={(e) => setForm({ ...form, seatsAvailable: Number(e.target.value) })}
            min={0}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : editing ? 'Update Allotment' : 'Save Allotment'}
          </Button>
        </div>
      </form>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search flight no., route, airline..."
            className="h-9 pl-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/50 bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-[200px]">Flight</TableHead>
              <TableHead>Route & Time</TableHead>
              <TableHead>Cabin</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Sell</TableHead>
              <TableHead className="text-center">Seats</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  Loading flights...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No flight allotments yet. Add the first manual allotment above.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((flight) => (
                <TableRow key={flight.id}>
                  <TableCell>
                    <div className="font-semibold">{flight.airline}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {flight.flight_no}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {flight.origin} {'->'} {flight.destination}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {flight.departure_time} - {flight.arrival_time}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                      {flight.cabin_class}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    INR {Number(flight.net_fare).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-green-600">
                    INR {Number(flight.selling_price).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {flight.seats_available}/{flight.seats_total}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge>{flight.status.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(flight)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => archiveFlight(flight)}
                      disabled={archiveMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
