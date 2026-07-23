import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(scriptDirectory, '../src');
// These adapters can issue legacy SQL only through config/prisma.ts, whose
// proxy resolves the authenticated AsyncLocalStorage TenantContext. They are
// unreachable when LEGACY_ROUTING_ENABLED=false unless an authenticated,
// feature-authorized operation dispatch supplies that context.
const tenantAwareCompatibilityAllowlist = new Set([
  path.normalize('legacy/db.server.ts'),
  path.normalize('legacy/db/schema.ts'),
  path.normalize('legacy/api/db.functions.server.ts'),
  path.normalize('operations/advertisingOperations.ts'),
  path.normalize('operations/aiOperations.ts'),
  path.normalize('operations/catalogOperations.ts'),
  path.normalize('operations/marketingOperations.ts'),
  path.normalize('operations/mayaOperations.ts'),
  path.normalize('operations/missionControlOperations.ts'),
  path.normalize('operations/supportOperations.ts'),
  path.normalize('operations/vendorOperations.ts'),
  path.normalize('repositories/prismaQueryRepository.ts'),
  path.normalize('repositories/sqlRepository.ts'),
]);
const forbidden = [
  /\$(?:queryRaw|executeRaw)(?:Unsafe)?\b/,
  /\b(?:getDbPool|sqlRepository|prismaQueryRepository)\b/,
  /(?:'|"|`)\s*(?:SELECT\b.+\bFROM|INSERT\s+INTO|UPDATE\b.+\bSET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i,
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? files(target) : target.endsWith('.ts') ? [target] : [];
      }),
    )
  ).flat();
}

function isTemporarilyAllowed(relative) {
  return [...tenantAwareCompatibilityAllowlist].some(
    (entry) => relative === entry || relative.startsWith(`${entry}${path.sep}`),
  );
}

const violations = [];
for (const file of await files(sourceRoot)) {
  const relative = path.relative(sourceRoot, file);
  if (relative.startsWith(`tests${path.sep}`)) continue;
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isTemporarilyAllowed(relative)) return;
    if (/\bINSERT\s+(?:IGNORE\s+)?INTO\b/i.test(line)) {
      violations.push(`${relative}:${index + 1}: ${line.trim()}`);
      return;
    }
    if (forbidden.some((pattern) => pattern.test(line))) {
      violations.push(`${relative}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length) {
  console.error(
    'Raw SQL/runtime database compatibility access is forbidden outside the migration allowlist:',
  );
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('Runtime SQL guard passed.');
