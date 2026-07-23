import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export const SUPPORTED_NODE_MAJOR = 24;

export const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'PLATFORM_DATABASE_URL',
  'TENANT_DATABASE_BASE_URL',
  'TENANT_PROVISIONING_DATABASE_URL',
  'TENANT_CREDENTIAL_ENCRYPTION_KEY',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'OPERATOR_JWT_SECRET',
  'AUTH_PASSWORD_PEPPER',
  'CORS_ORIGINS',
];

const OPTIONAL_PROVIDERS = [
  {
    label: 'Maya/Gemini',
    ready: (configured) => configured.has('GEMINI_API_KEY') || configured.has('GEMINI_API_KEYS'),
  },
  {
    label: 'email',
    ready: (configured) => configured.has('SMTP_HOST') && configured.has('SMTP_FROM'),
  },
  {
    label: 'WhatsApp',
    ready: (configured) =>
      configured.has('META_WHATSAPP_TOKEN') && configured.has('META_WHATSAPP_PHONE_NUMBER_ID'),
  },
  {
    label: 'inventory',
    ready: (configured) =>
      configured.has('INVENTORY_PROVIDER') &&
      configured.has('INVENTORY_API_BASE_URL') &&
      configured.has('INVENTORY_API_KEY'),
  },
];

const USAGE = `Usage: npm run doctor -- [--native | --docker]

  --native  Check native Node, MySQL, Redis, API, and Vite prerequisites (default)
  --docker  Check Docker Engine, Compose v2, daemon state, and the gateway port
  --help    Show this help`;

export function parseDoctorArguments(arguments_) {
  if (arguments_.includes('--help') || arguments_.includes('-h')) {
    return { help: true, mode: 'native' };
  }

  const allowed = new Set(['--native', '--docker']);
  const unknown = arguments_.filter((argument) => !allowed.has(argument));
  const requestedModes = arguments_.filter((argument) => allowed.has(argument));

  if (unknown.length > 0) {
    throw new Error(`Unknown option: ${unknown[0]}`);
  }
  if (requestedModes.length > 1) {
    throw new Error('Choose either --native or --docker, not both.');
  }

  return {
    help: false,
    mode: requestedModes[0] === '--docker' ? 'docker' : 'native',
  };
}

export function parseEnvConfiguration(contents) {
  const present = new Set();
  const configured = new Set();

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;

    present.add(match[1]);
    if (match[2].trim().length > 0) {
      configured.add(match[1]);
    }
  }

  return { present, configured };
}

export async function executeCommand(command, arguments_, options = {}) {
  try {
    const result = await execFileAsync(command, arguments_, {
      cwd: options.cwd,
      encoding: 'utf8',
      timeout: options.timeout ?? 10_000,
      windowsHide: true,
    });
    return { ok: true, stdout: result.stdout.trim() };
  } catch {
    return { ok: false, stdout: '' };
  }
}

export async function isPortInUse(port) {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(true);
        return;
      }
      reject(error);
    });
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => resolve(false));
    });
  });
}

function addCheck(checks, status, label, message) {
  checks.push({ status, label, message });
}

async function checkNodeAndNpm(checks, dependencies) {
  const major = Number.parseInt(dependencies.nodeVersion.split('.')[0], 10);
  if (major === SUPPORTED_NODE_MAJOR) {
    addCheck(checks, 'pass', 'Node.js', `Node ${dependencies.nodeVersion} is supported.`);
  } else {
    addCheck(
      checks,
      'fail',
      'Node.js',
      `Node ${dependencies.nodeVersion} detected; this repository requires Node ${SUPPORTED_NODE_MAJOR}.x.`,
    );
  }

  let npmCommand = 'npm';
  let npmArguments = ['--version'];
  if (dependencies.npmExecPath) {
    npmCommand = process.execPath;
    npmArguments = [dependencies.npmExecPath, '--version'];
  } else if (dependencies.platform === 'win32') {
    npmCommand = process.env.ComSpec ?? 'cmd.exe';
    npmArguments = ['/d', '/s', '/c', 'npm --version'];
  }
  const npm = await dependencies.runCommand(npmCommand, npmArguments, {
    cwd: dependencies.cwd,
  });
  if (npm.ok && npm.stdout) {
    addCheck(checks, 'pass', 'npm', `npm ${npm.stdout.split(/\s+/)[0]} detected.`);
  } else {
    addCheck(checks, 'fail', 'npm', 'npm was not found on PATH.');
  }
}

async function checkEnvironment(checks, dependencies) {
  let configuration;
  try {
    const contents = await dependencies.readText(path.join(dependencies.cwd, '.env'), 'utf8');
    configuration = parseEnvConfiguration(contents);
    addCheck(checks, 'pass', '.env', 'Local environment file found.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    addCheck(checks, 'fail', '.env', 'Local environment file is missing. Run npm run setup:env.');
    return;
  }

  const missing = REQUIRED_ENV_KEYS.filter((key) => !configuration.present.has(key));
  if (missing.length === 0) {
    addCheck(checks, 'pass', 'Required environment', 'All required key names are present.');
  } else {
    addCheck(checks, 'fail', 'Required environment', `Missing key names: ${missing.join(', ')}.`);
  }

  const unavailable = OPTIONAL_PROVIDERS.filter(
    (provider) => !provider.ready(configuration.configured),
  ).map((provider) => provider.label);
  if (unavailable.length === 0) {
    addCheck(checks, 'pass', 'Optional providers', 'Checked provider groups are configured.');
  } else {
    addCheck(
      checks,
      'warn',
      'Optional providers',
      `Not configured: ${unavailable.join(', ')}. Core development can continue.`,
    );
  }
}

async function checkNativePorts(checks, dependencies) {
  for (const service of [
    { label: 'App', port: 5174 },
    { label: 'API', port: 4000 },
  ]) {
    const occupied = await dependencies.checkPort(service.port);
    addCheck(
      checks,
      occupied ? 'fail' : 'pass',
      `${service.label} port`,
      occupied
        ? `Port ${service.port} is already in use. Stop the existing listener or choose another port.`
        : `Port ${service.port} is available.`,
    );
  }

  for (const service of [
    { label: 'MySQL', port: 3306 },
    { label: 'Redis', port: 6379 },
  ]) {
    const occupied = await dependencies.checkPort(service.port);
    addCheck(
      checks,
      occupied ? 'pass' : 'fail',
      service.label,
      occupied
        ? `A local listener was detected on port ${service.port}.`
        : `No local listener was detected on port ${service.port}. Start ${service.label}.`,
    );
  }
}

async function checkDocker(checks, dependencies) {
  const engine = await dependencies.runCommand('docker', ['--version'], {
    cwd: dependencies.cwd,
  });
  if (!engine.ok) {
    addCheck(checks, 'fail', 'Docker Engine', 'Docker was not found on PATH.');
  } else {
    addCheck(checks, 'pass', 'Docker Engine', 'Docker CLI detected.');
  }

  const compose = await dependencies.runCommand('docker', ['compose', 'version'], {
    cwd: dependencies.cwd,
  });
  if (!compose.ok) {
    addCheck(checks, 'fail', 'Docker Compose', 'Docker Compose v2 is unavailable.');
  } else if (Number.parseInt(compose.stdout.match(/\bv?(\d+)\.\d+/i)?.[1] ?? '0', 10) < 2) {
    addCheck(checks, 'fail', 'Docker Compose', 'Docker Compose v2 is required.');
  } else {
    addCheck(checks, 'pass', 'Docker Compose', 'Docker Compose v2 or newer detected.');
  }

  const daemon = await dependencies.runCommand('docker', ['info'], {
    cwd: dependencies.cwd,
  });
  addCheck(
    checks,
    daemon.ok ? 'pass' : 'fail',
    'Docker daemon',
    daemon.ok
      ? 'Docker daemon is reachable.'
      : 'Docker daemon is not reachable. Start Docker Desktop or the Docker service.',
  );

  const ports = [
    { label: 'App gateway', port: 8080, exposed: true },
    { label: 'API', port: 4000, exposed: false },
    { label: 'MySQL', port: 3306, exposed: false },
    { label: 'Redis', port: 6379, exposed: false },
  ];
  for (const service of ports) {
    const occupied = await dependencies.checkPort(service.port);
    if (service.exposed) {
      addCheck(
        checks,
        occupied ? 'fail' : 'pass',
        `${service.label} port`,
        occupied
          ? `Port ${service.port} is already in use and conflicts with Docker Compose.`
          : `Port ${service.port} is available.`,
      );
    } else {
      addCheck(
        checks,
        'pass',
        `${service.label} port`,
        `Port ${service.port} is ${occupied ? 'in use on the host' : 'available'}; Compose keeps this service internal.`,
      );
    }
  }
}

export async function runDoctor(options = {}) {
  const dependencies = {
    mode: options.mode ?? 'native',
    cwd: options.cwd ?? process.cwd(),
    nodeVersion: options.nodeVersion ?? process.versions.node,
    platform: options.platform ?? process.platform,
    npmExecPath: options.npmExecPath === undefined ? process.env.npm_execpath : options.npmExecPath,
    readText: options.readText ?? readFile,
    runCommand: options.runCommand ?? executeCommand,
    checkPort: options.checkPort ?? isPortInUse,
  };
  const checks = [];

  await checkNodeAndNpm(checks, dependencies);
  await checkEnvironment(checks, dependencies);
  if (dependencies.mode === 'docker') {
    await checkDocker(checks, dependencies);
  } else {
    await checkNativePorts(checks, dependencies);
  }

  return {
    checks,
    exitCode: checks.some((check) => check.status === 'fail') ? 1 : 0,
    mode: dependencies.mode,
  };
}

export function formatDoctorReport(report) {
  const labels = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
  const lines = [
    `MooNsConfig doctor (${report.mode})`,
    '',
    ...report.checks.map((check) => `${labels[check.status]}  ${check.label}: ${check.message}`),
  ];
  const totals = {
    pass: report.checks.filter((check) => check.status === 'pass').length,
    warn: report.checks.filter((check) => check.status === 'warn').length,
    fail: report.checks.filter((check) => check.status === 'fail').length,
  };
  lines.push('', `Summary: ${totals.pass} passed, ${totals.warn} warnings, ${totals.fail} failed.`);
  lines.push(
    report.exitCode === 0
      ? 'No blockers found.'
      : 'Resolve the failed checks, then run the doctor again.',
  );
  return lines.join('\n');
}

export async function main(arguments_ = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseDoctorArguments(arguments_);
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(USAGE);
    return 2;
  }

  if (parsed.help) {
    console.info(USAGE);
    return 0;
  }

  const report = await runDoctor({ mode: parsed.mode });
  console.info(formatDoctorReport(report));
  return report.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
