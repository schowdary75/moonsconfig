// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute, Link } from '@/lib/routerCompat';
import { useMemo, useState } from 'react';
import { Search, Star, ChevronRight, Mail, Phone, X, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { adminGetClients, adminCreateClient } from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const CLIENT_STATUSES = ['Lead', 'Active', 'VIP', 'Archived'] as const;

export const Route = createFileRoute('/_authenticated/crm/clients/')({
  component: ClientsListPage,
});

function ClientsListPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['crm_clients'],
    queryFn: async () => {
      return await adminGetClients({
        data: { auth: { email: user?.email || '', sessionToken: user?.session_token || '' } },
      });
    },
    enabled: !!user,
  });

  const createClientMutation = useMutation({
    mutationFn: async () => {
      return await adminCreateClient({
        data: {
          auth: { email: user?.email || '', sessionToken: user?.session_token || '' },
          ...newClient,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_clients'] });
      setIsAddModalOpen(false);
      setNewClient({ name: '', email: '', phone: '' });
      toast.success('Client added to directory successfully!');
    },
  });

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name) return toast.error('Name is required');
    createClientMutation.mutate();
  };

  const filteredClients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (clients as any[]).filter((client) => {
      const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
      const matchesQuery =
        !needle ||
        [client.name, client.email, client.phone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      return matchesStatus && matchesQuery;
    });
  }, [clients, query, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            {CLIENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <Button onClick={() => setIsAddModalOpen(true)}>Add Client</Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
        <div className="grid grid-cols-12 gap-4 p-4 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
          <div className="col-span-4 pl-4">Client</div>
          <div className="col-span-3">Contact</div>
          <div className="col-span-2 text-right">Lifetime Value</div>
          <div className="col-span-2 text-right">Last Active</div>
          <div className="col-span-1 text-right pr-4">Profile</div>
        </div>

        <div className="divide-y divide-border/50">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading clients...</div>
          ) : filteredClients.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {clients.length === 0
                ? 'No clients yet — Maya creates profiles automatically when leads convert, or add one manually.'
                : 'No clients match your search.'}
            </div>
          ) : (
            filteredClients.map((client: any) => (
              <Link
                key={client.id}
                to="/crm/clients/$id"
                params={{ id: client.id.toString() }}
                className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/50 transition-colors group bg-card"
              >
                <div className="col-span-4 pl-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground">
                    {client.name?.charAt(0) || 'C'}
                  </div>
                  <div>
                    <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {client.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {client.status === 'VIP' ? (
                        <span className="flex items-center text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                          <Star className="w-3 h-3 mr-0.5 fill-amber-500 text-amber-500" /> VIP
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded">
                          {client.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-span-3 space-y-1">
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Mail className="w-3 h-3 mr-1.5 text-muted-foreground/60" />{' '}
                    {client.email || 'No email'}
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Phone className="w-3 h-3 mr-1.5 text-muted-foreground/60" />{' '}
                    {client.phone || 'No phone'}
                  </div>
                </div>

                <div className="col-span-2 text-right font-medium text-foreground">
                  ₹{parseFloat(client.lifetimeValue || 0).toLocaleString('en-IN')}
                </div>

                <div className="col-span-2 text-right text-sm text-muted-foreground">
                  {client.lastActive || '—'}
                </div>

                <div className="col-span-1 text-right pr-4 flex justify-end">
                  <ChevronRight className="w-5 h-5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-xl overflow-hidden border">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold text-foreground">Add New Client</h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddClient} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Full Name *
                </label>
                <Input
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  placeholder="e.g. Eleanor Vance"
                  className="w-full bg-muted/40 border-border"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  placeholder="eleanor@example.com"
                  className="w-full bg-muted/40 border-border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Phone Number
                </label>
                <Input
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  placeholder="+1 (555) 019-2834"
                  className="w-full bg-muted/40 border-border"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createClientMutation.isPending}>
                  {createClientMutation.isPending ? 'Saving...' : 'Save Client'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
