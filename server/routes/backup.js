const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const archiver = require('archiver');
const AdmZip   = require('adm-zip');
const multer   = require('multer');
const { db, IMAGES_DIR, replaceDatabaseFile } = require('../db');

const DATA_DIR = path.join(IMAGES_DIR, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function localDatetimeStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
         `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function parseAlbumRow(row) {
  if (!row) return null;
  return {
    ...row,
    artists:   JSON.parse(row.artists   || '[]'),
    genres:    JSON.parse(row.genres    || '[]'),
    copyright: JSON.parse(row.copyright || '[]'),
    spotify_release_date: row.spotify_release_date ? JSON.parse(row.spotify_release_date) : null,
    spotify_first_track: row.spotify_first_track ? JSON.parse(row.spotify_first_track) : null,
    spotify_graphql_json: row.spotify_graphql_json ? JSON.parse(row.spotify_graphql_json) : null,
  };
}

function generateCsvContent(rows) {
  const headers = [
    'Album art (placeholder)',
    'Album name',
    'Album artist(s)',
    'Rating',
    'Notes',
    'Status',
    'Listen date',
    'Release date',
    'Release year',
    'Album type',
    'Spotify URL',
    'Medium art URL',
    'Full album JSON',
  ];

  function csvCell(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const dataRows = rows.map(row => {
    const a           = parseAlbumRow(row);
    const artistNames = a.artists.map(x => x.name      || '').join(', ');
    const fullAlbumJson = JSON.stringify(a);
    return [
      '',                                                          // A: blank (art placeholder)
      a.album_name ?? '',
      artistNames,
      a.rating ?? '',
      a.notes ?? '',
      a.status ?? '',
      a.listened_at ?? '',
      a.release_date ?? '',
      a.release_year ?? '',
      a.album_type ?? '',
      a.spotify_url ?? '',
      a.image_url_medium ?? '',
      fullAlbumJson,
    ].map(csvCell).join(',');
  });

  return '\uFEFF' + [headers.map(csvCell).join(','), ...dataRows].join('\n');
}

async function snapshotDb(tmpPath) {
  await db.backup(tmpPath);
}

function clearImagesDir() {
  if (!fs.existsSync(IMAGES_DIR)) return;
  for (const fileName of fs.readdirSync(IMAGES_DIR)) {
    fs.rmSync(path.join(IMAGES_DIR, fileName), { recursive: true, force: true });
  }
}

function getAlbumTableColumns(connection) {
  return connection.prepare('PRAGMA table_info(albums)').all().map(column => column.name);
}

function getBackupAlbumValue(columnName, row) {
  if (columnName === 'artists') return row.artists || '[]';
  if (columnName === 'genres') return row.genres || '[]';
  if (columnName === 'copyright') return row.copyright || '[]';
  if (columnName === 'status') return row.status ?? 'completed';
  if (columnName === 'repeats') return row.repeats ?? 0;
  if (columnName === 'priority') return row.priority ?? 0;
  if (columnName === 'source') return row.source ?? 'manual';
  return row[columnName] ?? null;
}

function buildAlbumInsertStatement(srcDb) {
  const currentColumns = getAlbumTableColumns(db);
  const sourceColumns = new Set(getAlbumTableColumns(srcDb));
  const insertColumns = currentColumns.filter(column => column !== 'id' && sourceColumns.has(column));
  const sql = `
    INSERT OR IGNORE INTO albums (
      ${insertColumns.join(', ')}
    ) VALUES (
      ${insertColumns.map(column => `:${column}`).join(', ')}
    )
  `;

  return {
    insertColumns,
    statement: db.prepare(sql),
  };
}

async function restoreAlbumImages(rows, zip, isRestore) {
  let imagesCopied = 0;
  let imagesRefetched = 0;

  const zipImageEntries = new Map();
  for (const entry of zip.getEntries()) {
    if (entry.entryName.startsWith('images/') && !entry.isDirectory) {
      zipImageEntries.set(entry.entryName, entry);
    }
  }

  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const { downloadImage } = require('../spotify');

  for (const row of rows) {
    if (row.image_path) {
      const entryKey = row.image_path.replace(/\\/g, '/');
      const entry = zipImageEntries.get(entryKey);
      if (entry) {
        const destPath = path.join(IMAGES_DIR, path.basename(entryKey));
        if (isRestore || !fs.existsSync(destPath)) {
          fs.writeFileSync(destPath, entry.getData());
          imagesCopied++;
        }
        continue;
      }
    }

    if (!row.spotify_album_id) continue;
    const imageUrl = row.image_url_large || row.image_url_medium || row.image_url_small;
    if (!imageUrl) continue;
    const destPath = path.join(IMAGES_DIR, `${row.spotify_album_id}.jpg`);
    if (!isRestore && fs.existsSync(destPath)) continue;

    try {
      await downloadImage(imageUrl, row.spotify_album_id);
      imagesRefetched++;
    } catch (err) {
      console.warn(`Could not re-fetch image for ${row.album_name}:`, err.message);
    }
  }

  return { imagesCopied, imagesRefetched };
}

// ---------------------------------------------------------------------------
// GET /api/backup/download  — full backup (CSV + DB + images)
// ---------------------------------------------------------------------------

router.get('/download', async (req, res) => {
  const stamp   = localDatetimeStamp();
  const tmpPath = path.join(DATA_DIR, `_snapshot_${stamp}.db`);
  try {
    await snapshotDb(tmpPath);
    const rows = db.prepare('SELECT * FROM albums ORDER BY created_at ASC').all();
    const csv  = generateCsvContent(rows);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition',
      `attachment; filename="album-tracker-backup-${stamp}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);
    archive.append(Buffer.from(csv, 'utf-8'), { name: 'albums.csv' });
    archive.file(tmpPath, { name: 'albums.db' });
    if (fs.existsSync(IMAGES_DIR)) archive.directory(IMAGES_DIR, 'images');
    await archive.finalize();
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

// ---------------------------------------------------------------------------
// GET /api/backup/download-essential  — essential backup (CSV + DB + manual images)
// ---------------------------------------------------------------------------

router.get('/download-essential', async (_req, res) => {
  const stamp   = localDatetimeStamp();
  const tmpPath = path.join(DATA_DIR, `_snapshot_${stamp}.db`);
  try {
    await snapshotDb(tmpPath);
    const rows = db.prepare('SELECT * FROM albums ORDER BY created_at ASC').all();
    const csv  = generateCsvContent(rows);
    const manualRows = rows.filter(r => r.source === 'manual');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition',
      `attachment; filename="album-tracker-backup-essential-${stamp}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);
    archive.append(Buffer.from(csv, 'utf-8'), { name: 'albums.csv' });
    archive.file(tmpPath, { name: 'albums.db' });
    for (const row of manualRows) {
      if (!row.image_path) continue;
      const imgFile = path.join(DATA_DIR, row.image_path);
      if (fs.existsSync(imgFile)) {
        archive.file(imgFile, { name: row.image_path });
      }
    }
    await archive.finalize();
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

// ---------------------------------------------------------------------------
// GET /api/backup/download-db  — DB-only backup (CSV + DB, no images)
// ---------------------------------------------------------------------------

router.get('/download-db', async (req, res) => {
  const stamp   = localDatetimeStamp();
  const tmpPath = path.join(DATA_DIR, `_snapshot_${stamp}.db`);
  try {
    await snapshotDb(tmpPath);
    const rows = db.prepare('SELECT * FROM albums ORDER BY created_at ASC').all();
    const csv  = generateCsvContent(rows);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition',
      `attachment; filename="album-tracker-backup-db-${stamp}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);
    archive.append(Buffer.from(csv, 'utf-8'), { name: 'albums.csv' });
    archive.file(tmpPath, { name: 'albums.db' });
    await archive.finalize();
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

// ---------------------------------------------------------------------------
// GET /api/backup/export-csv  — standalone CSV export
// ---------------------------------------------------------------------------

router.get('/export-csv', (req, res) => {
  const rows  = db.prepare('SELECT * FROM albums ORDER BY created_at ASC').all();
  if (!rows.length) return res.status(404).json({ error: 'No albums to export!' });
  const stamp = localDatetimeStamp();
  const csv   = generateCsvContent(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="album-tracker-${stamp}.csv"`);
  res.end(Buffer.from(csv, 'utf-8'));
});

// ---------------------------------------------------------------------------
// Upload middleware
// ---------------------------------------------------------------------------

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// POST /api/backup/merge  — add albums from ZIP that don't already exist
// ---------------------------------------------------------------------------

router.post('/merge', upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const zip    = new AdmZip(req.file.buffer);
    const result = await importFromZip(zip, false);
    res.json(result);
  } catch (e) {
    console.error('Merge error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/backup/restore  — wipe and replace with ZIP contents
// ---------------------------------------------------------------------------

router.post('/restore', upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const zip = new AdmZip(req.file.buffer);
    const result = await restoreFromZip(zip);
    res.json(result);
  } catch (e) {
    console.error('Restore error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Shared import logic
// ---------------------------------------------------------------------------

async function importFromZip(zip, isRestore) {
  const dbEntry = zip.getEntry('albums.db');
  if (!dbEntry) throw new Error('ZIP does not contain albums.db.');

  const tmpPath = path.join(DATA_DIR, '_import_tmp.db');
  fs.writeFileSync(tmpPath, dbEntry.getData());

  const BetterSqlite = require('better-sqlite3');
  const srcDb = new BetterSqlite(tmpPath, { readonly: true });

  let added = 0, skipped = 0, imagesCopied = 0, imagesRefetched = 0;

  try {
    const tableCheck = srcDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='albums'"
    ).get();
    if (!tableCheck) throw new Error('Backup database does not contain an albums table.');

    const backupAlbums = srcDb.prepare('SELECT * FROM albums').all();
    const { insertColumns, statement: insertStmt } = buildAlbumInsertStatement(srcDb);

    const manualDupCheck = db.prepare(
      'SELECT id FROM albums WHERE spotify_album_id IS NULL AND album_name = ? AND artists = ?'
    );

    const insertedRows = [];

    db.transaction(() => {
      for (const row of backupAlbums) {
        if (!isRestore && !row.spotify_album_id) {
          const dup = manualDupCheck.get(row.album_name, row.artists);
          if (dup) { skipped++; continue; }
        }
        const params = Object.fromEntries(
          insertColumns.map(column => [column, getBackupAlbumValue(column, row)])
        );
        const result = insertStmt.run(params);
        if (result.changes > 0) { added++; insertedRows.push(row); }
        else skipped++;
      }
    })();
    ({ imagesCopied, imagesRefetched } = await restoreAlbumImages(insertedRows, zip, isRestore));

  } finally {
    srcDb.close();
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }

  return { added, skipped, imagesCopied, imagesRefetched };
}

async function restoreFromZip(zip) {
  const dbEntry = zip.getEntry('albums.db');
  if (!dbEntry) throw new Error('ZIP does not contain albums.db.');

  const tmpPath = path.join(DATA_DIR, `_restore_tmp_${Date.now()}.db`);
  let backupDb = null;

  try {
    fs.writeFileSync(tmpPath, dbEntry.getData());
    const BetterSqlite = require('better-sqlite3');
    backupDb = new BetterSqlite(tmpPath, { readonly: true });
    const tableCheck = backupDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='albums'"
    ).get();
    if (!tableCheck) throw new Error('Backup database does not contain an albums table.');

    replaceDatabaseFile(tmpPath);
    clearImagesDir();
    const restoredAlbums = db.prepare('SELECT * FROM albums ORDER BY created_at ASC').all();
    const { imagesCopied, imagesRefetched } = await restoreAlbumImages(restoredAlbums, zip, true);
    return {
      added: restoredAlbums.length,
      skipped: 0,
      imagesCopied,
      imagesRefetched,
    };
  } finally {
    backupDb?.close();
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

router.__private = {
  importFromZip,
  restoreFromZip,
};

module.exports = router;
