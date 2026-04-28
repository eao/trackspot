import fs from 'node:fs';
import http from 'node:http';
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

const originalEnv = {
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  TRUSTED_HOSTS: process.env.TRUSTED_HOSTS,
};

function loadAppContext() {
  dataDir = createTempDataDir('trackspot-app-integration-');
  resetServerModules(serverModulePaths);
  dbModule = require('../server/db.js');
  const { createApp } = require('../server/app.js');
  return createApp();
}

function requestJsonWithHost(baseUrl, requestPath, { host, origin, body }) {
  const url = new URL(requestPath, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'PATCH',
      headers: {
        Host: host,
        Origin: origin,
        'Content-Type': 'application/json',
      },
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: text ? JSON.parse(text) : null,
        });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
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
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
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

  it('rejects unsafe cross-origin mutations before routes can persist changes', async () => {
    testServer = await startTestServer(loadAppContext());

    const rejected = await requestJson(testServer.baseUrl, '/api/preferences', {
      method: 'PATCH',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contentWidthPx: 1234 }),
    });
    const preferences = await requestJson(testServer.baseUrl, '/api/preferences');

    expect(rejected.status).toBe(403);
    expect(rejected.body).toEqual({ error: 'Cross-origin mutation rejected.' });
    expect(preferences.body.preferences.contentWidthPx).not.toBe(1234);
  });

  it('allows default loopback and configured browser mutation origins', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://trackspot.local:1060';
    testServer = await startTestServer(loadAppContext());

    const loopbackOrigin = await requestJson(testServer.baseUrl, '/api/preferences', {
      method: 'PATCH',
      headers: {
        Origin: 'http://127.0.0.1:1060',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contentWidthPx: 1234 }),
    });
    const configuredOrigin = await requestJson(testServer.baseUrl, '/api/preferences', {
      method: 'PATCH',
      headers: {
        Origin: 'http://trackspot.local:1060',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contentWidthPx: 1250 }),
    });

    expect(loopbackOrigin.status).toBe(200);
    expect(configuredOrigin.status).toBe(200);
    expect(configuredOrigin.headers.get('access-control-allow-origin')).toBe('http://trackspot.local:1060');
    expect(configuredOrigin.body.preferences.contentWidthPx).toBe(1250);
  });

  it('rejects mutation requests with untrusted Host headers', async () => {
    testServer = await startTestServer(loadAppContext());

    const rejected = await requestJsonWithHost(testServer.baseUrl, '/api/preferences', {
      host: 'evil.example:1060',
      origin: 'http://evil.example:1060',
      body: JSON.stringify({ contentWidthPx: 1234 }),
    });

    expect(rejected.status).toBe(403);
    expect(rejected.body).toEqual({ error: 'Request host is not trusted.' });
  });

  it('rejects unsafe referer-only browser mutations but allows direct local tools', async () => {
    testServer = await startTestServer(loadAppContext());

    const rejected = await requestJson(testServer.baseUrl, '/api/preferences', {
      method: 'PATCH',
      headers: {
        Referer: 'https://evil.example/page',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contentWidthPx: 1234 }),
    });
    const direct = await requestJson(testServer.baseUrl, '/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentWidthPx: 1260 }),
    });

    expect(rejected.status).toBe(403);
    expect(direct.status).toBe(200);
    expect(direct.body.preferences.contentWidthPx).toBe(1260);
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
