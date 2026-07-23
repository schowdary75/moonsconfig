import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { platformService } from '@/services/platformService';
import { toast } from '@/lib/toast';
import { APP_BASE_DOMAIN } from '@/constants/app';
import { getErrorCode, getErrorMessage } from '@/utils/errors';

const initial = {
  ownerName: '',
  email: '',
  mobile: '',
  password: '',
  companyName: '',
  slug: '',
  country: 'IN',
  timezone: 'Asia/Kolkata',
  billingAddress: '',
  gstin: '',
};

export function RegisterCompany() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [accept, setAccept] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState<{
    message: string;
    signIn: boolean;
  }>();
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accept) return toast.error('Accept the legal agreements to continue');
    setSubmissionError(undefined);
    setLoading(true);
    try {
      const result = await platformService.register({
        ...form,
        acceptedTerms: true,
        acceptedPrivacy: true,
        acceptedDpa: true,
      });
      localStorage.setItem('moonsconfig_pending_workspace', result.slug);
      if (result.verificationToken) {
        navigate(`/verify-email?token=${encodeURIComponent(result.verificationToken)}`);
      } else {
        toast.success('Check your email to verify your company account');
        navigate(`/provisioning/${result.provisioningJobId}?awaitingVerification=1`);
      }
    } catch (error) {
      const code = getErrorCode(error);
      const message =
        code === 'TRIAL_ALREADY_USED'
          ? 'This email already owns a company workspace.'
          : code === 'SLUG_ALREADY_USED'
            ? 'That company URL is already in use. Choose another URL.'
            : getErrorMessage(error);
      setSubmissionError({ message, signIn: code === 'TRIAL_ALREADY_USED' });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Create your travel company</CardTitle>
          <CardDescription>
            Your private workspace includes seven days of Enterprise access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
            <label className="space-y-1 text-sm">
              Your name
              <Input
                value={form.ownerName}
                onChange={(e) => update('ownerName', e.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              Mobile
              <Input
                value={form.mobile}
                onChange={(e) => update('mobile', e.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              Work email
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              Password
              <Input
                type="password"
                minLength={12}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                required
              />
              <span className="text-xs text-muted-foreground">At least 12 characters</span>
            </label>
            <label className="space-y-1 text-sm">
              Company name
              <Input
                value={form.companyName}
                onChange={(e) => {
                  update('companyName', e.target.value);
                  if (!form.slug)
                    update(
                      'slug',
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, ''),
                    );
                }}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              Company URL
              <Input value={form.slug} onChange={(e) => update('slug', e.target.value)} required />
              <span className="text-xs text-muted-foreground">
                {form.slug || 'company'}.{APP_BASE_DOMAIN}
              </span>
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              Billing address
              <Input
                value={form.billingAddress}
                onChange={(e) => update('billingAddress', e.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              GSTIN (optional)
              <Input value={form.gstin} onChange={(e) => update('gstin', e.target.value)} />
            </label>
            <label className="flex items-start gap-2 text-sm md:col-span-2">
              <input
                className="mt-1"
                type="checkbox"
                checked={accept}
                onChange={(e) => setAccept(e.target.checked)}
              />
              <span>
                I agree to the{' '}
                <Link className="underline" target="_blank" to="/legal/terms">
                  Terms of Service
                </Link>
                ,{' '}
                <Link className="underline" target="_blank" to="/legal/privacy">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link className="underline" target="_blank" to="/legal/dpa">
                  Data Processing Addendum
                </Link>
                .
              </span>
            </label>
            <Button className="md:col-span-2" disabled={loading}>
              {loading ? 'Creating company…' : 'Create company and start trial'}
            </Button>
            {submissionError ? (
              <p className="text-sm text-destructive md:col-span-2" role="alert">
                {submissionError.message}{' '}
                {submissionError.signIn ? (
                  <Link className="font-medium underline" to="/login">
                    Sign in instead
                  </Link>
                ) : null}
              </p>
            ) : null}
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already registered?{' '}
            <Link className="underline" to="/login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default RegisterCompany;
