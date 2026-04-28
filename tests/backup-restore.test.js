import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const serverModulePaths = [
  '../server/routes/backup.js',
  '../server/welcome-tour-store.js',
  '../server/preferences-store.js',
  '../server/album-helpers.js',
  '../server/spotify-helpers.js',
  '../server/db.js',
];

const tempDirs = [];
const openDbs = [];

function resetServerModules() {
  for (const modulePath of serverModulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function loadBackupTestContext() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-backup-test-'));
  tempDirs.push(dataDir);
  process.env.DATA_DIR = dataDir;
  resetServerModules();

  const dbModule = require('../server/db.js');
  const backupRouter = require('../server/routes/backup.js');

  return { dataDir, dbModule, backupRouter };
}

function writeFileEnsured(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

async function addDatabaseSnapshot(zip, db, dataDir) {
  const snapshotPath = path.join(dataDir, `albums-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  await db.backup(snapshotPath);
  zip.addLocalFile(snapshotPath, '', 'albums.db');
  fs.unlinkSync(snapshotPath);
}

function addFullBackupManifest(zip, backupRouter) {
  zip.addFile(
    backupRouter.__private.BACKUP_MANIFEST_NAME,
    Buffer.from(`${JSON.stringify(backupRouter.__private.buildBackupManifest('full', true), null, 2)}\n`),
  );
}

afterEach(async () => {
  while (openDbs.length) {
    openDbs.pop()?.close();
  }

  delete process.env.DATA_DIR;
  resetServerModules();

  while (tempDirs.length) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('backup and restore', () => {
  it('round-trips full backups without losing links, IDs, or import-job tables', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    fs.writeFileSync(path.join(dataDir, 'images', 'manual-42.jpg'), Buffer.from('fake-image-data'));

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, release_date, release_year, status, notes, listened_at, repeats, priority,
        image_path, source, album_link, artist_link, created_at, updated_at
      ) VALUES (
        :id, :album_name, :artists, :release_date, :release_year, :status, :notes, :listened_at, :repeats, :priority,
        :image_path, :source, :album_link, :artist_link, :created_at, :updated_at
      )
    `).run({
      id: 42,
      album_name: 'Backup Album',
      artists: JSON.stringify([{ name: 'Backup Artist' }]),
      release_date: '1999-12-31',
      release_year: 1999,
      status: 'completed',
      notes: 'should survive restore',
      listened_at: '2026-04-08',
      repeats: 3,
      priority: 8,
      image_path: 'images/manual-42.jpg',
      source: 'manual',
      album_link: 'https://example.com/album',
      artist_link: 'https://example.com/artist',
      created_at: '2026-04-01 12:00:00',
      updated_at: '2026-04-02 15:30:00',
    });

    db.prepare(`
      INSERT INTO import_jobs (
        id, source_type, filename, default_status, status, total_rows, imported_rows,
        created_at, updated_at, completed_at
      ) VALUES (
        :id, :source_type, :filename, :default_status, :status, :total_rows, :imported_rows,
        :created_at, :updated_at, :completed_at
      )
    `).run({
      id: 7,
      source_type: 'csv',
      filename: 'backup.csv',
      default_status: 'completed',
      status: 'completed',
      total_rows: 1,
      imported_rows: 1,
      created_at: '2026-04-01 00:00:00',
      updated_at: '2026-04-01 00:05:00',
      completed_at: '2026-04-01 00:05:00',
    });

    db.prepare(`
      INSERT INTO import_job_rows (
        id, job_id, row_index, spotify_url, desired_status, status, created_album_id,
        created_at, updated_at
      ) VALUES (
        :id, :job_id, :row_index, :spotify_url, :desired_status, :status, :created_album_id,
        :created_at, :updated_at
      )
    `).run({
      id: 19,
      job_id: 7,
      row_index: 1,
      spotify_url: 'https://open.spotify.com/album/example',
      desired_status: 'completed',
      status: 'imported',
      created_album_id: 42,
      created_at: '2026-04-01 00:00:00',
      updated_at: '2026-04-01 00:05:00',
    });

    const snapshotPath = path.join(dataDir, 'albums.snapshot.db');
    await db.backup(snapshotPath);

    const zip = new AdmZip();
    zip.addLocalFile(snapshotPath, '', 'albums.db');
    zip.addLocalFile(path.join(dataDir, 'images', 'manual-42.jpg'), 'images', 'manual-42.jpg');
    expect(zip.getEntry('albums.db')).toBeTruthy();

    db.prepare('DELETE FROM import_job_rows').run();
    db.prepare('DELETE FROM import_jobs').run();
    db.prepare('DELETE FROM albums').run();
    fs.writeFileSync(path.join(dataDir, 'images', 'current-only.jpg'), Buffer.from('new-image'));

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      3,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'planned',
      'images/current-only.jpg',
      'manual',
      '2026-04-08 00:00:00',
      '2026-04-08 00:00:00',
    );

    const restoreResult = await backupRouter.__private.restoreFromZip(zip);
    expect(restoreResult).toMatchObject({
      added: 1,
      skipped: 0,
      imagesCopied: 1,
      appStateRestored: false,
    });

    const restoredAlbum = db.prepare(`
      SELECT id, album_name, release_date, release_year, notes, repeats, priority, album_link, artist_link, image_path
      FROM albums
    `).get();

    expect(restoredAlbum).toEqual({
      id: 42,
      album_name: 'Backup Album',
      release_date: '1999-12-31',
      release_year: 1999,
      notes: 'should survive restore',
      repeats: 3,
      priority: 8,
      album_link: 'https://example.com/album',
      artist_link: 'https://example.com/artist',
      image_path: 'images/manual-42.jpg',
    });

    const restoredJob = db.prepare('SELECT id, filename, imported_rows FROM import_jobs').get();
    expect(restoredJob).toEqual({
      id: 7,
      filename: 'backup.csv',
      imported_rows: 1,
    });

    const restoredJobRow = db.prepare('SELECT id, job_id, created_album_id, status FROM import_job_rows').get();
    expect(restoredJobRow).toEqual({
      id: 19,
      job_id: 7,
      created_album_id: 42,
      status: 'imported',
    });

    expect(fs.readFileSync(path.join(dataDir, 'images', 'manual-42.jpg')).toString()).toBe('fake-image-data');
    expect(fs.existsSync(path.join(dataDir, 'images', 'current-only.jpg'))).toBe(false);
  }, 15000);

  it('preserves current DB and images when album image staging fails', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'images', 'backup-art.jpg'), Buffer.from('backup-image'));
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      42,
      'Backup Album',
      JSON.stringify([{ name: 'Backup Artist' }]),
      'completed',
      'images/backup-art.jpg',
      'manual',
      '2026-04-01 00:00:00',
      '2026-04-01 00:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addLocalFile(path.join(dataDir, 'images', 'backup-art.jpg'), 'images', 'backup-art.jpg');

    db.prepare('DELETE FROM albums').run();
    writeFileEnsured(path.join(dataDir, 'images', 'current-art.jpg'), Buffer.from('current-image'));
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      7,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'planned',
      'images/current-art.jpg',
      'manual',
      '2026-04-02 00:00:00',
      '2026-04-02 00:00:00',
    );

    const originalWriteFileSync = fs.writeFileSync;
    fs.writeFileSync = function writeFileSyncWithImageFailure(filePath, contents, options) {
      if (String(filePath).includes('_restore_images_') && String(filePath).endsWith('backup-art.jpg')) {
        throw new Error('simulated image staging failure');
      }
      return originalWriteFileSync.call(this, filePath, contents, options);
    };

    try {
      await expect(backupRouter.__private.restoreFromZip(zip)).rejects.toThrow(/simulated image staging failure/);
    } finally {
      fs.writeFileSync = originalWriteFileSync;
    }

    const currentAlbum = db.prepare('SELECT id, album_name, image_path FROM albums').get();
    expect(currentAlbum).toEqual({
      id: 7,
      album_name: 'Current Album',
      image_path: 'images/current-art.jpg',
    });
    expect(fs.readFileSync(path.join(dataDir, 'images', 'current-art.jpg')).toString()).toBe('current-image');
    expect(fs.readFileSync(path.join(dataDir, 'images', 'backup-art.jpg')).toString()).toBe('backup-image');
  }, 15000);

  it('rolls back DB and images when the final image swap fails', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'images', 'backup-art.jpg'), Buffer.from('backup-image'));
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      42,
      'Backup Album',
      JSON.stringify([{ name: 'Backup Artist' }]),
      'completed',
      'images/backup-art.jpg',
      'manual',
      '2026-04-01 00:00:00',
      '2026-04-01 00:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addLocalFile(path.join(dataDir, 'images', 'backup-art.jpg'), 'images', 'backup-art.jpg');

    db.prepare('DELETE FROM albums').run();
    fs.rmSync(path.join(dataDir, 'images', 'backup-art.jpg'), { force: true });
    writeFileEnsured(path.join(dataDir, 'images', 'current-art.jpg'), Buffer.from('current-image'));
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      7,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'planned',
      'images/current-art.jpg',
      'manual',
      '2026-04-02 00:00:00',
      '2026-04-02 00:00:00',
    );

    const originalRenameSync = fs.renameSync;
    fs.renameSync = function renameSyncWithSwapFailure(oldPath, newPath) {
      const oldPathText = String(oldPath);
      if (
        oldPathText.includes('_restore_images_')
        && !oldPathText.includes('_restore_images_rollback_')
        && path.resolve(String(newPath)) === path.resolve(path.join(dataDir, 'images'))
      ) {
        throw new Error('simulated image swap failure');
      }
      return originalRenameSync.call(this, oldPath, newPath);
    };

    try {
      await expect(backupRouter.__private.restoreFromZip(zip)).rejects.toThrow(/simulated image swap failure/);
    } finally {
      fs.renameSync = originalRenameSync;
    }

    const currentAlbum = db.prepare('SELECT id, album_name, image_path FROM albums').get();
    expect(currentAlbum).toEqual({
      id: 7,
      album_name: 'Current Album',
      image_path: 'images/current-art.jpg',
    });
    expect(fs.readFileSync(path.join(dataDir, 'images', 'current-art.jpg')).toString()).toBe('current-image');
    expect(fs.existsSync(path.join(dataDir, 'images', 'backup-art.jpg'))).toBe(false);
  }, 15000);

  it('recovers an interrupted restore journal on startup after the DB swap', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;

    writeFileEnsured(path.join(dataDir, 'images', 'current-art.jpg'), Buffer.from('current-image'));
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      7,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'planned',
      'images/current-art.jpg',
      'manual',
      '2026-04-02 00:00:00',
      '2026-04-02 00:00:00',
    );

    const rollbackDbPath = path.join(dataDir, '_restore_rollback_test.db');
    await db.backup(rollbackDbPath);

    db.prepare('DELETE FROM albums').run();
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      42,
      'Backup Album',
      JSON.stringify([{ name: 'Backup Artist' }]),
      'completed',
      'images/backup-art.jpg',
      'manual',
      '2026-04-01 00:00:00',
      '2026-04-01 00:00:00',
    );

    const stagingImagesDir = fs.mkdtempSync(path.join(dataDir, '_restore_images_'));
    writeFileEnsured(path.join(stagingImagesDir, 'backup-art.jpg'), Buffer.from('backup-image'));
    fs.writeFileSync(
      path.join(dataDir, backupRouter.__private.RESTORE_JOURNAL_NAME),
      `${JSON.stringify({
        operation: 'restore',
        phase: 'db-swapped',
        tmpPath: path.join(dataDir, '_restore_tmp_test.db'),
        rollbackDbPath,
        stagingImagesDir,
        stagingAppStateDir: null,
        imageRollback: {
          path: path.join(dataDir, '_restore_images_rollback_test'),
          hadImagesDir: true,
        },
        appStateRollbackDir: null,
      }, null, 2)}\n`,
    );

    db.close();
    resetServerModules();

    const recoveredDbModule = require('../server/db.js');
    require('../server/routes/backup.js');
    openDbs.push(recoveredDbModule.db);

    const currentAlbum = recoveredDbModule.db.prepare('SELECT id, album_name, image_path FROM albums').get();
    expect(currentAlbum).toEqual({
      id: 7,
      album_name: 'Current Album',
      image_path: 'images/current-art.jpg',
    });
    expect(fs.readFileSync(path.join(dataDir, 'images', 'current-art.jpg')).toString()).toBe('current-image');
    expect(fs.existsSync(path.join(dataDir, 'images', 'backup-art.jpg'))).toBe(false);
    expect(fs.existsSync(stagingImagesDir)).toBe(false);
    expect(fs.existsSync(path.join(dataDir, backupRouter.__private.RESTORE_JOURNAL_NAME))).toBe(false);
  }, 15000);

  it('fails closed and preserves a corrupt restore journal', () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const journalPath = path.join(dataDir, backupRouter.__private.RESTORE_JOURNAL_NAME);
    fs.writeFileSync(journalPath, '{"operation":"restore",');

    expect(() => backupRouter.__private.recoverInterruptedRestore()).toThrow(/Could not read restore journal/);
    expect(fs.readFileSync(journalPath, 'utf8')).toBe('{"operation":"restore",');
  });

  it('keeps the previous restore journal when an atomic journal write fails', () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const journalPath = path.join(dataDir, backupRouter.__private.RESTORE_JOURNAL_NAME);
    backupRouter.__private.writeRestoreJournal({
      operation: 'restore',
      phase: 'prepared',
      rollbackDbPath: path.join(dataDir, '_restore_rollback_existing.db'),
    });
    const previousContents = fs.readFileSync(journalPath, 'utf8');

    const originalWriteFileSync = fs.writeFileSync;
    fs.writeFileSync = function writeFileSyncWithJournalFailure(filePath, contents, options) {
      if (typeof filePath === 'number') {
        throw new Error('simulated journal temp write failure');
      }
      return originalWriteFileSync.call(this, filePath, contents, options);
    };

    try {
      expect(() => backupRouter.__private.writeRestoreJournal({
        operation: 'restore',
        phase: 'db-swapping',
        rollbackDbPath: path.join(dataDir, '_restore_rollback_new.db'),
      })).toThrow(/simulated journal temp write failure/);
    } finally {
      fs.writeFileSync = originalWriteFileSync;
    }

    expect(fs.readFileSync(journalPath, 'utf8')).toBe(previousContents);
    expect(backupRouter.__private.readRestoreJournal().phase).toBe('prepared');
  });

  it('restores the DB even when interrupted image rollback fails', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'images', 'current-art.jpg'), Buffer.from('current-image'));
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      7,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'planned',
      'images/current-art.jpg',
      'manual',
      '2026-04-02 00:00:00',
      '2026-04-02 00:00:00',
    );

    const rollbackDbPath = path.join(dataDir, '_restore_rollback_test.db');
    await db.backup(rollbackDbPath);

    db.prepare('DELETE FROM albums').run();
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      42,
      'Backup Album',
      JSON.stringify([{ name: 'Backup Artist' }]),
      'completed',
      'images/backup-art.jpg',
      'manual',
      '2026-04-01 00:00:00',
      '2026-04-01 00:00:00',
    );

    const imageRollbackDir = fs.mkdtempSync(path.join(dataDir, '_restore_images_rollback_'));
    writeFileEnsured(path.join(imageRollbackDir, 'current-art.jpg'), Buffer.from('current-image'));
    backupRouter.__private.writeRestoreJournal({
      operation: 'restore',
      phase: 'images-swapping',
      tmpPath: path.join(dataDir, '_restore_tmp_test.db'),
      rollbackDbPath,
      stagingImagesDir: null,
      stagingAppStateDir: null,
      imageRollback: {
        path: imageRollbackDir,
        hadImagesDir: true,
      },
      appStateRollbackDir: null,
    });

    const originalCpSync = fs.cpSync;
    fs.cpSync = function cpSyncWithImageRollbackFailure(oldPath, newPath, options) {
      if (
        path.resolve(String(oldPath)) === path.resolve(imageRollbackDir)
        && path.resolve(String(newPath)) === path.resolve(path.join(dataDir, 'images'))
      ) {
        throw new Error('simulated interrupted image rollback failure');
      }
      return originalCpSync.call(this, oldPath, newPath, options);
    };

    try {
      expect(() => backupRouter.__private.recoverInterruptedRestore())
        .toThrow(/Image restore rollback: simulated interrupted image rollback failure/);
    } finally {
      fs.cpSync = originalCpSync;
    }

    const journalPath = path.join(dataDir, backupRouter.__private.RESTORE_JOURNAL_NAME);
    expect(fs.existsSync(journalPath)).toBe(true);
    expect(fs.existsSync(rollbackDbPath)).toBe(true);
    expect(fs.existsSync(imageRollbackDir)).toBe(true);

    const currentAlbum = db.prepare('SELECT id, album_name, image_path FROM albums').get();
    expect(currentAlbum).toEqual({
      id: 7,
      album_name: 'Current Album',
      image_path: 'images/current-art.jpg',
    });

    expect(backupRouter.__private.recoverInterruptedRestore()).toBe(true);
    expect(fs.existsSync(journalPath)).toBe(false);
    expect(fs.existsSync(rollbackDbPath)).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, 'images', 'current-art.jpg')).toString()).toBe('current-image');
  }, 15000);

  it('restores images and DB even when interrupted app-state rollback fails', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'images', 'current-art.jpg'), Buffer.from('current-image'));
    writeFileEnsured(path.join(dataDir, 'images', 'backup-art.jpg'), Buffer.from('backup-image'));
    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Backup Name' }));
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      7,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'planned',
      'images/current-art.jpg',
      'manual',
      '2026-04-02 00:00:00',
      '2026-04-02 00:00:00',
    );

    const rollbackDbPath = path.join(dataDir, '_restore_rollback_test.db');
    await db.backup(rollbackDbPath);
    const imageRollbackDir = fs.mkdtempSync(path.join(dataDir, '_restore_images_rollback_'));
    writeFileEnsured(path.join(imageRollbackDir, 'current-art.jpg'), Buffer.from('current-image'));
    const appStateRollbackDir = fs.mkdtempSync(path.join(dataDir, '_restore_app_state_rollback_'));
    writeFileEnsured(path.join(appStateRollbackDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Current Name' }));

    db.prepare('DELETE FROM albums').run();
    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, image_path, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      42,
      'Backup Album',
      JSON.stringify([{ name: 'Backup Artist' }]),
      'completed',
      'images/backup-art.jpg',
      'manual',
      '2026-04-01 00:00:00',
      '2026-04-01 00:00:00',
    );

    backupRouter.__private.writeRestoreJournal({
      operation: 'restore',
      phase: 'app-state-swapping',
      tmpPath: path.join(dataDir, '_restore_tmp_test.db'),
      rollbackDbPath,
      stagingImagesDir: null,
      stagingAppStateDir: null,
      imageRollback: {
        path: imageRollbackDir,
        hadImagesDir: true,
      },
      appStateRollbackDir,
    });

    const originalCopyFileSync = fs.copyFileSync;
    fs.copyFileSync = function copyFileSyncWithAppStateRollbackFailure(sourcePath, targetPath, mode) {
      if (String(sourcePath).startsWith(appStateRollbackDir)) {
        throw new Error('simulated interrupted app-state rollback failure');
      }
      return originalCopyFileSync.call(this, sourcePath, targetPath, mode);
    };

    try {
      expect(() => backupRouter.__private.recoverInterruptedRestore())
        .toThrow(/App-state restore rollback: simulated interrupted app-state rollback failure/);
    } finally {
      fs.copyFileSync = originalCopyFileSync;
    }

    const journalPath = path.join(dataDir, backupRouter.__private.RESTORE_JOURNAL_NAME);
    expect(fs.existsSync(journalPath)).toBe(true);
    expect(fs.existsSync(rollbackDbPath)).toBe(true);
    expect(fs.existsSync(appStateRollbackDir)).toBe(true);

    const currentAlbum = db.prepare('SELECT id, album_name, image_path FROM albums').get();
    expect(currentAlbum).toEqual({
      id: 7,
      album_name: 'Current Album',
      image_path: 'images/current-art.jpg',
    });
    expect(fs.readFileSync(path.join(dataDir, 'images', 'current-art.jpg')).toString()).toBe('current-image');

    expect(backupRouter.__private.recoverInterruptedRestore()).toBe(true);
    expect(fs.existsSync(journalPath)).toBe(false);
    expect(fs.existsSync(rollbackDbPath)).toBe(false);
    expect(fs.existsSync(appStateRollbackDir)).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Current Name');
  }, 15000);

  it('restores app-state files from new full backups', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Backup Name' }));
    writeFileEnsured(path.join(dataDir, 'opacity-presets', 'custom-opacity.json'), JSON.stringify({ id: 'custom-opacity' }));
    writeFileEnsured(path.join(dataDir, 'themes', 'custom-theme.json'), JSON.stringify({ id: 'custom-theme' }));
    writeFileEnsured(path.join(dataDir, 'theme-preview-images', 'theme.png'), Buffer.from('preview'));
    writeFileEnsured(path.join(dataDir, 'theme-preview-images-thumbs', 'theme.jpg'), Buffer.from('preview-thumb'));
    writeFileEnsured(path.join(dataDir, 'backgrounds-user', 'primary.png'), Buffer.from('primary'));
    writeFileEnsured(path.join(dataDir, 'backgrounds-user-thumbs', 'primary.jpg'), Buffer.from('primary-thumb'));
    writeFileEnsured(path.join(dataDir, 'backgrounds-user-secondary', 'secondary.png'), Buffer.from('secondary'));
    writeFileEnsured(path.join(dataDir, 'backgrounds-user-secondary-thumbs', 'secondary.jpg'), Buffer.from('secondary-thumb'));

    const zip = new AdmZip();
    addFullBackupManifest(zip, backupRouter);
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addLocalFile(path.join(dataDir, 'preferences.json'), '', 'preferences.json');
    zip.addLocalFolder(path.join(dataDir, 'opacity-presets'), 'opacity-presets');
    zip.addLocalFolder(path.join(dataDir, 'themes'), 'themes');
    zip.addLocalFolder(path.join(dataDir, 'theme-preview-images'), 'theme-preview-images');
    zip.addLocalFolder(path.join(dataDir, 'theme-preview-images-thumbs'), 'theme-preview-images-thumbs');
    zip.addLocalFolder(path.join(dataDir, 'backgrounds-user'), 'backgrounds-user');
    zip.addLocalFolder(path.join(dataDir, 'backgrounds-user-thumbs'), 'backgrounds-user-thumbs');
    zip.addLocalFolder(path.join(dataDir, 'backgrounds-user-secondary'), 'backgrounds-user-secondary');
    zip.addLocalFolder(path.join(dataDir, 'backgrounds-user-secondary-thumbs'), 'backgrounds-user-secondary-thumbs');

    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Current Name' }));
    writeFileEnsured(path.join(dataDir, 'opacity-presets', 'current-only.json'), JSON.stringify({ id: 'current-only' }));
    writeFileEnsured(path.join(dataDir, 'backgrounds-user-thumbs', 'current-only.jpg'), Buffer.from('current-thumb'));

    const restoreResult = await backupRouter.__private.restoreFromZip(zip);

    expect(restoreResult).toMatchObject({
      appStateRestored: true,
      appStateFilesRestored: 9,
    });
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Backup Name');
    expect(fs.readFileSync(path.join(dataDir, 'opacity-presets', 'custom-opacity.json'), 'utf8')).toContain('custom-opacity');
    expect(fs.readFileSync(path.join(dataDir, 'themes', 'custom-theme.json'), 'utf8')).toContain('custom-theme');
    expect(fs.readFileSync(path.join(dataDir, 'theme-preview-images', 'theme.png')).toString()).toBe('preview');
    expect(fs.readFileSync(path.join(dataDir, 'theme-preview-images-thumbs', 'theme.jpg')).toString()).toBe('preview-thumb');
    expect(fs.readFileSync(path.join(dataDir, 'backgrounds-user', 'primary.png')).toString()).toBe('primary');
    expect(fs.readFileSync(path.join(dataDir, 'backgrounds-user-thumbs', 'primary.jpg')).toString()).toBe('primary-thumb');
    expect(fs.readFileSync(path.join(dataDir, 'backgrounds-user-secondary', 'secondary.png')).toString()).toBe('secondary');
    expect(fs.readFileSync(path.join(dataDir, 'backgrounds-user-secondary-thumbs', 'secondary.jpg')).toString()).toBe('secondary-thumb');
    expect(fs.existsSync(path.join(dataDir, 'opacity-presets', 'current-only.json'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'backgrounds-user-thumbs', 'current-only.jpg'))).toBe(false);
  }, 15000);

  it('preserves current app-state files when staging a full restore fails', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Backup Name' }));
    writeFileEnsured(path.join(dataDir, 'themes', 'backup-theme.json'), JSON.stringify({ id: 'backup-theme' }));

    const zip = new AdmZip();
    addFullBackupManifest(zip, backupRouter);
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addLocalFile(path.join(dataDir, 'preferences.json'), '', 'preferences.json');
    zip.addLocalFolder(path.join(dataDir, 'themes'), 'themes');

    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Current Name' }));
    writeFileEnsured(path.join(dataDir, 'themes', 'current-theme.json'), JSON.stringify({ id: 'current-theme' }));

    const originalWriteFileSync = fs.writeFileSync;
    fs.writeFileSync = function writeFileSyncWithRestoreFailure(filePath, contents, options) {
      if (String(filePath).includes('_restore_app_state_') && String(filePath).endsWith('backup-theme.json')) {
        throw new Error('simulated app-state staging failure');
      }
      return originalWriteFileSync.call(this, filePath, contents, options);
    };

    try {
      await expect(backupRouter.__private.restoreFromZip(zip)).rejects.toThrow(/simulated app-state staging failure/);
    } finally {
      fs.writeFileSync = originalWriteFileSync;
    }

    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Current Name');
    expect(fs.readFileSync(path.join(dataDir, 'themes', 'current-theme.json'), 'utf8')).toContain('current-theme');
  }, 15000);

  it('preserves app-state files when restoring legacy backups without a manifest', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Keep Me' }));
    writeFileEnsured(path.join(dataDir, 'themes', 'current-theme.json'), JSON.stringify({ id: 'current-theme' }));
    writeFileEnsured(path.join(dataDir, 'backgrounds-user', 'current.png'), Buffer.from('current-background'));

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);

    const restoreResult = await backupRouter.__private.restoreFromZip(zip);

    expect(restoreResult.appStateRestored).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Keep Me');
    expect(fs.readFileSync(path.join(dataDir, 'themes', 'current-theme.json'), 'utf8')).toContain('current-theme');
    expect(fs.readFileSync(path.join(dataDir, 'backgrounds-user', 'current.png')).toString()).toBe('current-background');
  }, 15000);

  it('rejects unsafe app-state paths without writing outside DATA_DIR', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Current Name' }));
    const outsidePath = path.join(path.dirname(dataDir), 'preferences.json');
    writeFileEnsured(outsidePath, 'outside-original');

    const zip = new AdmZip();
    addFullBackupManifest(zip, backupRouter);
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addFile('C:/preferences.json', Buffer.from('evil'));

    await expect(backupRouter.__private.restoreFromZip(zip)).rejects.toThrow(/Unsafe backup path/);
    expect(fs.readFileSync(outsidePath, 'utf8')).toBe('outside-original');
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Current Name');

    fs.rmSync(outsidePath, { force: true });
  }, 15000);

  it('creates album_link and artist_link columns on a fresh database', () => {
    const { dbModule } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const columns = dbModule.db.prepare('PRAGMA table_info(albums)').all().map(column => column.name);

    expect(columns).toContain('album_link');
    expect(columns).toContain('artist_link');
  });

  it('blocks backup mutations while the welcome tour lock is active', () => {
    const { dbModule, backupRouter } = loadBackupTestContext();
    openDbs.push(dbModule.db);
    const welcomeStore = require('../server/welcome-tour-store.js');
    welcomeStore.upsertWelcomeTourLock('tour-session');

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

    backupRouter.handle({ method: 'POST', url: '/merge', headers: {} }, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(423);
    expect(res.body.code).toBe('welcome_tour_active');
  });
});
