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
