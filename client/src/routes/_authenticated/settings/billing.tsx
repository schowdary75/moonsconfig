// @ts-nocheck -- commercial settings screen is intentionally isolated from legacy route types.
import { createFileRoute } from '@/lib/routerCompat';
import { useEffect, useMemo, useState } from 'react';
import { Check, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/api/client';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ApiSuccess } from '@/types/api';
import { platformService, type CommercialPlan } from '@/services/platformService';
import { toast } from '@/lib/toast';

export const Route = createFileRoute('/_authenticated/settings/billing')({
  component: BillingSettings,
});

function money(paise: number | null) {
  if (paise === null) return 'Custom';
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

function BillingSettings() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [billing, setBilling] = useState<any>(null);
  const [interval, setInterval] = useState<'monthly' | 'annual'>('annual');
  const [seats, setSeats] = useState<Record<string, number>>({ starter: 2, business: 10 });
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [availablePlans, current] = await Promise.all([
      platformService.plans(),
      apiClient.get<ApiSuccess<any>>('/billing/current').then(({ data }) => data.data),
    ]);
    setPlans(availablePlans);
    setBilling(current);
  };

  useEffect(() => {
    void load().catch(() => toast.error('Could not load billing details'));
  }, []);

  const active = useMemo(
    () => billing?.subscriptions?.find((item: any) => ['active', 'past_due'].includes(item.status)),
    [billing],
  );

  const checkout = async (plan: CommercialPlan) => {
    if (plan.code === 'enterprise') {
      window.location.href = 'mailto:sales@moonsconfig.com?subject=MooNsConfig Enterprise';
      return;
    }
    setBusy(plan.code);
    try {
      const response = await apiClient.post<ApiSuccess<any>>(
        active ? '/billing/change' : '/billing/checkout',
        {
          planCode: plan.code,
          interval,
          seats: seats[plan.code] || plan.includedSeats,
        },
      );
      if (response.data.data.checkoutUrl) window.location.href = response.data.data.checkoutUrl;
      else
        toast.success(
          response.data.data.effective === 'renewal'
            ? 'Plan change scheduled for renewal.'
            : 'Plan change submitted.',
        );
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to start checkout');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (
      !window.confirm(
        'Cancel at the end of the current billing period? Your data will not be deleted.',
      )
    )
      return;
    setBusy('cancel');
    try {
      await apiClient.post('/billing/cancel', { atPeriodEnd: true });
      toast.success('Cancellation scheduled for the end of the billing period');
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to schedule cancellation');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Billing &amp; plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prices exclude GST. Annual plans include two months free.
          </p>
        </div>
        <div className="flex rounded-lg border bg-card p-1">
          {(['monthly', 'annual'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={interval === value ? 'default' : 'ghost'}
              onClick={() => setInterval(value)}
            >
              {value === 'annual' ? 'Annual · 2 months free' : 'Monthly'}
            </Button>
          ))}
        </div>
      </div>

      {user?.subscription && (
        <Card className={user.subscription.locked ? 'border-destructive' : 'border-emerald-500/40'}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="font-semibold capitalize">
                  {user.subscription.planCode} · {user.subscription.status}
                </p>
                <p className="text-sm text-muted-foreground">
                  {user.subscription.trialEndsAt
                    ? `Enterprise trial ends ${new Date(user.subscription.trialEndsAt).toLocaleString()}`
                    : active?.currentPeriodEnd
                      ? `Current period ends ${new Date(active.currentPeriodEnd).toLocaleDateString()}`
                      : 'Choose a plan to continue service'}
                </p>
              </div>
            </div>
            {user.subscription.locked && <Badge variant="destructive">Workspace locked</Badge>}
            {active?.cancelAtPeriodEnd && <Badge variant="outline">Cancels at period end</Badge>}
            {active && !active.cancelAtPeriodEnd && (
              <Button variant="outline" disabled={busy === 'cancel'} onClick={cancel}>
                Cancel at renewal
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const selectedSeats = seats[plan.code] || plan.includedSeats;
          const base = interval === 'annual' ? plan.annualPricePaise : plan.monthlyPricePaise;
          return (
            <Card key={plan.code} className={plan.code === 'business' ? 'border-primary' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.code === user?.subscription?.planCode && <Badge>Current access</Badge>}
                </div>
                <p className="min-h-10 text-sm text-muted-foreground">{plan.description}</p>
                <p className="pt-2 text-3xl font-bold">
                  {money(base)}
                  {base !== null && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /{interval === 'annual' ? 'year' : 'month'}
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {plan.code !== 'enterprise' && (
                  <div className="space-y-2">
                    <Label htmlFor={`seats-${plan.code}`}>Staff seats</Label>
                    <Input
                      id={`seats-${plan.code}`}
                      type="number"
                      min={1}
                      max={plan.maxSeats || undefined}
                      value={selectedSeats}
                      onChange={(event) =>
                        setSeats((old) => ({ ...old, [plan.code]: Number(event.target.value) }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Includes {plan.includedSeats}; maximum {plan.maxSeats}.
                    </p>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={() => checkout(plan)}
                  disabled={busy === plan.code}
                >
                  {busy === plan.code ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  {plan.code === 'enterprise' ? 'Contact sales' : 'Choose plan'}
                </Button>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    {plan.includedSeats} staff included
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    {Number(BigInt(plan.storageBytes) / BigInt(1024 ** 3))} GB storage
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    {plan.support}
                  </li>
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
