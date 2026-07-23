// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import {
  Mail,
  Phone,
  CreditCard,
  Clock,
  FileText,
  CheckCircle2,
  Plane,
  ShieldCheck,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { adminGetClientById } from '@/lib/api/db.functions';
import { adminGetTraveller360ByCrmClient } from '@/lib/api/operations';
import { useAuth } from '@/components/auth-context';
import { useQuery } from '@tanstack/react-query';

export const Route = createFileRoute('/_authenticated/crm/clients/$id')({
  component: ClientProfilePage,
});

function ClientProfilePage() {
  const { id } = Route.useParams();
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['crm_client', id],
    queryFn: async () => {
      const auth = { email: user?.email || '', sessionToken: user?.session_token || '' };
      const [client, traveller360] = await Promise.all([
        adminGetClientById({ data: { auth, id: Number(id) } }),
        adminGetTraveller360ByCrmClient({ data: { auth, crmClientId: Number(id) } }),
      ]);
      return { client, traveller360 };
    },
    enabled: !!user && !!id,
  });

  if (isLoading)
    return <div className="text-center text-sm text-muted-foreground">Loading profile...</div>;
  if (!profile?.client)
    return <div className="text-center text-sm text-muted-foreground">Client not found</div>;
  const { client, traveller360 } = profile;
  const trips = traveller360?.trips ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* Header Profile Card */}
        <div className="rounded-lg bg-card border p-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="md:col-span-1">
              <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center text-2xl font-semibold text-foreground md:mx-0">
                {client.name.charAt(0)}
              </div>
            </div>

            <div className="md:col-span-2 text-center md:text-left space-y-2">
              <div className="flex flex-col md:flex-row items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-normal text-zinc-900">
                  {client.name}
                </h1>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    client.status === 'VIP'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : client.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {client.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-medium text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-zinc-400" /> {client.email || 'No email provided'}
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-zinc-400" /> {client.phone || 'No phone provided'}
                </div>
              </div>
            </div>

            <div className="md:col-span-1 flex flex-col justify-center text-center md:text-right border-t md:border-t-0 md:border-l border-zinc-100 pt-4 md:pt-0 mt-4 md:mt-0">
              <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-1">
                Lifetime Value
              </p>
              <h2 className="text-2xl font-semibold text-zinc-900">
                ₹{parseFloat(client.lifetimeValue || 0).toLocaleString()}
              </h2>
            </div>
            <div className="w-px bg-zinc-200" />
            <div>
              <p className="text-xs text-zinc-500 font-medium uppercase mb-1">Last Trip</p>
              <p className="text-sm font-medium text-zinc-700">
                {trips[0]?.name ?? client.lastTrip ?? 'No trip yet'}
              </p>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Deals & Tasks */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card border shadow-sm rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-500" /> Active Deals
              </h2>
              <div className="space-y-3">
                {trips.map((trip) => (
                  <div
                    key={trip.id}
                    className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">{trip.name}</p>
                      <p className="text-sm text-zinc-500 mt-1">
                        <Plane className="mr-1 inline h-3.5 w-3.5" />{' '}
                        <span className="text-indigo-600 font-medium capitalize">
                          {trip.status}
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600">
                        {trip.startDate
                          ? new Date(trip.startDate).toLocaleDateString('en-IN')
                          : 'Dates pending'}
                      </p>
                    </div>
                  </div>
                ))}
                {trips.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground border border-dashed rounded-lg">
                    No canonical trips yet.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-card border shadow-sm rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-purple-500" /> Upcoming Tasks
              </h2>
              <div className="p-8 text-center text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                {traveller360?.openActions?.length ?? 0} Maya/staff action(s) need attention.
              </div>
            </div>
          </div>

          {/* Quick Actions & Notes */}
          <div className="space-y-6">
            <div className="bg-card border shadow-sm rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" /> Traveller readiness
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Party identities</span>
                  <b>{traveller360?.identities?.length ?? 0}</b>
                </div>
                <div className="flex justify-between">
                  <span>Preferences</span>
                  <b>{traveller360?.preferences?.length ?? 0}</b>
                </div>
                <div className="flex justify-between">
                  <span>Consents</span>
                  <b>{traveller360?.consents?.filter((c) => c.status === 'granted').length ?? 0}</b>
                </div>
                <div className="flex justify-between">
                  <span>Secure documents</span>
                  <b>{traveller360?.documents?.length ?? 0}</b>
                </div>
              </div>
            </div>
            <div className="bg-card border shadow-sm rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-zinc-900">Quick Actions</h2>
              <div className="space-y-2">
                <button className="w-full text-left px-4 py-3 bg-muted/40 border hover:bg-muted rounded-lg text-sm font-medium text-zinc-700 transition-colors flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-indigo-500" /> Send Payment Link
                </button>
                <button className="w-full text-left px-4 py-3 bg-muted/40 border hover:bg-muted rounded-lg text-sm font-medium text-zinc-700 transition-colors flex items-center gap-3">
                  <FileText className="w-4 h-4 text-purple-500" /> Generate Quotation
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
