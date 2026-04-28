import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const originalFetch = globalThis.fetch;
const serverModulePaths = [
  '../server/routes/albums.js',
  '../server/import-service.js',
  '../server/album-helpers.js',
  '../server/spotify-helpers.js',
  '../server/spotify-note-links.js',
  '../server/db.js',
];

const tempDirs = [];
const openDbs = [];

function resetServerModules() {
  for (const modulePath of serverModulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function loadAlbumsRouteTestContext() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-albums-route-test-'));
  tempDirs.push(dataDir);
  process.env.DATA_DIR = dataDir;
  resetServerModules();

  const dbModule = require('../server/db.js');
  const albumsRouter = require('../server/routes/albums.js');

  return {
    dbModule,
    albumsRouter,
  };
}

function getRouteHandler(router, method, routePath) {
  const layer = router.stack.find(entry =>
    entry.route?.path === routePath && entry.route.methods?.[method]
  );
  return layer?.route?.stack?.[0]?.handle ?? null;
}

function getRouteHandlers(router, method, routePath) {
  const layer = router.stack.find(entry =>
    entry.route?.path === routePath && entry.route.methods?.[method]
  );
  return layer?.route?.stack?.map(entry => entry.handle) ?? [];
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    jsonBody: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      this.body = payload;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      this.body = '';
      return this;
    },
  };
}

function imageFullPath(dbModule, imagePath) {
  return path.join(dbModule.IMAGES_DIR, path.basename(imagePath));
}

function writeImage(dbModule, imagePath, contents = 'image') {
  const fullPath = imageFullPath(dbModule, imagePath);
  fs.writeFileSync(fullPath, contents);
  return fullPath;
}

function makeImportPayload(overrides = {}) {
  return {
    spotifyUrl: 'https://open.spotify.com/album/ABCDEFGHIJKLMNOPQRSTUV',
    spotifyId: 'ABCDEFGHIJKLMNOPQRSTUV',
    data: {
      albumUnion: {
        name: 'Imported Album',
        type: 'ALBUM',
        artists: {
          items: [{
            id: 'artist-1',
            profile: { name: 'Imported Artist' },
            sharingInfo: { shareUrl: 'https://open.spotify.com/artist/artist-1' },
            visuals: { avatarImage: { sources: [] } },
          }],
        },
        date: { isoString: '2026-04-15' },
        genres: { items: [] },
        tracksV2: { totalCount: 0, items: [] },
        copyright: { items: [] },
        coverArt: { sources: [] },
      },
    },
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;

  while (openDbs.length) {
    openDbs.pop()?.close();
  }

  delete process.env.DATA_DIR;
  resetServerModules();

  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('albums route helpers', () => {
  it('returns the uploaded manual image path from the albums upload endpoint', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    openDbs.push(dbModule.db);

    const handlers = getRouteHandlers(albumsRouter, 'post', '/upload-image');
    const uploadHandler = handlers.at(-1);
    expect(uploadHandler).toBeTypeOf('function');

    const res = createResponse();
    uploadHandler({ file: { filename: 'manual_test.jpg' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ image_path: 'images/manual_test.jpg' });
  });

  it('rejects manual image uploads when no file was received', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    openDbs.push(dbModule.db);

    const uploadHandler = getRouteHandlers(albumsRouter, 'post', '/upload-image').at(-1);
    const res = createResponse();
    uploadHandler({ file: null }, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'No image file received.' });
  });

  it('commits refetched art through the replacement endpoint and removes old art', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const oldPath = 'images/old-art.jpg';
    const oldFullPath = writeImage(dbModule, oldPath, Buffer.from([1, 2, 3]));

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, image_path, image_url_large
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Refetchable Album',
      JSON.stringify([{ name: 'Art Worker' }]),
      'completed',
      'spotify',
      oldPath,
      'https://cdn.example.test/new-art.jpg',
    );

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
    }));

    const refetchHandler = getRouteHandler(albumsRouter, 'post', '/:id/refetch-art');
    const refetchRes = createResponse();
    await refetchHandler({ params: { id: '1' } }, refetchRes);

    expect(refetchRes.statusCode).toBe(200);
    expect(refetchRes.jsonBody).toMatchObject({ identical: false });
    expect(refetchRes.jsonBody.new_image_path).toMatch(/^images\/_temp_1_\d+\.jpg$/);

    const tempPath = refetchRes.jsonBody.new_image_path;
    const tempFullPath = imageFullPath(dbModule, tempPath);
    expect(fs.existsSync(tempFullPath)).toBe(true);

    const replaceHandler = getRouteHandler(albumsRouter, 'post', '/:id/replace-refetched-art');
    const replaceRes = createResponse();
    replaceHandler({ params: { id: '1' }, body: { image_path: tempPath } }, replaceRes);

    expect(replaceRes.statusCode).toBe(200);
    expect(replaceRes.jsonBody.image_path).toMatch(/^images\/refetch_1_\d+_[a-z0-9]+\.jpg$/);
    expect(fs.existsSync(oldFullPath)).toBe(false);
    expect(fs.existsSync(tempFullPath)).toBe(false);
    expect(fs.existsSync(imageFullPath(dbModule, replaceRes.jsonBody.image_path))).toBe(true);

    const stored = db.prepare('SELECT image_path FROM albums WHERE id = ?').get(1);
    expect(stored.image_path).toBe(replaceRes.jsonBody.image_path);
  });

  it('rejects refetched temp art that belongs to a different album', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const oldPath = 'images/current-art.jpg';
    const tempPath = 'images/_temp_2_12345.jpg';
    const oldFullPath = writeImage(dbModule, oldPath, 'old');
    const tempFullPath = writeImage(dbModule, tempPath, 'temp');

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, image_path
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Wrong Temp Album',
      JSON.stringify([{ name: 'Art Worker' }]),
      'completed',
      'spotify',
      oldPath,
    );

    const handler = getRouteHandler(albumsRouter, 'post', '/:id/replace-refetched-art');
    const res = createResponse();
    handler({ params: { id: '1' }, body: { image_path: tempPath } }, res);

    expect(res.statusCode).toBe(400);
    expect(fs.existsSync(oldFullPath)).toBe(true);
    expect(fs.existsSync(tempFullPath)).toBe(true);
    expect(db.prepare('SELECT image_path FROM albums WHERE id = ?').get(1).image_path).toBe(oldPath);
  });

  it('deletes unreferenced old manual art when image_path changes through PATCH', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const oldPath = 'images/manual-old.jpg';
    const newPath = 'images/manual-new.jpg';
    const oldFullPath = writeImage(dbModule, oldPath, 'old');
    const newFullPath = writeImage(dbModule, newPath, 'new');

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, image_path
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Manual Album',
      JSON.stringify([{ name: 'Manual Artist' }]),
      'completed',
      'manual',
      oldPath,
    );

    const handler = getRouteHandler(albumsRouter, 'patch', '/:id');
    const res = createResponse();
    await handler({ params: { id: '1' }, body: { image_path: newPath } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.image_path).toBe(newPath);
    expect(fs.existsSync(oldFullPath)).toBe(false);
    expect(fs.existsSync(newFullPath)).toBe(true);
    expect(db.prepare('SELECT image_path FROM albums WHERE id = ?').get(1).image_path).toBe(newPath);
  });

  it('keeps old manual art when another album still references it', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const sharedPath = 'images/shared-manual.jpg';
    const newPath = 'images/manual-replacement.jpg';
    const sharedFullPath = writeImage(dbModule, sharedPath, 'shared');
    writeImage(dbModule, newPath, 'new');

    [
      { id: 1, name: 'First Album' },
      { id: 2, name: 'Second Album' },
    ].forEach(album => {
      db.prepare(`
        INSERT INTO albums (
          id, album_name, artists, status, source, image_path
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        album.id,
        album.name,
        JSON.stringify([{ name: 'Shared Artist' }]),
        'completed',
        'manual',
        sharedPath,
      );
    });

    const handler = getRouteHandler(albumsRouter, 'patch', '/:id');
    const res = createResponse();
    await handler({ params: { id: '1' }, body: { image_path: newPath } }, res);

    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(sharedFullPath)).toBe(true);
    expect(db.prepare('SELECT image_path FROM albums WHERE id = ?').get(2).image_path).toBe(sharedPath);
  });

  it('rejects unsafe image_path changes without deleting current art', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const oldPath = 'images/safe-current.jpg';
    const oldFullPath = writeImage(dbModule, oldPath, 'old');

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, image_path
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Unsafe Path Album',
      JSON.stringify([{ name: 'Careful Artist' }]),
      'completed',
      'manual',
      oldPath,
    );

    const handler = getRouteHandler(albumsRouter, 'patch', '/:id');
    const res = createResponse();
    await handler({ params: { id: '1' }, body: { image_path: 'images/../preferences.json' } }, res);

    expect(res.statusCode).toBe(400);
    expect(fs.existsSync(oldFullPath)).toBe(true);
    expect(db.prepare('SELECT image_path FROM albums WHERE id = ?').get(1).image_path).toBe(oldPath);
  });

  it('does not delete outside files when clearing crafted album art rows', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const preferencesPath = path.join(dbModule.DATA_DIR, 'preferences.json');
    fs.writeFileSync(preferencesPath, 'keep-me');

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, image_path
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Crafted Art Album',
      JSON.stringify([{ name: 'Careful Artist' }]),
      'completed',
      'manual',
      'images/../preferences.json',
    );

    const handler = getRouteHandler(albumsRouter, 'post', '/:id/delete-art');
    const res = createResponse();
    handler({ params: { id: '1' } }, res);

    expect(res.statusCode).toBe(200);
    expect(fs.readFileSync(preferencesPath, 'utf8')).toBe('keep-me');
    expect(db.prepare('SELECT image_path FROM albums WHERE id = ?').get(1).image_path).toBeNull();
  });

  it('does not delete outside files when deleting crafted album rows', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const preferencesPath = path.join(dbModule.DATA_DIR, 'preferences.json');
    fs.writeFileSync(preferencesPath, 'keep-me');

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, image_path
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Crafted Delete Album',
      JSON.stringify([{ name: 'Careful Artist' }]),
      'completed',
      'manual',
      'images/../preferences.json',
    );

    const handler = getRouteHandler(albumsRouter, 'delete', '/:id');
    const res = createResponse();
    handler({ params: { id: '1' } }, res);

    expect(res.statusCode).toBe(200);
    expect(fs.readFileSync(preferencesPath, 'utf8')).toBe('keep-me');
    expect(db.prepare('SELECT COUNT(*) AS count FROM albums').get().count).toBe(0);
  });

  it('does not delete outside files when wiping crafted album rows', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const preferencesPath = path.join(dbModule.DATA_DIR, 'preferences.json');
    fs.writeFileSync(preferencesPath, 'keep-me');

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, image_path
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Crafted Wipe Album',
      JSON.stringify([{ name: 'Careful Artist' }]),
      'completed',
      'manual',
      'images/../preferences.json',
    );

    const handler = getRouteHandler(albumsRouter, 'delete', '/wipe');
    const res = createResponse();
    handler({}, res);

    expect(res.statusCode).toBe(200);
    expect(fs.readFileSync(preferencesPath, 'utf8')).toBe('keep-me');
    expect(db.prepare('SELECT COUNT(*) AS count FROM albums').get().count).toBe(0);
  });

  it('rejects unsafe temp-art discard paths without deleting outside files', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    openDbs.push(dbModule.db);

    const preferencesPath = path.join(dbModule.DATA_DIR, 'preferences.json');
    fs.writeFileSync(preferencesPath, 'keep-me');

    const handler = getRouteHandler(albumsRouter, 'post', '/discard-temp-art');
    const res = createResponse();
    handler({ body: { path: 'images/../preferences.json' } }, res);

    expect(res.statusCode).toBe(400);
    expect(fs.readFileSync(preferencesPath, 'utf8')).toBe('keep-me');
  });

  it('does not copy random art from crafted donor image paths', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const preferencesPath = path.join(dbModule.DATA_DIR, 'preferences.json');
    fs.writeFileSync(preferencesPath, 'keep-me');

    [
      { id: 1, name: 'Target Album', imagePath: null },
      { id: 2, name: 'Crafted Donor Album', imagePath: 'images/../preferences.json' },
    ].forEach(album => {
      db.prepare(`
        INSERT INTO albums (
          id, album_name, artists, status, source, image_path
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        album.id,
        album.name,
        JSON.stringify([{ name: 'Careful Artist' }]),
        'completed',
        'manual',
        album.imagePath,
      );
    });

    const handler = getRouteHandler(albumsRouter, 'post', '/:id/random-art');
    const res = createResponse();
    handler({ params: { id: '1' } }, res);

    expect(res.statusCode).toBe(400);
    expect(fs.readFileSync(preferencesPath, 'utf8')).toBe('keep-me');
    expect(db.prepare('SELECT image_path FROM albums WHERE id = ?').get(1).image_path).toBeNull();
  });

  it('searches artist names without matching unrelated artist JSON metadata', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Death Note Original Soundtrack',
      JSON.stringify([{
        name: 'Yoshihisa Hirano',
        share_url: 'https://www.example.com/artist/yoshihisa-hirano',
        avatar_url: 'https://cdn.example.com/avatar.jpg',
      }]),
      'completed',
      'spotify',
      '2026-04-15 10:00:00',
      '2026-04-15 10:00:00',
    );

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      2,
      'WW Collection',
      JSON.stringify([{
        name: 'Actually Matching Artist',
        share_url: 'https://open.spotify.com/artist/artist-2',
        avatar_url: 'https://cdn.example.com/avatar-2.jpg',
      }]),
      'completed',
      'spotify',
      '2026-04-15 10:05:00',
      '2026-04-15 10:05:00',
    );

    const handler = getRouteHandler(albumsRouter, 'get', '/');
    const res = createResponse();

    handler({ query: { search: 'ww' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.albums.map(album => album.id)).toEqual([2]);
  });

  it('returns a compact Spotify album index with a deterministic revision and ETag', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, spotify_album_id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      11,
      'AAAAABBBBBCCCCCDDDDD1',
      'Planned Album',
      JSON.stringify([{ name: 'Artist One' }]),
      'planned',
      'spotify',
      '2026-04-15 10:00:00',
      '2026-04-15 11:00:00',
    );
    db.prepare(`
      INSERT INTO albums (
        id, spotify_album_id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      22,
      'AAAAABBBBBCCCCCDDDDD2',
      'Completed Album',
      JSON.stringify([{ name: 'Artist Two' }]),
      'completed',
      'spotify',
      '2026-04-15 10:05:00',
      '2026-04-15 12:30:00',
    );
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      99,
      'Manual Album',
      JSON.stringify([{ name: 'Manual Artist' }]),
      'completed',
      'manual',
      '2026-04-15 10:10:00',
      '2026-04-15 12:45:00',
    );

    const handler = getRouteHandler(albumsRouter, 'get', '/index');
    const req = { headers: {} };
    const res = createResponse();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBe('"2:2026-04-15T12:30:00"');
    expect(res.jsonBody).toEqual({
      revision: '2:2026-04-15T12:30:00',
      albums: {
        AAAAABBBBBCCCCCDDDDD1: { id: 11, status: 'planned' },
        AAAAABBBBBCCCCCDDDDD2: { id: 22, status: 'completed' },
      },
    });

    const cachedReq = { headers: { 'if-none-match': '"2:2026-04-15T12:30:00"' } };
    const cachedRes = createResponse();
    handler(cachedReq, cachedRes);

    expect(cachedRes.statusCode).toBe(304);
    expect(cachedRes.headers.etag).toBe('"2:2026-04-15T12:30:00"');
    expect(cachedRes.jsonBody).toBeUndefined();
  });

  it('applies import overrides including planned_at and preserves duplicate existing_id responses', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const handler = getRouteHandler(albumsRouter, 'post', '/import');
    const req = {
      body: makeImportPayload({
        status: 'planned',
        repeats: 4,
        rating: 88,
        notes: 'from spicetify',
        planned_at: '2026-04-10',
        listened_at: '2026-04-14',
      }),
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toMatchObject({
      spotify_album_id: 'ABCDEFGHIJKLMNOPQRSTUV',
      status: 'planned',
      repeats: 4,
      rating: 88,
      notes: 'from spicetify',
      planned_at: '2026-04-10',
      listened_at: '2026-04-14',
    });

    const storedAlbum = db.prepare(`
      SELECT spotify_album_id, status, repeats, rating, notes, planned_at, listened_at
      FROM albums
      WHERE spotify_album_id = ?
    `).get('ABCDEFGHIJKLMNOPQRSTUV');

    expect(storedAlbum).toEqual({
      spotify_album_id: 'ABCDEFGHIJKLMNOPQRSTUV',
      status: 'planned',
      repeats: 4,
      rating: 88,
      notes: 'from spicetify',
      planned_at: '2026-04-10',
      listened_at: '2026-04-14',
    });

    const duplicateReq = { body: makeImportPayload() };
    const duplicateRes = createResponse();
    await handler(duplicateReq, duplicateRes);

    expect(duplicateRes.statusCode).toBe(409);
    expect(duplicateRes.jsonBody.existing_id).toBe(res.jsonBody.id);
  });

  it('stores full duration_ms for long albums when the GraphQL payload includes all track pages', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const handler = getRouteHandler(albumsRouter, 'post', '/import');
    const req = {
      body: makeImportPayload({
        spotifyId: 'LONGALBUMABCDEFGHIJKLMNOP',
        spotifyUrl: 'https://open.spotify.com/album/LONGALBUMABCDEFGHIJKLMNOP',
        data: {
          albumUnion: {
            name: 'Long Album',
            type: 'ALBUM',
            artists: {
              items: [{
                id: 'artist-1',
                profile: { name: 'Imported Artist' },
                sharingInfo: { shareUrl: 'https://open.spotify.com/artist/artist-1' },
                visuals: { avatarImage: { sources: [] } },
              }],
            },
            date: { isoString: '2026-04-15' },
            genres: { items: [] },
            tracksV2: {
              totalCount: 75,
              items: Array.from({ length: 75 }, (_value, index) => ({
                track: { duration: { totalMilliseconds: 1000 + index } },
              })),
            },
            copyright: { items: [] },
            coverArt: { sources: [] },
          },
        },
      }),
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody.track_count).toBe(75);
    expect(res.jsonBody.duration_ms).toBe(
      Array.from({ length: 75 }, (_value, index) => 1000 + index).reduce((sum, value) => sum + value, 0)
    );

    const storedAlbum = db.prepare(`
      SELECT spotify_album_id, track_count, duration_ms
      FROM albums
      WHERE spotify_album_id = ?
    `).get('LONGALBUMABCDEFGHIJKLMNOP');

    expect(storedAlbum).toEqual({
      spotify_album_id: 'LONGALBUMABCDEFGHIJKLMNOP',
      track_count: 75,
      duration_ms: Array.from({ length: 75 }, (_value, index) => 1000 + index).reduce((sum, value) => sum + value, 0),
    });
  });

  it('stores compact first-track metadata from GraphQL imports', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const handler = getRouteHandler(albumsRouter, 'post', '/import');
    const req = {
      body: makeImportPayload({
        spotifyId: 'FIRSTTRACKALBUM1234567',
        spotifyUrl: 'https://open.spotify.com/album/FIRSTTRACKALBUM1234567',
        data: {
          albumUnion: {
            name: 'First Track Album',
            type: 'ALBUM',
            artists: {
              items: [{
                id: 'artist-1',
                profile: { name: 'Imported Artist' },
                sharingInfo: { shareUrl: 'https://open.spotify.com/artist/artist-1' },
                visuals: { avatarImage: { sources: [] } },
              }],
            },
            date: { isoString: '2026-04-15' },
            genres: { items: [] },
            tracksV2: {
              totalCount: 2,
              items: [
                { track: { name: 'A Good Start', uri: 'spotify:track:firstTrack123', duration: { totalMilliseconds: 1000 } } },
                { track: { name: 'Second Track', uri: 'spotify:track:secondTrack456', duration: { totalMilliseconds: 2000 } } },
              ],
            },
            copyright: { items: [] },
            coverArt: { sources: [] },
          },
        },
      }),
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody.spotify_first_track).toEqual({
      id: 'firstTrack123',
      name: 'A Good Start',
      uri: 'spotify:track:firstTrack123',
      share_url: 'https://open.spotify.com/track/firstTrack123',
    });

    const storedAlbum = db.prepare(`
      SELECT spotify_first_track
      FROM albums
      WHERE spotify_album_id = ?
    `).get('FIRSTTRACKALBUM1234567');

    expect(JSON.parse(storedAlbum.spotify_first_track)).toEqual(res.jsonBody.spotify_first_track);
  });

  it('normalizes Spotify note links during import saves', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ title: 'Imported Track' }),
    }));

    const handler = getRouteHandler(albumsRouter, 'post', '/import');
    const req = {
      body: makeImportPayload({
        spotifyId: 'IMPORTEDTRACKALBUM12345',
        spotifyUrl: 'https://open.spotify.com/album/IMPORTEDTRACKALBUM12345',
        notes: 'Keep [artist text](https://open.spotify.com/artist/0Ve5w7gefOsFmwW6aU3eSW?si=abc) and raw https://open.spotify.com/track/308uvg4mGNDn8GawwuaktM?si=xyz',
      }),
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody.notes).toBe('Keep [artist text](spotify:artist:0Ve5w7gefOsFmwW6aU3eSW) and raw [Imported Track](spotify:track:308uvg4mGNDn8GawwuaktM)');

    const storedAlbum = db.prepare(`
      SELECT notes
      FROM albums
      WHERE spotify_album_id = ?
    `).get('IMPORTEDTRACKALBUM12345');

    expect(storedAlbum).toEqual({
      notes: 'Keep [artist text](spotify:artist:0Ve5w7gefOsFmwW6aU3eSW) and raw [Imported Track](spotify:track:308uvg4mGNDn8GawwuaktM)',
    });
  });

  it('sorts by planned date and listened/planned fallback with created_at as a tiebreaker', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, planned_at, listened_at, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Planned First',
      JSON.stringify([{ name: 'Artist One' }]),
      'planned',
      '2026-04-01',
      null,
      'manual',
      '2026-04-15 08:00:00',
      '2026-04-15 08:00:00',
    );
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, planned_at, listened_at, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      2,
      'Completed Earlier',
      JSON.stringify([{ name: 'Artist Two' }]),
      'completed',
      '2026-04-03',
      '2026-04-05',
      'manual',
      '2026-04-15 07:00:00',
      '2026-04-15 07:00:00',
    );
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, planned_at, listened_at, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      3,
      'Completed Later',
      JSON.stringify([{ name: 'Artist Three' }]),
      'completed',
      null,
      '2026-04-05',
      'manual',
      '2026-04-15 09:00:00',
      '2026-04-15 09:00:00',
    );

    const handler = getRouteHandler(albumsRouter, 'get', '/');

    const plannedSortRes = createResponse();
    handler({ query: { sort: 'date_planned', order: 'asc' } }, plannedSortRes);
    expect(plannedSortRes.statusCode).toBe(200);
    expect(plannedSortRes.jsonBody.albums.map(album => album.id)).toEqual([1, 2, 3]);
    expect(plannedSortRes.jsonBody.meta.filteredCount).toBe(3);
    expect(plannedSortRes.jsonBody.meta.totalCount).toBe(3);

    const combinedSortRes = createResponse();
    handler({ query: { sort: 'date_listened_planned', order: 'desc' } }, combinedSortRes);
    expect(combinedSortRes.statusCode).toBe(200);
    expect(combinedSortRes.jsonBody.albums.map(album => album.id)).toEqual([3, 2, 1]);
  });

  it('sorts by track count with duration and album-name tiebreakers', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, track_count, duration_ms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Five Tracks',
      JSON.stringify([{ name: 'Artist One' }]),
      'completed',
      'manual',
      5,
      180000,
      '2026-04-15 08:00:00',
      '2026-04-15 08:00:00',
    );
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, track_count, duration_ms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      2,
      'Ten Tracks Earlier',
      JSON.stringify([{ name: 'Artist Two' }]),
      'completed',
      'manual',
      10,
      240000,
      '2026-04-15 07:00:00',
      '2026-04-15 07:00:00',
    );
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, track_count, duration_ms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      3,
      'Ten Tracks Later',
      JSON.stringify([{ name: 'Artist Three' }]),
      'completed',
      'manual',
      10,
      180000,
      '2026-04-15 09:00:00',
      '2026-04-15 09:00:00',
    );
    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      4,
      'Unknown Count',
      JSON.stringify([{ name: 'Artist Four' }]),
      'completed',
      'manual',
      '2026-04-15 10:00:00',
      '2026-04-15 10:00:00',
    );

    const handler = getRouteHandler(albumsRouter, 'get', '/');
    const res = createResponse();

    handler({ query: { sort: 'track_count', order: 'desc' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.albums.map(album => album.id)).toEqual([2, 3, 1, 4]);
  });

  it('sorts rating ties with Wrapped-style duration and title tiebreakers', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    [
      {
        id: 1,
        album_name: 'Longest',
        rating: 95,
        duration_ms: 240000,
        created_at: '2026-04-15 08:00:00',
      },
      {
        id: 2,
        album_name: 'Alpha',
        rating: 95,
        duration_ms: 180000,
        created_at: '2026-04-15 09:00:00',
      },
      {
        id: 3,
        album_name: 'Same Title',
        rating: 95,
        duration_ms: 180000,
        created_at: '2026-04-15 07:00:00',
      },
      {
        id: 4,
        album_name: 'Same Title',
        rating: 95,
        duration_ms: 180000,
        created_at: '2026-04-15 10:00:00',
      },
      {
        id: 5,
        album_name: 'Shortest',
        rating: 95,
        duration_ms: 120000,
        created_at: '2026-04-15 11:00:00',
      },
      {
        id: 6,
        album_name: 'Unrated',
        rating: null,
        duration_ms: 300000,
        created_at: '2026-04-15 12:00:00',
      },
    ].forEach(album => {
      db.prepare(`
        INSERT INTO albums (
          id, album_name, artists, status, source, rating, duration_ms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        album.id,
        album.album_name,
        JSON.stringify([{ name: 'Sorter' }]),
        'completed',
        'manual',
        album.rating,
        album.duration_ms,
        album.created_at,
        album.created_at,
      );
    });

    const handler = getRouteHandler(albumsRouter, 'get', '/');
    const res = createResponse();

    handler({ query: { sort: 'rating', order: 'desc' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.albums.map(album => album.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('sorts artists by the visible credited artist string, then album and release date', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    [
      {
        id: 1,
        album_name: 'Solo Album',
        artists: [{ name: 'Aesop Rock' }],
        release_date: '2026-02-01',
      },
      {
        id: 2,
        album_name: 'Alpha Collab',
        artists: [{ name: 'Aesop Rock' }, { name: 'Nujabes' }],
        release_date: '2026-02-03',
      },
      {
        id: 3,
        album_name: 'Beta Collab',
        artists: [{ name: 'Aesop Rock' }, { name: 'Nujabes' }],
        release_date: '2026-02-02',
      },
      {
        id: 4,
        album_name: 'Later Artist',
        artists: [{ name: 'Billy Woods' }],
        release_date: '2026-02-04',
      },
    ].forEach(album => {
      db.prepare(`
        INSERT INTO albums (
          id, album_name, artists, status, source, release_date, release_year, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        album.id,
        album.album_name,
        JSON.stringify(album.artists),
        'completed',
        'manual',
        album.release_date,
        Number.parseInt(album.release_date.slice(0, 4), 10),
        `2026-04-15 0${album.id}:00:00`,
        `2026-04-15 0${album.id}:00:00`,
      );
    });

    const handler = getRouteHandler(albumsRouter, 'get', '/');
    const ascRes = createResponse();
    handler({ query: { sort: 'artist', order: 'asc' } }, ascRes);

    expect(ascRes.statusCode).toBe(200);
    expect(ascRes.jsonBody.albums.map(album => album.id)).toEqual([1, 2, 3, 4]);
  });

  it('supports both note alphabetical and note length sorts', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    [
      {
        id: 1,
        album_name: 'Banana A',
        notes: 'banana',
      },
      {
        id: 2,
        album_name: 'Apple',
        notes: 'apple',
      },
      {
        id: 3,
        album_name: 'Banana B',
        notes: 'banana',
      },
      {
        id: 4,
        album_name: 'Shortest',
        notes: 'fig',
      },
      {
        id: 5,
        album_name: 'No Notes',
        notes: '',
      },
    ].forEach(album => {
      db.prepare(`
        INSERT INTO albums (
          id, album_name, artists, status, source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        album.id,
        album.album_name,
        JSON.stringify([{ name: 'Note Artist' }]),
        'completed',
        'manual',
        album.notes,
        `2026-04-15 0${album.id}:00:00`,
        `2026-04-15 0${album.id}:00:00`,
      );
    });

    const handler = getRouteHandler(albumsRouter, 'get', '/');

    const alphabeticalRes = createResponse();
    handler({ query: { sort: 'notes', order: 'asc' } }, alphabeticalRes);
    expect(alphabeticalRes.statusCode).toBe(200);
    expect(alphabeticalRes.jsonBody.albums.map(album => album.id)).toEqual([2, 1, 3, 4, 5]);

    const lengthRes = createResponse();
    handler({ query: { sort: 'notes_length', order: 'desc' } }, lengthRes);
    expect(lengthRes.statusCode).toBe(200);
    expect(lengthRes.jsonBody.albums.map(album => album.id)).toEqual([1, 3, 2, 4, 5]);
  });

  it('omits spotify_graphql_json from the main list endpoint but keeps compact Spotify metadata and single-album GraphQL payloads', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, source, spotify_release_date, spotify_first_track, spotify_graphql_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      7,
      'Debug Album',
      JSON.stringify([{ name: 'Debugger' }]),
      'planned',
      'spotify',
      JSON.stringify({ isoString: '2026-04-15T00:00:00Z', precision: 'DAY', year: 2026 }),
      JSON.stringify({ id: 'track-1', name: 'First Track', uri: 'spotify:track:track-1', share_url: 'https://open.spotify.com/track/track-1' }),
      JSON.stringify({ foo: { bar: 1 } }),
      '2026-04-15 08:00:00',
      '2026-04-15 08:00:00',
    );

    const listHandler = getRouteHandler(albumsRouter, 'get', '/');
    const listRes = createResponse();
    listHandler({ query: {} }, listRes);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.jsonBody.albums).toHaveLength(1);
    expect(listRes.jsonBody.albums[0]).not.toHaveProperty('spotify_graphql_json');
    expect(listRes.jsonBody.albums[0].spotify_release_date).toEqual({
      isoString: '2026-04-15T00:00:00Z',
      precision: 'DAY',
      year: 2026,
    });
    expect(listRes.jsonBody.albums[0].spotify_first_track).toEqual({
      id: 'track-1',
      name: 'First Track',
      uri: 'spotify:track:track-1',
      share_url: 'https://open.spotify.com/track/track-1',
    });

    const verboseListRes = createResponse();
    listHandler({ query: { include_spotify_graphql_json: '1' } }, verboseListRes);

    expect(verboseListRes.statusCode).toBe(200);
    expect(verboseListRes.jsonBody.albums[0].spotify_graphql_json).toEqual({ foo: { bar: 1 } });
    expect(verboseListRes.jsonBody.albums[0].spotify_release_date).toEqual({
      isoString: '2026-04-15T00:00:00Z',
      precision: 'DAY',
      year: 2026,
    });

    const singleHandler = getRouteHandler(albumsRouter, 'get', '/:id');
    const singleRes = createResponse();
    singleHandler({ params: { id: '7' } }, singleRes);

    expect(singleRes.statusCode).toBe(200);
    expect(singleRes.jsonBody.spotify_graphql_json).toEqual({ foo: { bar: 1 } });
    expect(singleRes.jsonBody.spotify_release_date).toEqual({
      isoString: '2026-04-15T00:00:00Z',
      precision: 'DAY',
      year: 2026,
    });
  });

  it('filters and paginates server-side while returning list metadata', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    [
      { id: 1, album_name: 'Alpha', status: 'completed', source: 'spotify', release_year: 2001, created_at: '2026-04-15 01:00:00' },
      { id: 2, album_name: 'Beta', status: 'planned', source: 'spotify', release_year: 2002, created_at: '2026-04-15 02:00:00' },
      { id: 3, album_name: 'Gamma', status: 'completed', source: 'manual', release_year: 2003, created_at: '2026-04-15 03:00:00' },
      { id: 4, album_name: 'Delta', status: 'dropped', source: 'spotify', release_year: 2004, created_at: '2026-04-15 04:00:00' },
    ].forEach(album => {
      db.prepare(`
        INSERT INTO albums (
          id, album_name, artists, status, source, release_year, duration_ms, listened_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        album.id,
        album.album_name,
        JSON.stringify([{ name: album.album_name === 'Gamma' ? 'Different Artist' : 'Shared Artist' }]),
        album.status,
        album.source,
        album.release_year,
        180000,
        album.status === 'completed' ? '2026-04-15' : null,
        album.created_at,
        album.created_at,
      );
    });

    const handler = getRouteHandler(albumsRouter, 'get', '/');
    const res = createResponse();
    handler({
      query: {
        statuses: 'completed,dropped',
        import_type: 'spotify',
        page: '2',
        per_page: '1',
        sort: 'date_logged',
        order: 'asc',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.albums.map(album => album.id)).toEqual([4]);
    expect(res.jsonBody.meta).toMatchObject({
      totalCount: 4,
      filteredCount: 2,
      currentPage: 2,
      totalPages: 2,
      startIndex: 1,
      endIndex: 2,
      isPaged: true,
      perPage: 1,
      pageCount: 1,
    });
    expect(res.jsonBody.meta.trackedListenedMs).toBe(720000);
  });

  it('filters to only null and non-standard album types when include_other is enabled by itself', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    [
      { id: 1, album_name: 'Standard Album', album_type: 'ALBUM', created_at: '2026-04-15 01:00:00' },
      { id: 2, album_name: 'Mystery Release', album_type: null, created_at: '2026-04-15 02:00:00' },
      { id: 3, album_name: 'Mixtape Drop', album_type: 'MIXTAPE', created_at: '2026-04-15 03:00:00' },
    ].forEach(album => {
      db.prepare(`
        INSERT INTO albums (
          id, album_name, artists, album_type, status, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        album.id,
        album.album_name,
        JSON.stringify([{ name: 'Shared Artist' }]),
        album.album_type,
        'planned',
        'manual',
        album.created_at,
        album.created_at,
      );
    });

    const handler = getRouteHandler(albumsRouter, 'get', '/');
    const res = createResponse();
    handler({
      query: {
        include_other: '1',
        sort: 'date_logged',
        order: 'asc',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.albums.map(album => album.id)).toEqual([2, 3]);
    expect(res.jsonBody.meta.filteredCount).toBe(2);
    expect(res.jsonBody.meta.totalCount).toBe(3);
  });

  it('defaults planned_at for planned albums and leaves listened_at null when omitted on manual create', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const handler = getRouteHandler(albumsRouter, 'post', '/');
    const req = {
      body: {
        album_name: 'Fresh Plan',
        artists: [{ name: 'Planner' }],
        status: 'planned',
      },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody.status).toBe('planned');
    expect(res.jsonBody.planned_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.jsonBody.listened_at).toBeNull();
  });

  it('stores exact manual release dates and derives release_year on create and edit', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    const createHandler = getRouteHandler(albumsRouter, 'post', '/');
    const createReq = {
      body: {
        album_name: 'Precise Album',
        artists: [{ name: 'Calendar Artist' }],
        status: 'completed',
        release_date: '2024-11-29',
      },
    };
    const createRes = createResponse();

    await createHandler(createReq, createRes);

    expect(createRes.statusCode).toBe(201);
    expect(createRes.jsonBody.release_date).toBe('2024-11-29');
    expect(createRes.jsonBody.release_year).toBe(2024);

    const createdRow = db.prepare(`
      SELECT release_date, release_year
      FROM albums
      WHERE id = ?
    `).get(createRes.jsonBody.id);

    expect(createdRow).toEqual({
      release_date: '2024-11-29',
      release_year: 2024,
    });

    const patchHandler = getRouteHandler(albumsRouter, 'patch', '/:id');
    const patchReq = {
      params: { id: String(createRes.jsonBody.id) },
      body: {
        release_date: '2025-01-03',
      },
    };
    const patchRes = createResponse();

    await patchHandler(patchReq, patchRes);

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.jsonBody.release_date).toBe('2025-01-03');
    expect(patchRes.jsonBody.release_year).toBe(2025);

    const patchedRow = db.prepare(`
      SELECT release_date, release_year
      FROM albums
      WHERE id = ?
    `).get(createRes.jsonBody.id);

    expect(patchedRow).toEqual({
      release_date: '2025-01-03',
      release_year: 2025,
    });
  });

  it('normalizes Spotify note links on album edits', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    db.prepare(`
      INSERT INTO albums (
        id, album_name, artists, status, notes, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Editable',
      JSON.stringify([{ name: 'Editor' }]),
      'completed',
      'before',
      'manual',
      '2026-04-15 10:00:00',
      '2026-04-15 10:00:00',
    );

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ title: 'Patched Album' }),
    }));

    const handler = getRouteHandler(albumsRouter, 'patch', '/:id');
    const req = {
      params: { id: '1' },
      body: {
        notes: 'Now https://open.spotify.com/album/3rHzUZDIsTv0zVyoNDN8YQ?si=abc and [artist](https://open.spotify.com/artist/0Ve5w7gefOsFmwW6aU3eSW?si=xyz)',
      },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.notes).toBe('Now [Patched Album](spotify:album:3rHzUZDIsTv0zVyoNDN8YQ) and [artist](spotify:artist:0Ve5w7gefOsFmwW6aU3eSW)');
  });

  it('normalizes Spotify note links on manual create and deduplicates oEmbed lookups', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    globalThis.fetch = vi.fn(async url => ({
      ok: true,
      json: async () => ({
        title: decodeURIComponent(String(url)).includes('/track/')
          ? 'Track Title'
          : 'Album Title',
      }),
    }));

    const handler = getRouteHandler(albumsRouter, 'post', '/');
    const req = {
      body: {
        album_name: 'Fresh Plan',
        artists: [{ name: 'Planner' }],
        status: 'completed',
        notes: 'Raw https://open.spotify.com/track/308uvg4mGNDn8GawwuaktM?si=abc and again https://open.spotify.com/track/308uvg4mGNDn8GawwuaktM?si=def plus [album link](https://open.spotify.com/album/3rHzUZDIsTv0zVyoNDN8YQ?si=xyz)',
      },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody.notes).toBe('Raw [Track Title](spotify:track:308uvg4mGNDn8GawwuaktM) and again [Track Title](spotify:track:308uvg4mGNDn8GawwuaktM) plus [album link](spotify:album:3rHzUZDIsTv0zVyoNDN8YQ)');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('leaves bare Spotify URLs unchanged when oEmbed fails during manual create', async () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const handler = getRouteHandler(albumsRouter, 'post', '/');
    const req = {
      body: {
        album_name: 'Fallback Album',
        artists: [{ name: 'Planner' }],
        status: 'completed',
        notes: 'https://open.spotify.com/playlist/1N2q2PpfXKlGhtQxBRlvB9?si=158763c47a194a23',
      },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody.notes).toBe('https://open.spotify.com/playlist/1N2q2PpfXKlGhtQxBRlvB9?si=158763c47a194a23');
  });

  it('sorts by release_date with artist and album-name tiebreakers', () => {
    const { dbModule, albumsRouter } = loadAlbumsRouteTestContext();
    const { db } = dbModule;
    openDbs.push(db);

    [
      { id: 1, album_name: 'April Early', artist_name: 'Sorter', release_date: '2026-04-02', release_year: 2026, created_at: '2026-04-15 07:00:00' },
      { id: 2, album_name: 'April Mid Earlier', artist_name: 'Sorter', release_date: '2026-04-15', release_year: 2026, created_at: '2026-04-15 08:00:00' },
      { id: 3, album_name: 'April Mid Later', artist_name: 'Sorter', release_date: '2026-04-15', release_year: 2026, created_at: '2026-04-15 09:00:00' },
      { id: 4, album_name: 'Unknown Release', artist_name: 'Sorter', release_date: null, release_year: null, created_at: '2026-04-15 10:00:00' },
    ].forEach(album => {
      db.prepare(`
        INSERT INTO albums (
          id, album_name, artists, status, source, release_date, release_year, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        album.id,
        album.album_name,
        JSON.stringify([{ name: album.artist_name }]),
        'completed',
        'manual',
        album.release_date,
        album.release_year,
        album.created_at,
        album.created_at,
      );
    });

    const handler = getRouteHandler(albumsRouter, 'get', '/');
    const descRes = createResponse();
    handler({ query: { sort: 'release_date', order: 'desc' } }, descRes);

    expect(descRes.statusCode).toBe(200);
    expect(descRes.jsonBody.albums.map(album => album.id)).toEqual([2, 3, 1, 4]);

    const ascRes = createResponse();
    handler({ query: { sort: 'release_date', order: 'asc' } }, ascRes);

    expect(ascRes.statusCode).toBe(200);
    expect(ascRes.jsonBody.albums.map(album => album.id)).toEqual([1, 2, 3, 4]);
  });
});
