// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useEffect, useMemo, useState } from 'react';
import { Shield, Download, Plus, RotateCw, Unlock, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from '@/lib/toast';

import {
  adminAllowlistIp,
  adminBlockIp,
  adminExtendIpBlock,
  adminGetSecurityOverview,
  adminRemoveAllowlistedIp,
  adminSaveSecuritySettings,
  adminUnblockIp,
} from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_authenticated/settings/security')({
  component: SecurityCenter,
});

type SecuritySettings = {
  f12TrapBlockEnabled: boolean;
  honeypotBlockEnabled: boolean;
  botUaBlockEnabled: boolean;
  spoofedBrowserBlockEnabled: boolean;
  rateLimitBlockEnabled: boolean;
  sourceMapBlockingEnabled: boolean;
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  blockDurationHours: number;
};

const defaultSettings: SecuritySettings = {
  f12TrapBlockEnabled: true,
  honeypotBlockEnabled: true,
  botUaBlockEnabled: true,
  spoofedBrowserBlockEnabled: true,
  rateLimitBlockEnabled: true,
  sourceMapBlockingEnabled: true,
  rateLimitMaxRequests: 120,
  rateLimitWindowSeconds: 10,
  blockDurationHours: 24,
};

const toggleRows: Array<{ key: keyof SecuritySettings; label: string }> = [
  { key: 'f12TrapBlockEnabled', label: 'F12 trap block' },
  { key: 'honeypotBlockEnabled', label: 'Honeypot block' },
  { key: 'botUaBlockEnabled', label: 'Bot user-agent block' },
  { key: 'spoofedBrowserBlockEnabled', label: 'Spoofed browser block' },
  { key: 'rateLimitBlockEnabled', label: 'Rate-limit block' },
  { key: 'sourceMapBlockingEnabled', label: 'Source-map/probe block' },
];

function authPayload(user: any) {
  return { email: user?.email || '', sessionToken: user?.session_token || '' };
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10">Active</Badge>
  ) : (
    <Badge variant="outline">Inactive</Badge>
  );
}

function SecurityCenter() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [allowlist, setAllowlist] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [settings, setSettings] = useState<SecuritySettings>(defaultSettings);
  const [blockForm, setBlockForm] = useState({ ip: '', reason: '', durationHours: 24 });
  const [allowForm, setAllowForm] = useState({ ip: '', label: '', notes: '' });
  const isAdmin = Boolean(user?.roles?.includes('admin') || user?.role === 'admin');
  const auth = useMemo(() => authPayload(user), [user]);

  const load = async () => {
    if (!user?.session_token || !isAdmin) return;
    setLoading(true);
    try {
      const overview = await adminGetSecurityOverview({ data: { auth } });
      setSettings({ ...defaultSettings, ...(overview as any).settings });
      setBlocks((overview as any).blocks || []);
      setAllowlist((overview as any).allowlist || []);
      setEvents((overview as any).events || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load Security Center');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.session_token, isAdmin]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await adminSaveSecuritySettings({ data: { auth, settings } });
      toast.success('Security settings saved');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const blockIp = async () => {
    if (!blockForm.ip || !blockForm.reason) return toast.error('Enter IP/CIDR and reason');
    await adminBlockIp({ data: { auth, ...blockForm } });
    toast.success('IP blocked');
    setBlockForm({ ip: '', reason: '', durationHours: settings.blockDurationHours });
    await load();
  };

  const allowIp = async () => {
    if (!allowForm.ip || !allowForm.label) return toast.error('Enter IP/CIDR and label');
    await adminAllowlistIp({ data: { auth, ...allowForm } });
    toast.success('IP allowlisted');
    setAllowForm({ ip: '', label: '', notes: '' });
    await load();
  };

  const exportCsv = () => {
    const rows = [
      ['type', 'ip', 'reason_or_label', 'source', 'active', 'last_seen'],
      ...blocks.map((row) => [
        'block',
        row.ip_cidr,
        row.reason,
        row.source,
        row.active ? 'yes' : 'no',
        row.last_seen_at || row.blocked_at,
      ]),
      ...allowlist.map((row) => [
        'allowlist',
        row.ip_cidr,
        row.label,
        '',
        row.active ? 'yes' : 'no',
        row.created_at,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `security-center-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Security Center access requires admin role.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Security Center</h1>
          <p className="text-sm text-muted-foreground">
            Manage blocking, allowlists, hardening rules, and security events.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RotateCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Hardening Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {toggleRows.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <Label className="text-sm">{item.label}</Label>
                  <Switch
                    checked={Boolean(settings[item.key])}
                    onCheckedChange={(checked) =>
                      setSettings((prev) => ({ ...prev, [item.key]: checked }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Max requests</Label>
                <Input
                  type="number"
                  value={settings.rateLimitMaxRequests}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      rateLimitMaxRequests: Number(e.target.value) || 1,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Window seconds</Label>
                <Input
                  type="number"
                  value={settings.rateLimitWindowSeconds}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      rateLimitWindowSeconds: Number(e.target.value) || 1,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Block hours</Label>
                <Input
                  type="number"
                  value={settings.blockDurationHours}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, blockDurationHours: Number(e.target.value) || 1 }))
                  }
                />
              </div>
            </div>
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save settings'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="space-y-3">
              <Label>Block IP/CIDR</Label>
              <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
                <Input
                  placeholder="203.0.113.10 or 203.0.113.0/24"
                  value={blockForm.ip}
                  onChange={(e) => setBlockForm((p) => ({ ...p, ip: e.target.value }))}
                />
                <Input
                  type="number"
                  value={blockForm.durationHours}
                  onChange={(e) =>
                    setBlockForm((p) => ({
                      ...p,
                      durationHours: Number(e.target.value) || settings.blockDurationHours,
                    }))
                  }
                />
              </div>
              <Textarea
                placeholder="Reason"
                value={blockForm.reason}
                onChange={(e) => setBlockForm((p) => ({ ...p, reason: e.target.value }))}
              />
              <Button size="sm" onClick={blockIp}>
                <Plus className="mr-2 h-4 w-4" />
                Block
              </Button>
            </div>
            <div className="space-y-3 border-t pt-5">
              <Label>Allowlist IP/CIDR</Label>
              <Input
                placeholder="IP or CIDR"
                value={allowForm.ip}
                onChange={(e) => setAllowForm((p) => ({ ...p, ip: e.target.value }))}
              />
              <Input
                placeholder="Label"
                value={allowForm.label}
                onChange={(e) => setAllowForm((p) => ({ ...p, label: e.target.value }))}
              />
              <Textarea
                placeholder="Notes"
                value={allowForm.notes}
                onChange={(e) => setAllowForm((p) => ({ ...p, notes: e.target.value }))}
              />
              <Button size="sm" onClick={allowIp}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Allowlist
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocked IPs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP/CIDR</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocks.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.ip_cidr}</TableCell>
                  <TableCell className="truncate">{row.reason}</TableCell>
                  <TableCell>{row.source}</TableCell>
                  <TableCell>{row.request_count}</TableCell>
                  <TableCell>{formatDate(row.last_seen_at || row.blocked_at)}</TableCell>
                  <TableCell>{formatDate(row.expires_at)}</TableCell>
                  <TableCell>
                    <StatusBadge active={Boolean(row.active)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await adminExtendIpBlock({
                            data: {
                              auth,
                              ip: row.ip_cidr,
                              durationHours: settings.blockDurationHours,
                            },
                          });
                          await load();
                        }}
                      >
                        Extend
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await adminAllowlistIp({
                            data: {
                              auth,
                              ip: row.ip_cidr,
                              label: 'Converted from block',
                              notes: row.reason,
                            },
                          });
                          await load();
                        }}
                      >
                        Allowlist
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await adminUnblockIp({ data: { auth, ip: row.ip_cidr } });
                          await load();
                        }}
                      >
                        <Unlock className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && blocks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No blocked IPs.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allowlist</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP/CIDR</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allowlist.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.ip_cidr}</TableCell>
                    <TableCell>{row.label}</TableCell>
                    <TableCell>
                      <StatusBadge active={Boolean(row.active)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await adminRemoveAllowlistedIp({ data: { auth, ip: row.ip_cidr } });
                          await load();
                        }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && allowlist.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No allowlisted IPs.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Security Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs">{formatDate(row.created_at)}</TableCell>
                      <TableCell>{row.event_type}</TableCell>
                      <TableCell className="font-mono text-xs">{row.ip_address || '-'}</TableCell>
                      <TableCell>{row.source}</TableCell>
                    </TableRow>
                  ))}
                  {!loading && events.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        No events yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
