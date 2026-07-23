import { useEffect, useState } from 'react';
import { apiClient } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SsoCallback() {
  const [error, setError] = useState('');
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code');
    const state = query.get('state');
    if (!code || !state) {
      setError('The SSO response is incomplete.');
      return;
    }
    void apiClient
      .post('/auth/sso/callback', { code, state })
      .then(() => {
        window.location.replace('/');
      })
      .catch((failure) => setError(failure?.response?.data?.message || 'SSO sign-in failed.'));
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Company sign-in</CardTitle>
        </CardHeader>
        <CardContent>{error || 'Completing secure sign-in…'}</CardContent>
      </Card>
    </div>
  );
}
