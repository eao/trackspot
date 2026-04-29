import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const serverModulePaths = [
  '../server/routes/backup.js',
  '../server/backup-mutation-lock.js',
  '../server/welcome-tour-store.js',
  '../server/preferences-store.js',
  '../server/personalization-store.js',
  '../server/background-library.js',
  '../server/album-helpers.js',
  '../server/external-links.js',
  '../server/http-downloads.js',
  '../server/spotify-helpers.js',
  '../server/db.js',
];
const configuredPathEnvNames = [
  'PREFERENCES_PATH',
  'THEMES_DIR',
  'THEME_PREVIEW_IMAGES_DIR',
  'USER_BACKGROUNDS_DIR',
];

const tempDirs = [];
const openDbs = [];

function resetServerModules() {
  for (const modulePath of serverModulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function clearConfiguredPathEnv() {
  for (const envName of configuredPathEnvNames) {
    delete process.env[envName];
  }
}

function loadBackupTestContext(configureEnv = () => {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-backup-test-'));
  tempDirs.push(dataDir);
  process.env.DATA_DIR = dataDir;
  configureEnv(dataDir);
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

function addLegacyAlbumsDatabase(zip, dataDir, rows) {
  const BetterSqlite = require('better-sqlite3');
  const legacyPath = path.join(dataDir, `legacy-albums-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const legacyDb = new BetterSqlite(legacyPath);
  try {
    legacyDb.exec(`
      CREATE TABLE albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spotify_album_id TEXT,
        album_name TEXT NOT NULL,
        artists TEXT NOT NULL,
        status TEXT NOT NULL,
        rating INTEGER,
        image_path TEXT,
        image_url_large TEXT,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const insert = legacyDb.prepare(`
      INSERT INTO albums (
        id, spotify_album_id, album_name, artists, status, rating, image_path, image_url_large, source,
        created_at, updated_at
      ) VALUES (
        :id, :spotify_album_id, :album_name, :artists, :status, :rating, :image_path, :image_url_large,
        :source, :created_at, :updated_at
      )
    `);
    rows.forEach((row, index) => {
      insert.run({
        id: row.id ?? index + 1,
        spotify_album_id: row.spotify_album_id ?? null,
        album_name: row.album_name,
        artists: row.artists ?? JSON.stringify([{ name: 'Legacy Artist' }]),
        status: row.status ?? 'completed',
        rating: row.rating ?? null,
        image_path: row.image_path ?? null,
        image_url_large: row.image_url_large ?? null,
        source: row.source ?? 'manual',
        created_at: row.created_at ?? '2026-04-01 12:00:00',
        updated_at: row.updated_at ?? '2026-04-01 12:00:00',
      });
    });
  } finally {
    legacyDb.close();
  }
  zip.addLocalFile(legacyPath, '', 'albums.db');
  fs.unlinkSync(legacyPath);
}

function addLegacyAlbumsDatabaseWithoutImagePath(zip, dataDir, rows) {
  const BetterSqlite = require('better-sqlite3');
  const legacyPath = path.join(dataDir, `legacy-albums-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const legacyDb = new BetterSqlite(legacyPath);
  try {
    legacyDb.exec(`
      CREATE TABLE albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spotify_album_id TEXT,
        album_name TEXT NOT NULL,
        artists TEXT NOT NULL,
        image_url_large TEXT,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const insert = legacyDb.prepare(`
      INSERT INTO albums (
        id, spotify_album_id, album_name, artists, image_url_large, status, source, created_at, updated_at
      ) VALUES (
        :id, :spotify_album_id, :album_name, :artists, :image_url_large, :status, :source, :created_at, :updated_at
      )
    `);
    rows.forEach((row, index) => {
      insert.run({
        id: row.id ?? index + 1,
        spotify_album_id: row.spotify_album_id ?? null,
        album_name: row.album_name,
        artists: row.artists ?? JSON.stringify([{ name: 'Legacy Artist' }]),
        image_url_large: row.image_url_large ?? null,
        status: row.status ?? 'completed',
        source: row.source ?? 'spotify',
        created_at: row.created_at ?? '2026-04-01 12:00:00',
        updated_at: row.updated_at ?? '2026-04-01 12:00:00',
      });
    });
  } finally {
    legacyDb.close();
  }
  zip.addLocalFile(legacyPath, '', 'albums.db');
  fs.unlinkSync(legacyPath);
}

function addMinimalLegacyAlbumsDatabase(zip, dataDir, rows) {
  const BetterSqlite = require('better-sqlite3');
  const legacyPath = path.join(dataDir, `legacy-albums-minimal-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const legacyDb = new BetterSqlite(legacyPath);
  try {
    legacyDb.exec(`
      CREATE TABLE albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_name TEXT NOT NULL,
        artists TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL
      )
    `);
    const insert = legacyDb.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source
      ) VALUES (
        :id, :album_name, :artists, :status, :source
      )
    `);
    rows.forEach((row, index) => {
      insert.run({
        id: row.id ?? index + 1,
        album_name: row.album_name,
        artists: row.artists ?? JSON.stringify([{ name: 'Legacy Artist' }]),
        status: row.status ?? 'completed',
        source: row.source ?? 'manual',
      });
    });
  } finally {
    legacyDb.close();
  }
  zip.addLocalFile(legacyPath, '', 'albums.db');
  fs.unlinkSync(legacyPath);
}

function addFullBackupManifest(zip, backupRouter) {
  zip.addFile(
    backupRouter.__private.BACKUP_MANIFEST_NAME,
    Buffer.from(`${JSON.stringify(backupRouter.__private.buildBackupManifest('full', true), null, 2)}\n`),
  );
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(async () => {
  vi.restoreAllMocks();

  while (openDbs.length) {
    openDbs.pop()?.close();
  }

  delete process.env.DATA_DIR;
  clearConfiguredPathEnv();
  resetServerModules();

  while (tempDirs.length) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('backup and restore', () => {
  it('rejects oversized backup entries before decompressing them', async () => {
    const { dbModule, backupRouter } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const oversizedDbEntry = {
      entryName: 'albums.db',
      isDirectory: false,
      header: { size: backupRouter.__private.BACKUP_RESTORE_MAX_DB_BYTES + 1 },
      getData: vi.fn(() => Buffer.alloc(0)),
    };
    const zip = {
      getEntries: () => [oversizedDbEntry],
      getEntry: name => (name === 'albums.db' ? oversizedDbEntry : null),
    };

    await expect(backupRouter.__private.restoreFromZip(zip)).rejects.toThrow(/too large/i);
    expect(oversizedDbEntry.getData).not.toHaveBeenCalled();
  });

  it('checks actual extracted ZIP entry size even when metadata is smaller', () => {
    const { dbModule, backupRouter } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const entry = {
      entryName: 'preferences.json',
      isDirectory: false,
      header: { size: 1 },
      getData: vi.fn(() => Buffer.from('12345')),
    };

    expect(() => backupRouter.__private.readZipEntryData(entry, { maxEntryBytes: 4 }))
      .toThrow(/too large/i);
  });

  it('caps inflation without calling getData when ZIP metadata is false', () => {
    const { dbModule, backupRouter } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const zip = new AdmZip();
    zip.addFile('preferences.json', Buffer.from('12345'));
    const entry = zip.getEntry('preferences.json');
    entry.header.size = 1;
    const getDataSpy = vi.spyOn(entry, 'getData');

    expect(() => backupRouter.__private.readZipEntryData(entry, { maxEntryBytes: 4 }))
      .toThrow(/too large/i);
    expect(getDataSpy).not.toHaveBeenCalled();
  });

  it('tracks actual extracted bytes across entries', () => {
    const { dbModule, backupRouter } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const tracker = backupRouter.__private.createZipExtractionTracker({ maxTotalBytes: 6 });
    const firstEntry = {
      entryName: 'themes/one.json',
      isDirectory: false,
      header: { size: 4 },
      getData: vi.fn(() => Buffer.from('1234')),
    };
    const secondEntry = {
      entryName: 'themes/two.json',
      isDirectory: false,
      header: { size: 4 },
      getData: vi.fn(() => Buffer.from('5678')),
    };

    expect(backupRouter.__private.readZipEntryData(firstEntry, {
      maxEntryBytes: 10,
      extractionTracker: tracker,
    }).toString()).toBe('1234');
    expect(tracker.totalBytes).toBe(4);
    expect(() => backupRouter.__private.readZipEntryData(secondEntry, {
      maxEntryBytes: 10,
      extractionTracker: tracker,
    })).toThrow(/too large after extraction/i);
    expect(secondEntry.getData).not.toHaveBeenCalled();
  });

  it('sanitizes unsafe links from backup databases before restore', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, album_link, artist_link, created_at, updated_at
      ) VALUES (
        :id, :album_name, :artists, :status, :source, :album_link, :artist_link, :created_at, :updated_at
      )
    `).run({
      id: 1,
      album_name: 'Unsafe Backup Album',
      artists: JSON.stringify([{
        name: 'Unsafe Artist',
        manual_link: 'javascript:alert(1)',
        share_url: 'https://example.com/artist',
      }]),
      status: 'completed',
      source: 'manual',
      album_link: 'javascript:alert(1)',
      artist_link: 'spotify:ARTIST:ABC123',
      created_at: '2026-04-01 12:00:00',
      updated_at: '2026-04-01 12:00:00',
    });

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);

    const result = await backupRouter.__private.restoreFromZip(zip);
    const restored = db.prepare('SELECT album_link, artist_link, artists FROM albums WHERE id = ?').get(1);
    const restoredArtists = JSON.parse(restored.artists);

    expect(result.sanitizedLinks).toBe(1);
    expect(restored.album_link).toBeNull();
    expect(restored.artist_link).toBe('spotify:artist:ABC123');
    expect(restoredArtists[0].manual_link).toBeNull();
    expect(restoredArtists[0].share_url).toBe('https://example.com/artist');
  });

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

  it('updates restored rows to the actual refetched image path', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('refetched-restore-image'),
    });

    db.prepare(`
      INSERT INTO albums (
        id, spotify_album_id, album_name, artists, status, image_path, image_url_large, source,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      42,
      'restore123',
      'Restore Refetch Album',
      JSON.stringify([{ name: 'Restore Artist' }]),
      'completed',
      'images/old-spotify-art.jpg',
      'https://example.test/restore-art.jpg',
      'spotify',
      '2026-04-01 12:00:00',
      '2026-04-01 12:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);

    db.prepare('DELETE FROM albums').run();
    writeFileEnsured(path.join(dataDir, 'images', 'old-spotify-art.jpg'), Buffer.from('old-image'));

    const restoreResult = await backupRouter.__private.restoreFromZip(zip);
    const restored = db.prepare(`
      SELECT album_name, image_path
      FROM albums
      WHERE album_name = ?
    `).get('Restore Refetch Album');

    expect(restoreResult).toMatchObject({
      added: 1,
      imagesCopied: 0,
      imagesRefetched: 1,
    });
    expect(restored).toEqual({
      album_name: 'Restore Refetch Album',
      image_path: 'images/restore123.jpg',
    });
    expect(fs.readFileSync(path.join(dataDir, restored.image_path)).toString()).toBe('refetched-restore-image');
    expect(fs.existsSync(path.join(dataDir, 'images', 'old-spotify-art.jpg'))).toBe(false);
  }, 15000);

  it('stores refetched image paths when restoring legacy backups without an image_path column', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('legacy-restore-image'),
    });

    const zip = new AdmZip();
    addLegacyAlbumsDatabaseWithoutImagePath(zip, dataDir, [
      {
        id: 101,
        spotify_album_id: 'legacyrestore123',
        album_name: 'Legacy Restore Art Album',
        artists: JSON.stringify([{ name: 'Legacy Restore Artist' }]),
        image_url_large: 'https://example.test/legacy-restore-art.jpg',
      },
    ]);

    const restoreResult = await backupRouter.__private.restoreFromZip(zip);
    const restored = db.prepare(`
      SELECT album_name, image_path
      FROM albums
      WHERE album_name = ?
    `).get('Legacy Restore Art Album');

    expect(restoreResult).toMatchObject({
      added: 1,
      imagesCopied: 0,
      imagesRefetched: 1,
    });
    expect(restored).toEqual({
      album_name: 'Legacy Restore Art Album',
      image_path: 'images/legacyrestore123.jpg',
    });
    expect(fs.readFileSync(path.join(dataDir, restored.image_path)).toString()).toBe('legacy-restore-image');
  }, 15000);

  it('migrates legacy backup databases missing created_at before restoring', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const zip = new AdmZip();
    addMinimalLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        album_name: 'Minimal Legacy Restore Album',
        artists: JSON.stringify([{ name: 'Minimal Legacy Artist' }]),
      },
    ]);

    const restoreResult = await backupRouter.__private.restoreFromZip(zip);
    const restored = db.prepare(`
      SELECT album_name, artists, status, source, created_at
      FROM albums
      WHERE album_name = ?
    `).get('Minimal Legacy Restore Album');

    expect(restoreResult).toMatchObject({
      added: 1,
      imagesCopied: 0,
      imagesRefetched: 0,
    });
    expect(restored).toMatchObject({
      album_name: 'Minimal Legacy Restore Album',
      artists: JSON.stringify([{ name: 'Minimal Legacy Artist' }]),
      status: 'completed',
      source: 'manual',
    });
    expect(restored.created_at).toEqual(expect.any(String));
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

  it('fails closed and preserves a restore journal with an unknown phase', () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const journalPath = path.join(dataDir, backupRouter.__private.RESTORE_JOURNAL_NAME);
    const journal = {
      operation: 'restore',
      phase: 'db-swapped-but-not-really',
      rollbackDbPath: path.join(dataDir, '_restore_rollback_unknown_phase.db'),
    };
    fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

    expect(() => backupRouter.__private.readRestoreJournal())
      .toThrow(/Could not read restore journal: Restore journal phase is invalid/);
    expect(() => backupRouter.__private.recoverInterruptedRestore())
      .toThrow(/Could not read restore journal: Restore journal phase is invalid/);
    expect(JSON.parse(fs.readFileSync(journalPath, 'utf8')).phase).toBe(journal.phase);
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

  it('restores app-state files into configured target paths', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext(currentDataDir => {
      const configuredRoot = path.join(currentDataDir, 'configured-app-state');
      process.env.PREFERENCES_PATH = path.join(configuredRoot, 'prefs', 'custom-preferences.json');
      process.env.THEMES_DIR = path.join(configuredRoot, 'theme-store');
      process.env.THEME_PREVIEW_IMAGES_DIR = path.join(configuredRoot, 'theme-previews');
      process.env.USER_BACKGROUNDS_DIR = path.join(configuredRoot, 'primary-backgrounds');
    });
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(process.env.PREFERENCES_PATH, JSON.stringify({ wrappedName: 'Current Configured Name' }));
    writeFileEnsured(path.join(process.env.THEMES_DIR, 'current-theme.json'), JSON.stringify({ id: 'current-theme' }));
    writeFileEnsured(path.join(process.env.THEME_PREVIEW_IMAGES_DIR, 'current-preview.png'), Buffer.from('current-preview'));
    writeFileEnsured(path.join(process.env.USER_BACKGROUNDS_DIR, 'current.png'), Buffer.from('current-background'));
    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Default Name' }));
    writeFileEnsured(path.join(dataDir, 'themes', 'default-theme.json'), JSON.stringify({ id: 'default-theme' }));
    writeFileEnsured(path.join(dataDir, 'theme-preview-images', 'default-preview.png'), Buffer.from('default-preview'));
    writeFileEnsured(path.join(dataDir, 'backgrounds-user', 'default.png'), Buffer.from('default-background'));

    const zip = new AdmZip();
    addFullBackupManifest(zip, backupRouter);
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addFile('preferences.json', Buffer.from(JSON.stringify({ wrappedName: 'Backup Configured Name' })));
    zip.addFile('themes/backup-theme.json', Buffer.from(JSON.stringify({ id: 'backup-theme' })));
    zip.addFile('theme-preview-images/backup-preview.png', Buffer.from('backup-preview'));
    zip.addFile('backgrounds-user/backup.png', Buffer.from('backup-background'));

    const restoreResult = await backupRouter.__private.restoreFromZip(zip);

    expect(restoreResult).toMatchObject({
      appStateRestored: true,
      appStateFilesRestored: 4,
    });
    expect(JSON.parse(fs.readFileSync(process.env.PREFERENCES_PATH, 'utf8')).wrappedName).toBe('Backup Configured Name');
    expect(fs.readFileSync(path.join(process.env.THEMES_DIR, 'backup-theme.json'), 'utf8')).toContain('backup-theme');
    expect(fs.readFileSync(path.join(process.env.THEME_PREVIEW_IMAGES_DIR, 'backup-preview.png')).toString()).toBe('backup-preview');
    expect(fs.readFileSync(path.join(process.env.USER_BACKGROUNDS_DIR, 'backup.png')).toString()).toBe('backup-background');
    expect(fs.existsSync(path.join(process.env.THEMES_DIR, 'current-theme.json'))).toBe(false);
    expect(fs.existsSync(path.join(process.env.THEME_PREVIEW_IMAGES_DIR, 'current-preview.png'))).toBe(false);
    expect(fs.existsSync(path.join(process.env.USER_BACKGROUNDS_DIR, 'current.png'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Default Name');
    expect(fs.readFileSync(path.join(dataDir, 'themes', 'default-theme.json'), 'utf8')).toContain('default-theme');
    expect(fs.readFileSync(path.join(dataDir, 'theme-preview-images', 'default-preview.png')).toString()).toBe('default-preview');
    expect(fs.readFileSync(path.join(dataDir, 'backgrounds-user', 'default.png')).toString()).toBe('default-background');
    expect(fs.existsSync(path.join(dataDir, 'themes', 'backup-theme.json'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'theme-preview-images', 'backup-preview.png'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'backgrounds-user', 'backup.png'))).toBe(false);
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

  it('rejects invalid app-state JSON before replacing current app-state files', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Current Name' }));
    writeFileEnsured(path.join(dataDir, 'themes', 'current-theme.json'), JSON.stringify({ id: 'current-theme' }));

    const zip = new AdmZip();
    addFullBackupManifest(zip, backupRouter);
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addFile('preferences.json', Buffer.from('{not-json'));
    zip.addFile('themes/backup-theme.json', Buffer.from(JSON.stringify({ id: 'backup-theme' })));

    await expect(backupRouter.__private.restoreFromZip(zip)).rejects.toThrow(/preferences\.json could not be parsed/);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Current Name');
    expect(fs.readFileSync(path.join(dataDir, 'themes', 'current-theme.json'), 'utf8')).toContain('current-theme');
    expect(fs.existsSync(path.join(dataDir, 'themes', 'backup-theme.json'))).toBe(false);
  }, 15000);

  it('rejects unexpected app-state file types before staging them', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Current Name' }));

    const zip = new AdmZip();
    addFullBackupManifest(zip, backupRouter);
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addFile('theme-preview-images/script.html', Buffer.from('<script>bad</script>'));

    await expect(backupRouter.__private.restoreFromZip(zip)).rejects.toThrow(/Unexpected app-state image path/);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Current Name');
  }, 15000);

  it('rejects incompatible full backup manifests before restoring app-state files', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Current Name' }));

    const manifest = {
      ...backupRouter.__private.buildBackupManifest('full', true),
      appStatePaths: ['preferences.json'],
    };
    const zip = new AdmZip();
    zip.addFile(backupRouter.__private.BACKUP_MANIFEST_NAME, Buffer.from(JSON.stringify(manifest)));
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addFile('preferences.json', Buffer.from(JSON.stringify({ wrappedName: 'Backup Name' })));

    await expect(backupRouter.__private.restoreFromZip(zip)).rejects.toThrow(/app-state paths are not compatible/);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Current Name');
  }, 15000);

  it('refuses configured app-state restore targets outside DATA_DIR before clearing them', async () => {
    const outsideThemesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-outside-themes-'));
    tempDirs.push(outsideThemesDir);
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext(() => {
      process.env.THEMES_DIR = outsideThemesDir;
    });
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(outsideThemesDir, 'outside-theme.json'), JSON.stringify({ id: 'outside-theme' }));
    writeFileEnsured(path.join(dataDir, 'preferences.json'), JSON.stringify({ wrappedName: 'Current Name' }));

    const zip = new AdmZip();
    addFullBackupManifest(zip, backupRouter);
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addFile('themes/backup-theme.json', Buffer.from(JSON.stringify({ id: 'backup-theme' })));

    await expect(backupRouter.__private.restoreFromZip(zip)).rejects.toThrow(/must stay inside DATA_DIR/);
    expect(fs.existsSync(path.join(outsideThemesDir, 'outside-theme.json'))).toBe(true);
    expect(fs.existsSync(path.join(outsideThemesDir, 'backup-theme.json'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).wrappedName).toBe('Current Name');
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

  it('rejects backup paths that collide on case-insensitive file systems', async () => {
    const { dbModule, backupRouter } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const zip = new AdmZip();
    zip.addFile('albums.db', Buffer.from('not-a-real-db'));
    zip.addFile('images/Cover.jpg', Buffer.from('upper'));
    zip.addFile('images/cover.jpg', Buffer.from('lower'));

    expect(() => backupRouter.__private.validateZipEntryNames(zip))
      .toThrow(/case-insensitive file systems/);
    await expect(backupRouter.__private.importFromZip(zip))
      .rejects.toThrow(/case-insensitive file systems/);
  });

  it('rejects Windows-reserved backup path segments before writing staged files', async () => {
    const { dbModule, backupRouter } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const zip = new AdmZip();
    zip.addFile('albums.db', Buffer.from('not-a-real-db'));
    zip.addFile('theme-preview-images/CON.jpg', Buffer.from('preview'));

    expect(backupRouter.__private.isWindowsReservedPathSegment('CON.jpg')).toBe(true);
    await expect(backupRouter.__private.restoreFromZip(zip))
      .rejects.toThrow(/not portable to Windows/);
  });

  it('reads uploaded backup zips from disk and cleans the upload artifact', () => {
    const { backupRouter, dataDir } = loadBackupTestContext();
    const uploadPath = path.join(backupRouter.__private.BACKUP_UPLOADS_DIR, '1234567890-abcdef12.zip');
    const zip = new AdmZip();

    fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
    zip.addFile('albums.db', Buffer.from('db'));
    zip.writeZip(uploadPath);

    const opened = backupRouter.__private.openUploadedBackupZip({ path: uploadPath });
    expect(opened.getEntry('albums.db')).toBeTruthy();
    expect(backupRouter.__private.BACKUP_UPLOADS_DIR).toBe(path.join(dataDir, '_backup_uploads'));

    backupRouter.__private.cleanupUploadedBackup({ path: uploadPath });

    expect(fs.existsSync(uploadPath)).toBe(false);
  });

  it('skips uploaded backup cleanup paths outside the upload directory', () => {
    const { backupRouter, dataDir } = loadBackupTestContext();
    const outsidePath = path.join(dataDir, 'keep-me.zip');
    fs.writeFileSync(outsidePath, 'keep');

    expect(backupRouter.__private.cleanupUploadedBackup({ path: outsidePath })).toBe(false);

    expect(fs.readFileSync(outsidePath, 'utf8')).toBe('keep');
  });

  it('sanitizes unsafe album image paths when merging backups', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'preferences.json'), 'keep-me');

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      101,
      'Unsafe Merge Album',
      JSON.stringify([{ name: 'Careful Artist' }]),
      'completed',
      'images/../preferences.json',
      'manual',
      '2026-04-01 12:00:00',
      '2026-04-01 12:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);
    db.prepare('DELETE FROM albums').run();

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare('SELECT album_name, image_path FROM albums').get();

    expect(result).toMatchObject({
      added: 1,
      sanitizedImagePaths: 1,
    });
    expect(restored).toEqual({
      album_name: 'Unsafe Merge Album',
      image_path: null,
    });
    expect(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).toBe('keep-me');
    expect(fs.readdirSync(dataDir).filter(fileName => fileName.startsWith('_import_tmp_'))).toEqual([]);
  });

  it('normalizes legacy constraint values instead of silently skipping merge rows', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        spotify_album_id: 'legacy-invalid-rating',
        album_name: 'Legacy Invalid Rating Album',
        artists: JSON.stringify([{ name: 'Legacy Artist' }]),
        rating: 101,
      },
    ]);

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare(`
      SELECT album_name, rating, repeats, priority
      FROM albums
      WHERE spotify_album_id = ?
    `).get('legacy-invalid-rating');

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
    });
    expect(restored).toEqual({
      album_name: 'Legacy Invalid Rating Album',
      rating: null,
      repeats: 0,
      priority: 0,
    });
  }, 15000);

  it('blocks merges while a restore is in progress', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const restoreZip = new AdmZip();
    addLegacyAlbumsDatabaseWithoutImagePath(restoreZip, dataDir, [
      {
        id: 101,
        spotify_album_id: 'restore-lock-album',
        album_name: 'Restore Lock Album',
        artists: JSON.stringify([{ name: 'Restore Artist' }]),
        image_url_large: 'https://example.test/restore-lock.jpg',
      },
    ]);

    const mergeZip = new AdmZip();
    addLegacyAlbumsDatabase(mergeZip, dataDir, [
      {
        id: 201,
        album_name: 'Blocked During Restore Album',
        artists: JSON.stringify([{ name: 'Blocked Artist' }]),
      },
    ]);

    const fetchDeferred = createDeferred();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchDeferred.promise);
    const restorePromise = backupRouter.__private.restoreFromZip(restoreZip);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await expect(backupRouter.__private.importFromZip(mergeZip))
      .rejects.toThrow(/backup restore is already in progress/);

    fetchDeferred.resolve({
      ok: true,
      arrayBuffer: async () => Buffer.from('restore-image'),
    });
    await expect(restorePromise).resolves.toMatchObject({
      added: 1,
      imagesRefetched: 1,
    });
  }, 15000);

  it('blocks restores while a merge is in progress', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const mergeZip = new AdmZip();
    addLegacyAlbumsDatabaseWithoutImagePath(mergeZip, dataDir, [
      {
        id: 101,
        spotify_album_id: 'merge-lock-album',
        album_name: 'Merge Lock Album',
        artists: JSON.stringify([{ name: 'Merge Artist' }]),
        image_url_large: 'https://example.test/merge-lock.jpg',
      },
    ]);

    const restoreZip = new AdmZip();
    addLegacyAlbumsDatabase(restoreZip, dataDir, [
      {
        id: 201,
        album_name: 'Blocked During Merge Album',
        artists: JSON.stringify([{ name: 'Blocked Artist' }]),
      },
    ]);

    const fetchDeferred = createDeferred();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchDeferred.promise);
    const mergePromise = backupRouter.__private.importFromZip(mergeZip);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await expect(backupRouter.__private.restoreFromZip(restoreZip))
      .rejects.toThrow(/backup merge is already in progress/);

    fetchDeferred.resolve({
      ok: true,
      arrayBuffer: async () => Buffer.from('merge-image'),
    });
    await expect(mergePromise).resolves.toMatchObject({
      added: 1,
      imagesRefetched: 1,
    });
  }, 15000);

  it('blocks restores while another app mutation is active', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const backupLock = require('../server/backup-mutation-lock.js');
    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        album_name: 'Blocked By App Mutation Album',
        artists: JSON.stringify([{ name: 'Blocked Artist' }]),
      },
    ]);

    db.prepare(`
      INSERT INTO albums (id, album_name, artists, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'completed',
      'manual',
      '2026-04-01 12:00:00',
      '2026-04-01 12:00:00',
    );

    const endMutation = backupLock.beginAppMutation();
    try {
      await expect(backupRouter.__private.restoreFromZip(zip))
        .rejects.toThrow(/app update is already in progress/);
    } finally {
      endMutation();
    }

    expect(db.prepare('SELECT album_name FROM albums').get()).toEqual({
      album_name: 'Current Album',
    });
  });

  it('rolls back merge rows, cleans partial images, and retries cleanly when final image copy fails', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'images', 'backup-art.jpg'), Buffer.from('backup-image'));
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      101,
      'Retry Merge Album',
      JSON.stringify([{ name: 'Retry Artist' }]),
      'completed',
      'images/backup-art.jpg',
      'manual',
      '2026-04-01 12:00:00',
      '2026-04-01 12:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addLocalFile(path.join(dataDir, 'images', 'backup-art.jpg'), 'images', 'backup-art.jpg');

    db.prepare('DELETE FROM albums').run();
    fs.rmSync(path.join(dataDir, 'images'), { recursive: true, force: true });

    const originalCopyFileSync = fs.copyFileSync;
    fs.copyFileSync = function copyFileSyncWithMergeCommitFailure(sourcePath, targetPath, mode) {
      if (
        String(sourcePath).includes('_import_images_')
        && String(targetPath).endsWith(path.join('images', 'backup-art.jpg'))
      ) {
        fs.writeFileSync(targetPath, Buffer.from('partial-image'));
        throw new Error('simulated merge image commit failure');
      }
      return originalCopyFileSync.call(this, sourcePath, targetPath, mode);
    };

    try {
      await expect(backupRouter.__private.importFromZip(zip, false))
        .rejects.toThrow(/simulated merge image commit failure/);
    } finally {
      fs.copyFileSync = originalCopyFileSync;
    }

    expect(db.prepare('SELECT COUNT(*) AS count FROM albums').get().count).toBe(0);
    expect(fs.existsSync(path.join(dataDir, 'images', 'backup-art.jpg'))).toBe(false);
    expect(fs.readdirSync(dataDir).filter(fileName => fileName.startsWith('_import_'))).toEqual([]);

    const retryResult = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare('SELECT album_name, image_path FROM albums').get();

    expect(retryResult).toMatchObject({
      added: 1,
      skipped: 0,
      imagesCopied: 1,
      imagesRefetched: 0,
    });
    expect(restored).toEqual({
      album_name: 'Retry Merge Album',
      image_path: 'images/backup-art.jpg',
    });
    expect(fs.readFileSync(path.join(dataDir, 'images', 'backup-art.jpg')).toString()).toBe('backup-image');
  }, 15000);

  it('does not delete a file that appears at the final merge image path before copy', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const imagePath = 'images/race-art.jpg';
    writeFileEnsured(path.join(dataDir, imagePath), Buffer.from('backup-image'));
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      101,
      'Racing Image Merge Album',
      JSON.stringify([{ name: 'Race Artist' }]),
      'completed',
      imagePath,
      'manual',
      '2026-04-01 12:00:00',
      '2026-04-01 12:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addLocalFile(path.join(dataDir, imagePath), 'images', 'race-art.jpg');

    db.prepare('DELETE FROM albums').run();
    fs.rmSync(path.join(dataDir, 'images'), { recursive: true, force: true });

    const originalCopyFileSync = fs.copyFileSync;
    fs.copyFileSync = function copyFileSyncWithRacingFile(sourcePath, targetPath, mode) {
      if (
        String(sourcePath).includes('_import_images_')
        && String(targetPath).endsWith(path.join('images', 'race-art.jpg'))
      ) {
        writeFileEnsured(String(targetPath), Buffer.from('racing-image'));
        const error = new Error('simulated final image race');
        error.code = 'EEXIST';
        throw error;
      }
      return originalCopyFileSync.call(this, sourcePath, targetPath, mode);
    };

    try {
      await expect(backupRouter.__private.importFromZip(zip))
        .rejects.toThrow(/simulated final image race/);
    } finally {
      fs.copyFileSync = originalCopyFileSync;
    }

    expect(db.prepare('SELECT COUNT(*) AS count FROM albums').get().count).toBe(0);
    expect(fs.readFileSync(path.join(dataDir, imagePath)).toString()).toBe('racing-image');
    expect(backupRouter.__private.readMergeJournal()).toBeNull();

    const retryResult = await backupRouter.__private.importFromZip(zip);
    const restored = db.prepare('SELECT album_name, image_path FROM albums').get();

    expect(retryResult).toMatchObject({
      added: 1,
      skipped: 0,
      imagesCopied: 1,
      imagesRefetched: 0,
    });
    expect(restored.album_name).toBe('Racing Image Merge Album');
    expect(restored.image_path).not.toBe(imagePath);
    expect(restored.image_path).toMatch(/^images\/merge_race-art_/);
    expect(fs.readFileSync(path.join(dataDir, imagePath)).toString()).toBe('racing-image');
    expect(fs.readFileSync(path.join(dataDir, restored.image_path)).toString()).toBe('backup-image');
  }, 15000);

  it('recovers interrupted restores before merging backup albums', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'completed',
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    const rollbackDbPath = path.join(dataDir, '_restore_rollback_merge_test.db');
    await db.backup(rollbackDbPath);

    db.prepare('DELETE FROM albums').run();
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      2,
      'Partially Restored Album',
      JSON.stringify([{ name: 'Partial Artist' }]),
      'completed',
      'manual',
      '2026-04-03 12:00:00',
      '2026-04-03 12:00:00',
    );

    backupRouter.__private.writeRestoreJournal({
      operation: 'restore',
      phase: 'db-swapped',
      tmpPath: path.join(dataDir, '_restore_tmp_merge_test.db'),
      rollbackDbPath,
    });

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        album_name: 'Merged Backup Album',
        artists: JSON.stringify([{ name: 'Merged Artist' }]),
      },
    ]);

    const result = await backupRouter.__private.importFromZip(zip, false);
    const albumNames = db.prepare('SELECT album_name FROM albums ORDER BY album_name').all()
      .map(row => row.album_name);

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
    });
    expect(albumNames).toEqual(['Current Album', 'Merged Backup Album']);
    expect(fs.existsSync(path.join(dataDir, backupRouter.__private.RESTORE_JOURNAL_NAME))).toBe(false);
    expect(fs.existsSync(rollbackDbPath)).toBe(false);
  }, 15000);

  it('recovers interrupted merge images without deleting DB-referenced art', () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const orphanImagePath = 'images/orphan-merge.jpg';
    const referencedImagePath = 'images/referenced-merge.jpg';
    writeFileEnsured(path.join(dataDir, orphanImagePath), Buffer.from('orphan-image'));
    writeFileEnsured(path.join(dataDir, referencedImagePath), Buffer.from('referenced-image'));
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Referenced Merge Album',
      JSON.stringify([{ name: 'Referenced Artist' }]),
      'completed',
      referencedImagePath,
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    backupRouter.__private.writeMergeJournal({
      operation: 'merge',
      imagePaths: [orphanImagePath, referencedImagePath],
    });

    expect(backupRouter.__private.recoverInterruptedMerge()).toBe(true);
    expect(fs.existsSync(path.join(dataDir, orphanImagePath))).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, referencedImagePath)).toString()).toBe('referenced-image');
    expect(fs.existsSync(path.join(dataDir, backupRouter.__private.MERGE_JOURNAL_NAME))).toBe(false);
  });

  it('recovers interrupted merge cleanup before restoring backup albums', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const orphanImagePath = 'images/orphan-before-restore.jpg';
    writeFileEnsured(path.join(dataDir, orphanImagePath), Buffer.from('orphan-image'));
    backupRouter.__private.writeMergeJournal({
      operation: 'merge',
      imagePaths: [orphanImagePath],
    });

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        album_name: 'Restored After Merge Journal Album',
        artists: JSON.stringify([{ name: 'Restored Artist' }]),
      },
    ]);

    const result = await backupRouter.__private.restoreFromZip(zip);
    const restored = db.prepare('SELECT album_name FROM albums').get();

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
    });
    expect(restored.album_name).toBe('Restored After Merge Journal Album');
    expect(fs.existsSync(path.join(dataDir, orphanImagePath))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, backupRouter.__private.MERGE_JOURNAL_NAME))).toBe(false);
  }, 15000);

  it('recovers interrupted merge temp artifacts from the merge journal', () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    const tmpPath = path.join(dataDir, '_import_tmp_1234567890_journaled');
    const stagingImagesDir = path.join(dataDir, '_import_images_1234567890_journaled');
    writeFileEnsured(tmpPath, Buffer.from('temporary backup db'));
    writeFileEnsured(path.join(stagingImagesDir, 'staged-art.jpg'), Buffer.from('staged image'));

    backupRouter.__private.writeMergeJournal({
      operation: 'merge',
      imagePaths: [],
      tmpPath,
      stagingImagesDir,
    });

    expect(backupRouter.__private.recoverInterruptedMerge()).toBe(true);
    expect(fs.existsSync(tmpPath)).toBe(false);
    expect(fs.existsSync(stagingImagesDir)).toBe(false);
    expect(fs.existsSync(path.join(dataDir, backupRouter.__private.MERGE_JOURNAL_NAME))).toBe(false);
  });

  it('cleans unjournaled merge temp artifacts on startup', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-backup-test-'));
    tempDirs.push(dataDir);
    process.env.DATA_DIR = dataDir;
    resetServerModules();

    const tmpPath = path.join(dataDir, '_import_tmp_1234567890_abc123');
    const stagingImagesDir = path.join(dataDir, '_import_images_1234567890_abc123');
    const similarlyPrefixedFile = path.join(dataDir, '_import_tmp_notes.txt');
    const similarlyPrefixedDir = path.join(dataDir, '_import_images_notes');
    writeFileEnsured(tmpPath, Buffer.from('orphan temporary backup db'));
    writeFileEnsured(path.join(stagingImagesDir, 'staged-art.jpg'), Buffer.from('orphan staged image'));
    writeFileEnsured(similarlyPrefixedFile, Buffer.from('not generated'));
    writeFileEnsured(path.join(similarlyPrefixedDir, 'keep.txt'), Buffer.from('not generated'));

    const dbModule = require('../server/db.js');
    const backupRouter = require('../server/routes/backup.js');
    openDbs.push(dbModule.db);

    expect(backupRouter.__private.MERGE_JOURNAL_NAME).toBe('_merge_journal.json');
    expect(fs.existsSync(tmpPath)).toBe(false);
    expect(fs.existsSync(stagingImagesDir)).toBe(false);
    expect(fs.existsSync(similarlyPrefixedFile)).toBe(true);
    expect(fs.existsSync(similarlyPrefixedDir)).toBe(true);
  });

  it('blocks new merges when an interrupted merge journal is corrupt', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const journalPath = path.join(dataDir, backupRouter.__private.MERGE_JOURNAL_NAME);
    fs.writeFileSync(journalPath, JSON.stringify({ operation: 'merge', imagePaths: 'images/orphan.jpg' }));

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        album_name: 'Corrupt Journal Merge Album',
        artists: JSON.stringify([{ name: 'Corrupt Journal Artist' }]),
      },
    ]);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => backupRouter.__private.readMergeJournal())
        .toThrow(/Could not read merge journal: Merge journal image paths are invalid/);

      fs.writeFileSync(journalPath, '{not-json');
      await expect(backupRouter.__private.importFromZip(zip, false))
        .rejects.toThrow(/Could not read merge journal/);
    } finally {
      errorSpy.mockRestore();
    }

    expect(db.prepare('SELECT COUNT(*) AS count FROM albums').get().count).toBe(0);
    expect(fs.existsSync(journalPath)).toBe(true);
  }, 15000);

  it('blocks restores when an interrupted merge journal is corrupt', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'completed',
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    const journalPath = path.join(dataDir, backupRouter.__private.MERGE_JOURNAL_NAME);
    fs.writeFileSync(journalPath, '{not-json');

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        album_name: 'Blocked Restore Album',
        artists: JSON.stringify([{ name: 'Blocked Restore Artist' }]),
      },
    ]);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(backupRouter.__private.restoreFromZip(zip))
        .rejects.toThrow(/Could not read merge journal/);
    } finally {
      errorSpy.mockRestore();
    }

    const current = db.prepare('SELECT id, album_name FROM albums').get();
    expect(current).toEqual({
      id: 1,
      album_name: 'Current Album',
    });
    expect(fs.existsSync(journalPath)).toBe(true);
  }, 15000);

  it('does not let a corrupt interrupted merge journal prevent startup', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-backup-test-'));
    tempDirs.push(dataDir);
    process.env.DATA_DIR = dataDir;
    resetServerModules();

    fs.writeFileSync(path.join(dataDir, '_merge_journal.json'), '{not-json');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const dbModule = require('../server/db.js');
      const backupRouter = require('../server/routes/backup.js');
      openDbs.push(dbModule.db);

      expect(backupRouter.__private.MERGE_JOURNAL_NAME).toBe('_merge_journal.json');
      expect(fs.existsSync(path.join(dataDir, backupRouter.__private.MERGE_JOURNAL_NAME))).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('blocks new merges when interrupted merge cleanup cannot finish', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const orphanImagePath = 'images/orphan-merge.jpg';
    const orphanFullPath = path.join(dataDir, orphanImagePath);
    writeFileEnsured(orphanFullPath, Buffer.from('orphan-image'));
    backupRouter.__private.writeMergeJournal({
      operation: 'merge',
      imagePaths: [orphanImagePath],
    });

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        album_name: 'Blocked Merge Album',
        artists: JSON.stringify([{ name: 'Blocked Artist' }]),
      },
    ]);

    const originalRmSync = fs.rmSync;
    const originalWarn = console.warn;
    fs.rmSync = function rmSyncWithInterruptedMergeCleanupFailure(targetPath, options) {
      if (path.resolve(String(targetPath)) === path.resolve(orphanFullPath)) {
        throw new Error('simulated interrupted merge cleanup failure');
      }
      return originalRmSync.call(this, targetPath, options);
    };
    console.warn = () => {};

    try {
      await expect(backupRouter.__private.importFromZip(zip, false))
        .rejects.toThrow(/Could not finish cleanup for a previous interrupted merge/);
    } finally {
      fs.rmSync = originalRmSync;
      console.warn = originalWarn;
    }

    expect(db.prepare('SELECT COUNT(*) AS count FROM albums').get().count).toBe(0);
    expect(fs.existsSync(orphanFullPath)).toBe(true);
    expect(backupRouter.__private.readMergeJournal()?.imagePaths).toEqual([orphanImagePath]);

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare('SELECT album_name FROM albums').get();

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
    });
    expect(restored.album_name).toBe('Blocked Merge Album');
    expect(fs.existsSync(orphanFullPath)).toBe(false);
    expect(backupRouter.__private.readMergeJournal()).toBeNull();
  }, 15000);

  it('blocks new merges when interrupted merge journal removal cannot finish', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const journalPath = path.join(dataDir, backupRouter.__private.MERGE_JOURNAL_NAME);
    backupRouter.__private.writeMergeJournal({
      operation: 'merge',
      imagePaths: [],
    });

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        album_name: 'Journal Removal Blocked Album',
        artists: JSON.stringify([{ name: 'Blocked Artist' }]),
      },
    ]);

    const originalRmSync = fs.rmSync;
    const originalWarn = console.warn;
    fs.rmSync = function rmSyncWithMergeJournalRemovalFailure(targetPath, options) {
      if (path.resolve(String(targetPath)) === path.resolve(journalPath)) {
        throw new Error('simulated merge journal removal failure');
      }
      return originalRmSync.call(this, targetPath, options);
    };
    console.warn = () => {};

    try {
      await expect(backupRouter.__private.importFromZip(zip, false))
        .rejects.toThrow(/Could not finish cleanup for a previous interrupted merge/);
    } finally {
      fs.rmSync = originalRmSync;
      console.warn = originalWarn;
    }

    expect(db.prepare('SELECT COUNT(*) AS count FROM albums').get().count).toBe(0);
    expect(fs.existsSync(journalPath)).toBe(true);

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare('SELECT album_name FROM albums').get();

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
    });
    expect(restored.album_name).toBe('Journal Removal Blocked Album');
    expect(backupRouter.__private.readMergeJournal()).toBeNull();
  }, 15000);

  it('does not fail a committed merge when staging cleanup fails', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        album_name: 'Cleanup Resilient Album',
        artists: JSON.stringify([{ name: 'Cleanup Artist' }]),
      },
    ]);

    const originalRmSync = fs.rmSync;
    const originalWarn = console.warn;
    const warnings = [];
    fs.rmSync = function rmSyncWithStagingCleanupFailure(targetPath, options) {
      if (String(targetPath).includes('_import_images_')) {
        throw new Error('simulated staging cleanup failure');
      }
      return originalRmSync.call(this, targetPath, options);
    };
    console.warn = (...args) => warnings.push(args);

    let result;
    try {
      result = await backupRouter.__private.importFromZip(zip, false);
    } finally {
      fs.rmSync = originalRmSync;
      console.warn = originalWarn;
    }

    const restored = db.prepare('SELECT album_name FROM albums').get();

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
    });
    expect(restored.album_name).toBe('Cleanup Resilient Album');
    expect(warnings.some(args => String(args[0]).includes('Merge cleanup failed for staged images'))).toBe(true);

    const journal = backupRouter.__private.readMergeJournal();
    expect(journal?.stagingImagesDir).toContain('_import_images_');
    expect(fs.existsSync(journal.stagingImagesDir)).toBe(true);

    expect(backupRouter.__private.recoverInterruptedMerge()).toBe(true);
    expect(fs.existsSync(journal.stagingImagesDir)).toBe(false);
    expect(backupRouter.__private.readMergeJournal()).toBeNull();
  }, 15000);

  it('renames colliding backup image paths during merge and reuses the staged path for shared backup art', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const sharedImagePath = 'images/manual-one.jpg';
    writeFileEnsured(path.join(dataDir, sharedImagePath), Buffer.from('backup-image'));
    [
      { id: 101, album_name: 'First Backup Album' },
      { id: 102, album_name: 'Second Backup Album' },
    ].forEach(album => {
      db.prepare(`
        INSERT INTO albums (
          id, album_name, artists, status, image_path, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        album.id,
        album.album_name,
        JSON.stringify([{ name: 'Backup Artist' }]),
        'completed',
        sharedImagePath,
        'manual',
        '2026-04-01 12:00:00',
        '2026-04-01 12:00:00',
      );
    });

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addLocalFile(path.join(dataDir, sharedImagePath), 'images', 'manual-one.jpg');

    db.prepare('DELETE FROM albums').run();
    writeFileEnsured(path.join(dataDir, sharedImagePath), Buffer.from('current-image'));
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'completed',
      sharedImagePath,
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    const result = await backupRouter.__private.importFromZip(zip, false);
    const current = db.prepare('SELECT image_path FROM albums WHERE album_name = ?').get('Current Album');
    const imported = db.prepare(`
      SELECT album_name, image_path
      FROM albums
      WHERE album_name LIKE '%Backup Album'
      ORDER BY album_name
    `).all();
    const importedPaths = [...new Set(imported.map(row => row.image_path))];

    expect(result).toMatchObject({
      added: 2,
      skipped: 0,
      imagesCopied: 1,
      imagesRefetched: 0,
    });
    expect(current.image_path).toBe(sharedImagePath);
    expect(imported).toHaveLength(2);
    expect(importedPaths).toHaveLength(1);
    expect(importedPaths[0]).not.toBe(sharedImagePath);
    expect(importedPaths[0]).toMatch(/^images\/merge_manual-one_/);
    expect(fs.readFileSync(path.join(dataDir, sharedImagePath)).toString()).toBe('current-image');
    expect(fs.readFileSync(path.join(dataDir, importedPaths[0])).toString()).toBe('backup-image');
  }, 15000);

  it('renames backup image paths already referenced by current albums even when the file is missing', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const referencedImagePath = 'images/missing-current-art.jpg';
    writeFileEnsured(path.join(dataDir, referencedImagePath), Buffer.from('backup-image'));
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      101,
      'Referenced Art Backup Album',
      JSON.stringify([{ name: 'Backup Artist' }]),
      'completed',
      referencedImagePath,
      'manual',
      '2026-04-01 12:00:00',
      '2026-04-01 12:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addLocalFile(path.join(dataDir, referencedImagePath), 'images', 'missing-current-art.jpg');

    db.prepare('DELETE FROM albums').run();
    fs.rmSync(path.join(dataDir, referencedImagePath), { force: true });
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Current Missing Art Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'completed',
      referencedImagePath,
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    const result = await backupRouter.__private.importFromZip(zip, false);
    const current = db.prepare('SELECT image_path FROM albums WHERE album_name = ?').get('Current Missing Art Album');
    const imported = db.prepare('SELECT image_path FROM albums WHERE album_name = ?').get('Referenced Art Backup Album');

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
      imagesCopied: 1,
      imagesRefetched: 0,
    });
    expect(current.image_path).toBe(referencedImagePath);
    expect(imported.image_path).not.toBe(referencedImagePath);
    expect(imported.image_path).toMatch(/^images\/merge_missing-current-art_/);
    expect(fs.existsSync(path.join(dataDir, referencedImagePath))).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, imported.image_path)).toString()).toBe('backup-image');
  }, 15000);

  it('renames backup image paths that collide by case with current album references', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const backupImagePath = 'images/caseart.jpg';
    const currentImagePath = 'images/CaseArt.jpg';
    writeFileEnsured(path.join(dataDir, backupImagePath), Buffer.from('backup-image'));
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      101,
      'Case Collision Backup Album',
      JSON.stringify([{ name: 'Backup Artist' }]),
      'completed',
      backupImagePath,
      'manual',
      '2026-04-01 12:00:00',
      '2026-04-01 12:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);
    zip.addLocalFile(path.join(dataDir, backupImagePath), 'images', 'caseart.jpg');

    db.prepare('DELETE FROM albums').run();
    fs.rmSync(path.join(dataDir, backupImagePath), { force: true });
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Current Missing Case Art Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'completed',
      currentImagePath,
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    const result = await backupRouter.__private.importFromZip(zip, false);
    const current = db.prepare('SELECT image_path FROM albums WHERE album_name = ?').get('Current Missing Case Art Album');
    const imported = db.prepare('SELECT image_path FROM albums WHERE album_name = ?').get('Case Collision Backup Album');

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
      imagesCopied: 1,
      imagesRefetched: 0,
    });
    expect(current.image_path).toBe(currentImagePath);
    expect(imported.image_path).not.toBe(backupImagePath);
    expect(imported.image_path).toMatch(/^images\/merge_caseart_/);
    expect(fs.existsSync(path.join(dataDir, backupImagePath))).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, imported.image_path)).toString()).toBe('backup-image');
  }, 15000);

  it('clears missing backup image paths during merge when art cannot be restored', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const missingBackupImagePath = 'images/missing-backup-art.jpg';
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      101,
      'Missing Art Backup Album',
      JSON.stringify([{ name: 'Missing Artist' }]),
      'completed',
      missingBackupImagePath,
      'manual',
      '2026-04-01 12:00:00',
      '2026-04-01 12:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);

    db.prepare('DELETE FROM albums').run();
    writeFileEnsured(path.join(dataDir, missingBackupImagePath), Buffer.from('current-image'));
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'completed',
      missingBackupImagePath,
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare('SELECT image_path FROM albums WHERE album_name = ?').get('Missing Art Backup Album');

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
      imagesCopied: 0,
      imagesRefetched: 0,
    });
    expect(restored.image_path).toBeNull();
    expect(fs.readFileSync(path.join(dataDir, missingBackupImagePath)).toString()).toBe('current-image');
  }, 15000);

  it('stores refetched image paths when merging legacy backups without an image_path column', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('refetched-image'),
    });

    const zip = new AdmZip();
    addLegacyAlbumsDatabaseWithoutImagePath(zip, dataDir, [
      {
        id: 101,
        spotify_album_id: 'legacy123',
        album_name: 'Legacy Refetched Art Album',
        artists: JSON.stringify([{ name: 'Legacy Artist' }]),
        image_url_large: 'https://example.test/legacy-art.jpg',
      },
    ]);

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare(`
      SELECT album_name, image_path
      FROM albums
      WHERE album_name = ?
    `).get('Legacy Refetched Art Album');

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
      imagesCopied: 0,
      imagesRefetched: 1,
    });
    expect(restored).toEqual({
      album_name: 'Legacy Refetched Art Album',
      image_path: 'images/legacy123.jpg',
    });
    expect(fs.readFileSync(path.join(dataDir, restored.image_path)).toString()).toBe('refetched-image');
  }, 15000);

  it('reuses staged backup art when normalized merge rows share a preferred image path', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('unused-refetched-image'),
    });

    const preferredImagePath = 'images/shared-preferred.jpg';
    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        spotify_album_id: 'shared-preferred',
        album_name: 'Normalized Refetch Album',
        artists: JSON.stringify([{ name: 'Normalized Artist' }]),
        rating: 101,
        image_url_large: 'https://example.test/shared-preferred.jpg',
        source: 'spotify',
      },
      {
        id: 102,
        album_name: 'Kept Preferred Art Album',
        artists: JSON.stringify([{ name: 'Kept Artist' }]),
        rating: 88,
        image_path: preferredImagePath,
      },
    ]);
    zip.addFile(preferredImagePath, Buffer.from('preferred-zip-image'));

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare(`
      SELECT album_name, image_path
      FROM albums
      ORDER BY album_name
    `).all();

    expect(result).toMatchObject({
      added: 2,
      skipped: 0,
      imagesCopied: 1,
      imagesRefetched: 0,
    });
    expect(restored).toEqual([
      {
        album_name: 'Kept Preferred Art Album',
        image_path: preferredImagePath,
      },
      {
        album_name: 'Normalized Refetch Album',
        image_path: preferredImagePath,
      },
    ]);
    expect(fs.readFileSync(path.join(dataDir, preferredImagePath)).toString()).toBe('preferred-zip-image');
  }, 15000);

  it('uses bundled legacy managed art before refetching when merging backups without image_path', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      arrayBuffer: async () => Buffer.from(''),
    });

    const zip = new AdmZip();
    addLegacyAlbumsDatabaseWithoutImagePath(zip, dataDir, [
      {
        id: 101,
        spotify_album_id: 'legacy123',
        album_name: 'Legacy Bundled Art Album',
        artists: JSON.stringify([{ name: 'Legacy Artist' }]),
        image_url_large: 'https://example.test/legacy-art.jpg',
      },
    ]);
    zip.addFile('images/legacy123.jpg', Buffer.from('backup-image'));

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare(`
      SELECT album_name, image_path
      FROM albums
      WHERE album_name = ?
    `).get('Legacy Bundled Art Album');

    expect(result).toMatchObject({
      added: 1,
      skipped: 0,
      imagesCopied: 1,
      imagesRefetched: 0,
    });
    expect(restored).toEqual({
      album_name: 'Legacy Bundled Art Album',
      image_path: 'images/legacy123.jpg',
    });
    expect(fs.readFileSync(path.join(dataDir, restored.image_path)).toString()).toBe('backup-image');
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 15000);

  it('normalizes legacy empty Spotify IDs to null when merging distinct manual albums', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        spotify_album_id: '',
        album_name: 'First Legacy Manual Album',
        artists: JSON.stringify([{ name: 'First Legacy Artist' }]),
      },
      {
        id: 102,
        spotify_album_id: '',
        album_name: 'Second Legacy Manual Album',
        artists: JSON.stringify([{ name: 'Second Legacy Artist' }]),
      },
    ]);

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare(`
      SELECT album_name, spotify_album_id
      FROM albums
      ORDER BY album_name
    `).all();

    expect(result).toMatchObject({
      added: 2,
      skipped: 0,
    });
    expect(restored).toEqual([
      {
        album_name: 'First Legacy Manual Album',
        spotify_album_id: null,
      },
      {
        album_name: 'Second Legacy Manual Album',
        spotify_album_id: null,
      },
    ]);
  }, 15000);

  it('normalizes earlier backup duplicate keys before skipping later duplicates', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const spotifyArtists = JSON.stringify([{ name: 'Duplicate Spotify Artist' }]);
    const manualArtists = JSON.stringify([{ name: 'Duplicate Manual Artist' }]);
    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        spotify_album_id: 'duplicate-spotify-id',
        album_name: 'Ignored Spotify Duplicate',
        artists: spotifyArtists,
        rating: 101,
      },
      {
        id: 102,
        spotify_album_id: 'duplicate-spotify-id',
        album_name: 'Kept Spotify Duplicate',
        artists: spotifyArtists,
        rating: 82,
      },
      {
        id: 103,
        spotify_album_id: '',
        album_name: 'Legacy Manual Duplicate',
        artists: manualArtists,
        rating: 101,
      },
      {
        id: 104,
        spotify_album_id: '',
        album_name: 'Legacy Manual Duplicate',
        artists: manualArtists,
        rating: 77,
      },
    ]);

    const result = await backupRouter.__private.importFromZip(zip, false);
    const restored = db.prepare(`
      SELECT spotify_album_id, album_name, rating
      FROM albums
      ORDER BY album_name
    `).all();

    expect(result).toMatchObject({
      added: 2,
      skipped: 2,
    });
    expect(restored).toEqual([
      {
        spotify_album_id: 'duplicate-spotify-id',
        album_name: 'Ignored Spotify Duplicate',
        rating: null,
      },
      {
        spotify_album_id: null,
        album_name: 'Legacy Manual Duplicate',
        rating: null,
      },
    ]);
  }, 15000);

  it('treats current albums with empty Spotify IDs as manual duplicates during merge', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const artists = JSON.stringify([{ name: 'Duplicate Legacy Artist' }]);
    db.prepare(`
      INSERT INTO albums (
        id, spotify_album_id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      '',
      'Duplicate Legacy Manual Album',
      artists,
      'completed',
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        spotify_album_id: '',
        album_name: 'Duplicate Legacy Manual Album',
        artists,
      },
    ]);

    const result = await backupRouter.__private.importFromZip(zip, false);
    const rows = db.prepare(`
      SELECT album_name, spotify_album_id
      FROM albums
      WHERE album_name = ?
    `).all('Duplicate Legacy Manual Album');

    expect(result).toMatchObject({
      added: 0,
      skipped: 1,
    });
    expect(rows).toEqual([
      {
        album_name: 'Duplicate Legacy Manual Album',
        spotify_album_id: '',
      },
    ]);
  }, 15000);

  it('uses normalized manual duplicate fields before inserting merge rows', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Normalized Manual Duplicate',
      '[]',
      'completed',
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    const zip = new AdmZip();
    addLegacyAlbumsDatabase(zip, dataDir, [
      {
        id: 101,
        spotify_album_id: '',
        album_name: 'Normalized Manual Duplicate',
        artists: '',
      },
    ]);

    const result = await backupRouter.__private.importFromZip(zip, false);
    const rows = db.prepare(`
      SELECT album_name, artists
      FROM albums
      WHERE album_name = ?
    `).all('Normalized Manual Duplicate');

    expect(result).toMatchObject({
      added: 0,
      skipped: 1,
    });
    expect(rows).toEqual([
      {
        album_name: 'Normalized Manual Duplicate',
        artists: '[]',
      },
    ]);
  }, 15000);

  it('allocates unique temp database paths for backup merges', () => {
    const { backupRouter, dataDir } = loadBackupTestContext();

    const firstPath = backupRouter.__private.createMergeTempPath();
    const secondPath = backupRouter.__private.createMergeTempPath();

    expect(firstPath).not.toBe(secondPath);
    expect(path.dirname(firstPath)).toBe(dataDir);
    expect(path.dirname(secondPath)).toBe(dataDir);
    expect(path.basename(firstPath)).toMatch(/^_import_tmp_/);
    expect(path.basename(secondPath)).toMatch(/^_import_tmp_/);
  });

  it('allocates independent staging directories for backup downloads', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    let first = null;
    let second = null;

    try {
      first = await backupRouter.__private.createBackupDownloadStaging();
      second = await backupRouter.__private.createBackupDownloadStaging();

      expect(first.stagingDir).not.toBe(second.stagingDir);
      expect(first.dbPath).not.toBe(second.dbPath);
      expect(path.dirname(first.stagingDir)).toBe(dataDir);
      expect(path.dirname(second.stagingDir)).toBe(dataDir);
      expect(path.basename(first.stagingDir)).toMatch(/^_backup_download_/);
      expect(path.basename(second.stagingDir)).toMatch(/^_backup_download_/);
      expect(fs.existsSync(first.dbPath)).toBe(true);
      expect(fs.existsSync(second.dbPath)).toBe(true);
    } finally {
      if (first) fs.rmSync(first.stagingDir, { recursive: true, force: true });
      if (second) fs.rmSync(second.stagingDir, { recursive: true, force: true });
    }

    expect(fs.existsSync(first.stagingDir)).toBe(false);
    expect(fs.existsSync(second.stagingDir)).toBe(false);
  });

  it('snapshots backup download files into staging before archiving', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    writeFileEnsured(path.join(dataDir, 'images', 'staged-art.jpg'), 'staged-art');
    writeFileEnsured(path.join(dataDir, 'preferences.json'), '{"wrappedName":"Staged"}\n');

    const staging = await backupRouter.__private.createBackupDownloadStaging({
      includeAllImages: true,
      includeAppState: true,
    });

    try {
      fs.rmSync(path.join(dataDir, 'images', 'staged-art.jpg'), { force: true });
      fs.rmSync(path.join(dataDir, 'preferences.json'), { force: true });

      expect(fs.readFileSync(path.join(staging.stagingDir, 'images', 'staged-art.jpg'), 'utf8'))
        .toBe('staged-art');
      expect(fs.readFileSync(path.join(staging.stagingDir, 'preferences.json'), 'utf8'))
        .toBe('{"wrappedName":"Staged"}\n');
    } finally {
      fs.rmSync(staging.stagingDir, { recursive: true, force: true });
    }
  });

  it('blocks backup download staging while an app mutation is active', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);
    const { beginAppMutation } = require('../server/backup-mutation-lock.js');
    const endMutation = beginAppMutation();

    try {
      await expect(backupRouter.__private.stageBackupDownload('download'))
        .rejects.toThrow(/app update is already in progress/i);
    } finally {
      endMutation();
    }

    expect(fs.readdirSync(dataDir).filter(fileName => fileName.startsWith('_backup_download_'))).toEqual([]);
  });

  it('sanitizes unsafe album image paths before replacing the database on restore', async () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    writeFileEnsured(path.join(dataDir, 'preferences.json'), 'keep-me');

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      101,
      'Unsafe Restore Album',
      JSON.stringify([{ name: 'Careful Artist' }]),
      'completed',
      'images/../preferences.json',
      'manual',
      '2026-04-01 12:00:00',
      '2026-04-01 12:00:00',
    );

    const zip = new AdmZip();
    await addDatabaseSnapshot(zip, db, dataDir);

    db.prepare('DELETE FROM albums').run();
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, image_path, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      202,
      'Current Album',
      JSON.stringify([{ name: 'Current Artist' }]),
      'completed',
      null,
      'manual',
      '2026-04-02 12:00:00',
      '2026-04-02 12:00:00',
    );

    const result = await backupRouter.__private.restoreFromZip(zip);
    const restored = db.prepare('SELECT id, album_name, image_path FROM albums').get();

    expect(result).toMatchObject({
      added: 1,
      sanitizedImagePaths: 1,
    });
    expect(restored).toEqual({
      id: 101,
      album_name: 'Unsafe Restore Album',
      image_path: null,
    });
    expect(fs.readFileSync(path.join(dataDir, 'preferences.json'), 'utf8')).toBe('keep-me');
  }, 15000);

  it('skips unsafe stored image paths when selecting essential backup images', () => {
    const { dbModule, backupRouter, dataDir } = loadBackupTestContext();
    openDbs.push(dbModule.db);

    writeFileEnsured(path.join(dataDir, 'images', 'manual.jpg'), 'image');

    expect(backupRouter.__private.resolveBackupAlbumImageForArchive('images/../preferences.json')).toBeNull();
    expect(backupRouter.__private.resolveBackupAlbumImageForArchive('images/manual.jpg')).toMatchObject({
      imagePath: 'images/manual.jpg',
      fullPath: path.join(dataDir, 'images', 'manual.jpg'),
    });
  });

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
