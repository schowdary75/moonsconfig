import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ApiSuccess } from '@/types/api';
import { toast } from '@/lib/toast';

export default function AcceptInvitation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', mobile: '', password: '' });
  const [busy, setBusy] = useState(false);
  const token = params.get('token') || '';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await apiClient.post<ApiSuccess<{ tenant: { slug: string } }>>(
        '/platform/invitations/accept',
        { token, ...form },
      );
      localStorage.setItem('moonsconfig_workspace', data.data.tenant.slug);
      toast.success('Invitation accepted. Sign in to your company workspace.');
      navigate(`/login?workspace=${encodeURIComponent(data.data.tenant.slug)}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to accept invitation');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-5">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join your company</CardTitle>
          <CardDescription>
            Create your staff profile. If you already use MooNsConfig, continue with your existing
            password after accepting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <label className="space-y-1 text-sm">
              Full name
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm">
              Mobile
              <Input
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm">
              Password
              <Input
                type="password"
                minLength={12}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <Button className="w-full" disabled={busy || !token}>
              {busy ? 'Joining…' : 'Accept invitation'}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            <Link className="underline" to="/login">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
