import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTempDataDir,
  removeTempDir,
  requestBuffer,
  requestJson,
  resetServerModules,
  startTestServer,
} from './helpers/server.js';

const serverModulePaths = [
  'server/app.js',
  'server/routes/backup.js',
  'server/routes/albums.js',
  'server/routes/imports.js',
  'server/routes/backgrounds.js',
  'server/routes/opacity-presets.js',
  'server/routes/themes.js',
  'server/routes/preferences.js',
  'server/routes/welcome-tour.js',
  'server/import-jobs.js',
  'server/import-service.js',
  'server/preferences-store.js',
  'server/personalization-store.js',
  'server/background-library.js',
  'server/welcome-tour-store.js',
  'server/db.js',
];

let dataDir;
let dbModule;
let testServer;

function loadBackupDownloadContext() {
  dataDir = createTempDataDir('trackspot-backup-download-');
  resetServerModules(serverModulePaths);
  dbModule = require('../server/db.js');
  const { createApp } = require('../server/app.js');
  return { app: createApp(), db: dbModule.db };
}

function writeDataFile(relativePath, contents = 'file') {
  const filePath = path.join(dataDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function insertAlbum(db, overrides = {}) {
  db.prepare(`
    INSERT INTO albums (
      id, spotify_album_id, album_name, artists, status, notes, image_path, source,
      created_at, updated_at
    ) VALUES (
      :id, :spotify_album_id, :album_name, :artists, :status, :notes, :image_path, :source,
      :created_at, :updated_at
    )
  `).run({
    id: overrides.id,
    spotify_album_id: overrides.spotify_album_id ?? null,
    album_name: overrides.album_name ?? 'Backup Album',
    artists: JSON.stringify(overrides.artists ?? [{ name: 'Backup Artist' }]),
    status: overrides.status ?? 'completed',
    notes: overrides.notes ?? null,
    image_path: overrides.image_path ?? null,
    source: overrides.source ?? 'manual',
    created_at: overrides.created_at ?? '2026-04-01 00:00:00',
    updated_at: overrides.updated_at ?? '2026-04-01 00:00:00',
  });
}

function readZipEntryMap(buffer) {
  const endSignature = 0x06054b50;
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset === -1) throw new Error('ZIP end-of-central-directory record was not found.');

  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map();
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`ZIP central directory entry ${index} was invalid.`);
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const entryName = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString('utf8').replace(/\\/g, '/');

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    const data = method === 0
      ? compressed
      : zlib.inflateRawSync(compressed);
    entries.set(entryName, data);

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function zipEntries(buffer) {
  return [...readZipEntryMap(buffer).keys()].sort();
}

function readManifest(buffer) {
  const entry = readZipEntryMap(buffer).get('trackspot-backup.json');
  if (!entry) throw new Error('Missing backup manifest.');
  return JSON.parse(entry.toString('utf8'));
}

afterEach(async () => {
  await testServer?.close();
  testServer = null;
  dbModule?.db?.close();
  dbModule = null;
  delete process.env.DATA_DIR;
  resetServerModules(serverModulePaths);
  removeTempDir(dataDir);
  dataDir = null;
});

describe('backup creation endpoints', () => {
  it('creates full, essential, and database backups with the expected artifact boundaries', async () => {
    const { app, db } = loadBackupDownloadContext();
    insertAlbum(db, {
      id: 1,
      album_name: 'Manual Backup Album',
      image_path: 'images/manual-one.jpg',
      source: 'manual',
    });
    insertAlbum(db, {
      id: 2,
      spotify_album_id: 'SPOTIFYALBUM1234567890',
      album_name: 'Spotify Backup Album',
      image_path: 'images/spotify-one.jpg',
      source: 'spotify',
    });
    writeDataFile('images/manual-one.jpg', 'manual-art');
    writeDataFile('images/spotify-one.jpg', 'spotify-art');
    writeDataFile('preferences.json', '{"contentWidthPx":1600}\n');
    writeDataFile('themes/user-theme.json', '{"id":"user-theme"}\n');
    testServer = await startTestServer(app);

    const full = await requestBuffer(testServer.baseUrl, '/api/backup/download');
    const essential = await requestBuffer(testServer.baseUrl, '/api/backup/download-essential');
    const database = await requestBuffer(testServer.baseUrl, '/api/backup/download-db');

    expect(full.status).toBe(200);
    expect(readManifest(full.buffer)).toMatchObject({
      kind: 'full',
      includesAppState: true,
      appStatePaths: expect.arrayContaining(['preferences.json', 'themes']),
    });
    expect(zipEntries(full.buffer)).toEqual(expect.arrayContaining([
      'trackspot-backup.json',
      'albums.csv',
      'albums.db',
      'images/manual-one.jpg',
      'images/spotify-one.jpg',
      'preferences.json',
      'themes/user-theme.json',
    ]));

    expect(essential.status).toBe(200);
    expect(readManifest(essential.buffer)).toMatchObject({
      kind: 'essential',
      includesAppState: false,
      appStatePaths: [],
    });
    expect(zipEntries(essential.buffer)).toEqual(expect.arrayContaining([
      'trackspot-backup.json',
      'albums.csv',
      'albums.db',
      'images/manual-one.jpg',
    ]));
    expect(zipEntries(essential.buffer)).not.toContain('images/spotify-one.jpg');
    expect(zipEntries(essential.buffer)).not.toContain('preferences.json');
    expect(zipEntries(essential.buffer)).not.toContain('themes/user-theme.json');

    expect(database.status).toBe(200);
    expect(readManifest(database.buffer)).toMatchObject({
      kind: 'database',
      includesAppState: false,
      appStatePaths: [],
    });
    expect(zipEntries(database.buffer)).toEqual(expect.arrayContaining([
      'trackspot-backup.json',
      'albums.csv',
      'albums.db',
    ]));
    expect(zipEntries(database.buffer).some(entry => entry.startsWith('images/'))).toBe(false);
    expect(fs.readdirSync(dataDir).filter(fileName => fileName.startsWith('_backup_download_'))).toEqual([]);
  });

  it('returns 404 for empty CSV exports and preserves BOM plus quoted CSV cells', async () => {
    const { app, db } = loadBackupDownloadContext();
    testServer = await startTestServer(app);

    const empty = await requestJson(testServer.baseUrl, '/api/backup/export-csv');

    expect(empty.status).toBe(404);
    expect(empty.body).toEqual({ error: 'No albums to export!' });

    insertAlbum(db, {
      id: 1,
      album_name: 'CSV Album',
      notes: 'comma, "quote"\nnext line',
      source: 'manual',
    });

    const exported = await requestBuffer(testServer.baseUrl, '/api/backup/export-csv');
    const csv = exported.buffer.toString('utf8');

    expect(exported.status).toBe(200);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain('"comma, ""quote""\nnext line"');
  });
});
