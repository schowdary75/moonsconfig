import * as OTPAuth from 'otpauth';
import { platformPrisma } from '../src/config/platformPrisma.js';
import { encryptTenantCredential } from '../src/utils/tenantCredentials.js';
import { hashPassword } from '../src/utils/password.js';

const email = process.env.PLATFORM_OPERATOR_EMAIL?.trim().toLowerCase();
const name = process.env.PLATFORM_OPERATOR_NAME?.trim();
const password = process.env.PLATFORM_OPERATOR_PASSWORD;
const role = process.env.PLATFORM_OPERATOR_ROLE as
  'support' | 'billing' | 'security' | 'platform_admin' | undefined;

if (
  !email ||
  !name ||
  !password ||
  !role ||
  !['support', 'billing', 'security', 'platform_admin'].includes(role)
) {
  throw new Error(
    'Set PLATFORM_OPERATOR_EMAIL, PLATFORM_OPERATOR_NAME, PLATFORM_OPERATOR_PASSWORD, and PLATFORM_OPERATOR_ROLE',
  );
}
if (password.length < 16)
  throw new Error('Platform operator password must contain at least 16 characters');

const existing = await platformPrisma.platformOperator.findUnique({ where: { email } });
if (existing)
  throw new Error(
    'Platform operator already exists; rotate credentials through an audited administrative procedure',
  );

const secret = new OTPAuth.Secret({ size: 20 });
const totp = new OTPAuth.TOTP({
  issuer: 'MooNsConfig Operations',
  label: email,
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  secret,
});
await platformPrisma.platformOperator.create({
  data: {
    email,
    name,
    passwordHash: await hashPassword(password),
    role,
    mfaSecret: encryptTenantCredential(secret.base32),
    mfaVerifiedAt: new Date(),
  },
});

process.stdout.write(
  `Platform operator created. Enroll this TOTP URI once, then clear it from terminal history:\n${totp.toString()}\n`,
);
await platformPrisma.$disconnect();
