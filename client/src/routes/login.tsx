// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/components/auth-context';
import { useNavigate } from '@/lib/routerCompat';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import { isGoogleAuthConfigured } from '@/config/googleAuth';
import { Link } from 'react-router';
import { apiClient } from '@/api/client';

export const Route = createFileRoute('/login')({
  component: Login,
});

function Login() {
  const { login, completeMfa, loginWithGoogle, user, initialized } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState(
    () =>
      new URLSearchParams(window.location.search).get('workspace') ||
      localStorage.getItem('moonsconfig_workspace') ||
      '',
  );
  const [loading, setLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [recovery, setRecovery] = useState(false);

  // Already signed in (restored session) — don't strand the user on the login form.
  useEffect(() => {
    if (initialized && user) navigate({ to: '/', replace: true });
  }, [initialized, user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(email, password, workspace || undefined);
    setLoading(false);
    if (res.mfaRequired && res.challengeToken) {
      setChallengeToken(res.challengeToken);
      toast.success('Enter the code from your authenticator app');
    } else if (res.success) {
      toast.success('Logged in successfully');
      navigate({ to: '/' });
    } else {
      toast.error(res.error || 'Login failed');
    }
  };

  const handleMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const result = await completeMfa(challengeToken, mfaCode, recovery);
    setLoading(false);
    if (result.success) navigate({ to: '/' });
    else toast.error(result.error || 'MFA verification failed');
  };

  const startSso = async () => {
    if (!workspace) return toast.error('Enter your company workspace first');
    setLoading(true);
    try {
      const response = await apiClient.post('/auth/sso/start', {
        workspace,
        email: email || undefined,
      });
      window.location.href = response.data.data.authorizationUrl;
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'SSO is not available for this workspace');
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (credentialResponse.credential) {
      const res = await loginWithGoogle(credentialResponse.credential);
      if (res.success) {
        toast.success('Logged in with Google successfully');
        navigate({ to: '/' });
      } else {
        toast.error(res.error || 'Google login failed');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>MooNsConfigs</CardTitle>
          <CardDescription>Enter your credentials to access the system.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={challengeToken ? handleMfa : handleLogin}>
            {challengeToken ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {recovery ? 'Recovery code' : 'Authenticator code'}
                  </label>
                  <Input
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    autoComplete="one-time-code"
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setRecovery((value) => !value)}
                >
                  {recovery ? 'Use authenticator code' : 'Use a recovery code'}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company workspace</label>
                  <Input
                    placeholder="your-company"
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank only for the original single-company deployment.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="admin@yourdomain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Please wait...' : challengeToken ? 'Verify and sign in' : 'Sign In'}
            </Button>
          </form>

          {!challengeToken && (
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              disabled={loading}
              onClick={startSso}
            >
              Sign in with company SSO
            </Button>
          )}

          <div className="mt-6 flex items-center justify-center space-x-2">
            <div className="h-px bg-border flex-1" />
            <span className="text-xs text-muted-foreground uppercase">Or</span>
            <div className="h-px bg-border flex-1" />
          </div>

          <div className="mt-6 flex justify-center">
            {isGoogleAuthConfigured ? (
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('Google login failed')}
                theme="outline"
                size="large"
                text="signin_with"
                shape="pill"
              />
            ) : (
              <Button type="button" variant="outline" disabled>
                Google login is not configured
              </Button>
            )}
          </div>
          <div className="mt-6 flex justify-between text-sm">
            <Link className="text-primary hover:underline" to="/pricing">
              View plans
            </Link>
            <Link className="text-primary hover:underline" to="/register">
              Register company
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
