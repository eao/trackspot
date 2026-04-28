import fs from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTempDataDir,
  removeTempDir,
  requestJson,
  resetServerModules,
  startTestServer,
} from './helpers/server.js';

const require = createRequire(import.meta.url);
const serverModulePaths = [
  'server/app.js',
  'server/routes/albums.js',
  'server/routes/backup.js',
  'server/routes/imports.js',
  'server/routes/backgrounds.js',
  'server/routes/opacity-presets.js',
  'server/routes/themes.js',
  'server/routes/preferences.js',
  'server/routes/welcome-tour.js',
  'server/import-jobs.js',
  'server/import-service.js',
  'server/preferences-store.js',
  'server/personalization-store.js',
  'server/background-library.js',
  'server/welcome-tour-store.js',
  'server/db.js',
];

let dataDir;
let dbModule;
let testServer;
let consoleErrorSpy;

function loadAppContext() {
  dataDir = createTempDataDir('trackspot-app-integration-');
  resetServerModules(serverModulePaths);
  dbModule = require('../server/db.js');
  const { createApp } = require('../server/app.js');
  return createApp();
}

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  await testServer?.close();
  testServer = null;
  dbModule?.db?.close();
  dbModule = null;
  delete process.env.DATA_DIR;
  resetServerModules(serverModulePaths);
  removeTempDir(dataDir);
  dataDir = null;
  consoleErrorSpy?.mockRestore();
});

describe('Express app integration', () => {
  it('serves CORS preflight through the real mounted app stack', async () => {
    testServer = await startTestServer(loadAppContext());

    const response = await fetch(`${testServer.baseUrl}/api/albums`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://open.spotify.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://open.spotify.com');
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });

  it('falls back to index.html for SPA deep links', async () => {
    testServer = await startTestServer(loadAppContext());
    const indexHtml = fs.readFileSync('public/index.html', 'utf8');

    const collection = await fetch(`${testServer.baseUrl}/collection/grid`);
    const wrapped = await fetch(`${testServer.baseUrl}/wrapped/2025`);

    expect(collection.status).toBe(200);
    expect(await collection.text()).toBe(indexHtml);
    expect(wrapped.status).toBe(200);
    expect(await wrapped.text()).toBe(indexHtml);
  });

  it('serves mounted preferences JSON through /api/preferences', async () => {
    testServer = await startTestServer(loadAppContext());

    const result = await requestJson(testServer.baseUrl, '/api/preferences');

    expect(result.status).toBe(200);
    expect(result.body.preferences).toEqual(expect.objectContaining({
      contentWidthPx: expect.any(Number),
      paginationMode: expect.any(String),
      quickActionsToolbarVisibility: expect.any(String),
    }));
  });

  it('returns JSON errors for malformed JSON request bodies', async () => {
    testServer = await startTestServer(loadAppContext());

    const result = await requestJson(testServer.baseUrl, '/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"contentWidthPx":',
    });

    expect(result.status).toBe(400);
    expect(result.headers.get('content-type')).toContain('application/json');
    expect(result.body).toEqual({ error: expect.stringMatching(/JSON|Unexpected|Expected/i) });
  });
});
