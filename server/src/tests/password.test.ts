import { createHash, pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { hashPassword, verifyCustomerPassword, verifyPassword } from '../utils/password.js';

describe('password compatibility', () => {
  it('verifies and upgrades a legacy PBKDF2 password', async () => {
    const password = 'legacy-password';
    const salt = '00112233445566778899aabbccddeeff';
    const digest = pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('hex');
    await expect(
      verifyPassword(`pbkdf2_sha256$210000$${salt}$${digest}`, password),
    ).resolves.toEqual({ valid: true, needsRehash: true });
  });

  it('uses bcrypt for new credentials', async () => {
    const hash = await hashPassword('new-secure-password');
    expect(hash).toMatch(/^\$2/);
    await expect(verifyPassword(hash, 'new-secure-password')).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
  });

  it('verifies the legacy customer SHA-256 format for one-time upgrade', async () => {
    const password = 'customer-password';
    const digest = createHash('sha256').update(`${password}${env.passwordPepper}`).digest('hex');
    await expect(verifyCustomerPassword(digest, password)).resolves.toEqual({
      valid: true,
      needsRehash: true,
    });
    await expect(verifyCustomerPassword(digest, 'wrong-password')).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });
});
