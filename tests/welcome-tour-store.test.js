import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const serverModulePaths = [
  '../server/welcome-tour-store.js',
  '../server/routes/welcome-tour.js',
  '../server/import-service.js',
  '../server/preferences-store.js',
  '../server/album-helpers.js',
  '../server/spotify-helpers.js',
  '../server/spotify-note-links.js',
  '../server/db.js',
];

const tempDirs = [];
const openDbs = [];

function resetServerModules() {
  for (const modulePath of serverModulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function loadContext() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-welcome-tour-test-'));
  tempDirs.push(dataDir);
  process.env.DATA_DIR = dataDir;
  delete process.env.PREFERENCES_PATH;
  resetServerModules();

  const dbModule = require('../server/db.js');
  const welcomeStore = require('../server/welcome-tour-store.js');
  const importService = require('../server/import-service.js');
  openDbs.push(dbModule.db);
  return { dbModule, welcomeStore, importService };
}

function makeImportPayload(spotifyId = '4pj54JwPaS9XsSRTTgAWZg') {
  return {
    spotifyId,
    spotifyUrl: `https://open.spotify.com/album/${spotifyId}`,
    data: {
      albumUnion: {
        name: 'Real Tchaikovsky Album',
        type: 'ALBUM',
        sharingInfo: { shareUrl: `https://open.spotify.com/album/${spotifyId}` },
        artists: {
          items: [{
            id: '3MKCzCnpzw3TjUYs2v7vDA',
            profile: { name: 'Pyotr Ilyich Tchaikovsky' },
            sharingInfo: { shareUrl: 'https://open.spotify.com/artist/3MKCzCnpzw3TjUYs2v7vDA' },
            visuals: { avatarImage: { sources: [] } },
          }],
        },
        date: { isoString: '2020-01-01T00:00:00Z', precision: 'DAY' },
        label: 'Real Label',
        genres: { items: [] },
        tracksV2: { totalCount: 1, items: [] },
        copyright: { items: [] },
        coverArt: { sources: [] },
      },
    },
  };
}

afterEach(() => {
  for (const db of openDbs.splice(0)) {
    try {
      db.close();
    } catch {
      // Test cleanup should continue even if a connection was already closed.
    }
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.DATA_DIR;
  delete process.env.PREFERENCES_PATH;
  resetServerModules();
});

describe('welcome tour store', () => {
  it('normalizes welcome tour preferences', () => {
    loadContext();
    const { normalizePreferences } = require('../server/preferences-store.js');

    expect(normalizePreferences({
      welcomeTourCompletedAt: '2026-04-25T12:00:00.000Z',
      welcomeTourSkippedAt: '',
      welcomeSamplesAddedAt: 42,
    })).toMatchObject({
      welcomeTourCompletedAt: '2026-04-25T12:00:00.000Z',
      welcomeTourSkippedAt: null,
      welcomeSamplesAddedAt: null,
    });
  });

  it('inserts sample albums idempotently without storing the real Spotify album id', () => {
    const { dbModule, welcomeStore } = loadContext();

    const first = welcomeStore.insertWelcomeSamples();
    const second = welcomeStore.insertWelcomeSamples();
    const rows = dbModule.db.prepare(`
      SELECT album_name, spotify_album_id, album_link, source, welcome_sample_key, image_path
      FROM albums
      ORDER BY id ASC
    `).all();

    expect(first.insertedCount).toBe(2);
    expect(second.insertedCount).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      album_name: 'Placeholder Spotify Import',
      spotify_album_id: null,
      album_link: 'spotify:album:4pj54JwPaS9XsSRTTgAWZg',
      source: 'spotify',
      welcome_sample_key: 'spotify-placeholder',
    });
    expect(rows[0].image_path).toBe('images/welcome-placeholder-spotify-album.jpg');
  });

  it('allows a later real import of the Spotify URI used by the placeholder link', async () => {
    const { dbModule, welcomeStore, importService } = loadContext();
    welcomeStore.insertWelcomeSamples();

    const imported = await importService.importSpotifyGraphqlAlbum(makeImportPayload());
    const spotifyRows = dbModule.db.prepare(`
      SELECT album_name, spotify_album_id, welcome_sample_key
      FROM albums
      WHERE album_name IN ('Placeholder Spotify Import', 'Real Tchaikovsky Album')
      ORDER BY id ASC
    `).all();

    expect(imported.spotify_album_id).toBe('4pj54JwPaS9XsSRTTgAWZg');
    expect(spotifyRows).toEqual([
      {
        album_name: 'Placeholder Spotify Import',
        spotify_album_id: null,
        welcome_sample_key: 'spotify-placeholder',
      },
      {
        album_name: 'Real Tchaikovsky Album',
        spotify_album_id: '4pj54JwPaS9XsSRTTgAWZg',
        welcome_sample_key: null,
      },
    ]);
  });

  it('removes only marked sample albums and copied sample art', () => {
    const { dbModule, welcomeStore } = loadContext();
    welcomeStore.insertWelcomeSamples();
    dbModule.db.prepare(`
      INSERT INTO albums (album_name, artists, status, source)
      VALUES ('Real Album', '[]', 'completed', 'manual')
    `).run();

    const result = welcomeStore.removeWelcomeSamples();
    const remaining = dbModule.db.prepare('SELECT album_name FROM albums ORDER BY id ASC').all();

    expect(result.removedCount).toBe(2);
    expect(remaining).toEqual([{ album_name: 'Real Album' }]);
    expect(fs.existsSync(path.join(dbModule.IMAGES_DIR, 'welcome-placeholder-spotify-album.jpg'))).toBe(false);
  });

  it('blocks mutations while a tour lock is active and lets the lock expire', () => {
    const { welcomeStore } = loadContext();
    welcomeStore.upsertWelcomeTourLock('session-1');

    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    let nextCalled = false;
    welcomeStore.rejectIfWelcomeTourLocked({}, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(423);
    expect(res.body.code).toBe('welcome_tour_active');

    welcomeStore.releaseWelcomeTourLock('session-1');
    welcomeStore.rejectIfWelcomeTourLocked({}, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});
