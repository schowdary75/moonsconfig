import { createHash, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';

const blocked = new Set(['dummy_hash', 'changeme123', 'google_sso', 'oauth:google', '']);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(`${password}${env.passwordPepper}`, env.bcryptRounds);
}

export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash || blocked.has(storedHash)) return { valid: false, needsRehash: false };
  if (storedHash.startsWith('$2')) {
    return {
      valid: await bcrypt.compare(`${password}${env.passwordPepper}`, storedHash),
      needsRehash: false,
    };
  }
  if (storedHash.startsWith('pbkdf2_sha256$')) {
    const [, iterationsRaw, salt, expectedHex] = storedHash.split('$');
    const iterations = Number(iterationsRaw);
    if (!iterations || !salt || !expectedHex) return { valid: false, needsRehash: false };
    const actual = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    const expected = Buffer.from(expectedHex, 'hex');
    return {
      valid: expected.length === actual.length && timingSafeEqual(expected, actual),
      needsRehash: true,
    };
  }
  return {
    valid: !blocked.has(password) && storedHash === password,
    needsRehash: storedHash === password,
  };
}

/**
 * Customer accounts historically used SHA-256(password + pepper), and a small
 * number of early accounts contain plaintext values. Keep that compatibility
 * isolated here so every successful legacy login can be upgraded to bcrypt.
 */
export async function verifyCustomerPassword(
  storedHash: string | null,
  password: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash || blocked.has(storedHash)) return { valid: false, needsRehash: false };
  if (storedHash.startsWith('$2') || storedHash.startsWith('pbkdf2_sha256$')) {
    return verifyPassword(storedHash, password);
  }
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const candidate = createHash('sha256').update(`${password}${env.passwordPepper}`).digest('hex');
    const expected = Buffer.from(storedHash.toLowerCase(), 'utf8');
    const actual = Buffer.from(candidate, 'utf8');
    return {
      valid: expected.length === actual.length && timingSafeEqual(expected, actual),
      needsRehash: expected.length === actual.length && timingSafeEqual(expected, actual),
    };
  }
  return {
    valid: storedHash === password,
    needsRehash: storedHash === password,
  };
}
