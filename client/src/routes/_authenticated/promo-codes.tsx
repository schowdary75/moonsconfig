// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  adminListPromoCodes,
  adminCreatePromoCode,
  adminTogglePromoCode,
} from '@/lib/api/db.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Tag, CheckCircle2, XCircle, Users, Sparkles, Receipt } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';

export const Route = createFileRoute('/_authenticated/promo-codes')({
  component: PromoCodesPage,
});

function PromoCodesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCode, setNewCode] = useState({
    code: '',
    type: 'general' as 'general' | 'referral' | 'single_use',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: 10,
    maxUses: 0,
    validUntil: '',
  });

  const { data: promoCodes, isLoading } = useQuery({
    queryKey: ['admin-promo-codes'],
    queryFn: async () => {
      return adminListPromoCodes({ data: { auth } });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (codeData: typeof newCode) => {
      return adminCreatePromoCode({ data: { ...codeData, auth } });
    },
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['admin-promo-codes'] });
        setIsModalOpen(false);
        setNewCode({
          code: '',
          type: 'general',
          discountType: 'percentage',
          discountValue: 10,
          maxUses: 0,
          validUntil: '',
        });
        toast.success('Promo code created successfully');
      } else {
        toast.error(res.error || 'Failed to create promo code');
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return adminTogglePromoCode({ data: { id, isActive, auth } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-promo-codes'] });
      toast.success('Promo code status updated');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.code) return toast.error('Code is required');
    createMutation.mutate(newCode);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Promo Code
        </Button>
      </div>

      <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="text-center py-20 text-zinc-500">Loading promo codes...</div>
        ) : !promoCodes || promoCodes.length === 0 ? (
          <div className="text-center py-20">
            <Receipt className="w-12 h-12 text-zinc-300 mb-4" />
            <h3 className="text-lg font-semibold text-zinc-700">No active promo codes</h3>
            <p className="text-zinc-500 mt-1">Create your first discount code to get started.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-sm font-medium text-zinc-500">
                <th className="px-6 py-4">Code</th>
                <th className="px-6 py-4">Discount</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Uses</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {promoCodes.map((promo: any) => (
                <tr key={promo.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded">
                      {promo.code}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-emerald-600">
                    {promo.discount_type === 'percentage'
                      ? `${promo.discount_value}%`
                      : `₹${promo.discount_value}`}{' '}
                    OFF
                  </td>
                  <td className="px-6 py-4">
                    <span className="capitalize text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
                      {promo.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-600">
                    {promo.current_uses} / {promo.max_uses === 0 ? '∞' : promo.max_uses}
                  </td>
                  <td className="px-6 py-4">
                    {promo.is_active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                        <XCircle className="w-3.5 h-3.5" /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        toggleMutation.mutate({ id: promo.id, isActive: !promo.is_active })
                      }
                      className={
                        promo.is_active
                          ? 'text-rose-600 border-rose-200 hover:bg-rose-50'
                          : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                      }
                    >
                      {promo.is_active ? 'Disable' : 'Enable'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 border">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/50">
              <h2 className="text-xl font-bold text-zinc-800">Create Promo Code</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-zinc-700">Code</label>
                <Input
                  value={newCode.code}
                  onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SUMMER25"
                  className="font-mono uppercase text-lg h-12"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-zinc-700">Discount Type</label>
                  <select
                    className="w-full h-11 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={newCode.discountType}
                    onChange={(e) =>
                      setNewCode({ ...newCode, discountType: e.target.value as any })
                    }
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-zinc-700">Value</label>
                  <Input
                    type="number"
                    value={newCode.discountValue}
                    onChange={(e) =>
                      setNewCode({ ...newCode, discountValue: Number(e.target.value) })
                    }
                    className="h-11"
                    min="1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-zinc-700">Code Type</label>
                  <select
                    className="w-full h-11 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={newCode.type}
                    onChange={(e) => setNewCode({ ...newCode, type: e.target.value as any })}
                  >
                    <option value="general">General</option>
                    <option value="single_use">Single Use</option>
                    <option value="referral">Referral</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-zinc-700">Max Uses (0 = ∞)</label>
                  <Input
                    type="number"
                    value={newCode.maxUses}
                    onChange={(e) => setNewCode({ ...newCode, maxUses: Number(e.target.value) })}
                    className="h-11"
                    min="0"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Code'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
