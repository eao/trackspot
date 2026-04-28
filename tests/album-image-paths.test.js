import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildManagedAlbumImagePath,
  buildUniqueAlbumImagePath,
  normalizeAlbumImagePath,
  resolveAlbumImagePath,
} = require('../server/album-image-paths.js');

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('album image path helpers', () => {
  it('accepts managed album image paths', () => {
    expect(normalizeAlbumImagePath('images/cover.jpg')).toBe('images/cover.jpg');
    expect(normalizeAlbumImagePath('images/cover.jpeg')).toBe('images/cover.jpeg');
    expect(normalizeAlbumImagePath('images/cover.png')).toBe('images/cover.png');
    expect(normalizeAlbumImagePath('images/cover.webp')).toBe('images/cover.webp');
    expect(normalizeAlbumImagePath(null)).toBeNull();
  });

  it('rejects traversal, nested paths, backslashes, and unsupported extensions', () => {
    [
      'cover.jpg',
      '/images/cover.jpg',
      'images/../preferences.json',
      'images/nested/cover.jpg',
      'images\\cover.jpg',
      'images/cover.gif',
      'images/.cover.jpg',
      'images/-cover.jpg',
    ].forEach(imagePath => {
      expect(() => normalizeAlbumImagePath(imagePath)).toThrow();
    });
  });

  it('resolves managed images inside the configured images directory', () => {
    const imagesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-image-path-test-'));
    tempDirs.push(imagesDir);

    const resolved = resolveAlbumImagePath('images/cover.jpg', imagesDir);

    expect(resolved).toMatchObject({
      imagePath: 'images/cover.jpg',
      filename: 'cover.jpg',
    });
    expect(resolved.fullPath).toBe(path.join(imagesDir, 'cover.jpg'));
  });

  it('generates safe managed filenames from unsafe name parts', () => {
    const imagesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-image-path-test-'));
    tempDirs.push(imagesDir);

    const imagePath = buildManagedAlbumImagePath('../cover art', '.gif');
    const unique = buildUniqueAlbumImagePath({
      imagesDir,
      prefix: '../cover art',
      ext: '.png',
    });

    expect(imagePath).toBe('images/_cover_art.jpg');
    expect(normalizeAlbumImagePath(imagePath)).toBe(imagePath);
    expect(unique.imagePath).toMatch(/^images\/_cover_art_\d+_[a-z0-9]+\.png$/);
    expect(path.dirname(unique.fullPath)).toBe(imagesDir);
  });
});
