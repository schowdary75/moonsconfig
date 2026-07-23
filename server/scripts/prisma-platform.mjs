import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(process.cwd(), '..', '.env'), quiet: true });
loadEnv({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });
loadEnv({ path: path.resolve(process.cwd(), '.env.local'), override: true, quiet: true });

if (!process.env.PLATFORM_DATABASE_URL) {
  const base = new URL(
    process.env.DATABASE_URL || 'mysql://moon_user:change-me@127.0.0.1:3306/moonsconfig',
  );
  base.pathname = '/moonsconfig_platform';
  process.env.PLATFORM_DATABASE_URL = base.toString();
}

const prismaCli = path.resolve(process.cwd(), '..', 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(
  process.execPath,
  [prismaCli, ...process.argv.slice(2), '--schema', 'prisma/platform/schema.prisma'],
  { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
