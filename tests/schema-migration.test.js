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

function tableColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name);
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
});
