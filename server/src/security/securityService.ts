import { prisma } from '../config/prisma.js';
import { renderBlockedPage } from '../legacy/blocked-page.js';

export type SecuritySettings = {
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

export type SecurityPolicy = SecuritySettings & {
  blockedIps: string[];
  allowlistedIps: string[];
};

export type SecurityEventSource =
  | 'f12_trap'
  | 'honeypot'
  | 'bot_ua'
  | 'spoofed_browser'
  | 'rate_limit'
  | 'manual'
  | 'allowlist'
  | 'system';

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
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

let securityTablesEnsured = false;

function parseBoolean(value: string | null | undefined, fallback: boolean) {
  if (value == null) return fallback;
  return value === 'true' || value === '1';
}

function parseNumber(value: string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getClientIp(request: Request): string {
  const headers = request.headers;
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return '127.0.0.1';
}

export function isLoopbackIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1' ||
    normalized === 'localhost'
  );
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const byte = Number(part);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null;
    value = (value << 8) + byte;
  }
  return value >>> 0;
}

export function matchesIpRule(ip: string, rule: string): boolean {
  const normalizedIp = ip.trim();
  const normalizedRule = rule.trim();
  if (!normalizedIp || !normalizedRule) return false;
  if (normalizedIp === normalizedRule) return true;
  if (!normalizedRule.includes('/')) return false;

  const [network, prefixRaw] = normalizedRule.split('/');
  const prefix = Number(prefixRaw);
  const ipNum = ipv4ToNumber(normalizedIp);
  const networkNum = ipv4ToNumber(network || '');
  if (
    ipNum == null ||
    networkNum == null ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  ) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (networkNum & mask);
}

export function isLocalDevRequest(request: Request, url: URL, ip: string): boolean {
  if (isLoopbackIp(ip)) return true;
  if (process.env.NODE_ENV === 'production') return false;

  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1'
  );
}

export async function ensureSecurityTables() {
  if (securityTablesEnsured) return;
  const legacyBlocks = await prisma.blocked_ips.findMany();
  await prisma.$transaction([
    ...Object.entries(DEFAULT_SECURITY_SETTINGS).map(([setting_key, value]) =>
      prisma.security_settings.upsert({
        where: { setting_key },
        create: {
          setting_key,
          setting_value: String(value),
          updated_by: 'system',
        },
        update: {},
      }),
    ),
    ...legacyBlocks.map((block) =>
      prisma.security_ip_blocks.upsert({
        where: { ip_cidr: block.ip_address },
        create: {
          ip_cidr: block.ip_address,
          reason: block.reason || 'Legacy blocked IP',
          source: 'legacy',
          user_agent: block.user_agent,
          request_count: block.request_count ?? 1,
          blocked_at: block.first_blocked_at,
          last_seen_at: block.last_request_at,
          active: true,
        },
        update: {},
      }),
    ),
  ]);
  securityTablesEnsured = true;
}

export async function getSecuritySettings(): Promise<SecuritySettings> {
  await ensureSecurityTables();
  const rows = await prisma.security_settings.findMany({
    select: { setting_key: true, setting_value: true },
  });
  const map = new Map(rows.map((row) => [row.setting_key, String(row.setting_value)]));
  return {
    f12TrapBlockEnabled: parseBoolean(
      map.get('f12TrapBlockEnabled'),
      DEFAULT_SECURITY_SETTINGS.f12TrapBlockEnabled,
    ),
    honeypotBlockEnabled: parseBoolean(
      map.get('honeypotBlockEnabled'),
      DEFAULT_SECURITY_SETTINGS.honeypotBlockEnabled,
    ),
    botUaBlockEnabled: parseBoolean(
      map.get('botUaBlockEnabled'),
      DEFAULT_SECURITY_SETTINGS.botUaBlockEnabled,
    ),
    spoofedBrowserBlockEnabled: parseBoolean(
      map.get('spoofedBrowserBlockEnabled'),
      DEFAULT_SECURITY_SETTINGS.spoofedBrowserBlockEnabled,
    ),
    rateLimitBlockEnabled: parseBoolean(
      map.get('rateLimitBlockEnabled'),
      DEFAULT_SECURITY_SETTINGS.rateLimitBlockEnabled,
    ),
    sourceMapBlockingEnabled: parseBoolean(
      map.get('sourceMapBlockingEnabled'),
      DEFAULT_SECURITY_SETTINGS.sourceMapBlockingEnabled,
    ),
    rateLimitMaxRequests: parseNumber(
      map.get('rateLimitMaxRequests'),
      DEFAULT_SECURITY_SETTINGS.rateLimitMaxRequests,
    ),
    rateLimitWindowSeconds: parseNumber(
      map.get('rateLimitWindowSeconds'),
      DEFAULT_SECURITY_SETTINGS.rateLimitWindowSeconds,
    ),
    blockDurationHours: parseNumber(
      map.get('blockDurationHours'),
      DEFAULT_SECURITY_SETTINGS.blockDurationHours,
    ),
  };
}

export async function saveSecuritySettings(settings: SecuritySettings, updatedBy: string) {
  await ensureSecurityTables();
  await prisma.$transaction(
    Object.entries(settings).map(([setting_key, value]) =>
      prisma.security_settings.upsert({
        where: { setting_key },
        create: { setting_key, setting_value: String(value), updated_by: updatedBy },
        update: { setting_value: String(value), updated_by: updatedBy },
      }),
    ),
  );
  await recordSecurityEvent({
    eventType: 'settings_update',
    source: 'manual',
    reason: 'Security settings updated',
    createdBy: updatedBy,
    metadata: settings,
  });
}

export async function recordSecurityEvent(event: {
  eventType: string;
  source: SecurityEventSource | string;
  ipAddress?: string | null;
  reason?: string | null;
  userAgent?: string | null;
  path?: string | null;
  metadata?: unknown;
  createdBy?: string | null;
}) {
  await ensureSecurityTables();
  await prisma.security_events.create({
    data: {
      event_type: event.eventType,
      ip_address: event.ipAddress || null,
      source: event.source,
      reason: event.reason || null,
      user_agent: event.userAgent || null,
      path: event.path || null,
      metadata: event.metadata === undefined ? null : JSON.stringify(event.metadata),
      created_by: event.createdBy || null,
    },
  });
}

export async function isIpAllowlisted(ip: string): Promise<boolean> {
  if (isLoopbackIp(ip)) return true;
  await ensureSecurityTables();
  const envAllowlist = (process.env.SECURITY_ALLOWLIST_IPS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (envAllowlist.some((rule) => matchesIpRule(ip, rule))) return true;
  const rows = await prisma.security_ip_allowlist.findMany({
    where: { active: true },
    select: { ip_cidr: true },
  });
  return rows.some((row) => matchesIpRule(ip, row.ip_cidr));
}

export async function findActiveIpBlock(ip: string): Promise<any | null> {
  await ensureSecurityTables();
  const rows = await prisma.security_ip_blocks.findMany({
    where: {
      active: true,
      OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
    },
    orderBy: { blocked_at: 'desc' },
  });
  return rows.find((row) => matchesIpRule(ip, row.ip_cidr)) || null;
}

export async function blockIpAddress(input: {
  ip: string;
  reason: string;
  source: SecurityEventSource | string;
  userAgent?: string | null;
  blockedBy?: string | null;
  durationHours?: number | null;
  path?: string | null;
}) {
  await ensureSecurityTables();
  if (await isIpAllowlisted(input.ip)) {
    await recordSecurityEvent({
      eventType: 'block_skipped_allowlisted',
      ipAddress: input.ip,
      source: input.source,
      reason: input.reason,
      userAgent: input.userAgent,
      path: input.path,
      createdBy: input.blockedBy,
    });
    return;
  }
  const settings = await getSecuritySettings();
  const durationHours = input.durationHours ?? settings.blockDurationHours;
  const now = new Date();
  const expires_at = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.security_ip_blocks.upsert({
      where: { ip_cidr: input.ip },
      create: {
        ip_cidr: input.ip,
        reason: input.reason,
        source: input.source,
        user_agent: input.userAgent || null,
        request_count: 1,
        blocked_by: input.blockedBy || null,
        last_seen_at: now,
        expires_at,
        active: true,
      },
      update: {
        reason: input.reason,
        source: input.source,
        user_agent: input.userAgent || null,
        request_count: { increment: 1 },
        blocked_by: input.blockedBy || null,
        last_seen_at: now,
        expires_at,
        active: true,
      },
    }),
    prisma.blocked_ips.upsert({
      where: { ip_address: input.ip },
      create: {
        ip_address: input.ip,
        reason: input.reason.slice(0, 255),
        user_agent: input.userAgent || null,
        request_count: 1,
        last_request_at: now,
      },
      update: {
        reason: input.reason.slice(0, 255),
        user_agent: input.userAgent || null,
        request_count: { increment: 1 },
        last_request_at: now,
      },
    }),
  ]);
  await recordSecurityEvent({
    eventType: 'ip_blocked',
    ipAddress: input.ip,
    source: input.source,
    reason: input.reason,
    userAgent: input.userAgent,
    path: input.path,
    createdBy: input.blockedBy,
  });
}

export async function unblockIp(ip: string, createdBy: string) {
  await ensureSecurityTables();
  await prisma.$transaction([
    prisma.security_ip_blocks.updateMany({
      where: { ip_cidr: ip },
      data: { active: false },
    }),
    prisma.blocked_ips.deleteMany({ where: { ip_address: ip } }),
  ]);
  await recordSecurityEvent({
    eventType: 'ip_unblocked',
    ipAddress: ip,
    source: 'manual',
    reason: 'IP unblocked',
    createdBy,
  });
}

export async function allowlistIp(input: {
  ip: string;
  label: string;
  notes?: string | null;
  createdBy: string;
}) {
  await ensureSecurityTables();
  await prisma.$transaction([
    prisma.security_ip_allowlist.upsert({
      where: { ip_cidr: input.ip },
      create: {
        ip_cidr: input.ip,
        label: input.label,
        notes: input.notes || null,
        created_by: input.createdBy,
        active: true,
      },
      update: {
        label: input.label,
        notes: input.notes || null,
        created_by: input.createdBy,
        active: true,
      },
    }),
    prisma.security_ip_blocks.updateMany({
      where: { ip_cidr: input.ip },
      data: { active: false },
    }),
    prisma.blocked_ips.deleteMany({ where: { ip_address: input.ip } }),
  ]);
  await recordSecurityEvent({
    eventType: 'ip_allowlisted',
    ipAddress: input.ip,
    source: 'allowlist',
    reason: input.label,
    createdBy: input.createdBy,
  });
}

export async function removeAllowlistedIp(ip: string, createdBy: string) {
  await ensureSecurityTables();
  await prisma.security_ip_allowlist.updateMany({
    where: { ip_cidr: ip },
    data: { active: false },
  });
  await recordSecurityEvent({
    eventType: 'ip_allowlist_removed',
    ipAddress: ip,
    source: 'allowlist',
    reason: 'Allowlist entry removed',
    createdBy,
  });
}

export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  await ensureSecurityTables();
  const settings = await getSecuritySettings();
  const [blockRows, allowRows] = await Promise.all([
    prisma.security_ip_blocks.findMany({
      where: {
        active: true,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
      select: { ip_cidr: true },
    }),
    prisma.security_ip_allowlist.findMany({
      where: { active: true },
      select: { ip_cidr: true },
    }),
  ]);
  const envAllowlist = (process.env.SECURITY_ALLOWLIST_IPS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    ...settings,
    blockedIps: blockRows.map((row) => row.ip_cidr),
    allowlistedIps: [...envAllowlist, ...allowRows.map((row) => row.ip_cidr)],
  };
}

export async function getBlockedIpRows() {
  await ensureSecurityTables();
  const rows = await prisma.security_ip_blocks.findMany({
    orderBy: [{ active: 'desc' }, { blocked_at: 'desc' }],
    take: 250,
  });
  return rows.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (b.last_seen_at ?? b.blocked_at).getTime() - (a.last_seen_at ?? a.blocked_at).getTime(),
  );
}

export async function getAllowlistRows() {
  await ensureSecurityTables();
  return prisma.security_ip_allowlist.findMany({
    orderBy: [{ active: 'desc' }, { created_at: 'desc' }],
    take: 250,
  });
}

export async function getSecurityEvents(limit = 100) {
  await ensureSecurityTables();
  return prisma.security_events.findMany({
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(limit, 1), 500),
  });
}

export async function blockResponseForIp(ip: string, reason?: string) {
  return new Response(
    renderBlockedPage(
      ip,
      reason || 'IP flagged for scraping, bot patterns, or security violations.',
      new Date().toISOString(),
    ),
    {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

export function isSensitiveProbePath(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return (
    path.endsWith('.map') ||
    path.includes('/.git') ||
    path.includes('/.env') ||
    path.endsWith('.bak') ||
    path.endsWith('.backup') ||
    path.endsWith('.old') ||
    path.endsWith('.sql') ||
    path.endsWith('.log')
  );
}

function internalSecretMatches(request: Request) {
  const configured =
    process.env.CONFIG_INTERNAL_API_SECRET || process.env.INTERNAL_SECURITY_API_SECRET || '';
  if (!configured) return false;
  const supplied =
    request.headers.get('x-internal-security-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return supplied === configured;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

export async function handleInternalSecurityRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/internal/security')) return null;
  if (!internalSecretMatches(request)) return json({ error: 'Unauthorized' }, { status: 401 });

  if (request.method === 'GET' && url.pathname === '/api/internal/security/policy') {
    return json(await getSecurityPolicy());
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/security/event') {
    const body = await readJson(request);
    await recordSecurityEvent({
      eventType: String(body.eventType || 'security_event'),
      source: String(body.source || 'system'),
      ipAddress: body.ipAddress ? String(body.ipAddress) : null,
      reason: body.reason ? String(body.reason) : null,
      userAgent: body.userAgent ? String(body.userAgent) : null,
      path: body.path ? String(body.path) : null,
      metadata: body.metadata || null,
      createdBy: 'moons-site',
    });
    return json({ success: true });
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/security/block') {
    const body = await readJson(request);
    await blockIpAddress({
      ip: String(body.ipAddress || ''),
      reason: String(body.reason || 'Security block'),
      source: String(body.source || 'system'),
      userAgent: body.userAgent ? String(body.userAgent) : null,
      path: body.path ? String(body.path) : null,
      blockedBy: 'moons-site',
      durationHours: body.durationHours ? Number(body.durationHours) : undefined,
    });
    return json({ success: true });
  }
  return json({ error: 'Not found' }, { status: 404 });
}
