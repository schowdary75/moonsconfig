// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute, useNavigate } from '@/lib/routerCompat';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  IndianRupee,
  LayoutGrid,
  Megaphone,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Search,
  TrendingUp,
  BrainCircuit,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  adminCreateCampaign,
  adminGetCampaigns,
  adminUpdateCampaignStatus,
} from '@/lib/api/db.functions';
import { adminGetAdCampaigns } from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';

export const Route = createFileRoute('/_authenticated/marketing/campaigns/')({
  component: CampaignsPage,
});

function CampaignsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'email' as const,
    budget: 0,
    spent: 0,
    reach: 0,
    conversions: 0,
  });
  const [query, setQuery] = useState('');

  const { data: standardCampaigns = [], isLoading: isStandardLoading } = useQuery({
    queryKey: ['mktg_campaigns', user?.session_token],
    queryFn: async () => adminGetCampaigns({ data: { auth: auth! } }),
    enabled: !!auth,
  });

  const { data: adCampaigns = [], isLoading: isAdsLoading } = useQuery({
    queryKey: ['ad_campaigns', user?.session_token],
    queryFn: async () => adminGetAdCampaigns({ data: { auth: auth! } }),
    enabled: !!auth,
  });

  const campaigns = [...adCampaigns, ...standardCampaigns];
  const isLoading = isStandardLoading || isAdsLoading;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!auth) throw new Error('Missing session');
      return adminCreateCampaign({ data: { auth, campaign: { ...form, status: 'draft' } } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mktg_campaigns'] });
      setShowForm(false);
      setForm({ name: '', type: 'email', budget: 0, spent: 0, reach: 0, conversions: 0 });
      toast.success('Campaign created');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create campaign'),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'active' | 'paused' }) => {
      if (!auth) throw new Error('Missing session');
      return adminUpdateCampaignStatus({ data: { auth, id, status } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mktg_campaigns'] });
      toast.success('Campaign status updated');
    },
  });

  const totalSpend = campaigns.reduce(
    (sum: number, campaign: any) => sum + Number(campaign.spent || 0),
    0,
  );
  const totalReach = campaigns.reduce(
    (sum: number, campaign: any) => sum + Number(campaign.reach || 0),
    0,
  );
  const totalConversions = campaigns.reduce(
    (sum: number, campaign: any) => sum + Number(campaign.conversions || 0),
    0,
  );
  const activeCampaigns = campaigns.filter((campaign: any) => campaign.status === 'active').length;
  const filteredCampaigns = campaigns.filter((campaign: any) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [campaign.name, campaign.type, campaign.status].some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(needle),
    );
  });

  const stats = [
    {
      label: 'Active Campaigns',
      value: String(activeCampaigns),
      icon: Megaphone,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      label: 'Total Ad Spend',
      value: `INR ${totalSpend.toLocaleString('en-IN')}`,
      icon: IndianRupee,
      color: 'text-indigo-600',
      bg: 'bg-indigo-100',
    },
    {
      label: 'Total Reach',
      value: totalReach.toLocaleString('en-IN'),
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
    {
      label: 'Conversions',
      value: totalConversions.toLocaleString('en-IN'),
      icon: MousePointerClick,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div />

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                className="h-9 w-56 pl-9"
                placeholder="Filter campaigns..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => setShowForm((value) => !value)}>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </div>
        </div>

        {showForm && (
          <form
            className="rounded-lg border bg-card p-5 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="Campaign name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <select
                className="h-9 rounded-md border bg-white px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="social_ad">Social ad</option>
                <option value="promo">Promo</option>
              </select>
              <Input
                type="number"
                placeholder="Budget"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
                min={0}
              />
              <Input
                type="number"
                placeholder="Spent"
                value={form.spent}
                onChange={(e) => setForm({ ...form, spent: Number(e.target.value) })}
                min={0}
              />
              <Input
                type="number"
                placeholder="Reach"
                value={form.reach}
                onChange={(e) => setForm({ ...form, reach: Number(e.target.value) })}
                min={0}
              />
              <Input
                type="number"
                placeholder="Conversions"
                value={form.conversions}
                onChange={(e) => setForm({ ...form, conversions: Number(e.target.value) })}
                min={0}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving...' : 'Create Campaign'}
              </Button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="mb-1 text-sm font-medium text-zinc-500">{stat.label}</p>
                  <h3 className="text-2xl font-bold text-zinc-900">{stat.value}</h3>
                </div>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg} ${stat.color}`}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-sm font-medium text-zinc-500">
                Live from configured campaigns
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b bg-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900">
              <LayoutGrid className="h-5 w-5 text-indigo-500" /> All Campaigns
            </h2>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-12 gap-4 border-b border-zinc-100 bg-zinc-50/70 p-4 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <div className="col-span-3 pl-4">Campaign Name</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Spend / Budget</div>
                <div className="col-span-2 text-right">Reach & Conversions</div>
                <div className="col-span-1 pr-4 text-right">Actions</div>
              </div>

              <div className="divide-y divide-zinc-100 bg-white">
                {isLoading ? (
                  <div className="p-8 text-center text-zinc-500">Loading campaigns...</div>
                ) : filteredCampaigns.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">No campaigns found.</div>
                ) : (
                  filteredCampaigns.map((campaign: any) => (
                    <div
                      key={campaign.id}
                      className={`grid grid-cols-12 items-center gap-4 p-4 transition-colors hover:bg-indigo-50/30 ${campaign.isMaya ? 'cursor-pointer' : ''}`}
                      onClick={() =>
                        campaign.isMaya &&
                        navigate({
                          to: '/marketing/campaigns/$campaignId',
                          params: { campaignId: String(campaign.id) },
                        })
                      }
                    >
                      <div className="col-span-3 pl-4 flex items-center gap-2">
                        {campaign.isMaya && (
                          <BrainCircuit className="h-4 w-4 text-primary shrink-0" />
                        )}
                        <div className="font-semibold text-zinc-900">{campaign.name}</div>
                      </div>
                      <div className="col-span-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${campaign.isMaya ? 'bg-primary/10 text-primary' : 'bg-zinc-100 text-zinc-600'}`}
                        >
                          {campaign.type}
                        </span>
                      </div>
                      <div className="col-span-2 text-xs font-semibold capitalize text-zinc-700">
                        {campaign.status}
                      </div>
                      <div className="col-span-2">
                        <div className="text-sm font-semibold text-zinc-900">
                          INR {Number(campaign.spent || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-xs font-medium text-zinc-500">
                          of INR {Number(campaign.budget || 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="text-sm font-semibold text-zinc-900">
                          Reach: {Number(campaign.reach || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-xs font-bold text-emerald-600">
                          {Number(campaign.conversions || 0).toLocaleString('en-IN')} conversions
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-end gap-2 pr-4 text-right">
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-50 text-zinc-500 hover:bg-indigo-50 hover:text-indigo-600 z-10 relative"
                          onClick={(e) => {
                            e.stopPropagation();
                            statusMutation.mutate({
                              id: campaign.id,
                              status: campaign.status === 'active' ? 'paused' : 'active',
                            });
                          }}
                          title={
                            campaign.status === 'active' ? 'Pause campaign' : 'Activate campaign'
                          }
                        >
                          {campaign.status === 'active' ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </button>
                        {campaign.isMaya && (
                          <button
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 z-10 relative"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({
                                to: '/marketing/campaigns/$campaignId',
                                params: { campaignId: String(campaign.id) },
                              });
                            }}
                            title="View Campaign Details"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
