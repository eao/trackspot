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

const CURRENT_TABLE_COLUMNS = Object.freeze({
  albums: Object.freeze([
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
  ]),
  import_jobs: Object.freeze([
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
  ]),
  import_job_rows: Object.freeze([
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
  ]),
});

const CURRENT_TABLE_ORDER = Object.freeze(['albums', 'import_jobs', 'import_job_rows']);

const REQUIRED_TABLE_SQL_PATTERNS = Object.freeze({
  albums: Object.freeze([
    /\bid\s+integer\s+primary\s+key\s+autoincrement\b/,
    /check\s*\(\s*rating\s+is\s+null\s+or\s*\(\s*rating\s*>=\s*0\s+and\s+rating\s*<=\s*100\s*\)\s*\)/,
    /check\s*\(\s*repeats\s*>=\s*0\s*\)/,
    /check\s*\(\s*priority\s*>=\s*0\s*\)/,
  ]),
  import_jobs: Object.freeze([
    /\bid\s+integer\s+primary\s+key\s+autoincrement\b/,
  ]),
  import_job_rows: Object.freeze([
    /\bid\s+integer\s+primary\s+key\s+autoincrement\b/,
  ]),
});

const DEFAULT_COPY_EXPRESSIONS = Object.freeze({
  albums: Object.freeze({
    spotify_url: 'NULL',
    spotify_album_id: 'NULL',
    share_url: 'NULL',
    album_name: "''",
    album_type: 'NULL',
    artists: "'[]'",
    release_date: 'NULL',
    release_year: 'NULL',
    label: 'NULL',
    genres: 'NULL',
    track_count: 'NULL',
    duration_ms: 'NULL',
    copyright: 'NULL',
    is_pre_release: 'NULL',
    dominant_color_dark: 'NULL',
    dominant_color_light: 'NULL',
    dominant_color_raw: 'NULL',
    image_path: 'NULL',
    image_url_small: 'NULL',
    image_url_medium: 'NULL',
    image_url_large: 'NULL',
    spotify_release_date: 'NULL',
    spotify_first_track: 'NULL',
    spotify_graphql_json: 'NULL',
    status: "'completed'",
    rating: 'NULL',
    notes: 'NULL',
    planned_at: 'NULL',
    listened_at: 'NULL',
    repeats: '0',
    priority: '0',
    source: "'manual'",
    album_link: 'NULL',
    artist_link: 'NULL',
    welcome_sample_key: 'NULL',
    created_at: "datetime('now')",
    updated_at: "datetime('now')",
  }),
  import_jobs: Object.freeze({
    source_type: "'csv'",
    filename: 'NULL',
    default_status: "'completed'",
    status: "'queued'",
    total_rows: '0',
    queued_rows: '0',
    processing_rows: '0',
    imported_rows: '0',
    skipped_rows: '0',
    failed_rows: '0',
    canceled_rows: '0',
    warning_rows: '0',
    last_error: 'NULL',
    created_at: "datetime('now')",
    updated_at: "datetime('now')",
    completed_at: 'NULL',
  }),
  import_job_rows: Object.freeze({
    job_id: '0',
    row_index: '0',
    spotify_url: 'NULL',
    spotify_album_id: 'NULL',
    desired_status: 'NULL',
    rating: 'NULL',
    notes: 'NULL',
    listened_at: 'NULL',
    default_status_applied: '0',
    warnings_json: 'NULL',
    status: "'queued'",
    error: 'NULL',
    created_album_id: 'NULL',
    lease_owner: 'NULL',
    lease_expires_at: 'NULL',
    raw_row_json: 'NULL',
    created_at: "datetime('now')",
    updated_at: "datetime('now')",
  }),
});

let expectedSchemaMetadata = null;

function openDatabase() {
  const connection = new Database(DB_PATH);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  ensureAppSchema(connection);
  return connection;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function createAlbumsTableSql(tableName, { ifNotExists = false } = {}) {
  return `
    CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${quoteIdentifier(tableName)} (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Spotify data
      spotify_url          TEXT,
      spotify_album_id     TEXT UNIQUE,
      share_url            TEXT,
      album_name           TEXT NOT NULL,
      album_type           TEXT,
      artists              TEXT NOT NULL,
      release_date         TEXT,
      release_year         INTEGER,
      label                TEXT,
      genres               TEXT,
      track_count          INTEGER,
      duration_ms          INTEGER,
      copyright            TEXT,
      is_pre_release       INTEGER,
      dominant_color_dark  TEXT,
      dominant_color_light TEXT,
      dominant_color_raw   TEXT,
      image_path           TEXT,
      image_url_small      TEXT,
      image_url_medium     TEXT,
      image_url_large      TEXT,
      spotify_release_date TEXT,
      spotify_first_track  TEXT,
      spotify_graphql_json TEXT,

      -- User data
      status               TEXT NOT NULL DEFAULT 'completed',
      rating               INTEGER CHECK(rating IS NULL OR (rating >= 0 AND rating <= 100)),
      notes                TEXT,
      planned_at           TEXT,
      listened_at          TEXT,
      repeats              INTEGER NOT NULL DEFAULT 0 CHECK(repeats >= 0),
      priority             INTEGER NOT NULL DEFAULT 0 CHECK(priority >= 0),

      -- Source
      source               TEXT NOT NULL DEFAULT 'manual',
      album_link           TEXT,
      artist_link          TEXT,
      welcome_sample_key   TEXT,

      -- Timestamps
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;
}

function createImportJobsTableSql(tableName, { ifNotExists = false } = {}) {
  return `
    CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${quoteIdentifier(tableName)} (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type          TEXT NOT NULL DEFAULT 'csv',
      filename             TEXT,
      default_status       TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'queued',
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
    )
  `;
}

function createImportJobRowsTableSql(tableName, { ifNotExists = false } = {}) {
  return `
    CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${quoteIdentifier(tableName)} (
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
      status               TEXT NOT NULL DEFAULT 'queued',
      error                TEXT,
      created_album_id     INTEGER,
      lease_owner          TEXT,
      lease_expires_at     TEXT,
      raw_row_json         TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(job_id, row_index)
    )
  `;
}

function createTableSql(tableName, options = {}) {
  if (tableName === 'albums') return createAlbumsTableSql(tableName, options);
  if (tableName === 'import_jobs') return createImportJobsTableSql(tableName, options);
  if (tableName === 'import_job_rows') return createImportJobRowsTableSql(tableName, options);
  throw new Error(`Unknown table schema: ${tableName}`);
}

function tableInfo(connection, tableName) {
  return connection.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
}

function tableExists(connection, tableName) {
  return Boolean(connection.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

function tableSql(connection, tableName) {
  return connection.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName)?.sql ?? '';
}

function normalizeDefaultValue(value) {
  if (value == null) return null;
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeSql(sql) {
  return String(sql)
    .replace(/--[^\n\r]*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function readColumnMetadata(connection, tableName) {
  return new Map(tableInfo(connection, tableName).map(column => [column.name, {
    type: String(column.type ?? '').trim().toUpperCase(),
    notnull: Number(column.notnull ?? 0),
    dflt_value: normalizeDefaultValue(column.dflt_value),
    pk: Number(column.pk ?? 0),
  }]));
}

function getExpectedSchemaMetadata() {
  if (expectedSchemaMetadata) return expectedSchemaMetadata;

  const schemaDb = new Database(':memory:');
  try {
    for (const tableName of CURRENT_TABLE_ORDER) {
      schemaDb.exec(createTableSql(tableName));
    }

    expectedSchemaMetadata = Object.freeze(Object.fromEntries(
      CURRENT_TABLE_ORDER.map(tableName => [tableName, Object.freeze({
        columns: readColumnMetadata(schemaDb, tableName),
      })]),
    ));
  } finally {
    schemaDb.close();
  }

  return expectedSchemaMetadata;
}

function columnMetadataMatches(currentColumn, expectedColumn) {
  return currentColumn.type === expectedColumn.type
    && currentColumn.notnull === expectedColumn.notnull
    && currentColumn.dflt_value === expectedColumn.dflt_value
    && currentColumn.pk === expectedColumn.pk;
}

function tableColumnMetadataMatches(connection, tableName) {
  const currentColumns = readColumnMetadata(connection, tableName);
  const expectedColumns = getExpectedSchemaMetadata()[tableName].columns;

  return CURRENT_TABLE_COLUMNS[tableName].every(columnName => {
    const currentColumn = currentColumns.get(columnName);
    const expectedColumn = expectedColumns.get(columnName);
    return currentColumn && expectedColumn && columnMetadataMatches(currentColumn, expectedColumn);
  });
}

function tableHasRequiredSqlClauses(connection, tableName) {
  const sql = normalizeSql(tableSql(connection, tableName));
  return REQUIRED_TABLE_SQL_PATTERNS[tableName].every(pattern => pattern.test(sql));
}

function indexColumnNames(connection, indexName) {
  return connection.prepare(`PRAGMA index_info(${quoteIdentifier(indexName)})`)
    .all()
    .sort((a, b) => a.seqno - b.seqno)
    .map(column => column.name);
}

function hasUniqueIndex(connection, tableName, columnNames) {
  return connection.prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`).all()
    .some(index => {
      if (!index.unique) return false;
      const columns = indexColumnNames(connection, index.name);
      return columns.length === columnNames.length
        && columns.every((columnName, indexPosition) => columnName === columnNames[indexPosition]);
    });
}

function hasImportRowsForeignKey(connection) {
  return connection.prepare('PRAGMA foreign_key_list(import_job_rows)').all()
    .some(foreignKey => foreignKey.from === 'job_id'
      && foreignKey.table === 'import_jobs'
      && foreignKey.to === 'id'
      && String(foreignKey.on_delete).toUpperCase() === 'CASCADE');
}

function tableNeedsRebuild(connection, tableName) {
  const currentColumns = tableInfo(connection, tableName).map(column => column.name);
  const expectedColumns = CURRENT_TABLE_COLUMNS[tableName];
  if (currentColumns.length !== expectedColumns.length
    || !expectedColumns.every((columnName, index) => currentColumns[index] === columnName)) {
    return true;
  }

  if (!tableColumnMetadataMatches(connection, tableName)
    || !tableHasRequiredSqlClauses(connection, tableName)) {
    return true;
  }

  if (tableName === 'albums') {
    return !hasUniqueIndex(connection, tableName, ['spotify_album_id']);
  }

  if (tableName === 'import_job_rows') {
    return !hasUniqueIndex(connection, tableName, ['job_id', 'row_index'])
      || !hasImportRowsForeignKey(connection);
  }

  return false;
}

function copyExpression(tableName, legacyTableName, columnName, existingColumnNames) {
  const legacyColumn = `legacy.${quoteIdentifier(columnName)}`;
  const fallback = DEFAULT_COPY_EXPRESSIONS[tableName]?.[columnName] ?? 'NULL';
  if (!existingColumnNames.has(columnName)) return fallback;

  if (columnName === 'spotify_album_id' && tableName === 'albums') {
    if (!existingColumnNames.has('id')) return `NULLIF(${legacyColumn}, '')`;
    return `
      CASE
        WHEN ${legacyColumn} IS NULL OR ${legacyColumn} = '' THEN NULL
        WHEN legacy.rowid = (
          SELECT MIN(dedupe.rowid)
          FROM ${quoteIdentifier(legacyTableName)} AS dedupe
          WHERE dedupe.${quoteIdentifier('spotify_album_id')} = ${legacyColumn}
        ) THEN ${legacyColumn}
        ELSE NULL
      END
    `;
  }

  if (columnName === 'created_at' || columnName === 'updated_at') {
    return `COALESCE(NULLIF(${legacyColumn}, ''), datetime('now'))`;
  }

  if (columnName === 'rating' && tableName === 'albums') {
    return `
      CASE
        WHEN ${legacyColumn} IS NULL OR (${legacyColumn} >= 0 AND ${legacyColumn} <= 100) THEN ${legacyColumn}
        ELSE NULL
      END
    `;
  }

  if (['repeats', 'priority'].includes(columnName) && tableName === 'albums') {
    return `
      CASE
        WHEN ${legacyColumn} IS NOT NULL AND ${legacyColumn} >= 0 THEN ${legacyColumn}
        ELSE ${fallback}
      END
    `;
  }

  if (['album_name', 'artists', 'status', 'source', 'default_status', 'source_type'].includes(columnName)) {
    return `COALESCE(${legacyColumn}, ${fallback})`;
  }

  if (['repeats', 'priority', 'total_rows', 'queued_rows', 'processing_rows', 'imported_rows',
    'skipped_rows', 'failed_rows', 'canceled_rows', 'warning_rows', 'default_status_applied',
    'job_id', 'row_index'].includes(columnName)) {
    return `COALESCE(${legacyColumn}, ${fallback})`;
  }

  return legacyColumn;
}

function copyWhereClause(tableName, legacyTableName, existingColumnNames) {
  if (tableName !== 'import_job_rows') return '';
  if (!existingColumnNames.has('job_id') || !existingColumnNames.has('row_index')) return 'WHERE 0';

  const clauses = [`
    EXISTS (
      SELECT 1
      FROM import_jobs
      WHERE import_jobs.id = legacy.${quoteIdentifier('job_id')}
    )
  `];

  if (existingColumnNames.has('id')) {
    clauses.push(`
      legacy.rowid = (
        SELECT MIN(dedupe.rowid)
        FROM ${quoteIdentifier(legacyTableName)} AS dedupe
        WHERE dedupe.${quoteIdentifier('job_id')} = legacy.${quoteIdentifier('job_id')}
          AND dedupe.${quoteIdentifier('row_index')} = legacy.${quoteIdentifier('row_index')}
      )
    `);
  }

  return `WHERE ${clauses.join(' AND ')}`;
}

function syncAutoincrementSequence(connection, tableName) {
  if (!tableExists(connection, 'sqlite_sequence')) return;

  const { max_id: maxId } = connection.prepare(`
    SELECT COALESCE(MAX(id), 0) AS max_id
    FROM ${quoteIdentifier(tableName)}
  `).get();
  const existing = connection.prepare('SELECT 1 FROM sqlite_sequence WHERE name = ?').get(tableName);
  if (existing) {
    connection.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(maxId, tableName);
  } else {
    connection.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(tableName, maxId);
  }
}

function rebuildTable(connection, tableName) {
  const legacyTableName = `${tableName}__legacy_schema_migration`;
  const existingColumnNames = new Set(tableInfo(connection, tableName).map(column => column.name));
  const copyColumns = CURRENT_TABLE_COLUMNS[tableName]
    .filter(columnName => columnName !== 'id' || existingColumnNames.has('id'));
  const selectExpressions = copyColumns
    .map(columnName => `${copyExpression(tableName, legacyTableName, columnName, existingColumnNames)} AS ${quoteIdentifier(columnName)}`);

  connection.exec(`
    DROP TABLE IF EXISTS ${quoteIdentifier(legacyTableName)};
    ALTER TABLE ${quoteIdentifier(tableName)} RENAME TO ${quoteIdentifier(legacyTableName)};
    ${createTableSql(tableName)};
    INSERT INTO ${quoteIdentifier(tableName)} (${copyColumns.map(quoteIdentifier).join(', ')})
    SELECT ${selectExpressions.join(', ')}
    FROM ${quoteIdentifier(legacyTableName)} AS legacy
    ${copyWhereClause(tableName, legacyTableName, existingColumnNames)};
    DROP TABLE ${quoteIdentifier(legacyTableName)};
  `);

  syncAutoincrementSequence(connection, tableName);
}

function ensureCurrentTableSchemas(connection) {
  for (const tableName of CURRENT_TABLE_ORDER) {
    connection.exec(createTableSql(tableName, { ifNotExists: true }));
  }

  const rebuildSet = new Set(CURRENT_TABLE_ORDER
    .filter(tableName => tableExists(connection, tableName) && tableNeedsRebuild(connection, tableName)));
  if (rebuildSet.has('import_jobs') && tableExists(connection, 'import_job_rows')) {
    rebuildSet.add('import_job_rows');
  }

  const rebuilds = CURRENT_TABLE_ORDER.filter(tableName => rebuildSet.has(tableName));
  if (!rebuilds.length) return;

  const foreignKeysWereEnabled = Boolean(connection.pragma('foreign_keys', { simple: true }));
  connection.pragma('foreign_keys = OFF');
  try {
    connection.transaction(() => {
      for (const tableName of rebuilds) {
        rebuildTable(connection, tableName);
      }
    })();
  } finally {
    if (foreignKeysWereEnabled) {
      connection.pragma('foreign_keys = ON');
    }
  }

  if (foreignKeysWereEnabled) {
    const foreignKeyViolations = connection.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyViolations.length) {
      throw new Error(`Schema migration left ${foreignKeyViolations.length} foreign key violation(s).`);
    }
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
  ensureCurrentTableSchemas(connection);

  connection.exec(`
    CREATE INDEX IF NOT EXISTS idx_spotify_album_id ON albums(spotify_album_id);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_import_job_rows_job_status ON import_job_rows(job_id, status, row_index);
    CREATE INDEX IF NOT EXISTS idx_import_job_rows_lease ON import_job_rows(status, lease_expires_at);
  `);

  ensureAlbumsUpdatedAtTrigger(connection);

  connection.exec(`
    CREATE TRIGGER IF NOT EXISTS import_jobs_updated_at
    AFTER UPDATE ON import_jobs
    BEGIN
      UPDATE import_jobs SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

    CREATE TRIGGER IF NOT EXISTS import_job_rows_updated_at
    AFTER UPDATE ON import_job_rows
    BEGIN
      UPDATE import_job_rows SET updated_at = datetime('now') WHERE id = OLD.id;
    END;
  `);

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
