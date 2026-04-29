import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAlbumArtPreloadCache,
  preloadAlbumArt,
  preloadAlbumArtUrls,
  selectAlbumArtPreloadUrls,
} from '../public/js/album-art-preload.js';

describe('album art preloading', () => {
  beforeEach(() => {
    clearAlbumArtPreloadCache();
  });

  it('selects unique album art URLs in page order', () => {
    const albums = [
      { image_path: 'images/one.jpg' },
      { image_path: 'images/two.jpg' },
      { image_path: 'images/two.jpg' },
      { image_path: null },
      { image_path: 'images/three.jpg' },
    ];

    expect(selectAlbumArtPreloadUrls(albums, { limit: 3 })).toEqual([
      '/images/one.jpg',
      '/images/two.jpg',
      '/images/three.jpg',
    ]);
  });

  it('starts browser image preloads without reloading already warmed URLs', () => {
    const decoded = [];
    const created = [];
    const imageFactory = vi.fn(() => {
      const img = {
        decode: vi.fn(() => {
          decoded.push(img.src);
          return Promise.resolve();
        }),
      };
      Object.defineProperty(img, 'src', {
        get() {
          return this._src;
        },
        set(value) {
          this._src = value;
          created.push(value);
        },
      });
      return img;
    });

    preloadAlbumArtUrls(['/images/one.jpg', '/images/two.jpg', '/images/one.jpg'], {
      imageFactory,
    });
    preloadAlbumArtUrls(['/images/two.jpg', '/images/three.jpg'], {
      imageFactory,
    });

    expect(imageFactory).toHaveBeenCalledTimes(3);
    expect(created).toEqual([
      '/images/one.jpg',
      '/images/two.jpg',
      '/images/three.jpg',
    ]);
    expect(decoded).toEqual([
      '/images/one.jpg',
      '/images/two.jpg',
      '/images/three.jpg',
    ]);
  });

  it('preloads art from album objects', () => {
    const created = [];
    const imageFactory = () => {
      const img = {};
      Object.defineProperty(img, 'src', {
        set(value) {
          created.push(value);
        },
      });
      return img;
    };

    const urls = preloadAlbumArt([
      { image_path: 'images/current.jpg' },
      { image_path: '' },
    ], { imageFactory });

    expect(urls).toEqual(['/images/current.jpg']);
    expect(created).toEqual(['/images/current.jpg']);
  });
});
