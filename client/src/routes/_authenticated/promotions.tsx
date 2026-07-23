// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  adminGetOffers,
  adminCreateOffer,
  adminToggleOffer,
  adminDeleteOffer,
  adminGetPackagesAll,
  adminGetDestinationsAll,
} from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Tag,
  Calendar,
  Image as ImageIcon,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { toast } from '@/lib/toast';

export const Route = createFileRoute('/_authenticated/promotions')({
  component: PromotionsPage,
});

function PromotionsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newOffer, setNewOffer] = useState({
    title: '',
    slug: '',
    description: '',
    discountPercent: 10,
    theme: 'seasonal' as any,
    isActive: true,
    isGlobal: false,
    targetScope: 'global' as 'global' | 'package' | 'destination' | 'domestic' | 'international',
    targetId: null as number | null,
  });

  const { user } = useAuth();
  const getAuthPayload = () => {
    return user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  };

  const { data: offers, isLoading } = useQuery({
    queryKey: ['admin-offers'],
    queryFn: async () => {
      const auth = getAuthPayload();
      if (!auth) throw new Error('Not authenticated');
      return adminGetOffers({ data: { auth } });
    },
  });

  const {
    data: packagesData,
    error: pkgsError,
    isLoading: pkgsLoading,
  } = useQuery({
    queryKey: ['admin-packages-light'],
    queryFn: async () => {
      const auth = getAuthPayload();
      if (!auth) throw new Error('Not authenticated');
      return adminGetPackagesAll({ data: { auth } });
    },
  });

  const { data: destinationsData } = useQuery({
    queryKey: ['admin-destinations-light'],
    queryFn: async () => {
      const auth = getAuthPayload();
      if (!auth) throw new Error('Not authenticated');
      return adminGetDestinationsAll({ data: { auth } });
    },
  });

  console.log('DEBUG: packagesData', packagesData);
  console.log('DEBUG: destinationsData', destinationsData);

  const createMutation = useMutation({
    mutationFn: async (offerData: typeof newOffer) => {
      const auth = getAuthPayload();
      if (!auth) throw new Error('Not authenticated');
      return adminCreateOffer({ data: { auth, ...offerData } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      setIsModalOpen(false);
      setNewOffer({
        title: '',
        slug: '',
        description: '',
        discountPercent: 10,
        theme: 'seasonal',
        isActive: true,
        isGlobal: false,
        targetScope: 'global',
        targetId: null,
      });
      toast.success('Promotion created successfully');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const auth = getAuthPayload();
      if (!auth) throw new Error('Not authenticated');
      return adminToggleOffer({ data: { auth, id, isActive } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      toast.success('Promotion status updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const auth = getAuthPayload();
      if (!auth) throw new Error('Not authenticated');
      return adminDeleteOffer({ data: { auth, id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      toast.success('Promotion deleted');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newOffer);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Promotion
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 text-center py-20 text-zinc-500">Loading promotions...</div>
        ) : offers?.length === 0 ? (
          <div className="col-span-3 text-center py-20 bg-card rounded-lg border border-dashed">
            <Tag className="w-12 h-12 text-zinc-300 mb-4" />
            <h3 className="text-lg font-semibold text-zinc-700">No active promotions</h3>
            <p className="text-zinc-500">
              Create a seasonal collection or flash sale to boost conversions.
            </p>
          </div>
        ) : (
          offers?.map((offer: any) => (
            <div
              key={offer.id}
              className="bg-card rounded-lg shadow-sm border overflow-hidden flex flex-col transition-all hover:shadow-md"
            >
              <div className="bg-muted/40 p-6 text-zinc-900 relative border-b">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${offer.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-600 border'}`}
                  >
                    {offer.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex gap-2 mb-2">
                  <span className="bg-card px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider inline-block border">
                    {offer.theme.replace('-', ' ')}
                  </span>
                  <span className="bg-card border px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider inline-block">
                    Target: {offer.targetScope}
                  </span>
                </div>
                <h3 className="text-xl font-bold mb-1">{offer.title}</h3>
                <p className="text-muted-foreground text-sm">{offer.discountPercent}% Privilege</p>
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-sm text-zinc-600 mb-4">
                    {offer.description || 'No description provided.'}
                  </p>
                  <div className="flex items-center text-xs text-zinc-500 mb-2">
                    <Calendar className="w-4 h-4 mr-2" />
                    No dates set
                  </div>
                  <div className="flex items-center text-xs text-zinc-500 mb-4">
                    <ImageIcon className="w-4 h-4 mr-2" />
                    {offer.bannerImageUrl ? 'Custom Banner' : 'Default Banner'}
                  </div>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-zinc-100">
                  <Button
                    variant="outline"
                    size="sm"
                    className={
                      offer.isActive
                        ? 'text-amber-600 hover:text-amber-700'
                        : 'text-emerald-600 hover:text-emerald-700'
                    }
                    onClick={() =>
                      toggleMutation.mutate({ id: offer.id, isActive: !offer.isActive })
                    }
                  >
                    {offer.isActive ? (
                      <>
                        <XCircle className="w-4 h-4 mr-1.5" /> Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> Activate
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 px-3"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this promotion?')) {
                        deleteMutation.mutate(offer.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl p-6 border">
            <h2 className="text-2xl font-bold text-zinc-900 mb-6">New Promotion</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Title (e.g. Winter Collection)
                </label>
                <Input
                  required
                  value={newOffer.title}
                  onChange={(e) =>
                    setNewOffer({
                      ...newOffer,
                      title: e.target.value,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    })
                  }
                  className="bg-zinc-50 border-zinc-200 focus-visible:ring-indigo-500"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Discount %</label>
                  <Input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={newOffer.discountPercent}
                    onChange={(e) =>
                      setNewOffer({ ...newOffer, discountPercent: Number(e.target.value) })
                    }
                    className="bg-zinc-50 border-zinc-200 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Theme</label>
                  <select
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newOffer.theme}
                    onChange={(e) => setNewOffer({ ...newOffer, theme: e.target.value as any })}
                  >
                    <option value="seasonal">Seasonal</option>
                    <option value="exclusive">Exclusive</option>
                    <option value="flash-sale">Flash Sale</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Short Description
                </label>
                <Input
                  value={newOffer.description}
                  onChange={(e) => setNewOffer({ ...newOffer, description: e.target.value })}
                  className="bg-zinc-50 border-zinc-200 focus-visible:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={newOffer.isActive}
                  onChange={(e) => setNewOffer((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                <label htmlFor="isActive" className="text-sm font-medium">
                  Active immediately
                </label>
              </div>

              <div className="flex flex-col gap-1 mt-4 border-t border-zinc-100 pt-4">
                <label className="text-sm font-medium text-zinc-700">Target Scope</label>
                <select
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newOffer.targetScope}
                  onChange={(e) => {
                    const scope = e.target.value as any;
                    setNewOffer({
                      ...newOffer,
                      targetScope: scope,
                      targetId: null,
                      isGlobal: scope === 'global',
                    });
                  }}
                >
                  <option value="global">Global (Applies to all inventory)</option>
                  <option value="domestic">Domestic (All India)</option>
                  <option value="international">International (Excludes India)</option>
                  <option value="package">Specific Package</option>
                  <option value="destination">Specific Destination</option>
                </select>
              </div>

              {newOffer.targetScope === 'package' && (
                <div className="flex flex-col gap-1 mt-2">
                  <label className="text-sm font-medium text-zinc-700">Select Package</label>
                  <select
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newOffer.targetId || ''}
                    onChange={(e) =>
                      setNewOffer({ ...newOffer, targetId: Number(e.target.value) || null })
                    }
                    required
                  >
                    <option value="">-- Select a package --</option>
                    {packagesData?.map((pkg: any) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newOffer.targetScope === 'destination' && (
                <div className="flex flex-col gap-1 mt-2">
                  <label className="text-sm font-medium text-zinc-700">Select Destination</label>
                  <select
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newOffer.targetId || ''}
                    onChange={(e) =>
                      setNewOffer({ ...newOffer, targetId: Number(e.target.value) || null })
                    }
                    required
                  >
                    <option value="">-- Select a destination --</option>
                    {destinationsData?.map((dest: any) => (
                      <option key={dest.id} value={dest.id}>
                        {dest.name} ({dest.country})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="pt-4 flex gap-3 border-t border-zinc-100">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Saving...' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
