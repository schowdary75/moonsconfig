import assert from 'node:assert/strict';
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';

const root = process.cwd();

async function readLauncher(name) {
  return readFile(path.join(root, name), 'utf8');
}

async function findBash() {
  const candidates =
    process.platform === 'win32'
      ? [
          process.env.GIT_BASH_PATH,
          'C:\\Program Files\\Git\\bin\\bash.exe',
          'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
        ]
      : ['/usr/bin/bash', '/bin/bash'];

  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known location.
    }
  }
  return null;
}

function bashPath(filePath) {
  return process.platform === 'win32' ? filePath.replaceAll('\\', '/') : filePath;
}

test('start.sh provides a complete Docker-only startup path', async () => {
  const source = await readLauncher('start.sh');

  assert.match(source, /^#!\/usr\/bin\/env bash\n/);
  assert.doesNotMatch(source, /\r\n/, 'start.sh must keep LF endings for Unix shells');
  assert.match(source, /docker compose version/);
  assert.match(source, /node:24-alpine/);
  assert.match(source, /compose up --build --detach --remove-orphans/);
  assert.match(source, /wait_for_service mysql/);
  assert.match(source, /wait_for_service redis/);
  assert.match(source, /wait_for_service worker/);
  assert.match(source, /api npm run prisma:seed/);
  assert.match(source, /compose logs --tail 80 --follow/);
  assert.match(source, /Run \.\/stop\.sh to stop/);
});

test('stop.sh preserves local data', async () => {
  const source = await readLauncher('stop.sh');

  assert.match(source, /^#!\/usr\/bin\/env bash\n/);
  assert.doesNotMatch(source, /\r\n/, 'stop.sh must keep LF endings for Unix shells');
  assert.match(source, /down --remove-orphans/);
  assert.doesNotMatch(
    source,
    /\bdown\b[^\n]*(?:--volumes|\s-v(?:\s|$))/m,
    'stop.sh must not remove Docker volumes',
  );
  assert.match(source, /Databases, uploads, and Redis data were preserved/);
});

const bash = await findBash();

test('launchers run the expected Docker lifecycle', { skip: !bash }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'moonsconfig-launcher-'));
  const binDirectory = path.join(temporary, 'bin');
  const dockerLog = path.join(temporary, 'docker.log');

  try {
    await mkdir(binDirectory);
    await Promise.all([
      copyFile(path.join(root, 'start.sh'), path.join(temporary, 'start.sh')),
      copyFile(path.join(root, 'stop.sh'), path.join(temporary, 'stop.sh')),
      writeFile(
        path.join(temporary, '.env'),
        [
          'ADMIN_EMAIL=owner@example.com',
          'ADMIN_PASSWORD=local-test-password',
          'ADMIN_NAME=Local Owner',
        ].join('\n'),
      ),
    ]);

    const fakeDocker = path.join(binDirectory, 'docker');
    await writeFile(
      fakeDocker,
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "$1" == "inspect" ]]; then
  printf 'healthy\\n'
elif [[ "$1" == "compose" && "$*" == *" ps -q "* ]]; then
  printf 'fake-container\\n'
fi
exit 0
`,
    );
    await Promise.all([
      chmod(fakeDocker, 0o755),
      chmod(path.join(temporary, 'start.sh'), 0o755),
      chmod(path.join(temporary, 'stop.sh'), 0o755),
    ]);

    const environment = {
      ...process.env,
      PATH: `${binDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
      FAKE_DOCKER_LOG: bashPath(dockerLog),
    };
    const start = spawnSync(
      bash,
      [bashPath(path.join(temporary, 'start.sh')), '--no-build', '--no-logs'],
      { cwd: temporary, env: environment, encoding: 'utf8' },
    );
    assert.equal(start.status, 0, `${start.stdout}\n${start.stderr}`);

    const stop = spawnSync(bash, [bashPath(path.join(temporary, 'stop.sh'))], {
      cwd: temporary,
      env: environment,
      encoding: 'utf8',
    });
    assert.equal(stop.status, 0, `${stop.stdout}\n${stop.stderr}`);

    const calls = await readFile(dockerLog, 'utf8');
    assert.match(calls, /compose version/);
    assert.match(calls, /compose --env-file .* up --detach --remove-orphans/);
    assert.match(
      calls,
      /exec -T -e ADMIN_EMAIL=owner@example\.com -e ADMIN_PASSWORD=local-test-password/,
    );
    assert.match(calls, /api npm run prisma:seed/);
    assert.match(calls, /compose --env-file .* down --remove-orphans/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
