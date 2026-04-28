const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const archiver = require('archiver');
const AdmZip   = require('adm-zip');
const multer   = require('multer');
const { db, DATA_DIR, IMAGES_DIR, replaceDatabaseFile } = require('../db');
const { getBackupUploadMaxBytes, getConfiguredPath } = require('../config');
const { beginBackupMutation, endBackupMutation } = require('../backup-mutation-lock');
const {
  buildManagedAlbumImagePath,
  buildUniqueAlbumImagePath,
  normalizeAlbumImagePath,
  resolveAlbumImagePath,
} = require('../album-image-paths');
const { rejectIfWelcomeTourLocked } = require('../welcome-tour-store');

const BACKUP_MANIFEST_NAME = 'trackspot-backup.json';
const BACKUP_MANIFEST_VERSION = 1;
const RESTORE_JOURNAL_NAME = '_restore_journal.json';
const RESTORE_JOURNAL_PATH = path.join(DATA_DIR, RESTORE_JOURNAL_NAME);
const MERGE_JOURNAL_NAME = '_merge_journal.json';
const MERGE_JOURNAL_PATH = path.join(DATA_DIR, MERGE_JOURNAL_NAME);
const MERGE_TEMP_DB_PREFIX = '_import_tmp_';
const MERGE_STAGING_IMAGES_PREFIX = '_import_images_';
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
  { zipPath: 'background-presets-thumbs', type: 'directory' },
  { zipPath: 'background-presets-secondary-thumbs', type: 'directory' },
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

function createMergeTempPath() {
  return createRestoreTempPath(MERGE_TEMP_DB_PREFIX);
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
    if (!RESTORE_PHASES.includes(journal.phase)) {
      throw new Error('Restore journal phase is invalid.');
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

function writeMergeJournal(journal) {
  const tempPath = createRestoreTempPath('_merge_journal_');
  const contents = `${JSON.stringify({ ...journal, updatedAt: new Date().toISOString() }, null, 2)}\n`;
  let fileFd = null;

  try {
    fileFd = fs.openSync(tempPath, 'w');
    fs.writeFileSync(fileFd, contents);
    fs.fsyncSync(fileFd);
    fs.closeSync(fileFd);
    fileFd = null;
    fs.renameSync(tempPath, MERGE_JOURNAL_PATH);
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

function readMergeJournal() {
  if (!fs.existsSync(MERGE_JOURNAL_PATH)) return null;
  try {
    const journal = JSON.parse(fs.readFileSync(MERGE_JOURNAL_PATH, 'utf8'));
    if (!journal || typeof journal !== 'object' || Array.isArray(journal) || journal.operation !== 'merge') {
      throw new Error('Merge journal is invalid.');
    }
    if (!Array.isArray(journal.imagePaths)) {
      throw new Error('Merge journal image paths are invalid.');
    }
    const imagePaths = journal.imagePaths.map(imagePath => {
      const normalized = normalizeAlbumImagePath(imagePath);
      if (!normalized) throw new Error('Merge journal image paths are invalid.');
      return normalized;
    });
    return {
      ...journal,
      imagePaths,
    };
  } catch (error) {
    console.error('Could not read merge journal:', error);
    throw new Error(`Could not read merge journal: ${error.message}`);
  }
}

function removeMergeJournal() {
  fs.rmSync(MERGE_JOURNAL_PATH, { force: true });
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

function finalizeArchiveResponse(archive, res) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      archive.off('error', onError);
      res.off('error', onError);
      res.off('finish', onFinish);
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const onFinish = () => {
      cleanup();
      resolve();
    };

    archive.once('error', onError);
    res.once('error', onError);
    res.once('finish', onFinish);
    archive.finalize().catch(onError);
  });
}

function normalizeZipEntryName(entryName) {
  return String(entryName || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

const WINDOWS_RESERVED_BASENAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const WINDOWS_RESERVED_PATH_CHARS_RE = /[<>:"|?*\u0000-\u001F]/;

function isWindowsReservedPathSegment(segment) {
  if (!segment) return true;
  if (WINDOWS_RESERVED_PATH_CHARS_RE.test(segment)) return true;
  if (/[. ]$/.test(segment)) return true;

  const windowsBaseName = segment.replace(/[. ]+$/g, '').split('.')[0];
  return WINDOWS_RESERVED_BASENAME_RE.test(windowsBaseName);
}

function isSafeZipEntryName(entryName) {
  const normalized = normalizeZipEntryName(entryName).replace(/\/+$/, '');
  if (!normalized) return false;
  if (path.isAbsolute(entryName) || /^[A-Za-z]:/.test(entryName)) return false;
  return !normalized.split('/').some(part => part === '..' || part === '');
}

function validateZipEntryNames(zip) {
  const seenCaseInsensitivePaths = new Map();

  for (const entry of zip.getEntries()) {
    const normalized = normalizeZipEntryName(entry.entryName).replace(/\/+$/, '');
    if (!isSafeZipEntryName(entry.entryName)) {
      throw new Error(`Unsafe backup path: ${entry.entryName}`);
    }

    const reservedSegment = normalized.split('/').find(isWindowsReservedPathSegment);
    if (reservedSegment) {
      throw new Error(`Backup path is not portable to Windows: ${entry.entryName}`);
    }

    const caseInsensitiveKey = normalized.toLowerCase();
    const previousPath = seenCaseInsensitivePaths.get(caseInsensitiveKey);
    if (previousPath) {
      if (previousPath === normalized) {
        throw new Error(`Duplicate backup path: ${entry.entryName}`);
      }
      throw new Error(
        `Backup paths collide on case-insensitive file systems: ${previousPath} and ${normalized}`
      );
    }
    seenCaseInsensitivePaths.set(caseInsensitiveKey, normalized);
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
      fs.cpSync(rollback.path, IMAGES_DIR, { recursive: true });
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
  const imagePath = buildManagedAlbumImagePath(albumId, '.jpg');
  const { fullPath: filepath } = resolveAlbumImagePath(imagePath, targetImagesDir);

  if (fs.existsSync(filepath)) {
    return imagePath;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download album art: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(targetImagesDir, { recursive: true });
  fs.writeFileSync(filepath, buffer);

  return imagePath;
}

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

function requireRestoreArtifact(artifactPath, label) {
  const resolved = resolveRestoreArtifact(artifactPath);
  if (!resolved) {
    throw new Error(`${label} is not a valid restore artifact.`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} is missing.`);
  }
  return resolved;
}

function recordRestoreRollbackProgress(journal, updates, errors, label) {
  const nextJournal = { ...journal, ...updates };
  try {
    writeRestoreJournal(nextJournal);
  } catch (error) {
    recordRestoreRollbackError(errors, label, error);
  }
  return nextJournal;
}

function finishInterruptedRestoreRecovery(journal, errors, cleanupLabel = 'Restore artifact cleanup') {
  throwRestoreRollbackErrors(errors);

  try {
    cleanupRestoreArtifacts(journal);
  } catch (error) {
    recordRestoreRollbackError(errors, cleanupLabel, error);
  }
  throwRestoreRollbackErrors(errors);

  try {
    removeRestoreJournal();
  } catch (error) {
    recordRestoreRollbackError(errors, 'Restore journal removal', error);
  }
  throwRestoreRollbackErrors(errors);
}

function rollbackInterruptedRestore(journal) {
  if (!journal) return;
  const rollbackErrors = [];
  let activeJournal = journal;

  if (journal.phase === 'committed') {
    finishInterruptedRestoreRecovery(journal, rollbackErrors, 'Committed restore artifact cleanup');
    return;
  }

  if (restorePhaseReached(activeJournal, 'app-state-swapping') && !activeJournal.appStateRolledBack) {
    try {
      const appStateRollbackDir = requireRestoreArtifact(
        activeJournal.appStateRollbackDir,
        'App-state restore rollback directory',
      );
      restoreAppStateRollback(appStateRollbackDir);
      activeJournal = recordRestoreRollbackProgress(
        activeJournal,
        { appStateRolledBack: true },
        rollbackErrors,
        'App-state rollback progress journal update',
      );
    } catch (error) {
      recordRestoreRollbackError(rollbackErrors, 'App-state restore rollback', error);
    }
  }

  if (restorePhaseReached(activeJournal, 'images-swapping') && !activeJournal.imagesRolledBack) {
    try {
      if (!activeJournal.imageRollback) {
        throw new Error('Image restore rollback metadata is missing.');
      }
      const imageRollbackPath = activeJournal.imageRollback.hadImagesDir
        ? requireRestoreArtifact(activeJournal.imageRollback.path, 'Image restore rollback directory')
        : resolveRestoreArtifact(activeJournal.imageRollback.path);
      restoreImagesRollback({
        ...activeJournal.imageRollback,
        path: imageRollbackPath || '',
      });
      activeJournal = recordRestoreRollbackProgress(
        activeJournal,
        { imagesRolledBack: true },
        rollbackErrors,
        'Image rollback progress journal update',
      );
    } catch (error) {
      recordRestoreRollbackError(rollbackErrors, 'Image restore rollback', error);
    }
  }

  if (restorePhaseReached(activeJournal, 'db-swapping') && !activeJournal.dbRolledBack) {
    try {
      const rollbackDbPath = requireRestoreArtifact(activeJournal.rollbackDbPath, 'Database restore rollback file');
      replaceDatabaseFile(rollbackDbPath);
      activeJournal = recordRestoreRollbackProgress(
        activeJournal,
        { dbRolledBack: true },
        rollbackErrors,
        'Database rollback progress journal update',
      );
    } catch (error) {
      recordRestoreRollbackError(rollbackErrors, 'Database restore rollback', error);
    }
  }

  finishInterruptedRestoreRecovery(activeJournal, rollbackErrors);
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

function tableHasColumn(connection, tableName, columnName) {
  return connection.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function getBackupAlbumValue(columnName, row) {
  if (columnName === 'spotify_album_id') return normalizeBackupSpotifyAlbumId(row.spotify_album_id);
  if (columnName === 'album_name') return row.album_name ?? '';
  if (columnName === 'artists') return row.artists || '[]';
  if (columnName === 'genres') return row.genres || '[]';
  if (columnName === 'copyright') return row.copyright || '[]';
  if (columnName === 'status') return row.status ?? 'completed';
  if (columnName === 'rating') return normalizeBackupRating(row.rating);
  if (columnName === 'repeats') return normalizeBackupNonNegativeInteger(row.repeats);
  if (columnName === 'priority') return normalizeBackupNonNegativeInteger(row.priority);
  if (columnName === 'source') return row.source ?? 'manual';
  if (columnName === 'created_at' || columnName === 'updated_at') {
    return row[columnName] || sqliteDatetimeNow();
  }
  return row[columnName] ?? null;
}

function normalizeBackupInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeBackupRating(value) {
  const parsed = normalizeBackupInteger(value);
  return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function normalizeBackupNonNegativeInteger(value) {
  const parsed = normalizeBackupInteger(value);
  return parsed !== null && parsed >= 0 ? parsed : 0;
}

function sqliteDatetimeNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeBackupSpotifyAlbumId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeBackupAlbumRow(row) {
  return {
    ...row,
    spotify_album_id: normalizeBackupSpotifyAlbumId(row.spotify_album_id),
  };
}

function sanitizeBackupAlbumImagePathValue(value) {
  if (value === null || value === undefined) {
    return { imagePath: null, sanitized: false };
  }

  try {
    const imagePath = normalizeAlbumImagePath(value);
    return {
      imagePath,
      sanitized: imagePath !== value,
    };
  } catch {
    return { imagePath: null, sanitized: true };
  }
}

function sanitizeBackupAlbumImagePaths(connection) {
  if (!tableHasColumn(connection, 'albums', 'image_path')) return 0;

  const rows = connection.prepare(`
    SELECT rowid AS rowid, image_path
    FROM albums
    WHERE image_path IS NOT NULL
  `).all();
  const update = connection.prepare('UPDATE albums SET image_path = ? WHERE rowid = ?');
  let sanitizedImagePaths = 0;

  const run = connection.transaction(items => {
    for (const row of items) {
      const sanitized = sanitizeBackupAlbumImagePathValue(row.image_path);
      if (!sanitized.sanitized) continue;
      update.run(sanitized.imagePath, row.rowid);
      sanitizedImagePaths++;
    }
  });
  run(rows);

  return sanitizedImagePaths;
}

function ensureBackupAlbumImagePathColumn(connection) {
  if (tableHasColumn(connection, 'albums', 'image_path')) return false;
  connection.exec('ALTER TABLE albums ADD COLUMN image_path TEXT');
  return true;
}

function applyRestoreImagePathUpdates(connection, imagePathUpdates) {
  if (!imagePathUpdates.length) return 0;

  const update = connection.prepare('UPDATE albums SET image_path = ? WHERE rowid = ?');
  let updated = 0;
  connection.transaction(updates => {
    for (const { rowid, imagePath } of updates) {
      if (rowid === null || rowid === undefined) continue;
      updated += update.run(imagePath, rowid).changes;
    }
  })(imagePathUpdates);

  return updated;
}

function buildAlbumInsertStatement(srcDb, options = {}) {
  const extraColumns = new Set(options.extraColumns || []);
  const currentColumns = getAlbumTableColumns(db);
  const sourceColumns = new Set(getAlbumTableColumns(srcDb));
  const insertColumns = currentColumns.filter(column => (
    column !== 'id'
    && (sourceColumns.has(column) || extraColumns.has(column))
  ));
  const sql = `
    INSERT INTO albums (
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

function isAlbumDuplicateConstraintError(error) {
  const message = String(error?.message || '');
  return error?.code === 'SQLITE_CONSTRAINT_UNIQUE'
    || message.includes('UNIQUE constraint failed: albums.spotify_album_id');
}

function getZipAlbumImageEntries(zip) {
  const entries = new Map();
  for (const entry of zip.getEntries()) {
    const normalized = normalizeZipEntryName(entry.entryName);
    if (entry.isDirectory) continue;
    try {
      const imagePath = normalizeAlbumImagePath(normalized);
      if (imagePath) entries.set(imagePath, entry);
    } catch {
      // Non-album-image entries are handled elsewhere in the backup.
    }
  }
  return entries;
}

const LEGACY_MANAGED_ALBUM_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function findLegacyManagedZipImage(row, zipImageEntries) {
  if (!row.spotify_album_id) return null;

  for (const ext of LEGACY_MANAGED_ALBUM_IMAGE_EXTENSIONS) {
    const imagePath = buildManagedAlbumImagePath(row.spotify_album_id, ext);
    const entry = zipImageEntries.get(imagePath);
    if (entry) return { entryKey: imagePath, entry };
  }

  return null;
}

function getManualMergeKey(row) {
  const albumName = getBackupAlbumValue('album_name', row);
  const artists = getBackupAlbumValue('artists', row);
  if (albumName === null || albumName === undefined) return null;
  if (artists === null || artists === undefined) return null;
  return `${albumName}\u0000${artists}`;
}

function getAlbumImageReservationKey(imagePath) {
  const normalized = normalizeAlbumImagePath(imagePath);
  return normalized ? normalized.toLowerCase() : null;
}

function selectMergeCandidateRows(backupAlbums) {
  const currentSpotifyIds = new Set(
    db.prepare(`
      SELECT spotify_album_id
      FROM albums
      WHERE spotify_album_id IS NOT NULL
        AND TRIM(spotify_album_id) != ''
    `).all()
      .map(row => normalizeBackupSpotifyAlbumId(row.spotify_album_id))
      .filter(Boolean),
  );
  const currentManualKeys = new Set(
    db.prepare(`
      SELECT album_name, artists
      FROM albums
      WHERE spotify_album_id IS NULL
         OR TRIM(spotify_album_id) = ''
    `).all()
      .map(getManualMergeKey)
      .filter(Boolean),
  );
  const candidateRows = [];
  let skipped = 0;

  for (const row of backupAlbums) {
    if (row.spotify_album_id) {
      if (currentSpotifyIds.has(row.spotify_album_id)) {
        skipped++;
        continue;
      }
      candidateRows.push(row);
      continue;
    }

    const manualKey = getManualMergeKey(row);
    if (manualKey && currentManualKeys.has(manualKey)) {
      skipped++;
      continue;
    }
    candidateRows.push(row);
  }

  return { candidateRows, skipped };
}

function reserveMergeImagePath(preferredImagePath, reservedFinalImagePaths) {
  let preferred = null;
  try {
    preferred = resolveAlbumImagePath(preferredImagePath, IMAGES_DIR);
  } catch {
    return null;
  }
  if (!preferred) return null;
  const preferredKey = getAlbumImageReservationKey(preferred.imagePath);

  if (!fs.existsSync(preferred.fullPath) && !reservedFinalImagePaths.has(preferredKey)) {
    reservedFinalImagePaths.add(preferredKey);
    return preferred;
  }

  const ext = path.extname(preferred.filename) || '.jpg';
  const prefix = `merge_${path.basename(preferred.filename, ext)}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const unique = buildUniqueAlbumImagePath({ imagesDir: IMAGES_DIR, prefix, ext });
    const uniqueKey = getAlbumImageReservationKey(unique.imagePath);
    if (reservedFinalImagePaths.has(uniqueKey)) continue;
    reservedFinalImagePaths.add(uniqueKey);
    return unique;
  }

  throw new Error('Could not allocate a unique backup image path.');
}

function createStagedMergeImageAsset(preferredImagePath, stagingImagesDir, source) {
  let preferred = null;
  try {
    preferred = resolveAlbumImagePath(preferredImagePath, IMAGES_DIR);
  } catch {
    return null;
  }
  if (!preferred) return null;

  const ext = path.extname(preferred.filename) || '.jpg';
  const prefix = `stage_${path.basename(preferred.filename, ext)}`;
  const stagedImage = buildUniqueAlbumImagePath({ imagesDir: stagingImagesDir, prefix, ext });
  fs.mkdirSync(path.dirname(stagedImage.fullPath), { recursive: true });
  return {
    source,
    preferredImagePath: preferred.imagePath,
    stagedImagePath: stagedImage.imagePath,
    stagedFullPath: stagedImage.fullPath,
    finalImagePath: null,
    finalFullPath: null,
    reservationKey: null,
  };
}

function stageMergeZipImage(entry, preferredImagePath, stagingImagesDir) {
  const asset = createStagedMergeImageAsset(
    preferredImagePath,
    stagingImagesDir,
    'zip',
  );
  if (!asset) return null;

  fs.writeFileSync(asset.stagedFullPath, entry.getData());
  return asset;
}

async function downloadImageToPath(imageUrl, imagePath, targetImagesDir) {
  const { fullPath: filepath, imagePath: normalizedImagePath } = resolveAlbumImagePath(imagePath, targetImagesDir);

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download album art: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, buffer);

  return normalizedImagePath;
}

async function stageMergeRefetchedImage(row, stagingImagesDir) {
  if (!row.spotify_album_id) return null;
  const imageUrl = row.image_url_large || row.image_url_medium || row.image_url_small;
  if (!imageUrl) return null;

  const preferredImagePath = buildManagedAlbumImagePath(row.spotify_album_id, '.jpg');
  const asset = createStagedMergeImageAsset(
    preferredImagePath,
    stagingImagesDir,
    'refetched',
  );
  if (!asset) return null;

  try {
    await downloadImageToPath(imageUrl, asset.stagedImagePath, stagingImagesDir);
    return asset;
  } catch (err) {
    fs.rmSync(asset.stagedFullPath, { force: true });
    console.warn(`Could not re-fetch image for ${row.album_name}:`, err.message);
    return null;
  }
}

function getCurrentAlbumImagePathReservations() {
  const rows = db.prepare(`
    SELECT image_path
    FROM albums
    WHERE image_path IS NOT NULL
  `).all();

  return new Set(rows
    .map(row => {
      try {
        return getAlbumImageReservationKey(row.image_path);
      } catch {
        return null;
      }
    })
    .filter(Boolean));
}

async function prepareMergeAlbumRows(rows, zip, stagingImagesDir) {
  const zipImageEntries = getZipAlbumImageEntries(zip);
  const stagedAssetsBySourceKey = new Map();
  const preparedRows = [];

  for (const row of rows) {
    const preparedRow = { ...row };
    let imageAsset = null;
    let entryKey = null;
    try {
      entryKey = normalizeAlbumImagePath(preparedRow.image_path);
    } catch {
      entryKey = null;
    }

    const entry = entryKey ? zipImageEntries.get(entryKey) : null;
    const legacyEntry = entry ? null : findLegacyManagedZipImage(preparedRow, zipImageEntries);
    const zipImage = entry
      ? { entryKey, entry }
      : legacyEntry;

    if (zipImage) {
      const sourceKey = `zip:${zipImage.entryKey}`;
      if (stagedAssetsBySourceKey.has(sourceKey)) {
        imageAsset = stagedAssetsBySourceKey.get(sourceKey);
      } else {
        imageAsset = stageMergeZipImage(
          zipImage.entry,
          zipImage.entryKey,
          stagingImagesDir,
        );
        stagedAssetsBySourceKey.set(sourceKey, imageAsset);
      }
    } else {
      const sourceKey = preparedRow.spotify_album_id ? `refetch:${preparedRow.spotify_album_id}` : null;
      if (sourceKey && stagedAssetsBySourceKey.has(sourceKey)) {
        imageAsset = stagedAssetsBySourceKey.get(sourceKey);
      } else {
        imageAsset = await stageMergeRefetchedImage(preparedRow, stagingImagesDir);
        if (sourceKey && imageAsset) stagedAssetsBySourceKey.set(sourceKey, imageAsset);
      }
    }

    preparedRow.image_path = null;
    preparedRows.push({ row: preparedRow, imageAsset });
  }

  return preparedRows;
}

function commitMergeImageAsset(asset, committedImagePaths, mergeJournal) {
  fs.mkdirSync(path.dirname(asset.finalFullPath), { recursive: true });
  const hadFinalBeforeCopy = fs.existsSync(asset.finalFullPath);
  try {
    fs.copyFileSync(asset.stagedFullPath, asset.finalFullPath, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    if (!hadFinalBeforeCopy && error?.code !== 'EEXIST') {
      try {
        fs.rmSync(asset.finalFullPath, { force: true });
      } catch {
        // Preserve the original copy failure; outer merge cleanup will continue.
      }
    }
    throw error;
  }
  committedImagePaths.push(asset.finalFullPath);
  recordMergeJournalImagePath(mergeJournal, asset.finalImagePath);
}

function cleanupCommittedMergeImages(committedImagePaths) {
  for (let index = committedImagePaths.length - 1; index >= 0; index -= 1) {
    try {
      fs.rmSync(committedImagePaths[index], { force: true });
    } catch (error) {
      console.warn('Merge image cleanup failed:', error);
    }
  }
}

function runMergeCleanup(label, cleanup) {
  try {
    cleanup();
    return true;
  } catch (error) {
    console.warn(`Merge cleanup failed for ${label}:`, error);
    return false;
  }
}

function cleanupMergeImportArtifacts({ srcDb, tmpPath, stagingImagesDir }) {
  let cleaned = true;
  if (srcDb) {
    cleaned = runMergeCleanup('temporary database handle', () => srcDb.close()) && cleaned;
  }
  cleaned = runMergeCleanup('temporary database file', () => {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }) && cleaned;
  if (stagingImagesDir) {
    cleaned = runMergeCleanup('staged images', () => {
      fs.rmSync(stagingImagesDir, { recursive: true, force: true });
    }) && cleaned;
  }
  return cleaned;
}

function resolveMergeImportArtifact(artifactPath, expectedPrefix) {
  if (!artifactPath) return null;
  const resolved = path.resolve(artifactPath);
  const resolvedDataDir = path.resolve(DATA_DIR);
  if (resolved !== resolvedDataDir && !resolved.startsWith(`${resolvedDataDir}${path.sep}`)) {
    return null;
  }
  if (!path.basename(resolved).startsWith(expectedPrefix)) return null;
  return resolved;
}

function cleanupJournaledMergeImportArtifact(journal, fieldName, expectedPrefix, label) {
  const artifactPath = journal?.[fieldName];
  if (!artifactPath) return true;

  const resolved = resolveMergeImportArtifact(artifactPath, expectedPrefix);
  if (!resolved) {
    console.warn(`Merge cleanup failed for ${label}: invalid artifact path.`);
    return false;
  }

  return runMergeCleanup(label, () => fs.rmSync(resolved, { recursive: true, force: true }));
}

function cleanupJournaledMergeImportArtifacts(journal) {
  let cleaned = true;
  cleaned = cleanupJournaledMergeImportArtifact(
    journal,
    'tmpPath',
    MERGE_TEMP_DB_PREFIX,
    'interrupted merge temporary database',
  ) && cleaned;
  cleaned = cleanupJournaledMergeImportArtifact(
    journal,
    'stagingImagesDir',
    MERGE_STAGING_IMAGES_PREFIX,
    'interrupted merge staged images',
  ) && cleaned;
  return cleaned;
}

function cleanupOrphanedMergeImportArtifacts() {
  if (!fs.existsSync(DATA_DIR)) return true;
  let cleaned = true;
  for (const dirent of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    const isMergeTempDb = dirent.isFile() && dirent.name.startsWith(MERGE_TEMP_DB_PREFIX);
    const isMergeStagingDir = dirent.isDirectory() && dirent.name.startsWith(MERGE_STAGING_IMAGES_PREFIX);
    if (!isMergeTempDb && !isMergeStagingDir) continue;

    const artifactPath = path.join(DATA_DIR, dirent.name);
    cleaned = runMergeCleanup(
      `orphaned merge artifact ${dirent.name}`,
      () => fs.rmSync(artifactPath, { recursive: true, force: true }),
    ) && cleaned;
  }
  return cleaned;
}

function ensureMergeAssetFinalPath(asset, reservedFinalImagePaths) {
  if (!asset) return null;
  if (asset.finalImagePath) return asset;

  const finalImage = reserveMergeImagePath(asset.preferredImagePath, reservedFinalImagePaths);
  if (!finalImage) return null;

  asset.finalImagePath = finalImage.imagePath;
  asset.finalFullPath = finalImage.fullPath;
  asset.reservationKey = getAlbumImageReservationKey(finalImage.imagePath);
  return asset;
}

function releaseMergeAssetFinalPath(asset, reservedFinalImagePaths) {
  if (!asset?.reservationKey) return;
  reservedFinalImagePaths.delete(asset.reservationKey);
  asset.finalImagePath = null;
  asset.finalFullPath = null;
  asset.reservationKey = null;
}

function recordMergeJournalImagePath(mergeJournal, imagePath) {
  if (!mergeJournal) return;

  const normalized = normalizeAlbumImagePath(imagePath);
  if (!normalized || mergeJournal.imagePaths.includes(normalized)) return;

  const nextImagePaths = [...mergeJournal.imagePaths, normalized];
  writeMergeJournal({ ...mergeJournal, imagePaths: nextImagePaths });
  mergeJournal.imagePaths = nextImagePaths;
}

function recoverInterruptedMerge() {
  const journal = readMergeJournal();
  if (!journal) return false;

  const referencedImagePaths = getCurrentAlbumImagePathReservations();
  let cleanupFailed = false;

  for (const imagePath of journal.imagePaths) {
    let resolved = null;
    let reservationKey = null;
    try {
      resolved = resolveAlbumImagePath(imagePath, IMAGES_DIR);
      reservationKey = getAlbumImageReservationKey(imagePath);
    } catch {
      continue;
    }

    if (!resolved || referencedImagePaths.has(reservationKey)) continue;

    try {
      fs.rmSync(resolved.fullPath, { force: true });
    } catch (error) {
      cleanupFailed = true;
      console.warn('Interrupted merge image cleanup failed:', error);
    }
  }

  cleanupFailed = !cleanupJournaledMergeImportArtifacts(journal) || cleanupFailed;

  if (!cleanupFailed) {
    try {
      removeMergeJournal();
    } catch (error) {
      cleanupFailed = true;
      console.warn('Interrupted merge journal cleanup failed:', error);
    }
  }

  return !cleanupFailed;
}

function recoverInterruptedMergeAtStartup() {
  try {
    recoverInterruptedMerge();
    if (!fs.existsSync(MERGE_JOURNAL_PATH)) {
      cleanupOrphanedMergeImportArtifacts();
    }
  } catch (error) {
    console.error('Interrupted merge recovery failed:', error);
  }
}

function requireInterruptedMergeRecovered() {
  const journal = readMergeJournal();
  if (!journal) return false;

  if (!recoverInterruptedMerge()) {
    throw new Error(
      'Could not finish cleanup for a previous interrupted merge. Please retry after the existing merge cleanup can complete.'
    );
  }

  return true;
}

function commitMergeImportRows(
  preparedRows,
  insertColumns,
  insertStmt,
  manualDupCheck,
  initialSkipped,
  committedImagePaths,
  mergeJournal,
) {
  return db.transaction(() => {
    let added = 0;
    let skipped = initialSkipped;
    let imagesCopied = 0;
    let imagesRefetched = 0;
    const assetsToCommit = new Map();
    const reservedFinalImagePaths = getCurrentAlbumImagePathReservations();

    for (const { row, imageAsset } of preparedRows) {
      if (!row.spotify_album_id) {
        const dup = manualDupCheck.get(
          getBackupAlbumValue('album_name', row),
          getBackupAlbumValue('artists', row),
        );
        if (dup) {
          skipped++;
          continue;
        }
      }

      const allocatedAsset = ensureMergeAssetFinalPath(imageAsset, reservedFinalImagePaths);
      const rowToInsert = allocatedAsset
        ? { ...row, image_path: allocatedAsset.finalImagePath }
        : row;
      const params = Object.fromEntries(
        insertColumns.map(column => [column, getBackupAlbumValue(column, rowToInsert)])
      );
      let result = null;
      try {
        result = insertStmt.run(params);
      } catch (error) {
        if (!isAlbumDuplicateConstraintError(error)) throw error;
        skipped++;
        if (allocatedAsset && !assetsToCommit.has(allocatedAsset.finalImagePath)) {
          releaseMergeAssetFinalPath(allocatedAsset, reservedFinalImagePaths);
        }
        continue;
      }
      if (result.changes > 0) {
        added++;
        if (allocatedAsset) assetsToCommit.set(allocatedAsset.finalImagePath, allocatedAsset);
      } else {
        skipped++;
        if (allocatedAsset && !assetsToCommit.has(allocatedAsset.finalImagePath)) {
          releaseMergeAssetFinalPath(allocatedAsset, reservedFinalImagePaths);
        }
      }
    }

    for (const asset of assetsToCommit.values()) {
      commitMergeImageAsset(asset, committedImagePaths, mergeJournal);
      if (asset.source === 'zip') imagesCopied++;
      else if (asset.source === 'refetched') imagesRefetched++;
    }

    return { added, skipped, imagesCopied, imagesRefetched };
  })();
}

async function restoreAlbumImages(rows, zip, isRestore, options = {}) {
  const targetImagesDir = options.targetImagesDir || IMAGES_DIR;
  let imagesCopied = 0;
  let imagesRefetched = 0;
  const imagePathUpdates = [];

  const zipImageEntries = getZipAlbumImageEntries(zip);

  fs.mkdirSync(targetImagesDir, { recursive: true });
  const { downloadImage } = targetImagesDir === IMAGES_DIR
    ? require('../spotify-helpers')
    : { downloadImage: (imageUrl, albumId) => downloadImageToDir(imageUrl, albumId, targetImagesDir) };

  for (const row of rows) {
    const originalImagePath = row.image_path ?? null;
    let restoredImagePath = null;

    if (row.image_path) {
      let entryKey = null;
      try {
        entryKey = normalizeAlbumImagePath(row.image_path);
      } catch {
        entryKey = null;
      }
      const entry = zipImageEntries.get(entryKey);
      if (entry) {
        const destPath = resolveAlbumImagePath(entryKey, targetImagesDir).fullPath;
        if (isRestore || !fs.existsSync(destPath)) {
          fs.writeFileSync(destPath, entry.getData());
          imagesCopied++;
        }
        restoredImagePath = entryKey;
        if (isRestore && restoredImagePath !== originalImagePath) {
          imagePathUpdates.push({ rowid: row.__restore_rowid, imagePath: restoredImagePath });
        }
        continue;
      }
    }

    if (row.spotify_album_id) {
      const imageUrl = row.image_url_large || row.image_url_medium || row.image_url_small;
      if (imageUrl) {
        const refetchedImagePath = buildManagedAlbumImagePath(row.spotify_album_id, '.jpg');
        const destPath = resolveAlbumImagePath(refetchedImagePath, targetImagesDir).fullPath;
        if (!isRestore && fs.existsSync(destPath)) {
          restoredImagePath = refetchedImagePath;
        } else {
          try {
            restoredImagePath = await downloadImage(imageUrl, row.spotify_album_id);
            imagesRefetched++;
          } catch (err) {
            console.warn(`Could not re-fetch image for ${row.album_name}:`, err.message);
          }
        }
      }
    }

    if (isRestore && restoredImagePath !== originalImagePath) {
      imagePathUpdates.push({ rowid: row.__restore_rowid, imagePath: restoredImagePath });
    }
  }

  return { imagesCopied, imagesRefetched, imagePathUpdates };
}

function resolveBackupAlbumImageForArchive(imagePath) {
  try {
    return resolveAlbumImagePath(imagePath, IMAGES_DIR);
  } catch {
    return null;
  }
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
    archive.pipe(res);
    appendBackupManifest(archive, 'full', true);
    archive.append(Buffer.from(csv, 'utf-8'), { name: 'albums.csv' });
    archive.file(tmpPath, { name: 'albums.db' });
    if (fs.existsSync(IMAGES_DIR)) archive.directory(IMAGES_DIR, 'images');
    appendAppStateToArchive(archive);
    await finalizeArchiveResponse(archive, res);
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
    archive.pipe(res);
    appendBackupManifest(archive, 'essential', false);
    archive.append(Buffer.from(csv, 'utf-8'), { name: 'albums.csv' });
    archive.file(tmpPath, { name: 'albums.db' });
    for (const row of manualRows) {
      if (!row.image_path) continue;
      const image = resolveBackupAlbumImageForArchive(row.image_path);
      if (image && fs.existsSync(image.fullPath)) {
        archive.file(image.fullPath, { name: image.imagePath });
      }
    }
    await finalizeArchiveResponse(archive, res);
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
    archive.pipe(res);
    appendBackupManifest(archive, 'database', false);
    archive.append(Buffer.from(csv, 'utf-8'), { name: 'albums.csv' });
    archive.file(tmpPath, { name: 'albums.db' });
    await finalizeArchiveResponse(archive, res);
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

const BACKUP_UPLOADS_DIR = getConfiguredPath('BACKUP_UPLOADS_DIR', path.join(DATA_DIR, '_backup_uploads'));
const BACKUP_UPLOAD_MAX_BYTES = getBackupUploadMaxBytes();

function createBackupUploadFileName(_req, file, callback) {
  const ext = path.extname(file.originalname || '').toLowerCase() || '.zip';
  const safeExt = ext === '.zip' ? ext : '.zip';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  callback(null, `${unique}${safeExt}`);
}

const upload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(BACKUP_UPLOADS_DIR, { recursive: true });
      callback(null, BACKUP_UPLOADS_DIR);
    },
    filename: createBackupUploadFileName,
  }),
  limits: { fileSize: BACKUP_UPLOAD_MAX_BYTES },
});

function openUploadedBackupZip(uploadedFile) {
  if (!uploadedFile?.path) {
    throw new Error('No file uploaded.');
  }
  return new AdmZip(uploadedFile.path);
}

function cleanupUploadedBackup(uploadedFile) {
  if (uploadedFile?.path) {
    fs.rmSync(uploadedFile.path, { force: true });
  }
}

// ---------------------------------------------------------------------------
// POST /api/backup/merge  — add albums from ZIP that don't already exist
// ---------------------------------------------------------------------------

router.post('/merge', upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const zip    = openUploadedBackupZip(req.file);
    const result = await importFromZip(zip, false);
    res.json(result);
  } catch (e) {
    console.error('Merge error:', e);
    res.status(e.status || e.statusCode || 500).json({ error: e.message });
  } finally {
    cleanupUploadedBackup(req.file);
  }
});

// ---------------------------------------------------------------------------
// POST /api/backup/restore  — wipe and replace with ZIP contents
// ---------------------------------------------------------------------------

router.post('/restore', upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const zip = openUploadedBackupZip(req.file);
    const result = await restoreFromZip(zip);
    res.json(result);
  } catch (e) {
    console.error('Restore error:', e);
    res.status(e.status || e.statusCode || 500).json({ error: e.message });
  } finally {
    cleanupUploadedBackup(req.file);
  }
});

// ---------------------------------------------------------------------------
// Shared import logic
// ---------------------------------------------------------------------------

async function importFromZip(zip) {
  validateZipEntryNames(zip);
  const dbEntry = zip.getEntry('albums.db');
  if (!dbEntry) throw new Error('ZIP does not contain albums.db.');

  beginBackupMutation('merge');

  try {
    recoverInterruptedRestore();
    requireInterruptedMergeRecovered();
    if (!cleanupOrphanedMergeImportArtifacts()) {
      throw new Error('Could not finish cleanup for previous merge temporary files. Please retry after cleanup can complete.');
    }

    const BetterSqlite = require('better-sqlite3');
    const tmpPath = createMergeTempPath();
    let stagingImagesDir = null;
    let srcDb = null;
    const committedMergeImagePaths = [];
    const mergeJournal = { operation: 'merge', imagePaths: [], tmpPath, stagingImagesDir };
    let mergeSucceeded = false;
    let mergeFailed = false;

    let added = 0, skipped = 0, imagesCopied = 0, imagesRefetched = 0;
    let sanitizedImagePaths = 0;

    try {
      writeMergeJournal(mergeJournal);
      fs.writeFileSync(tmpPath, dbEntry.getData());
      srcDb = new BetterSqlite(tmpPath);

      const tableCheck = srcDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='albums'"
      ).get();
      if (!tableCheck) throw new Error('Backup database does not contain an albums table.');

      sanitizedImagePaths = sanitizeBackupAlbumImagePaths(srcDb);
      const backupAlbums = srcDb.prepare('SELECT * FROM albums').all().map(normalizeBackupAlbumRow);
      const { insertColumns, statement: insertStmt } = buildAlbumInsertStatement(srcDb, {
        extraColumns: ['image_path'],
      });
      const selectedRows = selectMergeCandidateRows(backupAlbums);
      skipped = selectedRows.skipped;

      const manualDupCheck = db.prepare(
        `SELECT id
         FROM albums
         WHERE (spotify_album_id IS NULL OR TRIM(spotify_album_id) = '')
           AND album_name = ?
           AND artists = ?`
      );

      stagingImagesDir = createRestoreTempPath(MERGE_STAGING_IMAGES_PREFIX);
      mergeJournal.stagingImagesDir = stagingImagesDir;
      writeMergeJournal(mergeJournal);
      fs.mkdirSync(stagingImagesDir);
      const preparedRows = await prepareMergeAlbumRows(selectedRows.candidateRows, zip, stagingImagesDir);
      ({ added, skipped, imagesCopied, imagesRefetched } = commitMergeImportRows(
        preparedRows,
        insertColumns,
        insertStmt,
        manualDupCheck,
        skipped,
        committedMergeImagePaths,
        mergeJournal,
      ));
      mergeSucceeded = true;

    } catch (error) {
      mergeFailed = true;
      cleanupCommittedMergeImages(committedMergeImagePaths);
      throw error;
    } finally {
      const artifactsCleaned = cleanupMergeImportArtifacts({ srcDb, tmpPath, stagingImagesDir });
      if (mergeSucceeded) {
        if (artifactsCleaned) runMergeCleanup('merge journal', removeMergeJournal);
      } else if (mergeFailed && artifactsCleaned) {
        runMergeCleanup('interrupted merge recovery', () => {
          if (!recoverInterruptedMerge()) {
            throw new Error('Could not finish interrupted merge cleanup.');
          }
        });
      }
    }

    return { added, skipped, imagesCopied, imagesRefetched, sanitizedImagePaths };
  } finally {
    endBackupMutation('merge');
  }
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
  let sanitizedImagePaths = 0;
  const manifest = readBackupManifest(zip);
  const shouldRestoreAppState = manifest?.includesAppState === true;

  beginBackupMutation('restore');

  try {
    recoverInterruptedRestore();
    requireInterruptedMergeRecovered();
    if (!cleanupOrphanedMergeImportArtifacts()) {
      throw new Error('Could not finish cleanup for previous merge temporary files. Please retry after cleanup can complete.');
    }
    validateZipEntryNames(zip);
    fs.writeFileSync(tmpPath, dbEntry.getData());
    const BetterSqlite = require('better-sqlite3');
    backupDb = new BetterSqlite(tmpPath);
    const tableCheck = backupDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='albums'"
    ).get();
    if (!tableCheck) throw new Error('Backup database does not contain an albums table.');

    ensureBackupAlbumImagePathColumn(backupDb);
    sanitizedImagePaths = sanitizeBackupAlbumImagePaths(backupDb);
    const restoredAlbums = backupDb.prepare('SELECT rowid AS __restore_rowid, * FROM albums ORDER BY created_at ASC').all();
    stagingImagesDir = createRestoreTempDir('_restore_images_');
    const { imagesCopied, imagesRefetched, imagePathUpdates } = await restoreAlbumImages(
      restoredAlbums,
      zip,
      true,
      { targetImagesDir: stagingImagesDir },
    );
    applyRestoreImagePathUpdates(backupDb, imagePathUpdates);

    let appStateFilesRestored = 0;
    if (shouldRestoreAppState) {
      stagingAppStateDir = createRestoreTempDir('_restore_app_state_');
      appStateFilesRestored = stageAppStateFromZip(zip, stagingAppStateDir);
      appStateRollbackDir = createAppStateRollback();
    }

    backupDb.close();
    backupDb = null;

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
      sanitizedImagePaths,
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
    try {
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
    } finally {
      endBackupMutation('restore');
    }
  }
}

recoverInterruptedRestore();
recoverInterruptedMergeAtStartup();

router.__private = {
  APP_STATE_BACKUP_ITEMS,
  BACKUP_MANIFEST_NAME,
  BACKUP_UPLOAD_MAX_BYTES,
  BACKUP_UPLOADS_DIR,
  MERGE_JOURNAL_NAME,
  RESTORE_JOURNAL_NAME,
  buildBackupManifest,
  cleanupUploadedBackup,
  createMergeTempPath,
  createRestoreTempPath,
  isWindowsReservedPathSegment,
  importFromZip,
  openUploadedBackupZip,
  readBackupManifest,
  readMergeJournal,
  readRestoreJournal,
  recoverInterruptedMerge,
  recoverInterruptedRestore,
  resolveBackupAlbumImageForArchive,
  restoreAppStateFromZip,
  stageAppStateFromZip,
  restoreFromZip,
  sanitizeBackupAlbumImagePathValue,
  sanitizeBackupAlbumImagePaths,
  validateZipEntryNames,
  writeMergeJournal,
  writeRestoreJournal,
};

module.exports = router;
