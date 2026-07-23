import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios, { type AxiosInstance } from 'axios';
import { useSearchParams } from 'react-router';
import {
  Activity,
  AlertTriangle,
  Building2,
  CreditCard,
  Database,
  FileText,
  KeyRound,
  LifeBuoy,
  Loader2,
  LogOut,
  ReceiptIndianRupee,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  Users,
} from 'lucide-react';
import { API_BASE_URL } from '@/constants/app';
import logo from '../assets/logo.png';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type OperatorRole = 'support' | 'billing' | 'security' | 'platform_admin';
type TabKey =
  | 'overview'
  | 'workspaces'
  | 'memberships'
  | 'billing'
  | 'catalog'
  | 'invoices'
  | 'access'
  | 'operations'
  | 'lifecycle';

interface Operator {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
}

interface OperatorSession {
  idleExpiresIn: number;
  absoluteExpiresAt: string;
  mfaFreshUntil: string;
}

interface PageResult<T = Record<string, unknown>> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface GovernedAction {
  title: string;
  description: string;
  endpoint: string;
  method?: 'post' | 'patch' | 'delete';
  confirmationExpected: string;
  expectedUpdatedAt?: string;
  extras?: Record<string, unknown>;
  destructive?: boolean;
}

type EditorKind =
  | 'create_workspace'
  | 'edit_workspace'
  | 'invite_member'
  | 'manage_trial'
  | 'manual_subscription'
  | 'create_invoice'
  | 'edit_invoice'
  | 'invite_operator'
  | 'create_catalog'
  | 'add_domain'
  | 'configure_sso'
  | 'provider_credential'
  | 'create_migration'
  | 'provider_checkout';

interface EditorAction {
  kind: EditorKind;
  title: string;
  endpoint: string;
  method?: 'post' | 'patch' | 'put';
  confirmationExpected: string;
  expectedUpdatedAt?: string;
  initial?: Record<string, any>;
}

const tabs: Array<{
  key: TabKey;
  label: string;
  icon: typeof Activity;
  roles?: OperatorRole[];
}> = [
  { key: 'overview', label: 'Overview', icon: Activity },
  {
    key: 'workspaces',
    label: 'Workspaces',
    icon: Building2,
    roles: ['support', 'billing', 'security', 'platform_admin'],
  },
  {
    key: 'memberships',
    label: 'Memberships',
    icon: Users,
    roles: ['security', 'platform_admin'],
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: CreditCard,
    roles: ['billing', 'platform_admin'],
  },
  {
    key: 'catalog',
    label: 'Plan catalog',
    icon: FileText,
    roles: ['billing', 'platform_admin'],
  },
  {
    key: 'invoices',
    label: 'Invoices & payments',
    icon: ReceiptIndianRupee,
    roles: ['billing', 'platform_admin'],
  },
  {
    key: 'access',
    label: 'Access & security',
    icon: ShieldCheck,
    roles: ['support', 'security', 'platform_admin'],
  },
  {
    key: 'operations',
    label: 'Operations',
    icon: Database,
    roles: ['support', 'platform_admin'],
  },
  {
    key: 'lifecycle',
    label: 'Lifecycle',
    icon: Trash2,
    roles: ['platform_admin'],
  },
];

const roleOptions = [
  'admin',
  'manager',
  'editor',
  'approver',
  'sales',
  'support',
  'finance',
  'marketing',
  'operations',
  'viewer',
];

function money(paise: number | null | undefined) {
  if (paise === null || paise === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function date(value: unknown) {
  if (!value) return '—';
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-IN') : '—';
}

function bytes(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(amount) / Math.log(1024)));
  return `${(amount / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

function statusBadge(status: unknown) {
  const value = String(status ?? 'unknown');
  const danger = ['failed', 'past_due', 'suspended', 'deleted', 'critical'].includes(value);
  return <Badge variant={danger ? 'destructive' : 'outline'}>{value.replaceAll('_', ' ')}</Badge>;
}

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) return error.response?.data?.message || error.message;
  return error instanceof Error ? error.message : 'Request failed';
}

function canSee(role: OperatorRole, allowed?: OperatorRole[]) {
  return role === 'platform_admin' || !allowed || allowed.includes(role);
}

function MetricCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string | number;
  note?: string;
}) {
  return (
    <Card className="border-border bg-card text-card-foreground">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
      <Database className="mb-3 h-8 w-8 text-muted-foreground/60" />
      <p className="font-medium text-foreground">No {label} found</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Adjust the filters or register a test company to populate this view.
      </p>
    </div>
  );
}

function Pager({ page, pageSize, total, onPage }: PageResult & { onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-3 text-xs text-muted-foreground">
      <span>
        {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function OperatorLogin({
  onLogin,
}: {
  onLogin: (token: string, operator: Operator, session: OperatorSession) => void;
}) {
  const [credentials, setCredentials] = useState({ email: '', password: '', code: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const login = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await axios.post(`${API_BASE_URL}/platform-ops/auth/login`, credentials);
      const result = response.data.data;
      onLogin(result.accessToken, result.operator, {
        idleExpiresIn: result.idleExpiresIn,
        absoluteExpiresAt: result.absoluteExpiresAt,
        mfaFreshUntil: result.mfaFreshUntil,
      });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/30 px-4 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.09),transparent_32%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.06),transparent_28%)]" />
      <Card className="relative w-full max-w-md border-border bg-card shadow-xl">
        <CardHeader className="space-y-5 pb-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-background shadow-sm">
                <img
                  src={logo}
                  alt="MooNsConfig"
                  className="h-7 w-auto object-contain dark:invert"
                />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">MooNsConfig</p>
                <p className="text-xs text-muted-foreground">Travel CRM</p>
              </div>
            </div>
            <Badge variant="secondary" className="gap-1.5 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              Operator
            </Badge>
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl">Business operations</CardTitle>
            <CardDescription>
              Sign in with your platform-operator credentials and current authenticator code.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={login}>
            <div className="space-y-2">
              <Label htmlFor="operator-email">Operator email</Label>
              <Input
                id="operator-email"
                autoComplete="username"
                type="email"
                placeholder="operator@moon.com"
                required
                value={credentials.email}
                onChange={(event) => setCredentials({ ...credentials, email: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operator-password">Password</Label>
              <Input
                id="operator-password"
                autoComplete="current-password"
                type="password"
                placeholder="Enter your password"
                required
                value={credentials.password}
                onChange={(event) =>
                  setCredentials({ ...credentials, password: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operator-mfa">Authenticator code</Label>
              <Input
                id="operator-mfa"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                placeholder="000000"
                maxLength={6}
                required
                value={credentials.code}
                onChange={(event) =>
                  setCredentials({ ...credentials, code: event.target.value.replace(/\D/g, '') })
                }
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button
              className="w-full"
              type="submit"
              disabled={busy || credentials.code.length !== 6}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Secure sign in
            </Button>
            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Sessions lock after 30 minutes of inactivity, end after eight hours, and request
                fresh MFA for protected actions.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function OperatorActivation({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [enrollmentUri, setEnrollmentUri] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const activate = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await axios.post(`${API_BASE_URL}/platform-ops/auth/activate`, {
        token,
        password,
      });
      setOperatorId(response.data.data.operatorId);
      setEnrollmentUri(response.data.data.enrollmentUri);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/platform-ops/auth/activate/verify`, { operatorId, code });
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Activate platform operator</CardTitle>
          <CardDescription>
            Set your own password and enroll TOTP. The inviting administrator never sees either
            secret.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!operatorId ? (
            <>
              <div className="space-y-2">
                <Label>Password (minimum 16 characters)</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={busy || password.length < 16}
                onClick={() => void activate()}
              >
                Continue to authenticator setup
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Authenticator enrollment URI</Label>
                <div className="break-all rounded-md border bg-muted p-3 font-mono text-xs">
                  {enrollmentUri}
                </div>
                <p className="text-xs text-muted-foreground">
                  Add this URI to your authenticator, then enter its current six-digit code.
                </p>
              </div>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
              <Button
                className="w-full"
                disabled={busy || code.length !== 6}
                onClick={() => void verify()}
              >
                Verify and activate
              </Button>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function GovernedDialog({
  action,
  request,
  mfaFreshUntil,
  onMfaFresh,
  onClose,
  onComplete,
}: {
  action: GovernedAction | null;
  request: AxiosInstance;
  mfaFreshUntil?: string;
  onMfaFresh: (value: string) => void;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [form, setForm] = useState({ reason: '', ticket: '', confirmation: '', mfaCode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({ reason: '', ticket: '', confirmation: '', mfaCode: '' });
    setError('');
  }, [action]);

  const requiresMfa = Boolean(action) && new Date(mfaFreshUntil ?? 0).getTime() <= Date.now();

  const submit = async () => {
    if (!action) return;
    setBusy(true);
    setError('');
    try {
      if (requiresMfa) {
        const stepUp = await request.post('/auth/step-up', { code: form.mfaCode });
        onMfaFresh(stepUp.data.data.mfaFreshUntil);
      }
      const body = {
        reason: form.reason,
        ticket: form.ticket,
        confirmation: form.confirmation,
        idempotencyKey: crypto.randomUUID(),
        ...(action.expectedUpdatedAt ? { expectedUpdatedAt: action.expectedUpdatedAt } : {}),
        ...(action.extras ?? {}),
      };
      await request.request({ method: action.method ?? 'post', url: action.endpoint, data: body });
      await onComplete();
      onClose();
    } catch (failure) {
      if (axios.isAxiosError(failure) && failure.response?.data?.code === 'OPERATOR_MFA_REQUIRED') {
        onMfaFresh(new Date(0).toISOString());
      }
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>{action?.title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {action?.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={form.reason}
              placeholder="At least 10 characters"
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Ticket or approval reference</Label>
            <Input
              value={form.ticket}
              placeholder="SUP-1234"
              onChange={(event) => setForm({ ...form, ticket: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Type <span className="font-mono text-primary">{action?.confirmationExpected}</span>
            </Label>
            <Input
              value={form.confirmation}
              onChange={(event) => setForm({ ...form, confirmation: event.target.value })}
            />
          </div>
          {requiresMfa && (
            <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <Label htmlFor="operator-step-up">Fresh authenticator code</Label>
              <Input
                id="operator-step-up"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={form.mfaCode}
                onChange={(event) =>
                  setForm({ ...form, mfaCode: event.target.value.replace(/\D/g, '') })
                }
              />
              <p className="text-xs text-muted-foreground">
                Required because the last MFA verification is more than ten minutes old.
              </p>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action?.destructive ? 'destructive' : 'default'}
            disabled={
              busy ||
              form.reason.trim().length < 10 ||
              !form.ticket.trim() ||
              (requiresMfa && form.mfaCode.length !== 6) ||
              form.confirmation.trim().toLowerCase() !==
                action?.confirmationExpected.trim().toLowerCase()
            }
            onClick={submit}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminEditorDialog({
  action,
  request,
  mfaFreshUntil,
  onMfaFresh,
  onClose,
  onComplete,
}: {
  action: EditorAction | null;
  request: AxiosInstance;
  mfaFreshUntil?: string;
  onMfaFresh: (value: string) => void;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [reason, setReason] = useState('');
  const [ticket, setTicket] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setValues(action?.initial ?? {});
    setReason('');
    setTicket('');
    setConfirmation('');
    setMfaCode('');
    setError('');
  }, [action]);
  if (!action) return null;
  const requiresMfa = new Date(mfaFreshUntil ?? 0).getTime() <= Date.now();
  const field = (name: string, label: string, type = 'text', required = true) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        required={required}
        value={values[name] ?? ''}
        onChange={(event) =>
          setValues({
            ...values,
            [name]: type === 'number' ? Number(event.target.value) : event.target.value,
          })
        }
      />
    </div>
  );
  const select = (name: string, label: string, options: string[]) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={values[name] ?? options[0]}
        onChange={(event) => setValues({ ...values, [name]: event.target.value })}
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {value.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </div>
  );
  const updatePlan = (index: number, key: string, value: unknown) => {
    const plans = [...(values.plans ?? [])];
    plans[index] = { ...plans[index], [key]: value };
    setValues({ ...values, plans });
  };
  const content =
    action.kind === 'create_workspace' ? (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('name', 'Company name')}
          {field('slug', 'Workspace slug')}
          {field('ownerName', 'Owner name')}
          {field('ownerEmail', 'Owner email', 'email')}
          {field('ownerMobile', 'Owner mobile')}
          {field('gstin', 'GSTIN', 'text', false)}
          {field('timezone', 'Timezone')}
          {field('country', 'Country code')}
        </div>
        {field('billingAddress', 'Billing address')}
      </>
    ) : action.kind === 'edit_workspace' ? (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('name', 'Company name')}
          {field('slug', 'Workspace slug')}
          {field('country', 'Country code')}
          {field('timezone', 'Timezone')}
          {field('gstin', 'GSTIN', 'text', false)}
        </div>
        {field('billingAddress', 'Billing address')}
      </>
    ) : action.kind === 'invite_member' ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {field('email', 'Member email', 'email')}
        {select('role', 'Role', roleOptions)}
      </div>
    ) : action.kind === 'manage_trial' ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {select('action', 'Action', ['extend', 'end'])}
        {values.action !== 'end' && field('days', 'Extension days (max 30)', 'number')}
      </div>
    ) : action.kind === 'manual_subscription' ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {field('contractReference', 'Contract reference')}
        {field('seats', 'Seats', 'number')}
        {field('amountPaise', 'Contract amount (paise)', 'number')}
        {field('outstandingPaise', 'Outstanding (paise)', 'number')}
        {select('interval', 'Interval', ['annual', 'monthly'])}
        {select('status', 'Status', ['active', 'past_due', 'suspended'])}
        {field('periodStart', 'Period start', 'date')}
        {field('periodEnd', 'Period end', 'date')}
      </div>
    ) : action.kind === 'provider_checkout' ? (
      <div className="grid gap-3 sm:grid-cols-3">
        {select('planCode', 'Plan', ['starter', 'business'])}
        {select('interval', 'Interval', ['monthly', 'annual'])}
        {field('seats', 'Seats', 'number')}
      </div>
    ) : ['create_invoice', 'edit_invoice'].includes(action.kind) ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {action.kind === 'create_invoice' && field('invoiceNumber', 'Invoice number')}
        {field('legalName', 'Legal name')}
        {field('billingAddress', 'Billing address')}
        {field('gstin', 'GSTIN', 'text', false)}
        {field('placeOfSupply', 'Place of supply', 'text', false)}
        {field('description', 'Line description')}
        {field('unitAmountPaise', 'Amount (paise)', 'number')}
        {field('taxPaise', 'Tax (paise)', 'number')}
        {field('hsnSac', 'HSN/SAC')}
        {field('dueAt', 'Due date', 'date')}
      </div>
    ) : action.kind === 'invite_operator' ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {field('name', 'Operator name')}
        {field('email', 'Operator email', 'email')}
        {select('role', 'Operator role', ['support', 'billing', 'security', 'platform_admin'])}
      </div>
    ) : action.kind === 'add_domain' ? (
      field('hostname', 'Custom domain')
    ) : action.kind === 'configure_sso' ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {select('policy', 'SSO policy', ['disabled', 'optional', 'required'])}
        {field('connectionId', 'WorkOS connection ID', 'text', false)}
        <div className="sm:col-span-2">
          {field('domainsText', 'Verified company domains (comma separated)', 'text', false)}
        </div>
      </div>
    ) : action.kind === 'provider_credential' ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {select('provider', 'Provider', [
          'smtp',
          'google',
          'meta',
          'sms',
          'telephony',
          'ai',
          'webhook',
        ])}
        {field('credentialKey', 'Credential field (for example apiKey)')}
        {field('credentialValue', 'Secret value', 'password')}
      </div>
    ) : action.kind === 'create_migration' ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {field('migrationName', 'Migration directory name')}
        {field('targetVersion', 'Target schema version')}
      </div>
    ) : (
      <div className="space-y-4">
        {field('version', 'Catalog version', 'number')}
        {field('notes', 'Release notes')}
        {(values.plans ?? []).map((plan: any, index: number) => (
          <div key={plan.code} className="rounded-lg border p-3">
            <h3 className="mb-3 font-medium capitalize">{plan.code}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['includedSeats', 'Included seats'],
                ['maxSeats', 'Maximum seats'],
                ['storageBytes', 'Storage bytes'],
                ['monthlyPricePaise', 'Monthly price (paise)'],
                ['annualPricePaise', 'Annual price (paise)'],
                ['extraSeatPricePaise', 'Extra seat (paise)'],
              ].map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    value={plan[key] ?? ''}
                    onChange={(event) =>
                      updatePlan(
                        index,
                        key,
                        event.target.value === '' ? null : Number(event.target.value),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1">
              <Label>Enabled features (comma separated)</Label>
              <Input
                value={
                  plan.entitlements
                    ?.filter(
                      (item: any) =>
                        item.enabled && !['staff_seats', 'storage_bytes'].includes(item.featureKey),
                    )
                    .map((item: any) => item.featureKey)
                    .join(', ') ?? ''
                }
                onChange={(event) => {
                  const features = event.target.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean);
                  const quotas =
                    plan.entitlements?.filter((item: any) =>
                      ['staff_seats', 'storage_bytes'].includes(item.featureKey),
                    ) ?? [];
                  updatePlan(index, 'entitlements', [
                    ...features.map((featureKey) => ({
                      featureKey,
                      enabled: true,
                      limitValue: null,
                    })),
                    ...quotas,
                  ]);
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (requiresMfa) {
        const response = await request.post('/auth/step-up', { code: mfaCode });
        onMfaFresh(response.data.data.mfaFreshUntil);
      }
      let payload: any = { ...values };
      if (action.kind === 'create_invoice')
        payload = {
          ...values,
          dueAt: values.dueAt || null,
          lines: [
            {
              description: values.description,
              quantity: 1,
              unitAmountPaise: Number(values.unitAmountPaise),
              taxPaise: Number(values.taxPaise || 0),
              hsnSac: values.hsnSac || null,
            },
          ],
        };
      if (action.kind === 'edit_invoice')
        payload = {
          legalName: values.legalName,
          gstin: values.gstin || null,
          billingAddress: values.billingAddress,
          placeOfSupply: values.placeOfSupply || null,
          dueAt: values.dueAt || null,
          lines: [
            {
              description: values.description,
              quantity: 1,
              unitAmountPaise: Number(values.unitAmountPaise),
              taxPaise: Number(values.taxPaise || 0),
              hsnSac: values.hsnSac || null,
            },
          ],
        };
      if (action.kind === 'create_catalog')
        payload = {
          version: Number(values.version),
          notes: values.notes || null,
          plans: values.plans,
        };
      if (action.kind === 'configure_sso')
        payload = {
          policy: values.policy,
          connectionId: values.connectionId || null,
          domains: String(values.domainsText || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        };
      if (action.kind === 'provider_credential')
        payload = {
          provider: values.provider,
          credentials: { [values.credentialKey]: values.credentialValue },
        };
      await request.request({
        method: action.method ?? 'post',
        url: action.endpoint,
        data: {
          ...payload,
          reason,
          ticket,
          confirmation,
          idempotencyKey: crypto.randomUUID(),
          ...(action.expectedUpdatedAt ? { expectedUpdatedAt: action.expectedUpdatedAt } : {}),
        },
      });
      await onComplete();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{action.title}</DialogTitle>
          <DialogDescription>
            All changes are validated, idempotent, MFA-protected and audited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {content}
          <div className="grid gap-3 sm:grid-cols-2">
            {fieldGoverned('Reason', reason, setReason)}
            {fieldGoverned('Ticket / approval', ticket, setTicket)}
          </div>
          {fieldGoverned(
            `Type ${action.confirmationExpected} to confirm`,
            confirmation,
            setConfirmation,
          )}
          {requiresMfa &&
            fieldGoverned('Fresh authenticator code', mfaCode, (value) =>
              setMfaCode(value.replace(/\D/g, '').slice(0, 6)),
            )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              reason.trim().length < 10 ||
              !ticket.trim() ||
              confirmation.trim().toLowerCase() !== action.confirmationExpected.toLowerCase() ||
              (requiresMfa && mfaCode.length !== 6)
            }
            onClick={() => void submit()}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fieldGoverned(label: string, value: string, setValue: (value: string) => void) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => setValue(event.target.value)} />
    </div>
  );
}

export default function PlatformOps() {
  const [params, setParams] = useSearchParams();
  const [token, setToken] = useState('');
  const [operator, setOperator] = useState<Operator | null>(null);
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [data, setData] = useState<any>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const [workspace, setWorkspace] = useState<any>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [action, setAction] = useState<GovernedAction | null>(null);
  const [editor, setEditor] = useState<EditorAction | null>(null);
  const loadSequence = useRef(0);

  const request = useMemo(
    () =>
      axios.create({
        baseURL: `${API_BASE_URL}/platform-ops`,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }),
    [token],
  );

  const availableTabs = useMemo(
    () => (operator ? tabs.filter((tab) => canSee(operator.role, tab.roles)) : []),
    [operator],
  );
  const requestedTab = (params.get('tab') || 'overview') as TabKey;
  const activeTab = availableTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : (availableTabs[0]?.key ?? 'overview');

  const endpoint = useMemo(() => {
    if (activeTab === 'overview') return '/overview';
    if (activeTab === 'workspaces') return '/workspaces';
    if (activeTab === 'memberships') return '/memberships';
    if (activeTab === 'billing') return '/billing/subscriptions';
    if (activeTab === 'catalog') return '/billing/catalog-versions';
    if (activeTab === 'invoices')
      return kind === 'payments' ? '/billing/payment-events' : '/billing/invoices';
    if (activeTab === 'access') {
      if (kind === 'operators') return '/operators';
      if (kind === 'audit') return '/audit-events';
      if (kind === 'security') return '/security-events';
      if (kind === 'workspaces') return '/workspace-security';
      return '/access-grants';
    }
    if (activeTab === 'operations') {
      if (kind === 'migrations') return '/migration-rollouts';
      if (kind === 'backups') return '/backups';
      return '/provisioning-jobs';
    }
    return '/lifecycle';
  }, [activeTab, kind]);

  const requestKey = useMemo(
    () => JSON.stringify([endpoint, activeTab, kind, page, query.trim(), status]),
    [activeTab, endpoint, kind, page, query, status],
  );

  const filterStatuses = useMemo(() => {
    if (activeTab === 'workspaces')
      return [
        'pending',
        'pending_activation',
        'provisioning',
        'active',
        'suspended',
        'deleting',
        'deleted',
        'failed',
      ];
    if (activeTab === 'memberships') return ['invited', 'active', 'suspended'];
    if (activeTab === 'billing')
      return ['trialing', 'active', 'past_due', 'suspended', 'cancelled', 'expired'];
    if (activeTab === 'invoices')
      return kind === 'payments'
        ? ['processed', 'pending']
        : ['draft', 'issued', 'paid', 'void', 'failed'];
    if (activeTab === 'access')
      return kind === 'grants' ? ['pending', 'active'] : kind === 'security' ? ['open'] : [];
    if (activeTab === 'operations')
      return kind === 'migrations'
        ? ['draft', 'running', 'paused', 'completed', 'failed']
        : kind === 'backups'
          ? ['pending', 'processing', 'active', 'failed', 'revoked', 'deleted']
          : ['pending', 'processing', 'completed', 'failed'];
    if (activeTab === 'lifecycle')
      return kind === 'exports'
        ? ['pending', 'processing', 'completed', 'failed', 'expired']
        : ['requested', 'scheduled', 'processing', 'completed', 'cancelled', 'failed'];
    return [];
  }, [activeTab, kind]);

  const load = useCallback(async () => {
    if (!token) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try {
      const response = await request.get(endpoint, {
        params:
          activeTab === 'overview'
            ? undefined
            : {
                page,
                pageSize: 25,
                ...(query.trim() ? { query: query.trim() } : {}),
                ...(status ? { status } : {}),
                ...(activeTab === 'memberships'
                  ? { kind: kind === 'invitations' ? 'invitations' : 'memberships' }
                  : {}),
                ...(activeTab === 'lifecycle'
                  ? { kind: kind === 'exports' ? 'exports' : 'deletions' }
                  : {}),
              },
      });
      if (sequence !== loadSequence.current) return;
      setData(response.data.data);
      setLoadedRequestKey(requestKey);
    } catch (failure) {
      if (sequence !== loadSequence.current) return;
      if (axios.isAxiosError(failure) && failure.response?.status === 401) {
        setToken('');
        setOperator(null);
        setSession(null);
        setLoadedRequestKey('');
        setError('Operator session expired. Sign in with a fresh MFA code.');
      } else {
        setError(errorMessage(failure));
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [activeTab, endpoint, kind, page, query, request, requestKey, status, token]);

  useEffect(() => {
    if (!availableTabs.length) return;
    if (activeTab !== requestedTab) setParams({ tab: activeTab }, { replace: true });
  }, [activeTab, availableTabs.length, requestedTab, setParams]);

  useEffect(() => {
    setPage(1);
    setQuery('');
    setStatus('');
    setKind(
      activeTab === 'memberships'
        ? 'memberships'
        : activeTab === 'invoices'
          ? 'invoices'
          : activeTab === 'access'
            ? 'workspaces'
            : activeTab === 'operations'
              ? 'provisioning'
              : activeTab === 'lifecycle'
                ? 'deletions'
                : '',
    );
  }, [activeTab]);

  useEffect(() => {
    setStatus('');
    setPage(1);
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!session?.absoluteExpiresAt) return;
    const remaining = new Date(session.absoluteExpiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setToken('');
      setOperator(null);
      setSession(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setToken('');
      setOperator(null);
      setSession(null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [session?.absoluteExpiresAt]);

  const openWorkspace = async (id: string) => {
    setWorkspaceLoading(true);
    try {
      const response = await request.get(`/workspaces/${id}`);
      setWorkspace(response.data.data);
      const next = new URLSearchParams(params);
      next.set('tab', 'workspaces');
      next.set('workspace', id);
      setParams(next, { replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const closeWorkspace = () => {
    setWorkspace(null);
    const next = new URLSearchParams(params);
    next.delete('workspace');
    setParams(next, { replace: true });
  };

  const operatorActivation = params.get('operatorActivation');
  if (operatorActivation) {
    return (
      <OperatorActivation
        token={operatorActivation}
        onDone={() => setParams({ tab: 'overview' }, { replace: true })}
      />
    );
  }

  if (!token || !operator) {
    return (
      <OperatorLogin
        onLogin={(nextToken, nextOperator, nextSession) => {
          setToken(nextToken);
          setOperator(nextOperator);
          setSession(nextSession);
        }}
      />
    );
  }

  const visibleData = loadedRequestKey === requestKey ? data : null;
  const rows = (visibleData?.items ?? []) as any[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card shadow-sm">
              <img src={logo} alt="MooNsConfig" className="h-6 w-auto object-contain dark:invert" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Business</h1>
              <p className="text-xs text-muted-foreground">
                MooNsConfig platform operations · {operator.name} ·{' '}
                {operator.role.replace('_', ' ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/40 text-primary">
              30-minute inactivity · 8-hour maximum
            </Badge>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await request.post('/auth/logout');
                } catch {
                  // Local memory is cleared even if the server session already expired.
                }
                setToken('');
                setOperator(null);
                setSession(null);
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
        <div className="w-full overflow-x-auto px-4 pb-3 sm:px-6">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setParams({ tab: value }, { replace: true })}
          >
            <TabsList className="h-auto min-w-max bg-muted">
              {availableTabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  <tab.icon className="mr-2 h-4 w-4" /> {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="w-full space-y-5 p-4 sm:p-6">
        {activeTab !== 'overview' && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="border-input bg-background pl-9"
                placeholder={`Search ${activeTab}…`}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {filterStatuses.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            {activeTab === 'memberships' && (
              <Button
                variant="outline"
                onClick={() => {
                  setKind(kind === 'invitations' ? 'memberships' : 'invitations');
                  setPage(1);
                }}
              >
                {kind === 'invitations' ? 'Show memberships' : 'Show invitations'}
              </Button>
            )}
            {activeTab === 'invoices' && (
              <Button
                variant="outline"
                onClick={() => {
                  setKind(kind === 'payments' ? 'invoices' : 'payments');
                  setPage(1);
                }}
              >
                {kind === 'payments' ? 'Show invoices' : 'Show payment events'}
              </Button>
            )}
            {activeTab === 'access' && (
              <div className="flex rounded-md border border-border bg-muted/30 p-1">
                {['workspaces', 'grants', 'security', 'audit', 'operators']
                  .filter(
                    (value) =>
                      operator.role === 'platform_admin' ||
                      ['workspaces', 'grants'].includes(value) ||
                      operator.role === 'security',
                  )
                  .map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={kind === value ? 'secondary' : 'ghost'}
                      onClick={() => {
                        setKind(value);
                        setPage(1);
                      }}
                    >
                      {value}
                    </Button>
                  ))}
              </div>
            )}
            {activeTab === 'operations' && (
              <div className="flex rounded-md border border-border bg-muted/30 p-1">
                {['provisioning', 'migrations', 'backups'].map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={kind === value ? 'secondary' : 'ghost'}
                    disabled={value !== 'provisioning' && operator.role !== 'platform_admin'}
                    onClick={() => {
                      setKind(value);
                      setPage(1);
                    }}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            )}
            {activeTab === 'lifecycle' && (
              <Button
                variant="outline"
                onClick={() => {
                  setKind(kind === 'exports' ? 'deletions' : 'exports');
                  setPage(1);
                }}
              >
                {kind === 'exports' ? 'Show deletions' : 'Show exports'}
              </Button>
            )}
            {activeTab === 'billing' && (
              <Button
                onClick={() =>
                  setAction({
                    title: 'Reconcile Razorpay subscriptions',
                    description:
                      'Fetch current provider state. Verified provider results remain authoritative.',
                    endpoint: '/billing/reconcile',
                    confirmationExpected: 'RECONCILE',
                  })
                }
              >
                Reconcile billing
              </Button>
            )}
            {activeTab === 'workspaces' && operator.role === 'platform_admin' && (
              <Button
                onClick={() =>
                  setEditor({
                    kind: 'create_workspace',
                    title: 'Create workspace',
                    endpoint: '/workspaces',
                    confirmationExpected: 'CREATE WORKSPACE',
                    initial: { country: 'IN', timezone: 'Asia/Kolkata' },
                  })
                }
              >
                Create workspace
              </Button>
            )}
            {activeTab === 'catalog' && operator.role === 'platform_admin' && (
              <Button
                onClick={() => {
                  const latest = rows[0];
                  setEditor({
                    kind: 'create_catalog',
                    title: 'Create catalog draft',
                    endpoint: '/billing/catalog-versions',
                    confirmationExpected: `CREATE V${(latest?.version ?? 0) + 1}`,
                    initial: {
                      version: (latest?.version ?? 0) + 1,
                      notes: '',
                      plans:
                        latest?.plans?.map((plan: any) => ({
                          ...plan,
                          id: undefined,
                          catalogVersionId: undefined,
                          createdAt: undefined,
                          storageBytes: String(plan.storageBytes),
                          entitlements: plan.entitlements.map((item: any) => ({
                            featureKey: item.featureKey,
                            enabled: item.enabled,
                            limitValue: item.limitValue === null ? null : String(item.limitValue),
                          })),
                        })) ?? [],
                    },
                  });
                }}
              >
                New catalog version
              </Button>
            )}
            {activeTab === 'access' &&
              kind === 'operators' &&
              operator.role === 'platform_admin' && (
                <Button
                  onClick={() =>
                    setEditor({
                      kind: 'invite_operator',
                      title: 'Invite platform operator',
                      endpoint: '/operators',
                      confirmationExpected: 'INVITE OPERATOR',
                      initial: { role: 'support' },
                    })
                  }
                >
                  Invite operator
                </Button>
              )}
            {activeTab === 'operations' &&
              kind === 'migrations' &&
              operator.role === 'platform_admin' && (
                <Button
                  onClick={() =>
                    setEditor({
                      kind: 'create_migration',
                      title: 'Create migration draft',
                      endpoint: '/migration-rollouts',
                      confirmationExpected: 'CREATE MIGRATION',
                    })
                  }
                >
                  New migration
                </Button>
              )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {loading && !visibleData ? (
          <div className="flex min-h-72 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : activeTab === 'overview' ? (
          <Overview data={visibleData} />
        ) : rows.length === 0 ? (
          <EmptyState label={activeTab} />
        ) : (
          <Card className="overflow-hidden border-border bg-card text-card-foreground shadow-sm">
            <CardContent className="p-0">
              {activeTab === 'workspaces' && (
                <WorkspacesTable
                  rows={rows}
                  role={operator.role}
                  openWorkspace={(id: string) => void openWorkspace(id)}
                  onAction={setAction}
                />
              )}
              {activeTab === 'memberships' && (
                <MembershipsTable
                  rows={rows}
                  invitations={kind === 'invitations'}
                  role={operator.role}
                  onAction={setAction}
                  onEditor={setEditor}
                  request={request}
                />
              )}
              {activeTab === 'billing' && <SubscriptionsTable rows={rows} onAction={setAction} />}
              {activeTab === 'catalog' && <CatalogTable rows={rows} onAction={setAction} />}
              {activeTab === 'invoices' && (
                <InvoicesTable
                  rows={rows}
                  payments={kind === 'payments'}
                  onAction={setAction}
                  request={request}
                />
              )}
              {activeTab === 'access' && (
                <AccessTable
                  rows={rows}
                  kind={kind}
                  role={operator.role}
                  onAction={setAction}
                  onEditor={setEditor}
                />
              )}
              {activeTab === 'operations' && (
                <OperationsTable rows={rows} kind={kind} onAction={setAction} />
              )}
              {activeTab === 'lifecycle' && (
                <LifecycleTable rows={rows} exports={kind === 'exports'} onAction={setAction} />
              )}
              <Pager {...(visibleData ?? { page: 1, pageSize: 25, total: 0 })} onPage={setPage} />
            </CardContent>
          </Card>
        )}
      </main>

      <WorkspaceSheet
        workspace={workspace}
        loading={workspaceLoading}
        role={operator.role}
        onClose={closeWorkspace}
        onAction={setAction}
        onEditor={setEditor}
      />
      <AdminEditorDialog
        action={editor}
        request={request}
        mfaFreshUntil={session?.mfaFreshUntil}
        onMfaFresh={(mfaFreshUntil) =>
          setSession((current) => (current ? { ...current, mfaFreshUntil } : current))
        }
        onClose={() => setEditor(null)}
        onComplete={async () => {
          await load();
          if (workspace?.id) await openWorkspace(workspace.id);
        }}
      />
      <GovernedDialog
        action={action}
        request={request}
        mfaFreshUntil={session?.mfaFreshUntil}
        onMfaFresh={(mfaFreshUntil) =>
          setSession((current) => (current ? { ...current, mfaFreshUntil } : current))
        }
        onClose={() => setAction(null)}
        onComplete={async () => {
          await load();
          if (workspace?.id) await openWorkspace(workspace.id);
        }}
      />
    </div>
  );
}

function Overview({ data }: { data: any }) {
  const workspaceTotal = (data?.workspaces ?? []).reduce(
    (sum: number, item: any) => sum + item._count._all,
    0,
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Registered workspaces" value={workspaceTotal} />
        <MetricCard title="Active trials" value={data?.activeTrials ?? 0} />
        <MetricCard title="Active subscriptions" value={data?.activeSubscriptions ?? 0} />
        <MetricCard title="Overdue subscriptions" value={data?.overdueSubscriptions ?? 0} />
        <MetricCard
          title="Estimated MRR"
          value={money(data?.monthlyRecurringPaise ?? 0)}
          note="Confirmed ledger amounts only"
        />
        <MetricCard
          title="Outstanding"
          value={money(data?.outstandingPaise ?? 0)}
          note="Provider-confirmed balances"
        />
        <MetricCard title="Active memberships" value={data?.activeMemberships ?? 0} />
        <MetricCard title="Pending deletions" value={data?.pendingDeletions ?? 0} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Provisioning failures" value={data?.provisioningFailures ?? 0} />
        <MetricCard title="Migration failures" value={data?.migrationFailures ?? 0} />
        <MetricCard title="High security alerts" value={data?.securityAlerts ?? 0} />
      </div>
      <Card className="border-border bg-card text-card-foreground shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Workspace status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {(data?.workspaces ?? []).map((item: any) => (
            <div
              key={item.status}
              className="rounded-lg border border-border bg-muted/20 px-4 py-3"
            >
              <p className="text-xs uppercase text-muted-foreground">{item.status}</p>
              <p className="mt-1 text-2xl font-semibold">{item._count._all}</p>
            </div>
          ))}
          {!workspaceTotal && (
            <p className="text-sm text-muted-foreground">No companies have registered yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WorkspacesTable({ rows, role, openWorkspace, onAction }: any) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Company</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Renewal / trial</TableHead>
          <TableHead>Seats</TableHead>
          <TableHead>Storage</TableHead>
          <TableHead>Schema</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row: any) => (
          <TableRow key={row.id} className="border-border">
            <TableCell>
              <button className="text-left" onClick={() => openWorkspace(row.id)}>
                <p className="font-medium text-primary">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.slug}</p>
              </button>
            </TableCell>
            <TableCell>
              {statusBadge(row.administrativelySuspendedAt ? 'administrative hold' : row.status)}
            </TableCell>
            <TableCell>
              <p className="capitalize">{row.planCode ?? 'No plan'}</p>
              <p className="text-xs text-muted-foreground">
                {String(row.billingStatus).replaceAll('_', ' ')}
              </p>
            </TableCell>
            <TableCell>{date(row.trialEndsAt ?? row.renewalAt)}</TableCell>
            <TableCell>
              {row.seats ?? '—'}
              <span className="text-muted-foreground"> / {row.counts?.memberships ?? 0} used</span>
            </TableCell>
            <TableCell>{bytes(row.storageBytes)}</TableCell>
            <TableCell>{row.schemaVersion ?? 'unknown'}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => openWorkspace(row.id)}>
                  Details
                </Button>
                {role === 'platform_admin' && !row.administrativelySuspendedAt && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      onAction({
                        title: `Suspend ${row.name}`,
                        description:
                          'Immediately lock routed access and revoke active sessions. Billing state is preserved.',
                        endpoint: `/workspaces/${row.id}/suspend`,
                        confirmationExpected: row.slug,
                        expectedUpdatedAt: row.updatedAt,
                        destructive: true,
                      })
                    }
                  >
                    Suspend
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MembershipsTable({ rows, invitations, role, onAction, request }: any) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Person</TableHead>
          <TableHead>Workspace</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>MFA / expiry</TableHead>
          <TableHead className="text-right">Governed actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row: any) => (
          <TableRow key={row.id} className="border-border">
            <TableCell>
              <p className="font-medium">
                {invitations
                  ? (row.email ?? 'Unknown invitation')
                  : (row.user?.name ?? row.user?.email ?? 'Unknown member')}
              </p>
              <p className="text-xs text-muted-foreground">
                {invitations ? 'Pending invitation' : (row.user?.email ?? 'Account unavailable')}
              </p>
            </TableCell>
            <TableCell>
              {row.tenant?.name ?? 'Unknown workspace'}
              <p className="text-xs text-muted-foreground">{row.tenant?.slug ?? row.tenantId}</p>
            </TableCell>
            <TableCell>
              {invitations || row.role === 'owner' ? (
                <span className="capitalize">{row.role}</span>
              ) : (
                <select
                  className="rounded border border-input bg-background px-2 py-1 text-xs"
                  value={row.role}
                  onChange={(event) =>
                    onAction({
                      title: `Change role for ${row.user.email}`,
                      description: `Change this membership from ${row.role} to ${event.target.value} and revoke existing sessions.`,
                      endpoint: `/workspaces/${row.tenantId}/memberships/${row.id}`,
                      method: 'patch',
                      confirmationExpected: row.user.email,
                      expectedUpdatedAt: row.updatedAt,
                      extras: { role: event.target.value },
                    })
                  }
                >
                  {roleOptions.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              )}
            </TableCell>
            <TableCell>{statusBadge(row.status)}</TableCell>
            <TableCell>
              {invitations
                ? date(row.expiresAt)
                : row.user?.mfaEnabled
                  ? 'Enabled'
                  : 'Not enrolled'}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                {invitations ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onAction({
                          title: `Resend invitation`,
                          description: 'Rotate the invitation token and extend it for seven days.',
                          endpoint: `/workspaces/${row.tenantId}/invitations/${row.id}/resend`,
                          confirmationExpected: row.email,
                        })
                      }
                    >
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        onAction({
                          title: `Revoke invitation`,
                          description: 'Invalidate this invitation immediately.',
                          endpoint: `/workspaces/${row.tenantId}/invitations/${row.id}/revoke`,
                          confirmationExpected: row.email,
                          destructive: true,
                        })
                      }
                    >
                      Revoke
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onAction({
                          title: `Revoke sessions`,
                          description: 'End all platform and tenant sessions for this membership.',
                          endpoint: `/workspaces/${row.tenantId}/memberships/${row.id}/revoke-sessions`,
                          confirmationExpected: row.user.email,
                        })
                      }
                    >
                      Revoke sessions
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onAction({
                          title: 'Reset member MFA',
                          description:
                            'Disable existing MFA methods and revoke all sessions so the member must reenroll.',
                          endpoint: `/workspaces/${row.tenantId}/memberships/${row.id}/reset-mfa`,
                          confirmationExpected: row.user.email,
                          expectedUpdatedAt: row.updatedAt,
                          destructive: true,
                        })
                      }
                    >
                      Reset MFA
                    </Button>
                    {row.role !== 'owner' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          onAction({
                            title: 'Remove membership',
                            description:
                              'Revoke sessions and remove platform access while preserving authored business records.',
                            endpoint: `/workspaces/${row.tenantId}/memberships/${row.id}`,
                            method: 'delete',
                            confirmationExpected: row.user.email,
                            expectedUpdatedAt: row.updatedAt,
                            destructive: true,
                          })
                        }
                      >
                        Remove
                      </Button>
                    )}
                    {row.role !== 'owner' && role === 'platform_admin' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const detail = await request.get(`/workspaces/${row.tenantId}`);
                          onAction({
                            title: `Transfer ownership`,
                            description: `Make ${row.user.email} the workspace owner and demote the current owner to admin.`,
                            endpoint: `/workspaces/${row.tenantId}/transfer-ownership`,
                            confirmationExpected: row.tenant.slug,
                            expectedUpdatedAt: detail.data.data.updatedAt,
                            extras: { targetMembershipId: row.id },
                            destructive: true,
                          });
                        }}
                      >
                        Make owner
                      </Button>
                    )}
                    {row.role !== 'owner' && (
                      <Button
                        size="sm"
                        variant={row.status === 'active' ? 'destructive' : 'outline'}
                        onClick={() =>
                          onAction({
                            title: `${row.status === 'active' ? 'Suspend' : 'Reactivate'} membership`,
                            description: 'Update platform access and revoke any existing sessions.',
                            endpoint: `/workspaces/${row.tenantId}/memberships/${row.id}`,
                            method: 'patch',
                            confirmationExpected: row.user.email,
                            expectedUpdatedAt: row.updatedAt,
                            extras: { status: row.status === 'active' ? 'suspended' : 'active' },
                            destructive: row.status === 'active',
                          })
                        }
                      >
                        {row.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SubscriptionsTable({
  rows,
  onAction,
}: {
  rows: any[];
  onAction: (action: GovernedAction) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Workspace</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Seats</TableHead>
          <TableHead>Charge</TableHead>
          <TableHead>Outstanding</TableHead>
          <TableHead>Next charge</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className="border-border">
            <TableCell>
              {row.tenant.name}
              <p className="text-xs text-muted-foreground">{row.tenant.slug}</p>
            </TableCell>
            <TableCell className="text-right">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onAction({
                    title:
                      row.source === 'manual_enterprise'
                        ? 'Cancel Enterprise contract'
                        : 'Schedule subscription cancellation',
                    description:
                      row.source === 'manual_enterprise'
                        ? 'Suspend the manual contract through the append-only subscription ledger.'
                        : 'Request provider-safe cancellation without overwriting confirmed financial state.',
                    endpoint: `/billing/subscriptions/${row.id}/action`,
                    confirmationExpected: row.tenant.slug,
                    expectedUpdatedAt: row.updatedAt,
                    extras: { action: row.source === 'manual_enterprise' ? 'suspend' : 'cancel' },
                    destructive: true,
                  })
                }
              >
                {row.source === 'manual_enterprise' ? 'Suspend' : 'Cancel'}
              </Button>
            </TableCell>
            <TableCell className="capitalize">
              {row.planCode} · {row.interval ?? 'contract'}
            </TableCell>
            <TableCell>{statusBadge(row.status)}</TableCell>
            <TableCell>{row.seats}</TableCell>
            <TableCell>{money(row.amountPaise)}</TableCell>
            <TableCell>{money(row.outstandingPaise)}</TableCell>
            <TableCell>{date(row.nextChargeAt ?? row.currentPeriodEnd)}</TableCell>
            <TableCell>
              {row.provider ?? 'manual'}
              {row.contractReference && (
                <p className="text-xs text-muted-foreground">{row.contractReference}</p>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CatalogTable({
  rows,
  onAction,
}: {
  rows: any[];
  onAction: (action: GovernedAction) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Plans</TableHead>
          <TableHead>Published</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              v{row.version}
              <p className="text-xs text-muted-foreground">{row.notes || 'No release notes'}</p>
            </TableCell>
            <TableCell>{statusBadge(row.status)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                {row.plans?.map((plan: any) => (
                  <Badge key={plan.id} variant="outline" className="capitalize">
                    {plan.code}: {plan.includedSeats} seats · {bytes(plan.storageBytes)}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell>{date(row.publishedAt)}</TableCell>
            <TableCell className="text-right">
              {row.status === 'draft' && (
                <Button
                  size="sm"
                  onClick={() =>
                    onAction({
                      title: `Publish catalog v${row.version}`,
                      description:
                        'Retire the current catalog and publish this immutable version. Existing subscriptions keep their snapshots.',
                      endpoint: `/billing/catalog-versions/${row.id}/publish`,
                      confirmationExpected: `PUBLISH V${row.version}`,
                      expectedUpdatedAt: row.updatedAt,
                    })
                  }
                >
                  Publish
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function InvoicesTable({ rows, payments, onAction, onEditor, request }: any) {
  if (payments)
    return (
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>Event</TableHead>
            <TableHead>Workspace</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Provider time</TableHead>
            <TableHead>Processed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: any) => (
            <TableRow key={row.id} className="border-border">
              <TableCell>
                <p className="font-medium">{row.eventType}</p>
                <p className="text-xs text-muted-foreground">{row.providerEventId}</p>
              </TableCell>
              <TableCell>{row.tenant?.name ?? 'Unresolved'}</TableCell>
              <TableCell>{row.provider}</TableCell>
              <TableCell>{date(row.providerCreatedAt)}</TableCell>
              <TableCell>
                {row.processedAt ? date(row.processedAt) : statusBadge('pending')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Invoice</TableHead>
          <TableHead>Workspace</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Paid</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead>GST / Zoho</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row: any) => (
          <TableRow key={row.id} className="border-border">
            <TableCell>
              <p className="font-medium">{row.invoiceNumber}</p>
              <p className="text-xs text-muted-foreground">{date(row.issuedAt ?? row.createdAt)}</p>
            </TableCell>
            <TableCell>{row.tenant.name}</TableCell>
            <TableCell>{statusBadge(row.status)}</TableCell>
            <TableCell>{money(row.totalPaise)}</TableCell>
            <TableCell>{money(row.amountPaidPaise)}</TableCell>
            <TableCell>{money(row.balancePaise)}</TableCell>
            <TableCell>
              {money(row.taxPaise)}
              <p className="text-xs text-muted-foreground">
                {row.providerStatus ?? 'Not synchronized'}
              </p>
            </TableCell>
            <TableCell className="flex justify-end gap-2 text-right">
              {row.status === 'draft' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onEditor({
                      kind: 'edit_invoice',
                      title: `Edit ${row.invoiceNumber}`,
                      endpoint: `/billing/invoices/${row.id}`,
                      method: 'patch',
                      confirmationExpected: row.invoiceNumber,
                      expectedUpdatedAt: row.updatedAt,
                      initial: {
                        legalName: row.legalName,
                        billingAddress: row.billingAddress ?? '',
                        gstin: row.gstin ?? '',
                        placeOfSupply: row.placeOfSupply ?? '',
                        description: row.lines?.[0]?.description ?? '',
                        unitAmountPaise: row.lines?.[0]?.unitAmountPaise ?? 0,
                        taxPaise: row.lines?.[0]?.taxPaise ?? 0,
                        hsnSac: row.lines?.[0]?.hsnSac ?? '',
                        dueAt: row.dueAt ? String(row.dueAt).slice(0, 10) : '',
                      },
                    })
                  }
                >
                  Edit
                </Button>
              )}
              {row.status === 'draft' && (
                <Button
                  size="sm"
                  onClick={() =>
                    onAction({
                      title: 'Issue invoice',
                      description: 'Lock this invoice and queue provider synchronization.',
                      endpoint: `/billing/invoices/${row.id}/action`,
                      confirmationExpected: row.invoiceNumber,
                      expectedUpdatedAt: row.updatedAt,
                      extras: { action: 'issue' },
                    })
                  }
                >
                  Issue
                </Button>
              )}
              {['draft', 'issued', 'failed'].includes(row.status) && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    onAction({
                      title: 'Void invoice',
                      description:
                        'Void this invoice without deleting immutable financial history.',
                      endpoint: `/billing/invoices/${row.id}/action`,
                      confirmationExpected: row.invoiceNumber,
                      expectedUpdatedAt: row.updatedAt,
                      extras: { action: 'void' },
                      destructive: true,
                    })
                  }
                >
                  Void
                </Button>
              )}
              {row.downloadAvailable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const response = await request.get(`/billing/invoices/${row.id}/download`);
                    window.open(response.data.data.url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Download
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onAction({
                    title: `Retry invoice sync`,
                    description: 'Queue an idempotent Zoho Books synchronization attempt.',
                    endpoint: `/billing/invoices/${row.id}/retry-sync`,
                    confirmationExpected: row.invoiceNumber,
                  })
                }
              >
                Retry sync
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AccessTable({ rows, kind, role, onAction }: any) {
  if (kind === 'operators')
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Operator</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>MFA</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: any) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.email}</p>
              </TableCell>
              <TableCell className="capitalize">{row.role?.replaceAll('_', ' ')}</TableCell>
              <TableCell>{statusBadge(row.status)}</TableCell>
              <TableCell>
                {row.kind === 'invitation'
                  ? `Invitation expires ${date(row.expiresAt)}`
                  : row.mfaVerifiedAt
                    ? 'Enrolled'
                    : 'Reset required'}
              </TableCell>
              <TableCell className="text-right">
                {row.kind === 'operator' && (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onAction({
                          title: 'Revoke operator sessions',
                          description: 'Revoke all current sessions and preserve the account.',
                          endpoint: `/operators/${row.id}`,
                          method: 'patch',
                          confirmationExpected: row.email,
                          expectedUpdatedAt: row.updatedAt,
                          extras: { action: 'reset_mfa' },
                          destructive: true,
                        })
                      }
                    >
                      Reset MFA
                    </Button>
                    <Button
                      size="sm"
                      variant={row.status === 'active' ? 'destructive' : 'outline'}
                      onClick={() =>
                        onAction({
                          title: `${row.status === 'active' ? 'Suspend' : 'Reactivate'} operator`,
                          description: 'Update platform access and revoke all current sessions.',
                          endpoint: `/operators/${row.id}`,
                          method: 'patch',
                          confirmationExpected: row.email,
                          expectedUpdatedAt: row.updatedAt,
                          extras: { action: row.status === 'active' ? 'suspend' : 'reactivate' },
                          destructive: row.status === 'active',
                        })
                      }
                    >
                      {row.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  if (kind === 'workspaces')
    return (
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>Workspace</TableHead>
            <TableHead>SSO policy</TableHead>
            <TableHead>Domains</TableHead>
            <TableHead>Provider credentials</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: any) => (
            <TableRow key={row.id} className="border-border">
              <TableCell>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.slug}</p>
              </TableCell>
              <TableCell>{statusBadge(row.ssoConfig?.policy ?? 'disabled')}</TableCell>
              <TableCell>
                <p>{row.domains.length} configured</p>
                <p className="text-xs text-muted-foreground">
                  {row.domains.filter((item: any) => item.status === 'active').length} active
                </p>
              </TableCell>
              <TableCell>
                <p>{row.providerCredentials.length} configured</p>
                <p className="text-xs text-muted-foreground">
                  {row.providerCredentials.filter((item: any) => item.status === 'active').length}{' '}
                  verified
                </p>
              </TableCell>
              <TableCell>{date(row.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  if (kind === 'security')
    return (
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>Event</TableHead>
            <TableHead>Workspace</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: any) => (
            <TableRow key={row.id} className="border-border">
              <TableCell>{row.eventType}</TableCell>
              <TableCell>{row.tenant?.name ?? 'Platform'}</TableCell>
              <TableCell>{statusBadge(row.severity)}</TableCell>
              <TableCell>{row.source}</TableCell>
              <TableCell>{date(row.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  if (kind === 'audit')
    return (
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>Action</TableHead>
            <TableHead>Workspace</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Chain</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: any) => (
            <TableRow key={row.id} className="border-border">
              <TableCell>{row.action}</TableCell>
              <TableCell>{row.tenant?.name ?? 'Platform'}</TableCell>
              <TableCell>{row.operator?.email ?? row.actor?.email ?? 'System'}</TableCell>
              <TableCell>{row.target ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {row.eventHash?.slice(0, 12) ?? 'unsealed'}
              </TableCell>
              <TableCell>{date(row.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Workspace</TableHead>
          <TableHead>Operator</TableHead>
          <TableHead>Ticket</TableHead>
          <TableHead>Approval</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row: any) => (
          <TableRow key={row.id} className="border-border">
            <TableCell>{row.tenant.name}</TableCell>
            <TableCell>
              {row.operator.name}
              <p className="text-xs text-muted-foreground">{row.operator.role}</p>
            </TableCell>
            <TableCell>
              {row.ticket}
              <p className="max-w-xs truncate text-xs text-muted-foreground">{row.reason}</p>
            </TableCell>
            <TableCell>
              {row.revokedAt
                ? statusBadge('revoked')
                : row.approvedAt
                  ? statusBadge('approved')
                  : statusBadge('pending')}
            </TableCell>
            <TableCell>{date(row.expiresAt)}</TableCell>
            <TableCell className="text-right">
              {!row.revokedAt && ['security', 'platform_admin'].includes(role) && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    onAction({
                      title: 'Revoke support access',
                      description: 'End this support grant before its scheduled expiry.',
                      endpoint: `/access-grants/${row.id}/revoke`,
                      confirmationExpected: row.ticket,
                      destructive: true,
                    })
                  }
                >
                  Revoke
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OperationsTable({ rows, kind, onAction }: any) {
  if (kind === 'migrations')
    return (
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>Migration</TableHead>
            <TableHead>Target version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Targets</TableHead>
            <TableHead>Started / completed</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: any) => (
            <TableRow key={row.id} className="border-border">
              <TableCell className="font-medium">{row.migrationName}</TableCell>
              <TableCell>{row.targetVersion}</TableCell>
              <TableCell>{statusBadge(row.status)}</TableCell>
              <TableCell>{row.currentStage} / 3</TableCell>
              <TableCell>
                {row._count.targets} total
                <p className="text-xs text-muted-foreground">
                  {row.targetStatusCounts.completed ?? 0} completed ·{' '}
                  {row.targetStatusCounts.failed ?? 0} failed
                </p>
              </TableCell>
              <TableCell>
                {date(row.startedAt ?? row.createdAt)}
                {row.completedAt && (
                  <p className="text-xs text-muted-foreground">{date(row.completedAt)}</p>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {row.status === 'draft' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          onAction({
                            title: 'Start migration rollout',
                            description:
                              'Start the internal canary stage for this immutable migration.',
                            endpoint: `/migration-rollouts/${row.id}/action`,
                            confirmationExpected: row.migrationName,
                            expectedUpdatedAt: row.updatedAt,
                            extras: { action: 'start' },
                          })
                        }
                      >
                        Start
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          onAction({
                            title: 'Delete migration draft',
                            description: 'Delete this draft before any rollout has started.',
                            endpoint: `/migration-rollouts/${row.id}/action`,
                            confirmationExpected: row.migrationName,
                            expectedUpdatedAt: row.updatedAt,
                            extras: { action: 'delete_draft' },
                            destructive: true,
                          })
                        }
                      >
                        Delete draft
                      </Button>
                    </>
                  )}
                  {row.status === 'running' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onAction({
                            title: 'Pause migration',
                            description: 'Pause advancement after currently running jobs settle.',
                            endpoint: `/migration-rollouts/${row.id}/action`,
                            confirmationExpected: row.migrationName,
                            expectedUpdatedAt: row.updatedAt,
                            extras: { action: 'pause' },
                          })
                        }
                      >
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          onAction({
                            title: 'Advance migration stage',
                            description: 'Advance only after all current-stage targets completed.',
                            endpoint: `/migration-rollouts/${row.id}/action`,
                            confirmationExpected: row.migrationName,
                            expectedUpdatedAt: row.updatedAt,
                            extras: { action: 'advance' },
                          })
                        }
                      >
                        Advance
                      </Button>
                    </>
                  )}
                  {['paused', 'failed'].includes(row.status) && (
                    <Button
                      size="sm"
                      onClick={() =>
                        onAction({
                          title: 'Retry migration failures',
                          description:
                            'Reset failed targets and resume the current staged rollout.',
                          endpoint: `/migration-rollouts/${row.id}/action`,
                          confirmationExpected: row.migrationName,
                          expectedUpdatedAt: row.updatedAt,
                          extras: { action: 'retry' },
                        })
                      }
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  if (kind === 'backups')
    return (
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>Workspace</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Schema</TableHead>
            <TableHead>Captured</TableHead>
            <TableHead>Restore</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: any) => (
            <TableRow key={row.id} className="border-border">
              <TableCell>{row.tenant?.name ?? 'Platform'}</TableCell>
              <TableCell>{row.kind}</TableCell>
              <TableCell>{statusBadge(row.status)}</TableCell>
              <TableCell>{bytes(row.sizeBytes)}</TableCell>
              <TableCell>{row.schemaVersion ?? 'unknown'}</TableCell>
              <TableCell>{date(row.capturedAt ?? row.createdAt)}</TableCell>
              <TableCell>{row.restoredAt ? date(row.restoredAt) : 'Not drilled'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Workspace</TableHead>
          <TableHead>Job</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Attempts</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Error</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row: any) => (
          <TableRow key={row.id} className="border-border">
            <TableCell>
              {row.tenant.name}
              <p className="text-xs text-muted-foreground">
                schema {row.tenant.schemaVersion ?? 'unknown'}
              </p>
            </TableCell>
            <TableCell className="font-mono text-xs">{row.id}</TableCell>
            <TableCell>{statusBadge(row.status)}</TableCell>
            <TableCell>{row.attemptCount}</TableCell>
            <TableCell>{date(row.startedAt ?? row.createdAt)}</TableCell>
            <TableCell className="max-w-xs truncate text-destructive">
              {row.lastError ?? '—'}
            </TableCell>
            <TableCell className="text-right">
              {row.status === 'failed' && (
                <Button
                  size="sm"
                  onClick={() =>
                    onAction({
                      title: 'Retry provisioning',
                      description:
                        'Resume this idempotent provisioning state machine from its failed step.',
                      endpoint: `/provisioning-jobs/${row.id}/action`,
                      confirmationExpected: row.tenant.slug,
                      expectedUpdatedAt: row.updatedAt,
                      extras: { action: 'retry' },
                    })
                  }
                >
                  Retry
                </Button>
              )}
              {row.status === 'pending' && !row.startedAt && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    onAction({
                      title: 'Cancel provisioning',
                      description: 'Cancel only before database creation has started.',
                      endpoint: `/provisioning-jobs/${row.id}/action`,
                      confirmationExpected: row.tenant.slug,
                      expectedUpdatedAt: row.updatedAt,
                      extras: { action: 'cancel' },
                      destructive: true,
                    })
                  }
                >
                  Cancel
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LifecycleTable({ rows, exports, onAction }: any) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border">
          <TableHead>Workspace</TableHead>
          <TableHead>Record</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>{exports ? 'Size' : 'Execute at'}</TableHead>
          <TableHead>Completed / expiry</TableHead>
          <TableHead>Error</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row: any) => (
          <TableRow key={row.id} className="border-border">
            <TableCell>{row.tenant.name}</TableCell>
            <TableCell className="font-mono text-xs">{row.id}</TableCell>
            <TableCell>{statusBadge(row.status)}</TableCell>
            <TableCell>{exports ? bytes(row.sizeBytes) : date(row.executeAt)}</TableCell>
            <TableCell>
              {date(exports ? row.expiresAt : (row.completedAt ?? row.cancelledAt))}
            </TableCell>
            <TableCell className="max-w-xs truncate text-destructive">
              {row.lastError ?? '—'}
            </TableCell>
            <TableCell className="text-right">
              {exports && ['failed', 'expired'].includes(row.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAction({
                      title: `Retry export for ${row.tenant.name}`,
                      description:
                        'Queue this export again; download remains blocked until an approved access basis exists.',
                      endpoint: `/exports/${row.id}/retry`,
                      confirmationExpected: row.tenant.slug,
                    })
                  }
                >
                  Retry export
                </Button>
              )}
              {!exports && (
                <>
                  {['requested', 'scheduled'].includes(row.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onAction({
                          title: `Cancel deletion for ${row.tenant.name}`,
                          description:
                            'Cancel deletion. Access returns only when billing is valid and no administrative hold exists.',
                          endpoint: `/workspaces/${row.tenantId}/deletion/cancel`,
                          confirmationExpected: row.tenant.slug,
                          expectedUpdatedAt: row.tenant.updatedAt,
                        })
                      }
                    >
                      Cancel deletion
                    </Button>
                  )}
                  {row.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        onAction({
                          title: `Retry deletion for ${row.tenant.name}`,
                          description:
                            'Resume the deletion lifecycle from its failed state. This never directly drops a database from the request thread.',
                          endpoint: `/deletions/${row.id}/retry`,
                          confirmationExpected: `RETRY ${row.tenant.slug}`,
                          destructive: true,
                        })
                      }
                    >
                      Retry deletion
                    </Button>
                  )}
                </>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function WorkspaceSheet({ workspace, loading, role, onClose, onAction, onEditor }: any) {
  return (
    <Sheet open={Boolean(workspace) || loading} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-border bg-background text-foreground sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{workspace?.name ?? 'Loading workspace…'}</SheetTitle>
          <SheetDescription className="text-muted-foreground">{workspace?.slug}</SheetDescription>
        </SheetHeader>
        {loading && !workspace ? (
          <Loader2 className="mt-10 h-6 w-6 animate-spin" />
        ) : (
          workspace && (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Status', workspace.status],
                  ['Plan', workspace.planCode ?? 'None'],
                  ['Schema', workspace.schemaVersion ?? 'unknown'],
                  ['Storage', bytes(workspace.storageBytes)],
                  ['Created', date(workspace.createdAt)],
                  ['Updated', date(workspace.updatedAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs uppercase text-muted-foreground">{label}</p>
                    <p className="mt-1 text-sm capitalize">{value}</p>
                  </div>
                ))}
              </div>
              {workspace.administrativeSuspensionReason && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                  <p className="font-medium text-destructive">Administrative hold</p>
                  <p className="mt-1 text-sm text-destructive">
                    {workspace.administrativeSuspensionReason}
                  </p>
                </div>
              )}
              <section>
                <h3 className="mb-2 font-medium">Domains</h3>
                <div className="space-y-2">
                  {workspace.domains?.map((domain: any) => (
                    <div
                      key={domain.id}
                      className="flex justify-between rounded border border-border bg-card p-3"
                    >
                      <span>{domain.hostname}</span>
                      <div className="flex items-center gap-2">
                        {statusBadge(domain.status)}
                        {domain.kind !== 'platform_subdomain' && domain.status !== 'revoked' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                onAction({
                                  title: 'Verify custom domain',
                                  description:
                                    'Check the published ownership record and activate managed TLS when available.',
                                  endpoint: `/workspaces/${workspace.id}/domains/${domain.id}/action`,
                                  confirmationExpected: domain.hostname,
                                  expectedUpdatedAt: domain.updatedAt,
                                  extras: { action: 'verify' },
                                })
                              }
                            >
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                onAction({
                                  title: 'Revoke custom domain',
                                  description: 'Disable routing without deleting audit history.',
                                  endpoint: `/workspaces/${workspace.id}/domains/${domain.id}/action`,
                                  confirmationExpected: domain.hostname,
                                  expectedUpdatedAt: domain.updatedAt,
                                  extras: { action: 'revoke' },
                                  destructive: true,
                                })
                              }
                            >
                              Revoke
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {!workspace.domains?.length && (
                    <p className="text-sm text-muted-foreground">No domains</p>
                  )}
                </div>
              </section>
              <section>
                <h3 className="mb-2 font-medium">Provider credentials</h3>
                <div className="space-y-2">
                  {workspace.providerCredentials?.map((credential: any) => (
                    <div
                      key={credential.id}
                      className="flex justify-between rounded border border-border bg-card p-3"
                    >
                      <span>{credential.provider}</span>
                      {statusBadge(credential.status)}
                    </div>
                  ))}
                  {!workspace.providerCredentials?.length && (
                    <p className="text-sm text-muted-foreground">
                      No customer-owned providers configured.
                    </p>
                  )}
                </div>
              </section>
              {['support', 'platform_admin'].includes(role) && (
                <section className="space-y-2 border-t border-border pt-4">
                  <h3 className="font-medium">Tenant data support access</h3>
                  <p className="text-sm text-muted-foreground">
                    Requests are read-only, expire within 30 minutes, and remain unavailable until a
                    workspace owner approves them.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      onAction({
                        title: `Request support access`,
                        description:
                          'Create an owner-approved, read-only support grant lasting at most 30 minutes.',
                        endpoint: `/workspaces/${workspace.id}/access-grants`,
                        confirmationExpected: workspace.slug,
                        extras: { minutes: 30 },
                      })
                    }
                  >
                    <LifeBuoy className="mr-2 h-4 w-4" /> Request access
                  </Button>
                  {role === 'platform_admin' && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          onEditor({
                            kind: 'add_domain',
                            title: `Add domain for ${workspace.name}`,
                            endpoint: `/workspaces/${workspace.id}/domains`,
                            confirmationExpected: workspace.slug,
                            expectedUpdatedAt: workspace.updatedAt,
                          })
                        }
                      >
                        Add domain
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          onEditor({
                            kind: 'configure_sso',
                            title: `Configure SSO for ${workspace.name}`,
                            endpoint: `/workspaces/${workspace.id}/sso`,
                            method: 'put',
                            confirmationExpected: workspace.slug,
                            expectedUpdatedAt: workspace.updatedAt,
                            initial: {
                              policy: workspace.ssoConfig?.policy ?? 'disabled',
                              connectionId: '',
                              domainsText: Array.isArray(workspace.ssoConfig?.verifiedDomains)
                                ? workspace.ssoConfig.verifiedDomains.join(', ')
                                : '',
                            },
                          })
                        }
                      >
                        Configure SSO
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          onEditor({
                            kind: 'provider_credential',
                            title: `Store provider credential`,
                            endpoint: `/workspaces/${workspace.id}/provider-credentials`,
                            confirmationExpected: workspace.slug,
                            expectedUpdatedAt: workspace.updatedAt,
                            initial: { provider: 'smtp' },
                          })
                        }
                      >
                        Add provider credential
                      </Button>
                    </div>
                  )}
                </section>
              )}
              {role === 'platform_admin' && (
                <section className="space-y-2 border-t border-border pt-4">
                  <h3 className="font-medium">Governed lifecycle actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        onEditor({
                          kind: 'edit_workspace',
                          title: `Edit ${workspace.name}`,
                          endpoint: `/workspaces/${workspace.id}`,
                          method: 'patch',
                          confirmationExpected: workspace.slug,
                          expectedUpdatedAt: workspace.updatedAt,
                          initial: {
                            name: workspace.name,
                            slug: workspace.slug,
                            country: workspace.country,
                            timezone: workspace.timezone,
                            billingAddress: workspace.billingAddress,
                            gstin: workspace.gstin ?? '',
                          },
                        })
                      }
                    >
                      Edit workspace
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        onEditor({
                          kind: 'invite_member',
                          title: `Invite member to ${workspace.name}`,
                          endpoint: `/workspaces/${workspace.id}/invitations`,
                          confirmationExpected: workspace.slug,
                          expectedUpdatedAt: workspace.updatedAt,
                          initial: { role: 'viewer' },
                        })
                      }
                    >
                      Invite member
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        onEditor({
                          kind: 'manage_trial',
                          title: `Manage ${workspace.name} trial`,
                          endpoint: `/workspaces/${workspace.id}/trial`,
                          confirmationExpected: workspace.slug,
                          expectedUpdatedAt: workspace.updatedAt,
                          initial: { action: 'extend', days: 7 },
                        })
                      }
                    >
                      Manage trial
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        onEditor({
                          kind: 'manual_subscription',
                          title: `Create Enterprise contract`,
                          endpoint: '/billing/subscriptions',
                          confirmationExpected: workspace.slug,
                          expectedUpdatedAt: workspace.updatedAt,
                          initial: {
                            tenantId: workspace.id,
                            seats: 25,
                            amountPaise: 1499900,
                            outstandingPaise: 1499900,
                            interval: 'annual',
                            status: 'active',
                            periodStart: new Date().toISOString().slice(0, 10),
                            periodEnd: new Date(Date.now() + 365 * 86400000)
                              .toISOString()
                              .slice(0, 10),
                          },
                        })
                      }
                    >
                      Enterprise contract
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        onEditor({
                          kind: 'provider_checkout',
                          title: `Create Razorpay checkout`,
                          endpoint: '/billing/checkouts',
                          confirmationExpected: workspace.slug,
                          expectedUpdatedAt: workspace.updatedAt,
                          initial: {
                            tenantId: workspace.id,
                            planCode: 'starter',
                            interval: 'monthly',
                            seats: 2,
                          },
                        })
                      }
                    >
                      Razorpay checkout
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        onEditor({
                          kind: 'create_invoice',
                          title: `Create invoice for ${workspace.name}`,
                          endpoint: '/billing/invoices',
                          confirmationExpected: workspace.slug,
                          expectedUpdatedAt: workspace.updatedAt,
                          initial: {
                            tenantId: workspace.id,
                            invoiceNumber: `MC-${new Date().getFullYear()}-`,
                            legalName: workspace.name,
                            billingAddress: workspace.billingAddress,
                            gstin: workspace.gstin ?? '',
                            description: 'MooNsConfig Enterprise subscription',
                            unitAmountPaise: 0,
                            taxPaise: 0,
                            hsnSac: '998314',
                          },
                        })
                      }
                    >
                      Create invoice
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        onAction({
                          title: 'Reset onboarding',
                          description:
                            'Return this workspace to the company profile step without deleting configuration.',
                          endpoint: `/workspaces/${workspace.id}/reset-onboarding`,
                          confirmationExpected: workspace.slug,
                          expectedUpdatedAt: workspace.updatedAt,
                        })
                      }
                    >
                      Reset onboarding
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        onAction({
                          title: 'Trigger tenant backup',
                          description: 'Queue an encrypted logical tenant backup.',
                          endpoint: `/workspaces/${workspace.id}/backups`,
                          confirmationExpected: workspace.slug,
                          expectedUpdatedAt: workspace.updatedAt,
                        })
                      }
                    >
                      Trigger backup
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        onAction({
                          title: 'Create tenant export',
                          description:
                            'Queue an encrypted export. Download still requires an approved support or legal access basis.',
                          endpoint: `/workspaces/${workspace.id}/exports`,
                          confirmationExpected: workspace.slug,
                          expectedUpdatedAt: workspace.updatedAt,
                          extras: {
                            legalBasis: 'Owner support request recorded in the referenced ticket',
                          },
                        })
                      }
                    >
                      Create export
                    </Button>
                    {workspace.administrativelySuspendedAt ? (
                      <Button
                        onClick={() =>
                          onAction({
                            title: `Reactivate ${workspace.name}`,
                            description:
                              'Remove the administrative hold. A valid trial or paid subscription is still required.',
                            endpoint: `/workspaces/${workspace.id}/reactivate`,
                            confirmationExpected: workspace.slug,
                            expectedUpdatedAt: workspace.updatedAt,
                          })
                        }
                      >
                        Reactivate
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        onClick={() =>
                          onAction({
                            title: `Suspend ${workspace.name}`,
                            description:
                              'Lock all routed access and revoke sessions without changing billing records.',
                            endpoint: `/workspaces/${workspace.id}/suspend`,
                            confirmationExpected: workspace.slug,
                            expectedUpdatedAt: workspace.updatedAt,
                            destructive: true,
                          })
                        }
                      >
                        Suspend workspace
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      onClick={() =>
                        onAction({
                          title: `Schedule deletion`,
                          description:
                            'Lock the workspace now and queue full deletion after the seven-day cancellation window.',
                          endpoint: `/workspaces/${workspace.id}/deletion`,
                          confirmationExpected: `DELETE ${workspace.slug}`,
                          expectedUpdatedAt: workspace.updatedAt,
                          destructive: true,
                        })
                      }
                    >
                      Schedule deletion
                    </Button>
                  </div>
                </section>
              )}
            </div>
          )
        )}
      </SheetContent>
    </Sheet>
  );
}
