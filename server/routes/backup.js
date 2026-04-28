const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const archiver = require('archiver');
const AdmZip   = require('adm-zip');
const multer   = require('multer');
const { db, IMAGES_DIR, replaceDatabaseFile } = require('../db');
const { rejectIfWelcomeTourLocked } = require('../welcome-tour-store');

const DATA_DIR = path.join(IMAGES_DIR, '..');
const BACKUP_MANIFEST_NAME = 'trackspot-backup.json';
const BACKUP_MANIFEST_VERSION = 1;
const RESTORE_JOURNAL_NAME = '_restore_journal.json';
const RESTORE_JOURNAL_PATH = path.join(DATA_DIR, RESTORE_JOURNAL_NAME);
const APP_STATE_BACKUP_ITEMS = [
  { zipPath: 'preferences.json', type: 'file' },
  { zipPath: 'opacity-presets', type: 'directory' },
  { zipPath: 'themes', type: 'directory' },
  { zipPath: 'theme-preview-images', type: 'directory' },
  { zipPath: 'theme-preview-images-thumbs', type: 'directory' },
  { zipPath: 'backgrounds-user', type: 'directory' },
  { zipPath: 'backgrounds-user-thumbs', type: 'directory' },
  { zipPath: 'backgrounds-user-secondary', type: 'directory' },
  { zipPath: 'backgrounds-user-secondary-thumbs', type: 'directory' },
];

router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return rejectIfWelcomeTourLocked(req, res, next);
});

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

function createRestoreTempDir(prefix) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return fs.mkdtempSync(path.join(DATA_DIR, prefix));
}

function createRestoreTempPath(prefix) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return path.join(DATA_DIR, `${prefix}${unique}`);
}

function fsyncDirectoryBestEffort(directoryPath) {
  let dirFd = null;
  try {
    dirFd = fs.openSync(directoryPath, 'r');
    fs.fsyncSync(dirFd);
  } catch {
    // Directory fsync is not supported on every platform/filesystem.
  } finally {
    if (dirFd !== null) {
      try {
        fs.closeSync(dirFd);
      } catch {
        // Best-effort durability only.
      }
    }
  }
}

function writeRestoreJournal(journal) {
  const tempPath = createRestoreTempPath('_restore_journal_');
  const contents = `${JSON.stringify({ ...journal, updatedAt: new Date().toISOString() }, null, 2)}\n`;
  let fileFd = null;

  try {
    fileFd = fs.openSync(tempPath, 'w');
    fs.writeFileSync(fileFd, contents);
    fs.fsyncSync(fileFd);
    fs.closeSync(fileFd);
    fileFd = null;
    fs.renameSync(tempPath, RESTORE_JOURNAL_PATH);
    fsyncDirectoryBestEffort(DATA_DIR);
  } catch (error) {
    if (fileFd !== null) {
      try {
        fs.closeSync(fileFd);
      } catch {
        // Preserve the original write/rename error.
      }
    }
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function readRestoreJournal() {
  if (!fs.existsSync(RESTORE_JOURNAL_PATH)) return null;
  try {
    const journal = JSON.parse(fs.readFileSync(RESTORE_JOURNAL_PATH, 'utf8'));
    if (!journal || typeof journal !== 'object' || Array.isArray(journal) || journal.operation !== 'restore') {
      throw new Error('Restore journal is invalid.');
    }
    return journal;
  } catch (error) {
    console.error('Could not read restore journal:', error);
    throw new Error(`Could not read restore journal: ${error.message}`);
  }
}

function removeRestoreJournal() {
  fs.rmSync(RESTORE_JOURNAL_PATH, { force: true });
}

function buildBackupManifest(kind, includesAppState) {
  return {
    app: 'trackspot',
    version: BACKUP_MANIFEST_VERSION,
    kind,
    includesAppState: !!includesAppState,
    appStatePaths: includesAppState
      ? APP_STATE_BACKUP_ITEMS.map(item => item.zipPath)
      : [],
    createdAt: new Date().toISOString(),
  };
}

function appendBackupManifest(archive, kind, includesAppState) {
  const manifest = buildBackupManifest(kind, includesAppState);
  archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: BACKUP_MANIFEST_NAME });
}

function appendAppStateToArchive(archive) {
  for (const item of APP_STATE_BACKUP_ITEMS) {
    const sourcePath = path.join(DATA_DIR, item.zipPath);
    if (!fs.existsSync(sourcePath)) continue;
    if (item.type === 'file') {
      archive.file(sourcePath, { name: item.zipPath });
    } else {
      archive.directory(sourcePath, item.zipPath);
    }
  }
}

function normalizeZipEntryName(entryName) {
  return String(entryName || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function isSafeZipEntryName(entryName) {
  const normalized = normalizeZipEntryName(entryName).replace(/\/+$/, '');
  if (!normalized) return false;
  if (path.isAbsolute(entryName) || /^[A-Za-z]:/.test(entryName)) return false;
  return !normalized.split('/').some(part => part === '..' || part === '');
}

function validateZipEntryNames(zip) {
  for (const entry of zip.getEntries()) {
    if (!isSafeZipEntryName(entry.entryName)) {
      throw new Error(`Unsafe backup path: ${entry.entryName}`);
    }
  }
}

function resolveInside(basePath, relativePath) {
  const targetPath = path.resolve(basePath, relativePath);
  const resolvedBase = path.resolve(basePath);
  if (targetPath !== resolvedBase && !targetPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Unsafe backup path: ${relativePath}`);
  }
  return targetPath;
}

function readBackupManifest(zip) {
  const entry = zip.getEntry(BACKUP_MANIFEST_NAME);
  if (!entry || entry.isDirectory) return null;

  try {
    const manifest = JSON.parse(entry.getData().toString('utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
    return manifest;
  } catch {
    throw new Error('Backup manifest could not be parsed.');
  }
}

function getAppStateItemForEntry(entryName) {
  const normalized = normalizeZipEntryName(entryName);
  return APP_STATE_BACKUP_ITEMS.find(item => {
    if (item.type === 'file') return normalized === item.zipPath;
    return normalized.startsWith(`${item.zipPath}/`);
  }) || null;
}

function clearAppStateBackupTargets() {
  for (const item of APP_STATE_BACKUP_ITEMS) {
    const targetPath = resolveInside(DATA_DIR, item.zipPath);
    if (item.type === 'file') {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    } else {
      fs.rmSync(targetPath, { recursive: true, force: true });
      fs.mkdirSync(targetPath, { recursive: true });
    }
  }
}

function copyAppStateItems(sourceRoot, targetRoot, options = {}) {
  const { createMissingDirectories = false } = options;
  for (const item of APP_STATE_BACKUP_ITEMS) {
    const sourcePath = resolveInside(sourceRoot, item.zipPath);
    const targetPath = resolveInside(targetRoot, item.zipPath);
    if (!fs.existsSync(sourcePath)) {
      if (createMissingDirectories && item.type === 'directory') {
        fs.mkdirSync(targetPath, { recursive: true });
      }
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    if (item.type === 'file') {
      fs.copyFileSync(sourcePath, targetPath);
    } else {
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    }
  }
}

function restoreAppStateRollback(rollbackDir) {
  clearAppStateBackupTargets();
  copyAppStateItems(rollbackDir, DATA_DIR);
}

function getAppStateEntriesToRestore(zip) {
  const entriesToRestore = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const normalized = normalizeZipEntryName(entry.entryName);
    const item = getAppStateItemForEntry(normalized);
    if (!item) continue;
    if (!isSafeZipEntryName(entry.entryName)) {
      throw new Error(`Unsafe backup path: ${entry.entryName}`);
    }

    const targetPath = resolveInside(DATA_DIR, normalized);
    const itemRoot = resolveInside(DATA_DIR, item.zipPath);
    if (item.type === 'file' && targetPath !== itemRoot) {
      throw new Error(`Unsafe backup path: ${entry.entryName}`);
    }
    if (item.type === 'directory' && !targetPath.startsWith(`${itemRoot}${path.sep}`)) {
      throw new Error(`Unsafe backup path: ${entry.entryName}`);
    }

    entriesToRestore.push({ entry, normalized });
  }

  return entriesToRestore;
}

function stageAppStateFromZip(zip, stagingDir) {
  const entriesToRestore = getAppStateEntriesToRestore(zip);
  let filesRestored = 0;

  for (const { entry, normalized } of entriesToRestore) {
    const targetPath = resolveInside(stagingDir, normalized);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, entry.getData());
    filesRestored++;
  }

  return filesRestored;
}

function createAppStateRollback() {
  const rollbackDir = createRestoreTempDir('_restore_app_state_rollback_');
  copyAppStateItems(DATA_DIR, rollbackDir);
  return rollbackDir;
}

function commitAppStateFromStaging(stagingDir, rollbackDir = null) {
  const ownedRollbackDir = rollbackDir || createAppStateRollback();
  try {
    clearAppStateBackupTargets();
    copyAppStateItems(stagingDir, DATA_DIR, { createMissingDirectories: true });
  } catch (error) {
    try {
      restoreAppStateRollback(ownedRollbackDir);
    } catch (rollbackError) {
      console.error('App-state restore rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    if (!rollbackDir) fs.rmSync(ownedRollbackDir, { recursive: true, force: true });
  }
}

function restoreAppStateFromZip(zip) {
  const stagingDir = createRestoreTempDir('_restore_app_state_');
  try {
    const filesRestored = stageAppStateFromZip(zip, stagingDir);
    commitAppStateFromStaging(stagingDir);
    return filesRestored;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function createImageRollback() {
  return {
    path: createRestoreTempPath('_restore_images_rollback_'),
    hadImagesDir: fs.existsSync(IMAGES_DIR),
  };
}

function moveImagesDirToRollback(rollback = createImageRollback()) {
  fs.rmSync(rollback.path, { recursive: true, force: true });
  if (fs.existsSync(IMAGES_DIR)) {
    fs.renameSync(IMAGES_DIR, rollback.path);
  }
  return rollback;
}

function restoreImagesRollback(rollback) {
  if (rollback?.hadImagesDir) {
    if (fs.existsSync(rollback.path)) {
      fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
      fs.renameSync(rollback.path, IMAGES_DIR);
    } else if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }
  } else {
    fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

function commitImagesFromStaging(stagingImagesDir, rollback = createImageRollback()) {
  try {
    rollback = moveImagesDirToRollback(rollback);
    fs.renameSync(stagingImagesDir, IMAGES_DIR);
    return rollback;
  } catch (error) {
    try {
      restoreImagesRollback(rollback);
    } catch (rollbackError) {
      console.error('Image restore rollback failed:', rollbackError);
    }
    throw error;
  }
}

async function downloadImageToDir(imageUrl, albumId, targetImagesDir) {
  const filename = `${albumId}.jpg`;
  const filepath = path.join(targetImagesDir, filename);

  if (fs.existsSync(filepath)) {
    return `images/${filename}`;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download album art: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(targetImagesDir, { recursive: true });
  fs.writeFileSync(filepath, buffer);

  return `images/${filename}`;
}

const RESTORE_PHASES = [
  'prepared',
  'db-swapping',
  'db-swapped',
  'images-swapping',
  'images-swapped',
  'app-state-swapping',
  'app-state-swapped',
  'committed',
];

function restorePhaseIndex(phase) {
  const index = RESTORE_PHASES.indexOf(phase);
  return index === -1 ? 0 : index;
}

function restorePhaseReached(journal, phase) {
  return restorePhaseIndex(journal?.phase) >= restorePhaseIndex(phase);
}

function resolveRestoreArtifact(artifactPath) {
  if (!artifactPath) return null;
  const resolved = path.resolve(artifactPath);
  const resolvedDataDir = path.resolve(DATA_DIR);
  if (resolved !== resolvedDataDir && !resolved.startsWith(`${resolvedDataDir}${path.sep}`)) {
    return null;
  }
  if (!path.basename(resolved).startsWith('_restore_')) return null;
  return resolved;
}

function cleanupRestoreArtifacts(journal) {
  const artifactPaths = [
    journal?.tmpPath,
    journal?.rollbackDbPath,
    journal?.stagingImagesDir,
    journal?.stagingAppStateDir,
    journal?.appStateRollbackDir,
    journal?.imageRollback?.path,
  ];

  for (const artifactPath of artifactPaths) {
    const resolved = resolveRestoreArtifact(artifactPath);
    if (resolved && fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}

function recordRestoreRollbackError(errors, label, error) {
  console.error(`${label} failed:`, error);
  errors.push({ label, error });
}

function throwRestoreRollbackErrors(errors) {
  if (!errors.length) return;
  const message = errors
    .map(({ label, error }) => `${label}: ${error.message}`)
    .join('; ');
  const aggregate = new Error(`Interrupted restore recovery completed with errors: ${message}`);
  aggregate.errors = errors.map(({ error }) => error);
  throw aggregate;
}

function rollbackInterruptedRestore(journal) {
  if (!journal) return;
  const rollbackErrors = [];

  if (journal.phase === 'committed') {
    try {
      cleanupRestoreArtifacts(journal);
    } catch (error) {
      recordRestoreRollbackError(rollbackErrors, 'Committed restore artifact cleanup', error);
    }
    try {
      removeRestoreJournal();
    } catch (error) {
      recordRestoreRollbackError(rollbackErrors, 'Committed restore journal removal', error);
    }
    throwRestoreRollbackErrors(rollbackErrors);
    return;
  }

  if (restorePhaseReached(journal, 'app-state-swapping') && journal.appStateRollbackDir) {
    try {
      const appStateRollbackDir = resolveRestoreArtifact(journal.appStateRollbackDir);
      if (appStateRollbackDir && fs.existsSync(appStateRollbackDir)) {
        restoreAppStateRollback(appStateRollbackDir);
      }
    } catch (error) {
      recordRestoreRollbackError(rollbackErrors, 'App-state restore rollback', error);
    }
  }

  if (restorePhaseReached(journal, 'images-swapping') && journal.imageRollback) {
    try {
      const imageRollbackPath = resolveRestoreArtifact(journal.imageRollback.path);
      restoreImagesRollback({
        ...journal.imageRollback,
        path: imageRollbackPath || '',
      });
    } catch (error) {
      recordRestoreRollbackError(rollbackErrors, 'Image restore rollback', error);
    }
  }

  if (restorePhaseReached(journal, 'db-swapping')) {
    try {
      const rollbackDbPath = resolveRestoreArtifact(journal.rollbackDbPath);
      if (rollbackDbPath && fs.existsSync(rollbackDbPath)) {
        replaceDatabaseFile(rollbackDbPath);
      }
    } catch (error) {
      recordRestoreRollbackError(rollbackErrors, 'Database restore rollback', error);
    }
  }

  try {
    cleanupRestoreArtifacts(journal);
  } catch (error) {
    recordRestoreRollbackError(rollbackErrors, 'Restore artifact cleanup', error);
  }
  try {
    removeRestoreJournal();
  } catch (error) {
    recordRestoreRollbackError(rollbackErrors, 'Restore journal removal', error);
  }

  throwRestoreRollbackErrors(rollbackErrors);
}

function recoverInterruptedRestore() {
  const journal = readRestoreJournal();
  if (!journal) return false;

  try {
    rollbackInterruptedRestore(journal);
    return true;
  } catch (error) {
    console.error('Interrupted restore recovery failed:', error);
    throw error;
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

async function restoreAlbumImages(rows, zip, isRestore, options = {}) {
  const targetImagesDir = options.targetImagesDir || IMAGES_DIR;
  let imagesCopied = 0;
  let imagesRefetched = 0;

  const zipImageEntries = new Map();
  for (const entry of zip.getEntries()) {
    const normalized = normalizeZipEntryName(entry.entryName);
    if (normalized.startsWith('images/') && !entry.isDirectory) {
      zipImageEntries.set(normalized, entry);
    }
  }

  fs.mkdirSync(targetImagesDir, { recursive: true });
  const { downloadImage } = targetImagesDir === IMAGES_DIR
    ? require('../spotify-helpers')
    : { downloadImage: (imageUrl, albumId) => downloadImageToDir(imageUrl, albumId, targetImagesDir) };

  for (const row of rows) {
    if (row.image_path) {
      const entryKey = row.image_path.replace(/\\/g, '/');
      const entry = zipImageEntries.get(entryKey);
      if (entry) {
        const destPath = path.join(targetImagesDir, path.basename(entryKey));
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
    const destPath = path.join(targetImagesDir, `${row.spotify_album_id}.jpg`);
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
      `attachment; filename="trackspot-backup-${stamp}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);
    appendBackupManifest(archive, 'full', true);
    archive.append(Buffer.from(csv, 'utf-8'), { name: 'albums.csv' });
    archive.file(tmpPath, { name: 'albums.db' });
    if (fs.existsSync(IMAGES_DIR)) archive.directory(IMAGES_DIR, 'images');
    appendAppStateToArchive(archive);
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
      `attachment; filename="trackspot-backup-essential-${stamp}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);
    appendBackupManifest(archive, 'essential', false);
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
      `attachment; filename="trackspot-backup-db-${stamp}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);
    appendBackupManifest(archive, 'database', false);
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
    `attachment; filename="trackspot-${stamp}.csv"`);
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
  const rollbackDbPath = path.join(DATA_DIR, `_restore_rollback_${Date.now()}.db`);
  let stagingImagesDir = null;
  let stagingAppStateDir = null;
  let imageRollback = null;
  let appStateRollbackDir = null;
  let backupDb = null;
  let restoreSucceeded = false;
  let journal = null;
  const manifest = readBackupManifest(zip);
  const shouldRestoreAppState = manifest?.includesAppState === true;

  try {
    recoverInterruptedRestore();
    validateZipEntryNames(zip);
    fs.writeFileSync(tmpPath, dbEntry.getData());
    const BetterSqlite = require('better-sqlite3');
    backupDb = new BetterSqlite(tmpPath, { readonly: true });
    const tableCheck = backupDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='albums'"
    ).get();
    if (!tableCheck) throw new Error('Backup database does not contain an albums table.');

    const restoredAlbums = backupDb.prepare('SELECT * FROM albums ORDER BY created_at ASC').all();
    stagingImagesDir = createRestoreTempDir('_restore_images_');
    const { imagesCopied, imagesRefetched } = await restoreAlbumImages(
      restoredAlbums,
      zip,
      true,
      { targetImagesDir: stagingImagesDir },
    );

    let appStateFilesRestored = 0;
    if (shouldRestoreAppState) {
      stagingAppStateDir = createRestoreTempDir('_restore_app_state_');
      appStateFilesRestored = stageAppStateFromZip(zip, stagingAppStateDir);
      appStateRollbackDir = createAppStateRollback();
    }

    await db.backup(rollbackDbPath);
    imageRollback = createImageRollback();
    journal = {
      operation: 'restore',
      phase: 'prepared',
      tmpPath,
      rollbackDbPath,
      stagingImagesDir,
      stagingAppStateDir,
      imageRollback,
      appStateRollbackDir,
    };
    writeRestoreJournal(journal);

    journal = { ...journal, phase: 'db-swapping' };
    writeRestoreJournal(journal);
    replaceDatabaseFile(tmpPath);

    journal = { ...journal, phase: 'db-swapped' };
    writeRestoreJournal(journal);

    journal = { ...journal, phase: 'images-swapping' };
    writeRestoreJournal(journal);
    imageRollback = commitImagesFromStaging(stagingImagesDir, imageRollback);
    stagingImagesDir = null;
    journal = { ...journal, phase: 'images-swapped', stagingImagesDir, imageRollback };
    writeRestoreJournal(journal);

    if (shouldRestoreAppState) {
      journal = { ...journal, phase: 'app-state-swapping' };
      writeRestoreJournal(journal);
      commitAppStateFromStaging(stagingAppStateDir, appStateRollbackDir);
      journal = { ...journal, phase: 'app-state-swapped' };
      writeRestoreJournal(journal);
    }

    journal = { ...journal, phase: 'committed' };
    writeRestoreJournal(journal);
    restoreSucceeded = true;
    return {
      added: restoredAlbums.length,
      skipped: 0,
      imagesCopied,
      imagesRefetched,
      appStateRestored: shouldRestoreAppState,
      appStateFilesRestored,
    };
  } catch (error) {
    if (backupDb) {
      backupDb.close();
      backupDb = null;
    }
    const activeJournal = journal || readRestoreJournal();
    if (activeJournal) {
      try {
        rollbackInterruptedRestore(activeJournal);
      } catch (rollbackError) {
        console.error('Restore rollback failed:', rollbackError);
      }
    }
    throw error;
  } finally {
    backupDb?.close();
    if (restoreSucceeded && journal) {
      cleanupRestoreArtifacts(journal);
      removeRestoreJournal();
    } else if (!readRestoreJournal()) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(rollbackDbPath)) fs.unlinkSync(rollbackDbPath);
      if (stagingImagesDir) fs.rmSync(stagingImagesDir, { recursive: true, force: true });
      if (stagingAppStateDir) fs.rmSync(stagingAppStateDir, { recursive: true, force: true });
      if (appStateRollbackDir) fs.rmSync(appStateRollbackDir, { recursive: true, force: true });
    }
  }
}

recoverInterruptedRestore();

router.__private = {
  APP_STATE_BACKUP_ITEMS,
  BACKUP_MANIFEST_NAME,
  RESTORE_JOURNAL_NAME,
  buildBackupManifest,
  importFromZip,
  readBackupManifest,
  readRestoreJournal,
  recoverInterruptedRestore,
  restoreAppStateFromZip,
  stageAppStateFromZip,
  restoreFromZip,
  writeRestoreJournal,
};

module.exports = router;
