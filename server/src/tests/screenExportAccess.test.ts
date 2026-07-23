import { pbkdf2Sync } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors/AppError.js';
import { authorize } from '../middlewares/authenticate.js';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('../config/prisma.js', () => ({
  defaultPrisma: { protected_screen_access: { findUnique: mocks.findUnique } },
  prisma: { protected_screen_access: { findUnique: mocks.findUnique } },
}));
vi.mock('../config/tenantContext.js', () => ({ getTenantRuntime: vi.fn(() => null) }));

const { verifyScreenExportCode } = await import('../services/screenExportService.js');

function hash(code: string) {
  const salt = 'screen-export-test-salt';
  return `pbkdf2_sha256$210000$${salt}$${pbkdf2Sync(code, salt, 210000, 32, 'sha256').toString('hex')}`;
}

describe('screen export access', () => {
  it('returns service unavailable when the protected code is not configured', async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    await expect(verifyScreenExportCode('123456')).rejects.toMatchObject({
      statusCode: 503,
      code: 'SCREEN_EXPORT_NOT_CONFIGURED',
    });
  });

  it('rejects an incorrect code and accepts the configured code', async () => {
    const accessCodeHash = hash('123456');
    mocks.findUnique.mockResolvedValue({ access_code_hash: accessCodeHash });
    await expect(verifyScreenExportCode('654321')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SCREEN_EXPORT_CODE_INVALID',
    });
    await expect(verifyScreenExportCode('123456')).resolves.toBeUndefined();
  });

  it('requires the primary authenticated role to be admin', () => {
    const next = vi.fn();
    const middleware = authorize('admin');
    middleware(
      { auth: { role: 'viewer' } } as Request,
      {} as Response,
      next as unknown as NextFunction,
    );
    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});
