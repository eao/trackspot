import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const BetterSqlite = require('better-sqlite3');
const serverModulePaths = [
  '../server/db.js',
  '../server/album-helpers.js',
];

const tempDirs = [];
const openDbs = [];

function resetServerModules() {
  for (const modulePath of serverModulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function createLegacyDatabase() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-release-date-migration-test-'));
  tempDirs.push(dataDir);
  process.env.DATA_DIR = dataDir;

  const dbPath = path.join(dataDir, 'albums.db');
  const legacyDb = new BetterSqlite(dbPath);
  openDbs.push(legacyDb);

  legacyDb.exec(`
    CREATE TABLE albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spotify_album_id TEXT,
      album_name TEXT NOT NULL,
      artists TEXT NOT NULL,
      release_year INTEGER,
      spotify_release_date TEXT,
      spotify_graphql_json TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  legacyDb.prepare(`
    INSERT INTO albums (
      id, spotify_album_id, album_name, artists, release_year, spotify_release_date, spotify_graphql_json, status, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    1,
    'spotify-1',
    'Spotify Wins',
    JSON.stringify([{ name: 'Artist One' }]),
    1999,
    JSON.stringify({ isoString: '2024-03-15T00:00:00Z', precision: 'DAY', year: 2024 }),
    JSON.stringify({
      data: {
        albumUnion: {
          tracksV2: {
            items: [
              { track: { name: 'First Legacy Track', uri: 'spotify:track:legacyTrack1' } },
            ],
          },
        },
      },
    }),
    'completed',
    'spotify',
    '2026-04-15 01:00:00',
    '2026-04-15 01:00:00',
  );
  legacyDb.prepare(`
    INSERT INTO albums (
      id, spotify_album_id, album_name, artists, release_year, spotify_release_date, status, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    2,
    null,
    'Year Only',
    JSON.stringify([{ name: 'Artist Two' }]),
    2001,
    null,
    'completed',
    'manual',
    '2026-04-15 02:00:00',
    '2026-04-15 02:00:00',
  );
  legacyDb.prepare(`
    INSERT INTO albums (
      id, spotify_album_id, album_name, artists, release_year, spotify_release_date, status, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    3,
    null,
    'No Release Info',
    JSON.stringify([{ name: 'Artist Three' }]),
    null,
    null,
    'planned',
    'manual',
    '2026-04-15 03:00:00',
    '2026-04-15 03:00:00',
  );

  return dataDir;
}

afterEach(() => {
  while (openDbs.length) {
    openDbs.pop()?.close();
  }

  delete process.env.DATA_DIR;
  resetServerModules();

  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('release_date schema migration', () => {
  it('backfills release_date from spotify_release_date first, then release_year, and preserves nulls', () => {
    createLegacyDatabase();
    resetServerModules();

    const dbModule = require('../server/db.js');
    openDbs.push(dbModule.db);

    const columns = dbModule.db.prepare('PRAGMA table_info(albums)').all().map(column => column.name);
    expect(columns).toContain('release_date');

    const rows = dbModule.db.prepare(`
      SELECT id, release_date, release_year
      FROM albums
      ORDER BY id ASC
    `).all();

    expect(rows).toEqual([
      { id: 1, release_date: '2024-03-15', release_year: 2024 },
      { id: 2, release_date: '2001-01-01', release_year: 2001 },
      { id: 3, release_date: null, release_year: null },
    ]);
  });

  it('adds and backfills compact first-track metadata from legacy GraphQL payloads', () => {
    createLegacyDatabase();
    resetServerModules();

    const dbModule = require('../server/db.js');
    openDbs.push(dbModule.db);

    const columns = dbModule.db.prepare('PRAGMA table_info(albums)').all().map(column => column.name);
    expect(columns).toContain('spotify_first_track');

    const row = dbModule.db.prepare(`
      SELECT spotify_first_track, updated_at
      FROM albums
      WHERE id = 1
    `).get();

    expect(JSON.parse(row.spotify_first_track)).toEqual({
      id: 'legacyTrack1',
      name: 'First Legacy Track',
      uri: 'spotify:track:legacyTrack1',
      share_url: 'https://open.spotify.com/track/legacyTrack1',
    });
    expect(row.updated_at).toBe('2026-04-15 01:00:00');
  });
});
