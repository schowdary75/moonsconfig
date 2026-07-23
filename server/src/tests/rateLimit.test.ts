import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import {
  getOperationName,
  isRealtimeOperation,
  operationRateLimitKey,
  realtimeRateLimitKey,
  screenExportRateLimitKey,
} from '../middlewares/rateLimit.js';

describe('operation rate limiting', () => {
  it('recognizes realtime operation paths before route parameters are populated', () => {
    const request = { path: '/operations/getGlobalChatSignals', params: {} };

    expect(getOperationName(request as Pick<Request, 'path' | 'params'>)).toBe(
      'getGlobalChatSignals',
    );
    expect(isRealtimeOperation(request as Pick<Request, 'path' | 'params'>)).toBe(true);
  });

  it('keeps normal business operations in the standard API bucket', () => {
    const request = { path: '/operations/adminGetLeadCrmBoard', params: {} };

    expect(isRealtimeOperation(request as Pick<Request, 'path' | 'params'>)).toBe(false);
  });

  it('isolates realtime limits by IP and authenticated actor without exposing the token', () => {
    const request = {
      ip: '127.0.0.1',
      path: '/getAllSupportChats',
      params: { operationName: 'getAllSupportChats' },
      body: { data: { auth: { sessionToken: 'private-session-token' } } },
    } as unknown as Request;
    const key = realtimeRateLimitKey(request);

    expect(key).not.toContain('private-session-token');
    expect(key).toBe(realtimeRateLimitKey(request));
    expect(
      realtimeRateLimitKey({
        ...request,
        body: { data: { auth: { sessionToken: 'another-session-token' } } },
      } as Request),
    ).not.toBe(key);
  });

  it('uses a top-level legacy session token to isolate ordinary CRM operations', () => {
    const request = {
      ip: '127.0.0.1',
      path: '/crmVerifySession',
      params: { operationName: 'crmVerifySession' },
      body: { data: { sessionToken: 'employee-session-token' } },
    } as unknown as Request;

    const key = operationRateLimitKey(request);
    expect(key).not.toContain('employee-session-token');
    expect(
      operationRateLimitKey({
        ...request,
        body: { data: { sessionToken: 'different-employee-token' } },
      } as Request),
    ).not.toBe(key);
  });

  it('uses separate rate-limit namespaces for separate companies', () => {
    const request = {
      ip: '127.0.0.1',
      path: '/adminGetLeads',
      params: { operationName: 'adminGetLeads' },
      body: {},
      auth: { tenantId: 'tenant-one' },
    } as unknown as Request;

    expect(operationRateLimitKey(request)).not.toBe(
      operationRateLimitKey({ ...request, auth: { tenantId: 'tenant-two' } } as Request),
    );
  });

  it('isolates screen export code attempts by tenant and administrator', () => {
    const first = {
      ip: '127.0.0.1',
      auth: { tenantId: 'tenant-one', userId: 1, platformUserId: 'admin-one' },
    } as Request;
    const second = {
      ...first,
      auth: { tenantId: 'tenant-one', userId: 2, platformUserId: 'admin-two' },
    } as Request;

    expect(screenExportRateLimitKey(first)).not.toBe(screenExportRateLimitKey(second));
    expect(screenExportRateLimitKey(first)).toContain('tenant-one:admin-one');
  });
});
