import { describe, expect, it, vi } from 'vitest';
import { preloadStartupAlbumArt, selectStartupArtUrls } from '../public/js/startup-render.js';

describe('startup album art gating', () => {
  it('selects only the first visible batch of unique startup art URLs', () => {
    const albums = [
      { image_path: 'one.jpg' },
      { image_path: 'two.jpg' },
      { image_path: 'two.jpg' },
      { image_path: null },
      { image_path: 'three.jpg' },
    ];

    const urls = selectStartupArtUrls(albums, {
      limit: 3,
      getArtUrl: album => (album.image_path ? `/images/${album.image_path}` : null),
    });

    expect(urls).toEqual([
      '/images/one.jpg',
      '/images/two.jpg',
    ]);
  });

  it('waits for the startup art batch before resolving', async () => {
    const waitForUrls = vi.fn(() => Promise.resolve());
    const albums = [
      { image_path: 'one.jpg' },
      { image_path: 'two.jpg' },
      { image_path: 'three.jpg' },
    ];

    const urls = await preloadStartupAlbumArt(albums, {
      limit: 2,
      getArtUrl: album => `/images/${album.image_path}`,
      waitForUrls,
    });

    expect(waitForUrls).toHaveBeenCalledWith([
      '/images/one.jpg',
      '/images/two.jpg',
    ]);
    expect(urls).toEqual([
      '/images/one.jpg',
      '/images/two.jpg',
    ]);
  });

  it('does not hang startup when images are missing from the visible batch', async () => {
    const waitForUrls = vi.fn(() => Promise.resolve());
    const albums = [
      { image_path: null },
      { image_path: '' },
      { image_path: 'one.jpg' },
    ];

    const urls = await preloadStartupAlbumArt(albums, {
      getArtUrl: album => (album.image_path ? `/images/${album.image_path}` : null),
      waitForUrls,
    });

    expect(waitForUrls).toHaveBeenCalledWith([
      '/images/one.jpg',
    ]);
    expect(urls).toEqual([
      '/images/one.jpg',
    ]);
  });
});
