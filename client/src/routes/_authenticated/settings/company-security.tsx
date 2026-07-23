import { useEffect, useState } from 'react';
import { createFileRoute } from '@/lib/routerCompat';
import { apiClient } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';

export const Route = createFileRoute('/_authenticated/settings/company-security')({
  component: CompanySecurity,
});

function CompanySecurity() {
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState<any>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [hostname, setHostname] = useState('');
  const [sso, setSso] = useState<any>({ policy: 'disabled', verifiedDomains: [] });
  const [ssoDomains, setSsoDomains] = useState('');
  const [supportAccess, setSupportAccess] = useState<any[]>([]);
  const [exportRecord, setExportRecord] = useState<any>(null);

  const features = new Set<string>(user?.permissions || []);

  const stepUp = async () => {
    const mfaCode = window.prompt('Enter a fresh authenticator or recovery code');
    if (!mfaCode) throw new Error('MFA verification cancelled');
    const recovery = mfaCode.replace(/[\s-]/g, '').length > 6;
    const response = await apiClient.post('/auth/mfa/step-up', { code: mfaCode, recovery });
    tokenStore.set(response.data.data.accessToken);
  };

  const load = async () => {
    const requests: Promise<void>[] = [
      apiClient.get('/tenants/support-access').then(({ data }) => setSupportAccess(data.data)),
    ];
    if (features.has('custom_domain'))
      requests.push(apiClient.get('/tenants/domains').then(({ data }) => setDomains(data.data)));
    if (features.has('sso'))
      requests.push(
        apiClient.get('/tenants/sso').then(({ data }) => {
          setSso(data.data);
          setSsoDomains((data.data.verifiedDomains || []).join(', '));
        }),
      );
    await Promise.all(requests);
  };

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  const beginMfa = async () => {
    const response = await apiClient.post('/auth/mfa/setup');
    setSetup(response.data.data);
  };
  const verifyMfa = async () => {
    const response = await apiClient.post('/auth/mfa/verify', { code, recovery: false });
    setRecoveryCodes(response.data.data.recoveryCodes);
    setSetup(null);
    setCode('');
    await refreshUser();
    toast.success('Multi-factor authentication is active');
  };
  const addDomain = async () => {
    await stepUp();
    const response = await apiClient.post('/tenants/domains', { hostname });
    setDomains((current) => [...current, response.data.data]);
    setHostname('');
  };
  const verifyDomain = async (id: string) => {
    await stepUp();
    await apiClient.post(`/tenants/domains/${id}/verify`);
    await load();
  };
  const saveSso = async () => {
    await stepUp();
    await apiClient.put('/tenants/sso', {
      policy: sso.policy,
      connectionId: sso.connectionId || null,
      domains: ssoDomains
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    });
    await load();
    toast.success('SSO policy updated');
  };
  const requestExport = async () => {
    await stepUp();
    const response = await apiClient.post('/account/exports');
    setExportRecord(response.data.data);
    toast.success('Account export queued');
  };
  const requestDeletion = async () => {
    if (
      window.prompt('Type DELETE to lock this workspace and schedule deletion in seven days') !==
      'DELETE'
    )
      return;
    await stepUp();
    await apiClient.post('/account/deletion', { reason: 'Owner requested self-service deletion' });
    toast.success('Deletion scheduled. Sign in again to cancel within seven days.');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold">Company security &amp; data</h1>
        <p className="text-sm text-muted-foreground">
          Identity, domains, support access, exports, and deletion controls.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Administrator MFA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Authenticator status</span>
            <Badge>{user?.mfa?.enabled ? 'Enabled' : 'Required'}</Badge>
          </div>
          {!user?.mfa?.enabled && !setup && (
            <Button onClick={beginMfa}>Set up authenticator</Button>
          )}
          {setup && (
            <div className="space-y-3">
              <img className="h-48 w-48" src={setup.qrCodeDataUrl} alt="MFA QR code" />
              <p className="font-mono text-xs">{setup.manualKey}</p>
              <Input
                placeholder="6-digit code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <Button onClick={verifyMfa}>Verify and enable</Button>
            </div>
          )}
          {recoveryCodes.length > 0 && (
            <div className="rounded-md border p-4">
              <p className="mb-2 font-medium">Save these one-time recovery codes now</p>
              <div className="grid grid-cols-2 gap-1 font-mono text-sm">
                {recoveryCodes.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {features.has('sso') && (
        <Card>
          <CardHeader>
            <CardTitle>Enterprise SSO</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Policy</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={sso.policy}
                onChange={(event) => setSso({ ...sso, policy: event.target.value })}
              >
                <option value="disabled">Disabled</option>
                <option value="optional">Optional</option>
                <option value="required">Required</option>
              </select>
            </div>
            <div>
              <Label>Verified identity domains</Label>
              <Input
                value={ssoDomains}
                onChange={(event) => setSsoDomains(event.target.value)}
                placeholder="company.com, group.company.com"
              />
            </div>
            <div className="md:col-span-2">
              <Label>WorkOS connection ID</Label>
              <Input
                value={sso.connectionId || ''}
                onChange={(event) => setSso({ ...sso, connectionId: event.target.value })}
              />
            </div>
            <Button onClick={saveSso}>Save SSO policy</Button>
          </CardContent>
        </Card>
      )}

      {features.has('custom_domain') && (
        <Card>
          <CardHeader>
            <CardTitle>Custom domains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                placeholder="travel.example.com"
              />
              <Button onClick={addDomain}>Add domain</Button>
            </div>
            {domains.map((domain) => (
              <div key={domain.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{domain.hostname}</span>
                  <Badge variant="outline">{domain.status}</Badge>
                </div>
                {domain.dnsRecords?.map((record: any) => (
                  <p
                    key={`${record.type}-${record.name}`}
                    className="mt-2 break-all font-mono text-xs"
                  >
                    {record.type} {record.name} → {record.value}
                  </p>
                ))}
                {domain.status === 'dns_pending' && (
                  <Button className="mt-3" size="sm" onClick={() => verifyDomain(domain.id)}>
                    Verify DNS
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Support access requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {supportAccess.length === 0 && (
            <p className="text-sm text-muted-foreground">No pending requests.</p>
          )}
          {supportAccess.map((grant) => (
            <div key={grant.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">
                  {grant.operator.name} · {grant.ticket}
                </p>
                <p className="text-sm text-muted-foreground">
                  {grant.reason} · expires {new Date(grant.expiresAt).toLocaleString()}
                </p>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  await stepUp();
                  await apiClient.post(`/tenants/support-access/${grant.id}/approve`);
                  await load();
                }}
              >
                Approve read-only
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export and deletion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={requestExport}>
              Create full account export
            </Button>
            <Button variant="destructive" onClick={requestDeletion}>
              Delete company account
            </Button>
          </div>
          {exportRecord && (
            <p className="text-sm">
              Export {exportRecord.id}: {exportRecord.status}. Refresh this page later to retrieve
              it.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Voluntary deletion locks access immediately and can be cancelled for seven days.
            Cancelled or unpaid subscriptions use the 90-day retention policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
