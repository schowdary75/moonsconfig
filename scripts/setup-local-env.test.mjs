import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';

const root = process.cwd();

test('creates a safe local environment once and validates with Docker Compose', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'moonsconfig-setup-'));

  try {
    await copyFile(path.join(root, '.env.example'), path.join(temporary, '.env.example'));
    await copyFile(
      path.join(root, 'scripts', 'setup-local-env.mjs'),
      path.join(temporary, 'setup-local-env.mjs'),
    );

    const first = spawnSync(process.execPath, ['setup-local-env.mjs'], {
      cwd: temporary,
      encoding: 'utf8',
    });
    assert.equal(first.status, 0, first.stderr);

    const envPath = path.join(temporary, '.env');
    const generated = await readFile(envPath, 'utf8');
    const original = generated;
    const values = new Map(
      generated
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
        .filter(Boolean)
        .map((match) => [match[1], match[2]]),
    );

    for (const key of [
      'DATABASE_PASSWORD',
      'MYSQL_ROOT_PASSWORD',
      'JWT_ACCESS_SECRET',
      'OPERATOR_JWT_SECRET',
      'TENANT_CREDENTIAL_ENCRYPTION_KEY',
      'AUTH_PASSWORD_PEPPER',
      'ADMIN_PASSWORD',
    ]) {
      const value = values.get(key) ?? '';
      assert.ok(value.length >= 12, `${key} should contain a generated value`);
      assert.doesNotMatch(value, /^(?:change|replace|your-)/i);
    }

    const second = spawnSync(process.execPath, ['setup-local-env.mjs'], {
      cwd: temporary,
      encoding: 'utf8',
    });
    assert.notEqual(second.status, 0, 'the setup script should refuse to overwrite .env');
    assert.equal(await readFile(envPath, 'utf8'), original);

    if (process.env.CHECK_DOCKER_COMPOSE === '1') {
      const compose = spawnSync(
        'docker',
        [
          'compose',
          '--env-file',
          envPath,
          '--file',
          path.join(root, 'docker-compose.yml'),
          'config',
          '--quiet',
        ],
        { cwd: root, encoding: 'utf8' },
      );
      assert.equal(compose.status, 0, compose.stderr);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
