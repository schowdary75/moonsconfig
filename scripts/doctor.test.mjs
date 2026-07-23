import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_ENV_KEYS,
  formatDoctorReport,
  parseDoctorArguments,
  parseEnvConfiguration,
  runDoctor,
} from './doctor.mjs';

const completeEnvironment = [
  ...REQUIRED_ENV_KEYS.map((key) => `${key}=test-value-for-${key}`),
  'GEMINI_API_KEY=configured',
  'SMTP_HOST=configured',
  'SMTP_FROM=configured',
  'META_WHATSAPP_TOKEN=configured',
  'META_WHATSAPP_PHONE_NUMBER_ID=configured',
  'INVENTORY_PROVIDER=configured',
  'INVENTORY_API_BASE_URL=configured',
  'INVENTORY_API_KEY=configured',
].join('\n');

function dependencies(overrides = {}) {
  return {
    cwd: '/workspace',
    nodeVersion: '24.6.0',
    platform: 'linux',
    npmExecPath: null,
    readText: async () => completeEnvironment,
    runCommand: async (command, arguments_) => {
      if (command === 'npm') return { ok: true, stdout: '11.5.1' };
      if (arguments_[0] === '--version') {
        return { ok: true, stdout: 'Docker version 28.3.2' };
      }
      if (arguments_[0] === 'compose') {
        return { ok: true, stdout: 'Docker Compose version v2.38.2' };
      }
      return { ok: true, stdout: 'Server Version: 28.3.2' };
    },
    checkPort: async (port) => port === 3306 || port === 6379,
    ...overrides,
  };
}

test('reports a passing native path without depending on local services', async () => {
  const report = await runDoctor(dependencies());

  assert.equal(report.exitCode, 0);
  assert.equal(report.mode, 'native');
  assert.match(formatDoctorReport(report), /No blockers found\./);
});

test('reports native blockers and never includes environment values', async () => {
  const secret = 'must-never-appear-in-output';
  const report = await runDoctor(
    dependencies({
      nodeVersion: '25.1.0',
      readText: async () => `DATABASE_URL=${secret}`,
      runCommand: async () => ({ ok: false, stdout: '' }),
      checkPort: async (port) => port === 5174 || port === 4000,
    }),
  );
  const output = formatDoctorReport(report);

  assert.equal(report.exitCode, 1);
  assert.match(output, /Node 25\.1\.0 detected/);
  assert.match(output, /Missing key names:/);
  assert.match(output, /Port 5174 is already in use/);
  assert.match(output, /No local listener was detected on port 3306/);
  assert.doesNotMatch(output, new RegExp(secret));
});

test('makes optional provider gaps warnings rather than blockers', async () => {
  const report = await runDoctor(
    dependencies({
      readText: async () => REQUIRED_ENV_KEYS.map((key) => `${key}=`).join('\n'),
    }),
  );

  assert.equal(report.exitCode, 0);
  assert.ok(report.checks.some((check) => check.status === 'warn'));
  assert.match(formatDoctorReport(report), /Core development can continue/);
});

test('reports an explicit Docker daemon failure and gateway conflict', async () => {
  const report = await runDoctor({
    ...dependencies({
      mode: 'docker',
      runCommand: async (command, arguments_) => {
        if (command === 'npm') return { ok: true, stdout: '11.5.1' };
        if (arguments_[0] === '--version') {
          return { ok: true, stdout: 'Docker version 28.3.2' };
        }
        if (arguments_[0] === 'compose') {
          return { ok: true, stdout: 'Docker Compose version v2.38.2' };
        }
        return { ok: false, stdout: '' };
      },
      checkPort: async (port) => port === 8080,
    }),
  });
  const output = formatDoctorReport(report);

  assert.equal(report.exitCode, 1);
  assert.match(output, /Docker daemon is not reachable/);
  assert.match(output, /Port 8080 is already in use and conflicts with Docker Compose/);
  assert.match(output, /Compose keeps this service internal/);
});

test('parses key names without retaining values in the result', () => {
  const parsed = parseEnvConfiguration(
    'export DATABASE_URL=private-value\nREDIS_URL=\n# JWT_ACCESS_SECRET=ignored',
  );

  assert.deepEqual([...parsed.present], ['DATABASE_URL', 'REDIS_URL']);
  assert.deepEqual([...parsed.configured], ['DATABASE_URL']);
  assert.doesNotMatch(JSON.stringify(parsed), /private-value/);
});

test('parses supported modes and rejects ambiguous arguments', () => {
  assert.deepEqual(parseDoctorArguments([]), { help: false, mode: 'native' });
  assert.deepEqual(parseDoctorArguments(['--docker']), { help: false, mode: 'docker' });
  assert.throws(() => parseDoctorArguments(['--native', '--docker']), /Choose either/);
  assert.throws(() => parseDoctorArguments(['--install']), /Unknown option/);
});
