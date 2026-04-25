const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const {
  buildReleaseDateFromYear,
  deriveReleaseYear,
  extractSpotifyFirstTrackFromGraphqlPayload,
  extractSpotifyReleaseDateFromGraphqlPayload,
  getReleaseDateFromSpotifyReleaseDate,
  parseJsonField,
} = require('./album-helpers');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const DB_PATH = path.join(DATA_DIR, 'albums.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

let currentDb = null;

const ALBUMS_UPDATED_AT_TRIGGER_SQL = `
  CREATE TRIGGER IF NOT EXISTS albums_updated_at
  AFTER UPDATE ON albums
  BEGIN
    UPDATE albums SET updated_at = datetime('now') WHERE id = OLD.id;
  END;
`;

function openDatabase() {
  const connection = new Database(DB_PATH);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  ensureAppSchema(connection);
  return connection;
}

function ensureColumn(connection, tableName, columnName, alterSql) {
  const columns = connection.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some(column => column.name === columnName)) {
    connection.exec(alterSql);
  }
}

function ensureAlbumsUpdatedAtTrigger(connection) {
  connection.exec(ALBUMS_UPDATED_AT_TRIGGER_SQL);
}

function backfillSpotifyReleaseDates(connection) {
  const columns = connection.prepare('PRAGMA table_info(albums)').all();
  if (!columns.some(column => column.name === 'spotify_release_date')) return 0;

  const rowsNeedingBackfill = connection.prepare(`
    SELECT id, spotify_graphql_json
    FROM albums
    WHERE spotify_release_date IS NULL
      AND spotify_graphql_json IS NOT NULL
  `).all();

  if (!rowsNeedingBackfill.length) return 0;

  const updateReleaseDate = connection.prepare(`
    UPDATE albums
    SET spotify_release_date = :spotify_release_date
    WHERE id = :id
  `);

  const runBackfill = connection.transaction(rows => {
    let updatedCount = 0;
    connection.exec('DROP TRIGGER IF EXISTS albums_updated_at');
    try {
      for (const row of rows) {
        let parsedPayload = null;
        try {
          parsedPayload = JSON.parse(row.spotify_graphql_json);
        } catch {
          parsedPayload = null;
        }
        const spotifyReleaseDate = extractSpotifyReleaseDateFromGraphqlPayload(parsedPayload);
        if (!spotifyReleaseDate) continue;
        updateReleaseDate.run({
          id: row.id,
          spotify_release_date: JSON.stringify(spotifyReleaseDate),
        });
        updatedCount++;
      }
    } finally {
      ensureAlbumsUpdatedAtTrigger(connection);
    }
    return updatedCount;
  });

  return runBackfill(rowsNeedingBackfill);
}

function backfillSpotifyFirstTracks(connection) {
  const columns = connection.prepare('PRAGMA table_info(albums)').all();
  if (!columns.some(column => column.name === 'spotify_first_track')) return 0;

  const rowsNeedingBackfill = connection.prepare(`
    SELECT id, spotify_graphql_json
    FROM albums
    WHERE spotify_first_track IS NULL
      AND spotify_graphql_json IS NOT NULL
  `).all();

  if (!rowsNeedingBackfill.length) return 0;

  const updateFirstTrack = connection.prepare(`
    UPDATE albums
    SET spotify_first_track = :spotify_first_track
    WHERE id = :id
  `);

  const runBackfill = connection.transaction(rows => {
    let updatedCount = 0;
    connection.exec('DROP TRIGGER IF EXISTS albums_updated_at');
    try {
      for (const row of rows) {
        let parsedPayload = null;
        try {
          parsedPayload = JSON.parse(row.spotify_graphql_json);
        } catch {
          parsedPayload = null;
        }
        const firstTrack = extractSpotifyFirstTrackFromGraphqlPayload(parsedPayload);
        if (!firstTrack) continue;
        updateFirstTrack.run({
          id: row.id,
          spotify_first_track: JSON.stringify(firstTrack),
        });
        updatedCount++;
      }
    } finally {
      ensureAlbumsUpdatedAtTrigger(connection);
    }
    return updatedCount;
  });

  return runBackfill(rowsNeedingBackfill);
}

function backfillAlbumReleaseDates(connection) {
  const columns = connection.prepare('PRAGMA table_info(albums)').all();
  if (!columns.some(column => column.name === 'release_date')) return 0;

  const rowsNeedingBackfill = connection.prepare(`
    SELECT id, release_year, spotify_release_date
    FROM albums
    WHERE release_date IS NULL
  `).all();

  if (!rowsNeedingBackfill.length) return 0;

  const updateReleaseDate = connection.prepare(`
    UPDATE albums
    SET release_date = :release_date,
        release_year = :release_year
    WHERE id = :id
  `);

  const runBackfill = connection.transaction(rows => {
    let updatedCount = 0;
    connection.exec('DROP TRIGGER IF EXISTS albums_updated_at');
    try {
      for (const row of rows) {
        const spotifyReleaseDate = parseJsonField(row.spotify_release_date, null);
        const releaseDate = getReleaseDateFromSpotifyReleaseDate(spotifyReleaseDate)
          ?? buildReleaseDateFromYear(row.release_year);
        if (!releaseDate) continue;
        updateReleaseDate.run({
          id: row.id,
          release_date: releaseDate,
          release_year: deriveReleaseYear(releaseDate),
        });
        updatedCount++;
      }
    } finally {
      ensureAlbumsUpdatedAtTrigger(connection);
    }
    return updatedCount;
  });

  return runBackfill(rowsNeedingBackfill);
}

function ensureAppSchema(connection) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Spotify data
      spotify_url          TEXT,
      spotify_album_id     TEXT UNIQUE,
      share_url            TEXT,
      album_name           TEXT NOT NULL,
      album_type           TEXT,
      artists              TEXT NOT NULL,  -- JSON array of {id, name, share_url, avatar_url}
      release_date         TEXT,
      release_year         INTEGER,
      label                TEXT,
      genres               TEXT,           -- JSON array of strings
      track_count          INTEGER,
      duration_ms          INTEGER,
      copyright            TEXT,           -- JSON array of {text, type}
      is_pre_release       INTEGER,        -- 0 or 1
      dominant_color_dark  TEXT,
      dominant_color_light TEXT,
      dominant_color_raw   TEXT,
      image_path           TEXT,
      image_url_small      TEXT,           -- 64px Spotify CDN URL
      image_url_medium     TEXT,           -- 300px Spotify CDN URL
      image_url_large      TEXT,           -- 640px Spotify CDN URL
      spotify_release_date TEXT,           -- JSON object with Spotify release date data (isoString, precision, year)
      spotify_first_track  TEXT,           -- JSON object with first-track data for share previews (id, name, uri, share_url)
      spotify_graphql_json TEXT,           -- Raw Spotify GraphQL response JSON from the Spicetify importer

      -- User data
      status               TEXT NOT NULL DEFAULT 'completed',  -- 'completed' | 'planned' | 'dropped'
      rating               INTEGER CHECK(rating IS NULL OR (rating >= 0 AND rating <= 100)),
      notes                TEXT,
      planned_at           TEXT,
      listened_at          TEXT,
      repeats              INTEGER NOT NULL DEFAULT 0 CHECK(repeats >= 0),
      priority             INTEGER NOT NULL DEFAULT 0 CHECK(priority >= 0),

      -- Source
      source               TEXT NOT NULL DEFAULT 'manual',  -- 'spotify' | 'manual'
      album_link           TEXT,
      artist_link          TEXT,
      welcome_sample_key   TEXT,

      -- Timestamps
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_spotify_album_id ON albums(spotify_album_id);
  `);

  ensureAlbumsUpdatedAtTrigger(connection);

  connection.exec(`
    CREATE TABLE IF NOT EXISTS import_jobs (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type          TEXT NOT NULL DEFAULT 'csv',
      filename             TEXT,
      default_status       TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'processing' | 'completed' | 'failed'
      total_rows           INTEGER NOT NULL DEFAULT 0,
      queued_rows          INTEGER NOT NULL DEFAULT 0,
      processing_rows      INTEGER NOT NULL DEFAULT 0,
      imported_rows        INTEGER NOT NULL DEFAULT 0,
      skipped_rows         INTEGER NOT NULL DEFAULT 0,
      failed_rows          INTEGER NOT NULL DEFAULT 0,
      canceled_rows        INTEGER NOT NULL DEFAULT 0,
      warning_rows         INTEGER NOT NULL DEFAULT 0,
      last_error           TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at         TEXT
    );

    CREATE TABLE IF NOT EXISTS import_job_rows (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id               INTEGER NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
      row_index            INTEGER NOT NULL,
      spotify_url          TEXT,
      spotify_album_id     TEXT,
      desired_status       TEXT,
      rating               INTEGER,
      notes                TEXT,
      listened_at          TEXT,
      default_status_applied INTEGER NOT NULL DEFAULT 0,
      warnings_json        TEXT,
      status               TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'processing' | 'imported' | 'skipped' | 'failed'
      error                TEXT,
      created_album_id     INTEGER,
      lease_owner          TEXT,
      lease_expires_at     TEXT,
      raw_row_json         TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(job_id, row_index)
    );

    CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_import_job_rows_job_status ON import_job_rows(job_id, status, row_index);
    CREATE INDEX IF NOT EXISTS idx_import_job_rows_lease ON import_job_rows(status, lease_expires_at);
  `);

  connection.exec(`
    CREATE TRIGGER IF NOT EXISTS import_jobs_updated_at
    AFTER UPDATE ON import_jobs
    BEGIN
      UPDATE import_jobs SET updated_at = datetime('now') WHERE id = OLD.id;
    END;
  `);

  connection.exec(`
    CREATE TRIGGER IF NOT EXISTS import_job_rows_updated_at
    AFTER UPDATE ON import_job_rows
    BEGIN
      UPDATE import_job_rows SET updated_at = datetime('now') WHERE id = OLD.id;
    END;
  `);

  ensureColumn(connection, 'import_jobs', 'canceled_rows',
    `ALTER TABLE import_jobs ADD COLUMN canceled_rows INTEGER NOT NULL DEFAULT 0;`);
  ensureColumn(connection, 'albums', 'planned_at',
    `ALTER TABLE albums ADD COLUMN planned_at TEXT;`);
  ensureColumn(connection, 'albums', 'spotify_release_date',
    `ALTER TABLE albums ADD COLUMN spotify_release_date TEXT;`);
  ensureColumn(connection, 'albums', 'release_date',
    `ALTER TABLE albums ADD COLUMN release_date TEXT;`);
  ensureColumn(connection, 'albums', 'spotify_first_track',
    `ALTER TABLE albums ADD COLUMN spotify_first_track TEXT;`);
  ensureColumn(connection, 'albums', 'welcome_sample_key',
    `ALTER TABLE albums ADD COLUMN welcome_sample_key TEXT;`);
  backfillSpotifyReleaseDates(connection);
  backfillAlbumReleaseDates(connection);
  backfillSpotifyFirstTracks(connection);
}

function getDb() {
  if (!currentDb) currentDb = openDatabase();
  return currentDb;
}

function reopenDatabase() {
  if (currentDb) currentDb.close();
  currentDb = openDatabase();
  return currentDb;
}

function replaceDatabaseFile(sourcePath) {
  const sidecarPaths = [`${DB_PATH}-wal`, `${DB_PATH}-shm`];

  if (currentDb) {
    currentDb.close();
    currentDb = null;
  }

  for (const sidecarPath of sidecarPaths) {
    fs.rmSync(sidecarPath, { force: true });
  }

  fs.copyFileSync(sourcePath, DB_PATH);
  currentDb = openDatabase();
  return currentDb;
}

const db = new Proxy({}, {
  get(_target, prop) {
    const value = getDb()[prop];
    return typeof value === 'function' ? value.bind(getDb()) : value;
  },
});

module.exports = {
  db,
  DATA_DIR,
  DB_PATH,
  IMAGES_DIR,
  ensureAppSchema,
  getDb,
  reopenDatabase,
  replaceDatabaseFile,
};
