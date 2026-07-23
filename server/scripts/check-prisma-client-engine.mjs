import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const clients = [
  {
    name: 'tenant',
    entry: path.resolve(process.cwd(), '..', 'node_modules', '.prisma', 'client', 'index.js'),
    engine: path.resolve(
      process.cwd(),
      '..',
      'node_modules',
      '.prisma',
      'client',
      'query_engine-windows.dll.node',
    ),
  },
  {
    name: 'platform',
    entry: path.resolve(
      process.cwd(),
      '..',
      'node_modules',
      '@moonsconfig',
      'platform-client',
      'index.js',
    ),
    engine: path.resolve(
      process.cwd(),
      '..',
      'node_modules',
      '@moonsconfig',
      'platform-client',
      'query_engine-windows.dll.node',
    ),
  },
];

const failures = [];
for (const client of clients) {
  try {
    const source = await readFile(client.entry, 'utf8');
    if (!source.includes('"copyEngine": true')) {
      failures.push(`${client.name} Prisma Client was generated without its native engine`);
      continue;
    }
    if (process.platform === 'win32') await access(client.engine);
  } catch {
    failures.push(`${client.name} Prisma Client or native engine is missing`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(
    'Run `npm run prisma:generate --workspace @moonsconfig/server` without `--no-engine`, then restart the API and worker.',
  );
  process.exit(1);
}

console.log('Prisma native-engine guard passed.');
