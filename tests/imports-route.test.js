import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTempDataDir,
  removeTempDir,
  requestJson,
  resetServerModules,
  startTestServer,
} from './helpers/server.js';

const require = createRequire(import.meta.url);
const originalFetch = globalThis.fetch;
const serverModulePaths = [
  'server/app.js',
  'server/routes/imports.js',
  'server/routes/albums.js',
  'server/routes/backup.js',
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
let importJobs;
let welcomeStore;
let testServer;

function loadImportsRouteContext() {
  dataDir = createTempDataDir('trackspot-imports-route-');
  resetServerModules(serverModulePaths);
  dbModule = require('../server/db.js');
  importJobs = require('../server/import-jobs.js');
  welcomeStore = require('../server/welcome-tour-store.js');
  const { createApp } = require('../server/app.js');
  return { app: createApp(), db: dbModule.db, importJobs, welcomeStore };
}

function createAndClaimRow(workerId = 'worker-1', spotifyId = 'ABCDEFGHIJKLMNOPQRSTUV') {
  importJobs.createCsvImportJob({
    filename: 'imports.csv',
    defaultStatus: 'completed',
    csvBuffer: Buffer.from(`https://open.spotify.com/album/${spotifyId}`),
  });
  return importJobs.claimNextImportRow(workerId).row;
}

function makeGraphqlPayload(spotifyId = 'ABCDEFGHIJKLMNOPQRSTUV', coverArtUrl = null) {
  return {
    data: {
      albumUnion: {
        name: 'Route Import Album',
        type: 'album',
        isPreRelease: false,
        sharingInfo: {
          shareUrl: `https://open.spotify.com/album/${spotifyId}`,
        },
        artists: {
          items: [{
            id: 'artist-1',
            profile: { name: 'Route Import Artist' },
            sharingInfo: { shareUrl: 'https://open.spotify.com/artist/artist-1' },
            visuals: { avatarImage: { sources: [] } },
          }],
        },
        tracksV2: { totalCount: 0, items: [] },
        copyright: { items: [] },
        genres: { items: [] },
        coverArt: {
          sources: coverArtUrl
            ? [{ url: coverArtUrl, width: 640, height: 640 }]
            : [],
        },
      },
    },
  };
}

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await testServer?.close();
  testServer = null;
  dbModule?.db?.close();
  dbModule = null;
  importJobs = null;
  welcomeStore = null;
  delete process.env.DATA_DIR;
  resetServerModules(serverModulePaths);
  removeTempDir(dataDir);
  dataDir = null;
});

describe('CSV import HTTP routes', () => {
  it('returns 400 when a CSV upload request has no uploaded file', async () => {
    const { app } = loadImportsRouteContext();
    testServer = await startTestServer(app);

    const result = await requestJson(testServer.baseUrl, '/api/imports/csv', {
      method: 'POST',
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'A CSV file is required.' });
  });

  it('blocks non-GET import routes while the welcome tour lock is active', async () => {
    const { app, welcomeStore: store } = loadImportsRouteContext();
    store.upsertWelcomeTourLock('tour-session');
    testServer = await startTestServer(app);

    const result = await requestJson(testServer.baseUrl, '/api/imports/csv', {
      method: 'POST',
    });

    expect(result.status).toBe(423);
    expect(result.body).toMatchObject({
      code: 'welcome_tour_active',
    });
  });

  it('marks a claimed row failed when completion receives invalid GraphQL payload', async () => {
    const { app, db } = loadImportsRouteContext();
    const row = createAndClaimRow('worker-invalid');
    testServer = await startTestServer(app);

    const result = await requestJson(testServer.baseUrl, `/api/imports/rows/${row.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerId: 'worker-invalid',
        graphqlData: {},
      }),
    });

    const storedRow = db.prepare('SELECT status, error FROM import_job_rows WHERE id = ?').get(row.id);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      row_status: 'failed',
      error: 'Invalid payload. Expected Spotify GraphQL album data.',
    });
    expect(storedRow).toMatchObject({
      status: 'failed',
      error: 'Invalid payload. Expected Spotify GraphQL album data.',
    });
  });

  it('skips duplicate completions and removes prepared temp art', async () => {
    const spotifyId = 'DUPLICATEALBUM12345678';
    const { app, db } = loadImportsRouteContext();
    const row = createAndClaimRow('worker-duplicate', spotifyId);
    db.prepare(`
      INSERT INTO albums (
        id, spotify_album_id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (
        42, :spotify_album_id, 'Existing Album', :artists, 'completed', 'spotify',
        '2026-04-01 00:00:00', '2026-04-01 00:00:00'
      )
    `).run({
      spotify_album_id: spotifyId,
      artists: JSON.stringify([{ name: 'Existing Artist' }]),
    });
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
    }));
    testServer = await startTestServer(app);

    const response = await originalFetch(`${testServer.baseUrl}/api/imports/rows/${row.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerId: 'worker-duplicate',
        graphqlData: makeGraphqlPayload(spotifyId, 'https://images.example/cover.jpg'),
      }),
    });
    const result = {
      status: response.status,
      body: await response.json(),
    };

    const imageFiles = fs.readdirSync(path.join(dataDir, 'images'));
    const storedRow = db.prepare('SELECT status, error FROM import_job_rows WHERE id = ?').get(row.id);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      row_status: 'skipped',
      existing_id: 42,
    });
    expect(storedRow.status).toBe('skipped');
    expect(imageFiles.filter(fileName => fileName.includes('.import-'))).toEqual([]);
  });

  it('rejects row failure reports from a worker that does not own the active lease', async () => {
    const { app } = loadImportsRouteContext();
    const row = createAndClaimRow('worker-owner');
    testServer = await startTestServer(app);

    const result = await requestJson(testServer.baseUrl, `/api/imports/rows/${row.id}/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerId: 'worker-other',
        error: 'worker failed',
      }),
    });

    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      error: 'Import row lease is no longer owned by this worker.',
    });
  });
});
