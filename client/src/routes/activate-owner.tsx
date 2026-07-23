import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { platformService } from '@/services/platformService';
import { toast } from '@/lib/toast';

export default function ActivateOwner() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const token = params.get('token') || '';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await platformService.activateOwner(token, password);
      toast.success('Owner account activated. Your isolated workspace is now being prepared.');
      navigate(`/provisioning/${result.provisioningJobId}`, { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to activate owner account');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-5">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Activate company owner</CardTitle>
          <CardDescription>
            Verify this invitation by setting your own password. After provisioning, administrator
            MFA enrollment is required at sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <label className="space-y-1 text-sm">
              Password
              <Input
                type="password"
                minLength={12}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              <span>I accept the Terms, Privacy Policy, and Data Processing Agreement.</span>
            </label>
            <Button
              className="w-full"
              disabled={busy || !token || password.length < 12 || !accepted}
            >
              {busy ? 'Activating…' : 'Activate and provision workspace'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
