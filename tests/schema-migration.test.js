import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const BetterSqlite = require('better-sqlite3');
const serverModulePaths = [
  '../server/import-jobs.js',
  '../server/album-helpers.js',
  '../server/spotify-helpers.js',
  '../server/db.js',
];

const tempDirs = [];
const openDbs = [];

const EXPECTED_COLUMNS = {
  albums: [
    'id',
    'spotify_url',
    'spotify_album_id',
    'share_url',
    'album_name',
    'album_type',
    'artists',
    'release_date',
    'release_year',
    'label',
    'genres',
    'track_count',
    'duration_ms',
    'copyright',
    'is_pre_release',
    'dominant_color_dark',
    'dominant_color_light',
    'dominant_color_raw',
    'image_path',
    'image_url_small',
    'image_url_medium',
    'image_url_large',
    'spotify_release_date',
    'spotify_first_track',
    'spotify_graphql_json',
    'status',
    'rating',
    'notes',
    'planned_at',
    'listened_at',
    'repeats',
    'priority',
    'source',
    'album_link',
    'artist_link',
    'welcome_sample_key',
    'created_at',
    'updated_at',
  ],
  import_jobs: [
    'id',
    'source_type',
    'filename',
    'default_status',
    'status',
    'total_rows',
    'queued_rows',
    'processing_rows',
    'imported_rows',
    'skipped_rows',
    'failed_rows',
    'canceled_rows',
    'warning_rows',
    'last_error',
    'created_at',
    'updated_at',
    'completed_at',
  ],
  import_job_rows: [
    'id',
    'job_id',
    'row_index',
    'spotify_url',
    'spotify_album_id',
    'desired_status',
    'rating',
    'notes',
    'listened_at',
    'default_status_applied',
    'warnings_json',
    'status',
    'error',
    'created_album_id',
    'lease_owner',
    'lease_expires_at',
    'raw_row_json',
    'created_at',
    'updated_at',
  ],
};

function resetServerModules() {
  for (const modulePath of serverModulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function createSparseLegacyDatabase() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-schema-migration-test-'));
  tempDirs.push(dataDir);
  process.env.DATA_DIR = dataDir;

  const dbPath = path.join(dataDir, 'albums.db');
  const legacyDb = new BetterSqlite(dbPath);
  openDbs.push(legacyDb);

  legacyDb.exec(`
    CREATE TABLE albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_name TEXT NOT NULL,
      artists TEXT NOT NULL
    );

    CREATE TABLE import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      default_status TEXT NOT NULL
    );

    CREATE TABLE import_job_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued'
    );
  `);

  legacyDb.prepare(`
    INSERT INTO albums (id, album_name, artists)
    VALUES (?, ?, ?)
  `).run(1, 'Legacy Album', JSON.stringify([{ name: 'Legacy Artist' }]));

  legacyDb.prepare(`
    INSERT INTO import_jobs (id, default_status)
    VALUES (?, ?)
  `).run(1, 'completed');

  legacyDb.prepare(`
    INSERT INTO import_job_rows (id, job_id, row_index, status)
    VALUES (?, ?, ?, ?)
  `).run(1, 1, 1, 'queued');
}

function createConstraintDriftDatabase() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-schema-drift-test-'));
  tempDirs.push(dataDir);
  process.env.DATA_DIR = dataDir;

  const dbPath = path.join(dataDir, 'albums.db');
  const driftedDb = new BetterSqlite(dbPath);
  openDbs.push(driftedDb);

  driftedDb.exec(`
    CREATE TABLE albums (
      id INTEGER,
      spotify_url TEXT,
      spotify_album_id TEXT,
      share_url TEXT,
      album_name TEXT,
      album_type TEXT,
      artists TEXT,
      release_date TEXT,
      release_year INTEGER,
      label TEXT,
      genres TEXT,
      track_count INTEGER,
      duration_ms INTEGER,
      copyright TEXT,
      is_pre_release INTEGER,
      dominant_color_dark TEXT,
      dominant_color_light TEXT,
      dominant_color_raw TEXT,
      image_path TEXT,
      image_url_small TEXT,
      image_url_medium TEXT,
      image_url_large TEXT,
      spotify_release_date TEXT,
      spotify_first_track TEXT,
      spotify_graphql_json TEXT,
      status TEXT DEFAULT 'completed',
      rating INTEGER,
      notes TEXT,
      planned_at TEXT,
      listened_at TEXT,
      repeats INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      source TEXT DEFAULT 'manual',
      album_link TEXT,
      artist_link TEXT,
      welcome_sample_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX albums_spotify_album_id_unique ON albums(spotify_album_id);

    CREATE TABLE import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      default_status TEXT NOT NULL
    );

    CREATE TABLE import_job_rows (
      id INTEGER,
      job_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      spotify_url TEXT,
      status TEXT NOT NULL DEFAULT 'queued'
    );
  `);

  driftedDb.prepare(`
    INSERT INTO albums (
      id, spotify_album_id, album_name, artists, status, rating, repeats, priority, source,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    7,
    'drifted-album-1',
    null,
    null,
    null,
    150,
    -3,
    -5,
    null,
    '',
    '',
  );

  driftedDb.prepare(`
    INSERT INTO albums (
      spotify_album_id, album_name, artists, status, source
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    'drifted-album-null-id',
    'Null ID Album',
    '[]',
    'completed',
    'manual',
  );

  driftedDb.prepare(`
    INSERT INTO import_jobs (id, default_status)
    VALUES (?, ?)
  `).run(42, 'planned');

  driftedDb.prepare(`
    INSERT INTO import_job_rows (job_id, row_index, spotify_url, status)
    VALUES (?, ?, ?, ?)
  `).run(42, 1, 'https://open.spotify.com/album/NULLIDIMPORTROW', 'queued');
}

function tableColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name);
}

function columnInfo(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .find(column => column.name === columnName);
}

function expectDatetimeNowDefault(db, tableName, columnName) {
  expect(String(columnInfo(db, tableName, columnName)?.dflt_value ?? ''))
    .toMatch(/datetime\s*\(\s*'now'\s*\)/i);
}

function expectTimestampValue(value) {
  expect(value).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/));
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

describe('legacy schema migration', () => {
  it('adds the current persisted column set to sparse legacy tables', () => {
    createSparseLegacyDatabase();
    resetServerModules();

    const dbModule = require('../server/db.js');
    const importJobs = require('../server/import-jobs.js');
    const { db } = dbModule;
    openDbs.push(db);

    for (const [tableName, expectedColumns] of Object.entries(EXPECTED_COLUMNS)) {
      expect(tableColumns(db, tableName)).toEqual(expect.arrayContaining(expectedColumns));
    }

    const migratedAlbum = db.prepare(`
      SELECT status, source, repeats, priority, image_url_small, image_url_medium, image_url_large,
        album_link, artist_link
      FROM albums
      WHERE id = 1
    `).get();
    expect(migratedAlbum).toEqual({
      status: 'completed',
      source: 'manual',
      repeats: 0,
      priority: 0,
      image_url_small: null,
      image_url_medium: null,
      image_url_large: null,
      album_link: null,
      artist_link: null,
    });

    db.prepare(`
      UPDATE albums
      SET
        repeats = ?,
        priority = ?,
        album_link = ?,
        artist_link = ?,
        image_url_small = ?,
        image_url_medium = ?,
        image_url_large = ?
      WHERE id = ?
    `).run(
      2,
      5,
      'https://example.com/album',
      'https://example.com/artist',
      'https://example.com/small.jpg',
      'https://example.com/medium.jpg',
      'https://example.com/large.jpg',
      1,
    );

    expect(db.prepare(`
      SELECT repeats, priority, album_link, artist_link, image_url_small, image_url_medium, image_url_large
      FROM albums
      WHERE id = 1
    `).get()).toEqual({
      repeats: 2,
      priority: 5,
      album_link: 'https://example.com/album',
      artist_link: 'https://example.com/artist',
      image_url_small: 'https://example.com/small.jpg',
      image_url_medium: 'https://example.com/medium.jpg',
      image_url_large: 'https://example.com/large.jpg',
    });

    db.prepare(`
      INSERT INTO import_job_rows (
        job_id, row_index, spotify_url, spotify_album_id, desired_status,
        warnings_json, status, created_album_id, lease_owner, lease_expires_at, raw_row_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      1,
      2,
      'https://open.spotify.com/album/ABCDEFGHIJKLMNOPQRST',
      'ABCDEFGHIJKLMNOPQRST',
      'completed',
      JSON.stringify(['Imported with a warning.']),
      'imported',
      1,
      'worker-1',
      '2026-04-15 00:00:00',
      JSON.stringify(['https://open.spotify.com/album/ABCDEFGHIJKLMNOPQRST']),
    );

    db.prepare(`
      UPDATE import_job_rows
      SET status = 'canceled'
      WHERE id = 1
    `).run();

    const refreshedJob = importJobs.refreshImportJob(1);
    expect(refreshedJob).toMatchObject({
      source_type: 'csv',
      status: 'completed',
      total_rows: 2,
      imported_rows: 1,
      canceled_rows: 1,
      warning_rows: 1,
    });

    const importedRow = db.prepare(`
      SELECT created_album_id, lease_owner, lease_expires_at, raw_row_json
      FROM import_job_rows
      WHERE row_index = 2
    `).get();
    expect(importedRow).toEqual({
      created_album_id: 1,
      lease_owner: 'worker-1',
      lease_expires_at: '2026-04-15 00:00:00',
      raw_row_json: JSON.stringify(['https://open.spotify.com/album/ABCDEFGHIJKLMNOPQRST']),
    });
  });

  it('restores timestamp defaults and constraints on migrated tables', () => {
    createSparseLegacyDatabase();
    resetServerModules();

    const dbModule = require('../server/db.js');
    const { db } = dbModule;
    openDbs.push(db);

    for (const tableName of Object.keys(EXPECTED_COLUMNS)) {
      expectDatetimeNowDefault(db, tableName, 'created_at');
      expectDatetimeNowDefault(db, tableName, 'updated_at');
    }

    const legacyRows = db.prepare(`
      SELECT albums.created_at AS album_created_at,
        import_jobs.created_at AS job_created_at,
        import_job_rows.created_at AS row_created_at
      FROM albums, import_jobs, import_job_rows
      WHERE albums.id = 1
        AND import_jobs.id = 1
        AND import_job_rows.id = 1
    `).get();
    expectTimestampValue(legacyRows.album_created_at);
    expectTimestampValue(legacyRows.job_created_at);
    expectTimestampValue(legacyRows.row_created_at);

    const insertedAlbum = db.prepare(`
      INSERT INTO albums (album_name, artists, spotify_album_id)
      VALUES (?, ?, ?)
    `).run('New Album', '[]', 'spotify-album-1');
    const newAlbum = db.prepare(`
      SELECT created_at, updated_at
      FROM albums
      WHERE id = ?
    `).get(insertedAlbum.lastInsertRowid);
    expectTimestampValue(newAlbum.created_at);
    expectTimestampValue(newAlbum.updated_at);

    expect(() => db.prepare(`
      INSERT INTO albums (album_name, artists, spotify_album_id)
      VALUES (?, ?, ?)
    `).run('Duplicate Album', '[]', 'spotify-album-1')).toThrow(/UNIQUE/i);

    const insertedJob = db.prepare(`
      INSERT INTO import_jobs (default_status)
      VALUES (?)
    `).run('completed');
    const newJob = db.prepare(`
      SELECT created_at, updated_at
      FROM import_jobs
      WHERE id = ?
    `).get(insertedJob.lastInsertRowid);
    expectTimestampValue(newJob.created_at);
    expectTimestampValue(newJob.updated_at);

    const insertedImportRow = db.prepare(`
      INSERT INTO import_job_rows (job_id, row_index)
      VALUES (?, ?)
    `).run(insertedJob.lastInsertRowid, 1);
    const newImportRow = db.prepare(`
      SELECT created_at, updated_at
      FROM import_job_rows
      WHERE id = ?
    `).get(insertedImportRow.lastInsertRowid);
    expectTimestampValue(newImportRow.created_at);
    expectTimestampValue(newImportRow.updated_at);

    expect(() => db.prepare(`
      INSERT INTO import_job_rows (job_id, row_index)
      VALUES (?, ?)
    `).run(insertedJob.lastInsertRowid, 1)).toThrow(/UNIQUE/i);

    expect(() => db.prepare(`
      INSERT INTO import_job_rows (job_id, row_index)
      VALUES (?, ?)
    `).run(9999, 1)).toThrow(/FOREIGN KEY/i);

    db.prepare('DELETE FROM import_jobs WHERE id = ?').run(insertedJob.lastInsertRowid);
    expect(db.prepare('SELECT COUNT(*) AS count FROM import_job_rows WHERE job_id = ?')
      .get(insertedJob.lastInsertRowid).count).toBe(0);
  });

  it('rebuilds tables whose columns exist but constraints drifted', () => {
    createConstraintDriftDatabase();
    resetServerModules();

    const dbModule = require('../server/db.js');
    const { db } = dbModule;
    openDbs.push(db);

    expect(columnInfo(db, 'albums', 'id')).toMatchObject({ pk: 1 });
    expect(columnInfo(db, 'albums', 'album_name')).toMatchObject({ notnull: 1 });
    expect(columnInfo(db, 'albums', 'artists')).toMatchObject({ notnull: 1 });
    expect(columnInfo(db, 'albums', 'status')).toMatchObject({ notnull: 1 });
    expect(columnInfo(db, 'albums', 'source')).toMatchObject({ notnull: 1 });

    const migratedAlbum = db.prepare(`
      SELECT id, spotify_album_id, album_name, artists, status, source, rating, repeats, priority, created_at, updated_at
      FROM albums
      WHERE id = 7
    `).get();
    expect(migratedAlbum).toMatchObject({
      id: 7,
      spotify_album_id: 'drifted-album-1',
      album_name: '',
      artists: '[]',
      status: 'completed',
      source: 'manual',
      rating: null,
      repeats: 0,
      priority: 0,
    });
    expectTimestampValue(migratedAlbum.created_at);
    expectTimestampValue(migratedAlbum.updated_at);

    const nullIdAlbum = db.prepare(`
      SELECT id, spotify_album_id, album_name, artists
      FROM albums
      WHERE spotify_album_id = ?
    `).get('drifted-album-null-id');
    expect(nullIdAlbum).toMatchObject({
      id: 8,
      spotify_album_id: 'drifted-album-null-id',
      album_name: 'Null ID Album',
      artists: '[]',
    });

    expect(db.prepare(`
      SELECT id, job_id, row_index, spotify_url, status
      FROM import_job_rows
      WHERE job_id = ? AND row_index = ?
    `).get(42, 1)).toMatchObject({
      id: 1,
      job_id: 42,
      row_index: 1,
      spotify_url: 'https://open.spotify.com/album/NULLIDIMPORTROW',
      status: 'queued',
    });

    expect(() => db.prepare(`
      INSERT INTO albums (album_name, artists, rating)
      VALUES (?, ?, ?)
    `).run('Invalid Rating', '[]', 101)).toThrow(/CHECK/i);

    expect(() => db.prepare(`
      INSERT INTO albums (album_name, artists, repeats)
      VALUES (?, ?, ?)
    `).run('Invalid Repeats', '[]', -1)).toThrow(/CHECK/i);

    expect(() => db.prepare(`
      INSERT INTO albums (album_name, artists, priority)
      VALUES (?, ?, ?)
    `).run('Invalid Priority', '[]', -1)).toThrow(/CHECK/i);

    const insertedAlbum = db.prepare(`
      INSERT INTO albums (album_name, artists)
      VALUES (?, ?)
    `).run('Next Album', '[]');
    expect(insertedAlbum.lastInsertRowid).toBe(9);
  });
});
