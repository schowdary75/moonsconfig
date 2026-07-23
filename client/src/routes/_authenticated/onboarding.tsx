import { useState } from 'react';
import { createFileRoute, useNavigate } from '@/lib/routerCompat';
import { apiClient } from '@/api/client';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/toast';

export const Route = createFileRoute('/_authenticated/onboarding')({ component: Onboarding });

const details: Record<string, { title: string; text: string; destination?: string }> = {
  company_profile: {
    title: 'Confirm company profile',
    text: 'Your registered company, GST, timezone, and INR billing details form the workspace baseline.',
  },
  branding: {
    title: 'Add branding',
    text: 'Configure logo, colours, proposal identity, and public-site theme.',
    destination: '/themes',
  },
  communication: {
    title: 'Connect communication',
    text: 'Add customer-owned SMTP, SMS, or telephony credentials from Company Security.',
    destination: '/settings/company-security',
  },
  staff: {
    title: 'Invite your staff',
    text: 'Staff invitations consume the trial or purchased seat allowance.',
    destination: '/settings/users',
  },
  import: {
    title: 'Import existing data',
    text: 'Use the CRM import tools to bring clients and leads into this isolated company database.',
    destination: '/crm/clients',
  },
  domain: {
    title: 'Set up a public domain',
    text: 'Business and Enterprise companies can verify a custom domain. This can be completed later.',
    destination: '/settings/company-security',
  },
};

function Onboarding() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const step = user?.tenant?.onboardingStep || 'company_profile';
  const detail = details[step] || details.company_profile;
  const advance = async () => {
    setBusy(true);
    try {
      await apiClient.post('/tenants/onboarding', { completedStep: step });
      await refreshUser();
      toast.success('Onboarding progress saved');
    } finally {
      setBusy(false);
    }
  };
  if (user?.tenant?.onboardingCompletedAt)
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Card>
          <CardHeader>
            <CardTitle>Workspace setup complete</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: '/' })}>Open dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Company onboarding</p>
        <h1 className="text-3xl font-semibold">{detail.title}</h1>
        <p className="mt-2 text-muted-foreground">{detail.text}</p>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            {Object.keys(details).map((item) => (
              <span
                key={item}
                className={`rounded-full px-3 py-1 text-xs ${item === step ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                {item.replace('_', ' ')}
              </span>
            ))}
          </div>
          {detail.destination && (
            <Button variant="outline" onClick={() => navigate({ to: detail.destination! })}>
              Open related settings
            </Button>
          )}
          <Button className="w-full" disabled={busy} onClick={advance}>
            {busy ? 'Saving…' : step === 'domain' ? 'Finish onboarding' : 'Complete this step'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
