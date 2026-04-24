import { describe, expect, it, vi } from 'vitest';
import { runStartupFlow } from '../public/js/startup-flow.js';

describe('startup flow', () => {
  it('starts the sidebar reveal before startup art-gated album loading finishes', async () => {
    const order = [];
    let resolveLoadAlbums;

    const loadAlbums = vi.fn(() => {
      order.push('load:start');
      return new Promise(resolve => {
        resolveLoadAlbums = () => {
          order.push('load:end');
          resolve();
        };
      });
    });
    const revealSidebarForStartup = vi.fn(() => {
      order.push('sidebar:reveal');
      return Promise.resolve(true);
    });
    const maybeClearLaunchAlbumParam = vi.fn(() => {
      order.push('clear:param');
    });
    const openLaunchAlbumModal = vi.fn(() => {
      order.push('launch:open');
      return Promise.resolve(false);
    });
    const openEditModal = vi.fn();

    const pending = runStartupFlow({
      sidebar: {},
      launchAlbumId: 42,
      loadAlbums,
      revealSidebarForStartup,
      maybeClearLaunchAlbumParam,
      openLaunchAlbumModal,
      openEditModal,
    });

    expect(order).toEqual(['sidebar:reveal', 'load:start']);
    expect(maybeClearLaunchAlbumParam).not.toHaveBeenCalled();
    expect(openLaunchAlbumModal).not.toHaveBeenCalled();

    resolveLoadAlbums();
    await pending;

    expect(order).toEqual([
      'sidebar:reveal',
      'load:start',
      'load:end',
      'clear:param',
      'launch:open',
    ]);
    expect(openLaunchAlbumModal).toHaveBeenCalledWith(42, { openModal: openEditModal });
  });
});
