import { randomBytes } from 'node:crypto';
import { constants, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const examplePath = path.join(root, '.env.example');
const outputPath = path.join(root, '.env');

const randomHex = (bytes = 32) => randomBytes(bytes).toString('hex');
const databasePassword = randomHex(24);
const rootPassword = randomHex(24);
const adminPassword = `Mc-${randomBytes(14).toString('base64url')}-9a`;

const replacements = new Map([
  ['DATABASE_PASSWORD', databasePassword],
  ['DATABASE_URL', `mysql://moon_user:${databasePassword}@127.0.0.1:3306/moonsconfig`],
  [
    'PLATFORM_DATABASE_URL',
    `mysql://moon_user:${databasePassword}@127.0.0.1:3306/moonsconfig_platform`,
  ],
  ['TENANT_DATABASE_BASE_URL', `mysql://moon_user:${databasePassword}@127.0.0.1:3306/moonsconfig`],
  ['TENANT_PROVISIONING_DATABASE_URL', `mysql://root:${rootPassword}@127.0.0.1:3306/mysql`],
  ['TENANT_CREDENTIAL_ENCRYPTION_KEY', randomHex()],
  ['ORIGIN_SHARED_SECRET', randomHex()],
  ['MALWARE_WEBHOOK_SECRET', randomHex()],
  ['AUTH_PASSWORD_PEPPER', randomHex()],
  ['ADMIN_EMAIL', 'owner@example.com'],
  ['ADMIN_PASSWORD', adminPassword],
  ['JWT_ACCESS_SECRET', randomHex()],
  ['OPERATOR_JWT_SECRET', randomHex()],
  ['ARI_PASSWORD', randomHex(18)],
  ['MYSQL_ROOT_PASSWORD', rootPassword],
]);

try {
  await copyFile(examplePath, outputPath, constants.COPYFILE_EXCL);
} catch (error) {
  if (error?.code === 'EEXIST') {
    console.error('Refusing to overwrite the existing .env file.');
    console.error('Keep it, or move it aside before running npm run setup:env again.');
    process.exit(1);
  }
  throw error;
}

const example = await readFile(outputPath, 'utf8');
const configured = example
  .split(/\r?\n/)
  .map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match) return line;
    const value = replacements.get(match[1]);
    return value === undefined ? line : `${match[1]}=${value}`;
  })
  .join('\n');

await writeFile(outputPath, configured, { encoding: 'utf8', mode: 0o600 });

console.info('Created .env with unique local-only secrets. Git ignores this file.');
console.info('');
console.info('Initial local administrator (created when you run the seed command):');
console.info('  Email: owner@example.com');
console.info(`  Password: ${adminPassword}`);
console.info('');
console.info('Save this password locally, sign in, and change it before sharing the environment.');
