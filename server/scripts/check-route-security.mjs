import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const routesFile = path.resolve(scriptDirectory, '../src/routes/index.ts');
const source = await readFile(routesFile, 'utf8');

const requiredDirectRoutes = new Map([
  ["get '/health'", "apiRoutes.get('/health', healthController)"],
  ["get '/readiness'", "apiRoutes.get('/readiness', readinessController)"],
  ["get '/me'", "apiRoutes.get('/me', authenticate, authController.me)"],
  [
    "get '/public/tenant-config'",
    "apiRoutes.get('/public/tenant-config', platformController.publicTenantConfig)",
  ],
]);

// Every mounted router must either own its authentication policy explicitly or
// be protected at the mount. Adding a new mount without classifying it fails CI.
const classifiedMounts = new Map([
  ['platformRoutes', 'self-managed-public-and-webhook'],
  ['platformOpsRoutes', 'separate-operator-auth'],
  ['tenantRoutes', 'per-route-auth-tenant-feature'],
  ['billingRoutes', 'per-route-auth-or-signed-webhook'],
  ['authRoutes', 'self-managed-auth-protocol'],
  ['accountRoutes', 'router-level-auth-and-mfa'],
  ['screenExportRoutes', 'per-route-admin-auth-tenant-rate-limit'],
  ['travelGovernanceRoutes', 'authenticate-tenantScope-per-route-mfa'],
  ['customerAuthRoutes', 'self-managed-auth-protocol'],
  ['customerRoutes', 'authenticate-tenantScope'],
  ['userRoutes', 'authenticate-tenantScope-feature'],
  ['uploadRoutes', 'authenticate-tenantScope-feature'],
  ['operationRoutes', 'authenticate-tenantScope-operation-feature'],
  ['smsRoutes', 'authenticate-tenantScope-feature'],
  ['voiceRoutes', 'authenticate-tenantScope-feature'],
]);

const failures = [];
for (const [name, exact] of requiredDirectRoutes) {
  if (!source.includes(exact))
    failures.push(`Direct route ${name} changed without a security classification.`);
}

const mounts = [...source.matchAll(/apiRoutes\.use\(([\s\S]*?)\);/g)]
  .map((match) => match[1].match(/([A-Za-z]+Routes),?\s*$/)?.[1])
  .filter(Boolean);
for (const mount of mounts) {
  if (!classifiedMounts.has(mount))
    failures.push(`Router ${mount} has no authentication/public exemption classification.`);
}
for (const mount of classifiedMounts.keys()) {
  if (!mounts.includes(mount)) failures.push(`Security manifest contains stale router ${mount}.`);
}

if (source.includes('authenticateOptional : authenticate')) {
  // The compatibility expression is permitted only while production defaults
  // remain fail-closed and readiness reports legacy routing as a failed gate.
  const envSource = await readFile(path.resolve(scriptDirectory, '../src/config/env.ts'), 'utf8');
  if (!/LEGACY_ROUTING_ENABLED:[\s\S]{0,100}default\(false\)/.test(envSource)) {
    failures.push('Legacy routing no longer defaults to disabled.');
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Route security guard passed (${mounts.length} classified routers).`);
