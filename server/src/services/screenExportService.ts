import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import type { Response } from 'express';
import archiver from 'archiver';
import ts from 'typescript';
import { env } from '../config/env.js';
import { defaultPrisma, prisma } from '../config/prisma.js';
import { getTenantRuntime } from '../config/tenantContext.js';
import { AppError } from '../errors/AppError.js';
import { verifyPassword } from '../utils/password.js';

const MAX_EXPORT_FILES = 2_000;
const MAX_EXPORT_BYTES = 25 * 1024 * 1024;
const SCREEN_ACCESS_KEY = 'screen-source-export';
const CLIENT_ROUTE_ROOT = 'client/src/routes/_authenticated';
const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.html',
  '.wav',
  '.mp3',
  '.woff',
  '.woff2',
];
const FORBIDDEN_PARTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'storage',
  'uploads',
  'recordings',
]);
const NODE_BUILTINS = new Set(
  builtinModules.flatMap((name) => [name, name.replace(/^node:/, ''), `node:${name}`]),
);

const REST_ROUTE_ROOTS: Array<[string, string]> = [
  ['/customer-auth', 'server/src/routes/customerAuthRoutes.ts'],
  ['/platform-ops', 'server/src/routes/platformOpsRoutes.ts'],
  ['/customer', 'server/src/routes/customerRoutes.ts'],
  ['/platform', 'server/src/routes/platformRoutes.ts'],
  ['/tenants', 'server/src/routes/tenantRoutes.ts'],
  ['/billing', 'server/src/routes/billingRoutes.ts'],
  ['/account', 'server/src/routes/accountRoutes.ts'],
  ['/uploads', 'server/src/routes/uploadRoutes.ts'],
  ['/users', 'server/src/routes/userRoutes.ts'],
  ['/voice', 'server/src/routes/voiceRoutes.ts'],
  ['/auth', 'server/src/routes/authRoutes.ts'],
  ['/sms', 'server/src/routes/smsRoutes.ts'],
];

export interface ScreenDefinition {
  routeId: string;
  routePattern: string;
  sourcePath: string;
  slug: string;
}

interface ArchiveSourceFile {
  relativePath: string;
  absolutePath: string;
  size: number;
  sha256: string;
}

export interface PreparedScreenExport {
  definition: ScreenDefinition;
  files: ArchiveSourceFile[];
  manifest: string;
  readme: string;
  totalBytes: number;
}

interface DependencyState {
  clientFiles: Set<string>;
  serverFiles: Set<string>;
  clientExternal: Set<string>;
  serverExternal: Set<string>;
  operations: Set<string>;
  endpoints: Set<string>;
  prismaSchemas: Set<'tenant' | 'platform'>;
}

function posixPath(value: string) {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

function fromWorkspace(workspaceRoot: string, absolutePath: string) {
  return posixPath(path.relative(workspaceRoot, absolutePath));
}

function isWithin(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isForbidden(relativePath: string) {
  const parts = posixPath(relativePath).split('/');
  const base = parts.at(-1) ?? '';
  return (
    parts.some((part) => FORBIDDEN_PARTS.has(part)) ||
    base === '.env' ||
    base.startsWith('.env.') ||
    base.endsWith('.map') ||
    base.endsWith('.log')
  );
}

async function exists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return listFiles(absolute);
        return entry.isFile() ? [absolute] : [];
      }),
  );
  return nested.flat();
}

async function findWorkspaceRoot(explicitRoot = env.screenExportSourceRoot) {
  const candidates = [
    explicitRoot,
    path.resolve(process.cwd(), 'screen-export-source'),
    process.cwd(),
    path.resolve(process.cwd(), '..'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const root = path.resolve(candidate);
    if (
      (await exists(path.join(root, CLIENT_ROUTE_ROOT))) &&
      (await exists(path.join(root, 'server/src')))
    ) {
      return root;
    }
  }
  throw new AppError(
    503,
    'Screen export source is unavailable in this deployment',
    'SCREEN_EXPORT_SOURCE_UNAVAILABLE',
  );
}

function scriptKind(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseSource(filename: string, content: string) {
  return ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, scriptKind(filename));
}

function routePatternFromId(routeId: string) {
  const route = routeId.replace(/^\/_authenticated/, '') || '/';
  if (route === '/') return '/';
  return `/${route
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith('$') ? `:${segment.slice(1)}` : segment))
    .join('/')}`;
}

function slugFromPattern(routePattern: string) {
  if (routePattern === '/') return 'dashboard';
  return routePattern
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith(':') ? 'detail' : segment))
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractRouteId(sourceFile: ts.SourceFile) {
  let routeId: string | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'createFileRoute' &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      routeId = node.arguments[0].text;
    }
    if (!routeId) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return routeId;
}

export async function discoverAuthenticatedScreens(workspaceRoot?: string) {
  const root = workspaceRoot ? path.resolve(workspaceRoot) : await findWorkspaceRoot();
  const routeRoot = path.join(root, CLIENT_ROUTE_ROOT);
  const routeFiles = (await listFiles(routeRoot)).filter((file) =>
    ['.ts', '.tsx'].includes(path.extname(file).toLowerCase()),
  );
  const definitions: ScreenDefinition[] = [];

  for (const absolutePath of routeFiles) {
    const content = await fs.readFile(absolutePath, 'utf8');
    const routeId = extractRouteId(parseSource(absolutePath, content));
    if (!routeId?.startsWith('/_authenticated')) continue;
    const routePattern = routePatternFromId(routeId);
    definitions.push({
      routeId,
      routePattern,
      sourcePath: fromWorkspace(root, absolutePath),
      slug: slugFromPattern(routePattern),
    });
  }

  return definitions.sort(
    (left, right) =>
      right.routePattern.split('/').length - left.routePattern.split('/').length ||
      left.routePattern.localeCompare(right.routePattern),
  );
}

function normalizedPathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function routeMatches(pattern: string, pathname: string) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = normalizedPathname(pathname).split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => {
    if (part.startsWith(':')) return true;
    try {
      return decodeURIComponent(pathParts[index] ?? '') === part;
    } catch {
      return false;
    }
  });
}

export async function findScreenDefinition(pathname: string, workspaceRoot?: string) {
  const definitions = await discoverAuthenticatedScreens(workspaceRoot);
  return definitions.find((definition) => routeMatches(definition.routePattern, pathname));
}

function packageName(specifier: string) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0] ?? specifier;
}

function isExternalSpecifier(specifier: string) {
  return !specifier.startsWith('.') && !specifier.startsWith('@/') && !path.isAbsolute(specifier);
}

async function resolveModule(
  workspaceRoot: string,
  ownerRelativePath: string,
  specifier: string,
  area: 'client' | 'server',
) {
  if (isExternalSpecifier(specifier)) return undefined;
  const ownerAbsolute = path.join(workspaceRoot, ownerRelativePath);
  let base: string;
  if (specifier.startsWith('@/')) {
    if (area !== 'client') return undefined;
    base = path.join(workspaceRoot, 'client/src', specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(ownerAbsolute), specifier);
  } else {
    return undefined;
  }

  const explicitExtension = path.extname(base);
  const stem = ['.js', '.jsx', '.mjs', '.cjs'].includes(explicitExtension)
    ? base.slice(0, -explicitExtension.length)
    : base;
  const candidates = [base, ...MODULE_EXTENSIONS.map((extension) => `${stem}${extension}`)];
  candidates.push(...MODULE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)));

  for (const candidate of [...new Set(candidates)]) {
    if (!(await exists(candidate))) continue;
    const stats = await fs.stat(candidate);
    if (!stats.isFile()) continue;
    const relative = fromWorkspace(workspaceRoot, candidate);
    const allowedPrefix = area === 'client' ? 'client/' : 'server/src/';
    if (!relative.startsWith(allowedPrefix) || isForbidden(relative)) return undefined;
    return relative;
  }
  return undefined;
}

function moduleSpecifiers(sourceFile: ts.SourceFile) {
  const values = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      values.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      values.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

function textFromEndpointArgument(node: ts.Expression | undefined) {
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return `${node.head.text}${node.templateSpans
      .map((span) => `:param${span.literal.text}`)
      .join('')}`;
  }
  return undefined;
}

function collectClientSignals(
  sourceFile: ts.SourceFile,
  relativePath: string,
  state: DependencyState,
) {
  const publicReferences: Array<{ value: string; prefix: boolean }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (
        /(?:^|\/)lib\/api\/(?:db\.functions|auth\.functions|operations)$/.test(specifier) &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        for (const binding of node.importClause.namedBindings.elements) {
          if (!binding.isTypeOnly)
            state.operations.add((binding.propertyName ?? binding.name).text);
        }
      }
    }

    if (ts.isCallExpression(node)) {
      if (
        relativePath !== 'client/src/lib/api/operations.ts' &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'executeLegacyOperation' &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        state.operations.add(node.arguments[0].text);
      }

      let isApiClientCall =
        ts.isIdentifier(node.expression) && node.expression.text === 'apiClient';
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'apiClient' &&
        ['get', 'post', 'put', 'patch', 'delete'].includes(node.expression.name.text)
      ) {
        isApiClientCall = true;
      }
      if (isApiClientCall) {
        const endpoint = textFromEndpointArgument(node.arguments[0]);
        if (endpoint?.startsWith('/')) state.endpoints.add(endpoint);
      }
    }

    if (ts.isStringLiteralLike(node) && node.text.startsWith('/')) {
      publicReferences.push({ value: node.text, prefix: false });
    } else if (ts.isTemplateExpression(node) && node.head.text.startsWith('/')) {
      publicReferences.push({ value: node.head.text, prefix: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return publicReferences;
}

async function addPublicReference(
  workspaceRoot: string,
  reference: { value: string; prefix: boolean },
  state: DependencyState,
) {
  const pathname = reference.value.split(/[?#]/, 1)[0]?.replace(/^\/+/, '') ?? '';
  if (!pathname || pathname.includes('..')) return;
  const publicRoot = path.join(workspaceRoot, 'client/public');
  const absolute = path.resolve(publicRoot, pathname);
  if (!isWithin(publicRoot, absolute)) return;

  if ((await exists(absolute)) && (await fs.stat(absolute)).isFile()) {
    const relative = fromWorkspace(workspaceRoot, absolute);
    if (!isForbidden(relative)) state.clientFiles.add(relative);
    return;
  }

  if (reference.prefix || reference.value.endsWith('/')) {
    const directory = reference.value.endsWith('/') ? absolute : path.dirname(absolute);
    if (!(await exists(directory)) || !(await fs.stat(directory)).isDirectory()) return;
    for (const file of await listFiles(directory)) {
      const relative = fromWorkspace(workspaceRoot, file);
      if (!isForbidden(relative)) state.clientFiles.add(relative);
    }
    return;
  }
}

async function collectClientDependencies(
  workspaceRoot: string,
  entryPath: string,
  state: DependencyState,
) {
  const queue = [entryPath, 'client/src/styles.css', 'client/vite.config.ts'];
  state.clientFiles.add('client/package.json');
  state.clientFiles.add('client/tsconfig.json');

  while (queue.length) {
    const relativePath = queue.shift()!;
    if (state.clientFiles.has(relativePath) && relativePath !== entryPath) continue;
    state.clientFiles.add(relativePath);
    const extension = path.extname(relativePath).toLowerCase();
    if (!SCRIPT_EXTENSIONS.has(extension)) continue;
    const content = await fs.readFile(path.join(workspaceRoot, relativePath), 'utf8');
    const sourceFile = parseSource(relativePath, content);

    for (const specifier of moduleSpecifiers(sourceFile)) {
      if (isExternalSpecifier(specifier)) {
        const name = packageName(specifier);
        if (!NODE_BUILTINS.has(name)) state.clientExternal.add(name);
        continue;
      }
      const resolved = await resolveModule(workspaceRoot, relativePath, specifier, 'client');
      if (resolved && !state.clientFiles.has(resolved)) queue.push(resolved);
    }

    for (const reference of collectClientSignals(sourceFile, relativePath, state)) {
      await addPublicReference(workspaceRoot, reference, state);
    }
  }
}

function hasExportModifier(node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function exportedNames(sourceFile: ts.SourceFile) {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement) && statement.name) {
      names.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
  }
  return names;
}

async function operationSourceIndex(workspaceRoot: string) {
  const roots = [
    path.join(workspaceRoot, 'server/src/operations'),
    path.join(workspaceRoot, 'server/src/legacy/api/db.functions.server.ts'),
  ];
  const files = [
    ...(await listFiles(roots[0]!)),
    ...((await exists(roots[1]!)) ? [roots[1]!] : []),
  ].filter((file) => ['.ts', '.tsx'].includes(path.extname(file).toLowerCase()));
  const index = new Map<string, string>();
  for (const file of files) {
    const relative = fromWorkspace(workspaceRoot, file);
    const source = parseSource(relative, await fs.readFile(file, 'utf8'));
    for (const name of exportedNames(source)) index.set(name, relative);
  }
  return index;
}

function routeSourceForEndpoint(endpoint: string) {
  if (endpoint.startsWith('/operations/')) return undefined;
  return REST_ROUTE_ROOTS.find(
    ([prefix]) => endpoint === prefix || endpoint.startsWith(`${prefix}/`),
  )?.[1];
}

async function collectServerDependencies(workspaceRoot: string, state: DependencyState) {
  const operationIndex = await operationSourceIndex(workspaceRoot);
  const queue = new Set<string>();
  for (const operation of state.operations) {
    const source = operationIndex.get(operation);
    if (source) queue.add(source);
  }
  for (const endpoint of state.endpoints) {
    const source = routeSourceForEndpoint(endpoint);
    if (source) queue.add(source);
  }

  const pending = [...queue].sort();
  while (pending.length) {
    const relativePath = pending.shift()!;
    if (state.serverFiles.has(relativePath)) continue;
    state.serverFiles.add(relativePath);
    if (relativePath === 'server/src/config/prisma.ts') state.prismaSchemas.add('tenant');
    if (relativePath === 'server/src/config/platformPrisma.ts') state.prismaSchemas.add('platform');

    const extension = path.extname(relativePath).toLowerCase();
    if (!SCRIPT_EXTENSIONS.has(extension)) continue;
    const content = await fs.readFile(path.join(workspaceRoot, relativePath), 'utf8');
    const sourceFile = parseSource(relativePath, content);
    for (const specifier of moduleSpecifiers(sourceFile)) {
      if (isExternalSpecifier(specifier)) {
        const name = packageName(specifier);
        if (!NODE_BUILTINS.has(name)) state.serverExternal.add(name);
        continue;
      }
      const resolved = await resolveModule(workspaceRoot, relativePath, specifier, 'server');
      if (resolved && !state.serverFiles.has(resolved)) pending.push(resolved);
    }
  }

  if (state.serverFiles.size > 0) {
    state.serverFiles.add('server/package.json');
    state.serverFiles.add('server/tsconfig.json');
    state.serverFiles.add('server/tsconfig.build.json');
  }

  for (const schema of state.prismaSchemas) {
    const prismaRoot =
      schema === 'tenant'
        ? path.join(workspaceRoot, 'server/prisma')
        : path.join(workspaceRoot, 'server/prisma/platform');
    const schemaFile = path.join(prismaRoot, 'schema.prisma');
    if (await exists(schemaFile)) state.serverFiles.add(fromWorkspace(workspaceRoot, schemaFile));
    const migrations = path.join(prismaRoot, 'migrations');
    if (await exists(migrations)) {
      for (const file of await listFiles(migrations)) {
        const relative = fromWorkspace(workspaceRoot, file);
        if (!isForbidden(relative)) state.serverFiles.add(relative);
      }
    }
  }
}

async function dependencyVersions(
  workspaceRoot: string,
  packages: Set<string>,
  manifests: string[],
) {
  const available = new Map<string, string>();
  for (const manifest of manifests) {
    const absolute = path.join(workspaceRoot, manifest);
    if (!(await exists(absolute))) continue;
    const parsed = JSON.parse(await fs.readFile(absolute, 'utf8')) as Record<string, unknown>;
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const [name, version] of Object.entries(
        (parsed[section] as Record<string, string> | undefined) ?? {},
      )) {
        if (!available.has(name)) available.set(name, version);
      }
    }
  }
  return Object.fromEntries(
    [...packages]
      .sort()
      .map((name) => [name, available.get(name) ?? 'version not declared in source workspace']),
  );
}

async function environmentVariableNames(workspaceRoot: string, state: DependencyState) {
  if (![...state.serverFiles].some((file) => file === 'server/src/config/env.ts')) return [];
  const envSource = await fs.readFile(path.join(workspaceRoot, 'server/src/config/env.ts'), 'utf8');
  return [...envSource.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):\s*Joi\./gm)]
    .map((match) => match[1]!)
    .sort();
}

function allowedSourcePath(relativePath: string) {
  const normalized = posixPath(relativePath);
  const exact = new Set([
    'package.json',
    'client/package.json',
    'client/tsconfig.json',
    'client/vite.config.ts',
    'server/package.json',
    'server/tsconfig.json',
    'server/tsconfig.build.json',
  ]);
  return (
    exact.has(normalized) ||
    normalized.startsWith('client/src/') ||
    normalized.startsWith('client/public/') ||
    normalized.startsWith('server/src/') ||
    normalized.startsWith('server/prisma/')
  );
}

async function archiveSourceFiles(workspaceRoot: string, relativePaths: Set<string>) {
  const files: ArchiveSourceFile[] = [];
  let totalBytes = 0;
  for (const relativePath of [...relativePaths].sort()) {
    if (!allowedSourcePath(relativePath) || isForbidden(relativePath)) continue;
    const absolutePath = path.resolve(workspaceRoot, relativePath);
    const realPath = await fs.realpath(absolutePath).catch(() => undefined);
    if (!realPath || !isWithin(workspaceRoot, realPath)) {
      throw new AppError(503, 'A screen source dependency is unavailable', 'SCREEN_SOURCE_MISSING');
    }
    const stats = await fs.stat(realPath);
    if (!stats.isFile()) continue;
    totalBytes += stats.size;
    if (files.length + 1 > MAX_EXPORT_FILES || totalBytes > MAX_EXPORT_BYTES) {
      throw new AppError(
        413,
        'This screen source package exceeds the safe export limit',
        'SCREEN_EXPORT_TOO_LARGE',
      );
    }
    const content = await fs.readFile(realPath);
    files.push({
      relativePath: posixPath(relativePath),
      absolutePath: realPath,
      size: stats.size,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
  return { files, totalBytes };
}

function buildReadme(
  definition: ScreenDefinition,
  state: DependencyState,
  clientDependencies: Record<string, string>,
  serverDependencies: Record<string, string>,
) {
  const lines = [
    `# ${definition.slug} screen export`,
    '',
    `Route: \`${definition.routePattern}\``,
    `Entry source: \`${definition.sourcePath}\``,
    '',
    'This capsule targets another MooNsConfig-based React/Vite and Express/Prisma application.',
    'Copy files using their preserved paths, review shared-file conflicts, register the route, and',
    'wire the listed backend operations/endpoints before applying database migrations.',
    '',
    '## Backend operations',
    '',
    ...([...state.operations].sort().map((name) => `- \`${name}\``) || []),
    ...(state.operations.size ? [] : ['- None detected']),
    '',
    '## REST endpoints',
    '',
    ...([...state.endpoints].sort().map((endpoint) => `- \`${endpoint}\``) || []),
    ...(state.endpoints.size ? [] : ['- None detected']),
    '',
    '## Package dependencies',
    '',
    ...Object.entries(clientDependencies).map(
      ([name, version]) => `- Client: \`${name}@${version}\``,
    ),
    ...Object.entries(serverDependencies).map(
      ([name, version]) => `- Server: \`${name}@${version}\``,
    ),
    '',
    '## Safety',
    '',
    'No environment values, credentials, live database records, uploads, logs, build output,',
    'node_modules, or Git metadata are included. Review schema and migration changes before applying',
    'them to an existing database.',
    '',
  ];
  return lines.join('\n');
}

export async function verifyScreenExportCode(accessCode: string) {
  const database = getTenantRuntime() ? prisma : defaultPrisma;
  const setting = await database.protected_screen_access.findUnique({
    where: { screen_key: SCREEN_ACCESS_KEY },
    select: { access_code_hash: true },
  });
  if (!setting) {
    throw new AppError(
      503,
      'Screen export access is not configured',
      'SCREEN_EXPORT_NOT_CONFIGURED',
    );
  }
  const result = await verifyPassword(setting.access_code_hash, accessCode);
  if (!result.valid) {
    throw new AppError(403, 'Incorrect screen export access code', 'SCREEN_EXPORT_CODE_INVALID');
  }
}

export async function prepareScreenExport(pathname: string, sourceRoot?: string) {
  const workspaceRoot = await findWorkspaceRoot(sourceRoot);
  const definition = await findScreenDefinition(pathname, workspaceRoot);
  if (!definition) {
    throw new AppError(404, 'The current screen is not registered for export', 'SCREEN_NOT_FOUND');
  }

  const state: DependencyState = {
    clientFiles: new Set(),
    serverFiles: new Set(),
    clientExternal: new Set(),
    serverExternal: new Set(),
    operations: new Set(),
    endpoints: new Set(),
    prismaSchemas: new Set(),
  };
  await collectClientDependencies(workspaceRoot, definition.sourcePath, state);
  await collectServerDependencies(workspaceRoot, state);
  const relativePaths = new Set([...state.clientFiles, ...state.serverFiles]);
  relativePaths.add('package.json');

  const { files, totalBytes } = await archiveSourceFiles(workspaceRoot, relativePaths);
  const [clientDependencies, serverDependencies, envNames] = await Promise.all([
    dependencyVersions(workspaceRoot, state.clientExternal, [
      'client/package.json',
      'package.json',
    ]),
    dependencyVersions(workspaceRoot, state.serverExternal, [
      'server/package.json',
      'package.json',
    ]),
    environmentVariableNames(workspaceRoot, state),
  ]);
  const readme = buildReadme(definition, state, clientDependencies, serverDependencies);
  const manifest = JSON.stringify(
    {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      screen: definition,
      files: files.map(({ relativePath, size, sha256 }) => ({ relativePath, size, sha256 })),
      generatedFiles: ['README.md', 'screen-export.manifest.json'],
      uncompressedSourceBytes: totalBytes,
      dependencies: { client: clientDependencies, server: serverDependencies },
      backend: {
        operations: [...state.operations].sort(),
        endpoints: [...state.endpoints].sort(),
        prismaSchemas: [...state.prismaSchemas].sort(),
        environmentVariables: envNames,
      },
      exclusions: [
        'environment values and credentials',
        'live database records',
        'uploads, recordings, storage and logs',
        'node_modules and generated builds',
        'Git metadata',
      ],
    },
    null,
    2,
  );
  const generatedBytes = Buffer.byteLength(readme) + Buffer.byteLength(manifest);
  if (files.length + 2 > MAX_EXPORT_FILES || totalBytes + generatedBytes > MAX_EXPORT_BYTES) {
    throw new AppError(
      413,
      'This screen source package exceeds the safe export limit',
      'SCREEN_EXPORT_TOO_LARGE',
    );
  }
  return { definition, files, manifest, readme, totalBytes } satisfies PreparedScreenExport;
}

export async function streamScreenExport(response: Response, prepared: PreparedScreenExport) {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const root = prepared.definition.slug;
  response.status(200);
  response.setHeader('Content-Type', 'application/zip');
  response.setHeader('Content-Disposition', `attachment; filename="${root}.zip"`);
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    archive.on('warning', (error) => (error.code === 'ENOENT' ? finish(error) : undefined));
    archive.on('error', finish);
    response.on('finish', () => finish());
    response.on('close', () => {
      if (!response.writableFinished) finish(new Error('Screen export download was interrupted'));
    });
    response.on('error', finish);
    archive.pipe(response);
    for (const file of prepared.files) {
      archive.file(file.absolutePath, { name: `${root}/${file.relativePath}` });
    }
    archive.append(prepared.readme, { name: `${root}/README.md` });
    archive.append(prepared.manifest, { name: `${root}/screen-export.manifest.json` });
    void archive.finalize().catch(finish);
  });
}

export function screenExportArchivePaths(prepared: PreparedScreenExport) {
  const root = prepared.definition.slug;
  return [
    ...prepared.files.map((file) => `${root}/${file.relativePath}`),
    `${root}/README.md`,
    `${root}/screen-export.manifest.json`,
  ];
}
