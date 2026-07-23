// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-context';
import {
  CRM_MODULES,
  getCrmUsers,
  getRolePermissions,
  getSignedUpUsers,
  updateCrmUserBadge,
  updateCrmUserPassword,
  updateCrmUserRoles,
  updateRolePermissions,
  upsertCrmEmployee,
  updateCustomerUser,
  type CrmRole,
  type CrmUserRow,
  type CustomerUserRow,
  type RolePermissionRow,
} from '@/lib/api/auth.functions';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings2, Pencil } from 'lucide-react';
import { apiClient } from '@/api/client';

export const Route = createFileRoute('/_authenticated/settings/users')({
  component: PeopleAccessSettings,
});

const roles: CrmRole[] = [
  'admin',
  'editor',
  'approver',
  'manager',
  'sales',
  'support',
  'finance',
  'marketing',
  'operations',
  'viewer',
];

export const ROLE_LABELS: Record<CrmRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  approver: 'Approver',
  manager: 'Manager',
  sales: 'Sales',
  support: 'Support',
  finance: 'Finance',
  marketing: 'Marketing',
  operations: 'Operations',
  viewer: 'Viewer',
};

export const ROLE_TONES: Record<CrmRole, string> = {
  admin: 'border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  editor: 'border-sky-400/60 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  approver: 'border-violet-400/60 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  manager: 'border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  sales: 'border-emerald-400/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  support: 'border-cyan-400/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  finance: 'border-teal-400/60 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  marketing: 'border-pink-400/60 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  operations: 'border-indigo-400/60 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  viewer: 'border-muted bg-muted/45 text-muted-foreground',
};

const travelBadges = [
  { key: 'passport_elite', label: 'Passport Elite', tone: 'from-sky-500 to-indigo-600' },
  { key: 'route_architect', label: 'Route Architect', tone: 'from-emerald-500 to-teal-700' },
  { key: 'luxury_curator', label: 'Luxury Curator', tone: 'from-amber-400 to-rose-600' },
  { key: 'summit_support', label: 'Summit Support', tone: 'from-slate-500 to-cyan-700' },
  { key: 'island_closer', label: 'Island Closer', tone: 'from-fuchsia-500 to-orange-500' },
  { key: 'global_nomad', label: 'Global Nomad', tone: 'from-purple-500 to-pink-600' },
  { key: 'culture_voyager', label: 'Culture Voyager', tone: 'from-yellow-400 to-red-500' },
  { key: 'code_captain', label: 'Code Captain', tone: 'from-blue-600 to-cyan-400' },
  { key: 'system_architect', label: 'System Architect', tone: 'from-zinc-600 to-zinc-900' },
  { key: 'pixel_pioneer', label: 'Pixel Pioneer', tone: 'from-violet-600 to-fuchsia-400' },
];

function TravelBadgeSvg({ badgeKey, size = 42 }: { badgeKey?: string | null; size?: number }) {
  const badge = travelBadges.find((item) => item.key === badgeKey) || travelBadges[0];
  const label = badge.label.split(' ');
  const initials = label
    .map((part) => part[0])
    .join('')
    .slice(0, 2);
  return (
    <div
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${badge.tone} p-[2px] shadow-lg shadow-black/15`}
      title={badge.label}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label={badge.label}
        className="rounded-full"
      >
        <defs>
          <radialGradient id={`shine-${badge.key}`} cx="28%" cy="18%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <stop offset="45%" stopColor="white" stopOpacity="0.18" />
            <stop offset="100%" stopColor="black" stopOpacity="0.16" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="31" fill={`url(#shine-${badge.key})`} opacity="0.92" />
        <circle
          cx="32"
          cy="32"
          r="25"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="2"
        />
        <path
          d="M18 37c8-13 18-18 30-20-5 8-9 17-10 29-3-6-7-9-12-9l-8 8 3-8h-3Z"
          fill="white"
          opacity="0.9"
        />
        <path
          d="M22 18h20M20 46h24"
          stroke="white"
          strokeOpacity="0.7"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text
          x="32"
          y="34"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fill="#102033"
          opacity="0.78"
        >
          {initials}
        </text>
      </svg>
    </div>
  );
}

function RolePillSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: CrmRole[];
  onChange: (roles: CrmRole[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {roles.map((role) => {
        const selected = value.includes(role);
        const next = selected ? value.filter((item) => item !== role) : [...value, role];
        return (
          <button
            key={role}
            type="button"
            disabled={disabled}
            onClick={() => onChange(next)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-all ${
              selected
                ? `${ROLE_TONES[role]} shadow-sm ring-1 ring-current/20`
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <span className="mr-1">{selected ? 'On' : '+'}</span>
            {ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}

function BadgePicker({
  value,
  onChange,
  compact = false,
}: {
  value?: string | null;
  onChange: (badgeKey: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'md:grid-cols-5'}`}>
      {travelBadges.map((badge) => {
        const selected = (value || 'passport_elite') === badge.key;
        return (
          <button
            key={badge.key}
            type="button"
            onClick={() => onChange(badge.key)}
            className={`flex items-center gap-3 rounded-md border bg-background p-3 text-left transition-all ${
              selected
                ? 'border-primary shadow-md ring-2 ring-primary/15'
                : 'hover:border-primary/40 hover:bg-muted/40'
            } ${compact ? 'min-w-64' : ''}`}
          >
            <TravelBadgeSvg badgeKey={badge.key} size={compact ? 34 : 46} />
            <div className="min-w-0">
              <div className="text-sm font-semibold">{badge.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {selected ? 'Selected badge' : 'Travel profile badge'}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PermissionSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
        checked ? 'border-primary bg-primary shadow-sm' : 'border-border bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:ring-2 hover:ring-primary/15'}`}
      aria-pressed={checked}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

function CustomerRow({
  customer,
  sessionToken,
  onUpdate,
}: {
  customer: CustomerUserRow;
  sessionToken: string;
  onUpdate: () => void;
}) {
  const [form, setForm] = useState({
    name: customer.name,
    email: customer.email,
    phone: customer.phone || '',
  });
  async function handleSave() {
    try {
      await updateCustomerUser({
        data: {
          sessionToken,
          id: customer.id,
          name: form.name,
          email: form.email,
          phone: form.phone,
        },
      });
      toast.success('User updated');
      onUpdate();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update user');
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {customer.name}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
              >
                <Pencil size={12} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[300px]">
              <div className="space-y-3">
                <h4 className="font-medium leading-none">Edit User</h4>
                <Input
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <Input
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
                <Input
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <Button size="sm" onClick={handleSave} className="w-full">
                  Save Changes
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </TableCell>
      <TableCell>{customer.email}</TableCell>
      <TableCell>{customer.phone || '-'}</TableCell>
      <TableCell>{customer.oauth_provider || 'email'}</TableCell>
      <TableCell>{customer.points_balance}</TableCell>
      <TableCell>{new Date(customer.created_at).toLocaleString('en-IN')}</TableCell>
    </TableRow>
  );
}

function EmployeeEditPopover({
  employee,
  sessionToken,
  onUpdate,
}: {
  employee: CrmUserRow;
  sessionToken: string;
  onUpdate: () => void;
}) {
  const [form, setForm] = useState({
    name: employee.name || '',
    email: employee.email,
    mobile: employee.mobile || '',
  });
  async function handleSave() {
    try {
      await upsertCrmEmployee({
        data: {
          sessionToken,
          id: employee.id,
          name: form.name,
          email: form.email,
          mobile: form.mobile,
          role: employee.role,
          roles: employee.roles?.length ? employee.roles : [employee.role],
          badgeKey: employee.badge_key || 'passport_elite',
        },
      });
      toast.success('Employee updated');
      onUpdate();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update employee');
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
        >
          <Pencil size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px]">
        <div className="space-y-3">
          <h4 className="font-medium leading-none">Edit Employee</h4>
          <Input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            placeholder="Mobile"
            value={form.mobile}
            onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
          />
          <Button size="sm" onClick={handleSave} className="w-full">
            Save Changes
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const emptyEmployee = {
  name: '',
  email: '',
  mobile: '',
  roles: ['sales'] as CrmRole[],
  password: '',
  badgeKey: 'passport_elite',
};

function PeopleAccessSettings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'employees' | 'customers' | 'permissions' | 'badges'>(
    'employees',
  );
  const [employees, setEmployees] = useState<CrmUserRow[]>([]);
  const [customers, setCustomers] = useState<CustomerUserRow[]>([]);
  const [permissions, setPermissions] = useState<RolePermissionRow[]>([]);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const sessionToken = user?.session_token || '';
  const isAdmin = Boolean(user?.roles?.includes('admin') || user?.role === 'admin');
  const isCommercialWorkspace = Boolean(user?.platformUserId);

  useEffect(() => {
    if (!isAdmin) return;
    loadAll(true);
  }, [user?.session_token, isAdmin]);

  async function loadAll(showLoading = false) {
    try {
      if (showLoading) setLoading(true);
      const [staffRows, customerRows, permissionRows] = await Promise.all([
        getCrmUsers({ data: { sessionToken } }),
        getSignedUpUsers({ data: { sessionToken } }),
        getRolePermissions({ data: { sessionToken } }),
      ]);
      setEmployees(staffRows);
      setCustomers(customerRows);
      setPermissions(permissionRows);
    } catch (err) {
      toast.error('Failed to load people and access data');
    } finally {
      setLoading(false);
    }
  }

  const permissionMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const role of roles) map[role] = new Set();
    permissions.forEach((row) => {
      if (row.can_access) map[row.role]?.add(row.module_key);
    });
    return map;
  }, [permissions]);
  const permissionGroups = useMemo(
    () =>
      CRM_MODULES.reduce(
        (groups, module) => {
          const group = module.group || 'Other';
          (groups[group] ||= []).push(module);
          return groups;
        },
        {} as Record<string, Array<(typeof CRM_MODULES)[number]>>,
      ),
    [],
  );

  async function saveEmployee() {
    if (!employeeForm.name || !employeeForm.email) {
      toast.error('Name and email are required');
      return;
    }
    if (employeeForm.roles.length === 0) {
      toast.error('Select at least one role');
      return;
    }

    const isNewUser = !employees.find(
      (e) => e.email.toLowerCase() === employeeForm.email.toLowerCase(),
    );
    if (
      !isCommercialWorkspace &&
      isNewUser &&
      (!employeeForm.password || employeeForm.password.length < 8)
    ) {
      toast.error('A password of at least 8 characters is required for new employees.');
      return;
    }
    if (employeeForm.password && employeeForm.password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }

    try {
      if (isCommercialWorkspace && isNewUser) {
        await apiClient.post('/tenants/invitations', {
          email: employeeForm.email,
          role: employeeForm.roles.includes('admin') ? 'admin' : employeeForm.roles[0],
        });
        toast.success('Invitation sent');
        setEmployeeForm(emptyEmployee);
        return;
      }
      await upsertCrmEmployee({
        data: {
          sessionToken,
          ...employeeForm,
          role: employeeForm.roles.includes('admin') ? 'admin' : employeeForm.roles[0],
          roles: employeeForm.roles,
          password: employeeForm.password || undefined,
        },
      });
      toast.success('Employee saved');
      setEmployeeForm(emptyEmployee);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save employee');
    }
  }

  async function changeRoles(userId: number, nextRoles: CrmRole[]) {
    if (nextRoles.length === 0) {
      toast.error('Select at least one role');
      return;
    }
    try {
      await updateCrmUserRoles({ data: { sessionToken, userId, roles: nextRoles } });
      toast.success('Roles updated');
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update roles');
    }
  }

  async function changePassword(userId: number) {
    const password = passwords[userId]?.trim();
    if (!password) {
      toast.error('Enter a new password');
      return;
    }
    try {
      await updateCrmUserPassword({ data: { sessionToken, userId, password } });
      toast.success('Password changed');
      setPasswords((current) => ({ ...current, [userId]: '' }));
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    }
  }

  async function changeBadge(userId: number, badgeKey: string) {
    try {
      await updateCrmUserBadge({ data: { sessionToken, userId, badgeKey } });
      toast.success('Badge updated');
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update badge');
    }
  }

  async function togglePermission(role: CrmRole, moduleKey: string) {
    const next = new Set(permissionMap[role] || []);
    if (next.has(moduleKey)) next.delete(moduleKey);
    else next.add(moduleKey);
    try {
      await updateRolePermissions({ data: { sessionToken, role, modules: Array.from(next) } });
      toast.success('Permissions updated');
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update permissions');
    }
  }

  if (!isAdmin) {
    return <div className="p-8 text-center text-muted-foreground">Access denied. Admin only.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div />
        <Badge variant="outline">
          {employees.length} employees | {customers.length} signed-up users
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ['employees', 'Employees'],
          ['customers', 'Signed-up Users'],
          ['permissions', 'Role Permissions'],
          ['badges', 'Travel Badges'],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={activeTab === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(key as any)}
          >
            {label}
          </Button>
        ))}
      </div>

      {activeTab === 'employees' && (
        <div className="space-y-4">
          <div className="rounded-md border bg-background p-4">
            <h3 className="mb-3 font-semibold">Employee Onboarding</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="Name"
                value={employeeForm.name}
                onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
              />
              <Input
                placeholder="Email"
                value={employeeForm.email}
                onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
              />
              <Input
                placeholder="Mobile"
                value={employeeForm.mobile}
                onChange={(e) => setEmployeeForm({ ...employeeForm, mobile: e.target.value })}
              />
              <div className="rounded-md border bg-background/80 px-4 py-3 md:col-span-2">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Access Roles
                </div>
                <RolePillSelector
                  value={employeeForm.roles}
                  onChange={(nextRoles) => setEmployeeForm({ ...employeeForm, roles: nextRoles })}
                />
              </div>
              <div className="rounded-md border bg-background/80 px-4 py-3 md:col-span-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Profile Badge
                </div>
                <BadgePicker
                  value={employeeForm.badgeKey}
                  onChange={(badgeKey) => setEmployeeForm({ ...employeeForm, badgeKey })}
                />
              </div>
              {!isCommercialWorkspace && (
                <Input
                  className="md:col-span-3"
                  placeholder="Initial password"
                  value={employeeForm.password}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                />
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={saveEmployee}>
                {isCommercialWorkspace ? 'Send Invitation' : 'Create Employee'}
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Badge</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Admin Password Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TravelBadgeSvg badgeKey={employee.badge_key} />
                          <div className="grid gap-1">
                            <div className="text-xs font-semibold">
                              {travelBadges.find((badge) => badge.key === employee.badge_key)
                                ?.label || 'Passport Elite'}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {travelBadges.map((badge) => (
                                <button
                                  key={badge.key}
                                  type="button"
                                  onClick={() => changeBadge(employee.id, badge.key)}
                                  className={`h-2.5 w-6 rounded-full bg-gradient-to-r ${badge.tone} ${
                                    (employee.badge_key || 'passport_elite') === badge.key
                                      ? 'ring-2 ring-primary/40'
                                      : 'opacity-45 hover:opacity-100'
                                  }`}
                                  title={badge.label}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center justify-between gap-2">
                          <span>{employee.name || '-'}</span>
                          <EmployeeEditPopover
                            employee={employee}
                            sessionToken={sessionToken}
                            onUpdate={loadAll}
                          />
                        </div>
                      </TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>{employee.mobile || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <div className="flex flex-wrap gap-1 max-w-[240px]">
                            {(employee.roles?.length ? employee.roles : [employee.role]).map(
                              (r) => (
                                <span
                                  key={r}
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ROLE_TONES[r]}`}
                                >
                                  {ROLE_LABELS[r]}
                                </span>
                              ),
                            )}
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                disabled={employee.id === user?.id}
                              >
                                <Settings2 size={14} />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-[360px]">
                              <div className="mb-3 space-y-1">
                                <h4 className="text-sm font-medium leading-none">Edit Roles</h4>
                                <p className="text-xs text-muted-foreground">
                                  Modify access roles for {employee.name || employee.email}.
                                </p>
                              </div>
                              <RolePillSelector
                                compact
                                disabled={employee.id === user?.id}
                                value={employee.roles?.length ? employee.roles : [employee.role]}
                                onChange={(nextRoles) => changeRoles(employee.id, nextRoles)}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Input
                            className=""
                            type="password"
                            placeholder="New password"
                            value={passwords[employee.id] || ''}
                            onChange={(e) =>
                              setPasswords((current) => ({
                                ...current,
                                [employee.id]: e.target.value,
                              }))
                            }
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => changePassword(employee.id)}
                          >
                            Change
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Signed Up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <CustomerRow
                  key={customer.id}
                  customer={customer}
                  sessionToken={sessionToken}
                  onUpdate={loadAll}
                />
              ))}
              {!loading && customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No signed-up users yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="rounded-md border bg-background p-4">
          <h3 className="mb-3 font-semibold">Module Permissions by Role</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Module</th>
                  {roles.map((role) => (
                    <th key={role} className="p-2 text-center capitalize">
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(permissionGroups).map(([group, modules]) => (
                  <Fragment key={group}>
                    <tr className="border-b bg-muted/50">
                      <td
                        colSpan={roles.length + 1}
                        className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {group}
                      </td>
                    </tr>
                    {modules.map((module) => (
                      <tr key={module.key} className="border-b last:border-0">
                        <td className="p-2 pl-4 font-medium">{module.label}</td>
                        {roles.map((role) => (
                          <td key={role} className="p-2 text-center">
                            <PermissionSwitch
                              checked={permissionMap[role]?.has(module.key) || false}
                              disabled={role === 'admin' && module.key === 'users'}
                              onChange={() => togglePermission(role, module.key)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'badges' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {travelBadges.map((badge) => (
            <div key={badge.key} className="rounded-md border bg-background p-5 text-center">
              <TravelBadgeSvg badgeKey={badge.key} size={72} />
              <h3 className="mt-3 font-semibold">{badge.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Premium travel profile badge shown in the sidebar while the employee is logged in.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
