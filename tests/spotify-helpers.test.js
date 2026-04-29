import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTempDataDir,
  removeTempDir,
  resetServerModules,
} from './helpers/server.js';

const require = createRequire(import.meta.url);
const originalFetch = globalThis.fetch;
const serverModulePaths = [
  'server/spotify-helpers.js',
  'server/album-image-paths.js',
  'server/http-downloads.js',
  'server/db.js',
];

let dataDir;
let dbModule;

function loadSpotifyHelpersContext() {
  dataDir = createTempDataDir('trackspot-spotify-helpers-');
  resetServerModules(serverModulePaths);
  dbModule = require('../server/db.js');
  return {
    spotifyHelpers: require('../server/spotify-helpers.js'),
    albumImagePaths: require('../server/album-image-paths.js'),
    dbModule,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  dbModule?.db?.close();
  dbModule = null;
  delete process.env.DATA_DIR;
  resetServerModules(serverModulePaths);
  removeTempDir(dataDir);
  dataDir = null;
  vi.restoreAllMocks();
});

describe('Spotify helper utilities', () => {
  it('extracts album ids from canonical URLs, localized URLs, and Spotify URIs', () => {
    const { spotifyHelpers } = loadSpotifyHelpersContext();
    const albumId = '2gvrhSDbT29UtKoQSJDqmW';

    expect(spotifyHelpers.extractAlbumId(`https://open.spotify.com/album/${albumId}?si=abc`)).toBe(albumId);
    expect(spotifyHelpers.extractAlbumId(`https://open.spotify.com/intl-ja/album/${albumId}`)).toBe(albumId);
    expect(spotifyHelpers.extractAlbumId(`https://open.spotify.com/us/album/${albumId}`)).toBe(albumId);
    expect(spotifyHelpers.extractAlbumId(`spotify:album:${albumId}`)).toBe(albumId);
  });

  it('rejects non-album Spotify URLs', () => {
    const { spotifyHelpers } = loadSpotifyHelpersContext();

    expect(() => spotifyHelpers.extractAlbumId('https://open.spotify.com/track/1234567890abcdef'))
      .toThrow(/album link/i);
    expect(() => spotifyHelpers.extractAlbumId('https://open.spotify.com/artist/1234567890abcdef'))
      .toThrow(/album link/i);
  });

  it('returns an existing managed image path without fetching again', async () => {
    const { spotifyHelpers, albumImagePaths } = loadSpotifyHelpersContext();
    const imagePath = albumImagePaths.buildManagedAlbumImagePath('existing-album', '.jpg');
    const resolved = albumImagePaths.resolveAlbumImagePath(imagePath, dbModule.IMAGES_DIR);
    fs.writeFileSync(resolved.fullPath, Buffer.from([1, 2, 3]));
    globalThis.fetch = vi.fn();

    const result = await spotifyHelpers.downloadImage('https://images.example/cover.jpg', 'existing-album');

    expect(result).toBe(imagePath);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dbModule.IMAGES_DIR, 'existing-album.jpg'))).toBe(true);
  });
});
