import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { screenExportSchema } from '../validators/platformValidator.js';
import { verifyPassword } from '../utils/password.js';
import {
  discoverAuthenticatedScreens,
  findScreenDefinition,
  prepareScreenExport,
  screenExportArchivePaths,
  streamScreenExport,
} from '../services/screenExportService.js';

const workspaceRoot = path.resolve(process.cwd(), '..');

describe('screen source exports', () => {
  it('discovers every authenticated screen and matches static and dynamic paths', async () => {
    const screens = await discoverAuthenticatedScreens(workspaceRoot);
    expect(screens).toHaveLength(51);
    expect(await findScreenDefinition('/', workspaceRoot)).toMatchObject({
      slug: 'dashboard',
      routePattern: '/',
    });
    expect(await findScreenDefinition('/packages/summer-special', workspaceRoot)).toMatchObject({
      slug: 'packages-detail',
      routePattern: '/packages/:id',
    });
    expect(await findScreenDefinition('/marketing/campaigns/launch', workspaceRoot)).toMatchObject({
      slug: 'marketing-campaigns-detail',
      routePattern: '/marketing/campaigns/:campaignId',
    });
    expect(await findScreenDefinition('/login', workspaceRoot)).toBeUndefined();
  }, 20_000);

  it('collects lazy client code, public assets, backend roots, Prisma source, and safe archive paths', async () => {
    const dashboard = await prepareScreenExport('/', workspaceRoot);
    expect(dashboard.files.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining([
        'client/src/routes/_authenticated/index.tsx',
        'client/src/components/dashboard/DashboardPulseChart.tsx',
        'client/src/components/LazyMarkdown.tsx',
        'client/src/styles.css',
        'server/prisma/schema.prisma',
      ]),
    );

    const routeMap = await prepareScreenExport('/route-map', workspaceRoot);
    expect(
      routeMap.files.some((file) => file.relativePath === 'client/public/admin1/index.json'),
    ).toBe(true);

    const packageDetail = await prepareScreenExport('/packages/example', workspaceRoot);
    expect(
      packageDetail.files.some((file) => file.relativePath === 'client/public/route-animator.html'),
    ).toBe(true);
    const manifest = JSON.parse(packageDetail.manifest);
    expect(manifest.backend.operations.length).toBeGreaterThan(0);
    expect(manifest.backend.endpoints).toContain('/auth/refresh');
    expect(manifest.dependencies.client.react).toBeTruthy();

    const paths = screenExportArchivePaths(packageDetail);
    expect(paths.every((entry) => entry.startsWith('packages-detail/'))).toBe(true);
    expect(paths).toContain('packages-detail/README.md');
    expect(paths).toContain('packages-detail/screen-export.manifest.json');
    expect(
      paths.some((entry) =>
        /(?:^|\/)(?:\.git|node_modules|dist|build|uploads|storage)(?:\/|$)/.test(entry),
      ),
    ).toBe(false);
    expect(packageDetail.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
  }, 45_000);

  it('validates a safe authenticated pathname and six-digit access code', () => {
    expect(
      screenExportSchema.validate({
        body: { pathname: '/packages/42', accessCode: '123456' },
        params: {},
        query: {},
      }).error,
    ).toBeUndefined();
    expect(
      screenExportSchema.validate({
        body: { pathname: '/../server', accessCode: '123456' },
        params: {},
        query: {},
      }).error,
    ).toBeTruthy();
    expect(
      screenExportSchema.validate({
        body: { pathname: '/packages', accessCode: '12345' },
        params: {},
        query: {},
      }).error,
    ).toBeTruthy();
  });

  it('stores the configured export code only as a verifiable PBKDF2 hash', async () => {
    const migration = await fs.readFile(
      path.join(
        workspaceRoot,
        'server/prisma/migrations/202607210001_add_screen_source_export_access/migration.sql',
      ),
      'utf8',
    );
    const hash = migration.match(/pbkdf2_sha256\$[^']+/)?.[0];
    expect(hash).toBeTruthy();
    expect((await verifyPassword(hash!, '909988')).valid).toBe(true);
    expect((await verifyPassword(hash!, '909989')).valid).toBe(false);
  });

  it('streams an attachment ZIP with every entry below the screen-named root', async () => {
    const packagePath = path.join(workspaceRoot, 'package.json');
    const stats = await fs.stat(packagePath);
    const prepared = {
      definition: {
        routeId: '/_authenticated/',
        routePattern: '/',
        sourcePath: 'client/src/routes/_authenticated/index.tsx',
        slug: 'dashboard',
      },
      files: [
        {
          relativePath: 'package.json',
          absolutePath: packagePath,
          size: stats.size,
          sha256: '0'.repeat(64),
        },
      ],
      manifest: '{}',
      readme: '# Dashboard',
      totalBytes: stats.size,
    };
    const app = express();
    app.get('/archive', async (_request, response, next) => {
      try {
        await streamScreenExport(response, prepared);
      } catch (error) {
        next(error);
      }
    });
    const binaryParser = (
      response: any,
      callback: (error: Error | null, body?: Buffer) => void,
    ) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
      response.on('error', callback);
    };

    const response = await request(app).get('/archive').buffer(true).parse(binaryParser);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.headers['content-disposition']).toBe('attachment; filename="dashboard.zip"');
    const zipContents = (response.body as Buffer).toString('latin1');
    expect(zipContents).toContain('dashboard/package.json');
    expect(zipContents).toContain('dashboard/README.md');
    expect(zipContents).toContain('dashboard/screen-export.manifest.json');
  });
});
