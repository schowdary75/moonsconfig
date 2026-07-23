import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Check, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { platformService, type CommercialPlan } from '@/services/platformService';

const highlights: Record<string, string[]> = {
  starter: [
    'Core CRM and sales pipeline',
    'Quotes, bookings and route maps',
    'Customer portal',
    '2 staff included',
  ],
  business: [
    'Complete inventory and finance',
    'Marketing automation',
    'White-label custom domain',
    '10 staff included',
  ],
  enterprise: [
    'AI, telephony and advanced security',
    'SSO, API and custom integrations',
    'Multi-brand operations',
    '25 staff included',
  ],
};

export function Pricing() {
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  useEffect(() => {
    void platformService.plans().then(setPlans);
  }, []);
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
          <ShieldCheck className="h-4 w-4" /> A private database for every travel company
        </div>
        <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
          Run your travel business from one place
        </h1>
        <p className="mx-auto mt-5 max-w-3xl text-lg text-slate-300">
          Start with seven days of full Enterprise access. No card required, GST added only when you
          subscribe.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/register">Start free trial</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="mailto:sales@moonsconfig.com">Talk to sales</a>
          </Button>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-20 md:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.code}
            className={
              plan.code === 'business'
                ? 'border-cyan-400 shadow-xl shadow-cyan-950'
                : 'border-slate-800'
            }
          >
            <CardHeader>
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <p className="min-h-12 text-sm text-muted-foreground">{plan.description}</p>
              <div className="pt-4 text-3xl font-bold">
                {plan.monthlyPricePaise
                  ? `₹${(plan.monthlyPricePaise / 100).toLocaleString('en-IN')}`
                  : 'Custom'}
                {plan.monthlyPricePaise && (
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild className="mb-6 w-full">
                <Link to="/register">Start 7-day trial</Link>
              </Button>
              <ul className="space-y-3 text-sm">
                {highlights[plan.code]?.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="mx-auto max-w-4xl px-6 pb-20">
        <h2 className="text-center text-3xl font-bold">Frequently asked questions</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            [
              'When does the trial start?',
              'Only after your private company database is fully provisioned. It then runs for seven consecutive days.',
            ],
            [
              'Do I need a payment card?',
              'No. Provider-backed email, SMS, telephony and advertising still require your own verified credentials.',
            ],
            [
              'What happens when access ends?',
              'The workspace is locked, billing recovery and export remain available, and data is retained for 90 days.',
            ],
            [
              'Is company data isolated?',
              'Yes. Every company receives its own MySQL database, storage namespace, job scope and realtime rooms.',
            ],
          ].map(([question, answer]) => (
            <Card key={question} className="border-slate-800">
              <CardHeader>
                <CardTitle className="text-base">{question}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{answer}</CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-400">
          <Link className="underline" to="/legal/terms">
            Terms
          </Link>{' '}
          ·{' '}
          <Link className="underline" to="/legal/privacy">
            Privacy
          </Link>{' '}
          ·{' '}
          <Link className="underline" to="/legal/acceptable-use">
            Acceptable use
          </Link>{' '}
          ·{' '}
          <Link className="underline" to="/legal/refunds">
            Refunds
          </Link>
        </p>
      </section>
    </main>
  );
}

export default Pricing;
