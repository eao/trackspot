import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  navigation: {
    page: 'stats',
    scrollPositions: {
      collection: 120,
      stats: 0,
      wrapped: 0,
    },
  },
  complexStatuses: [
    { id: 'cs_all', name: 'All', statuses: ['completed', 'dropped', 'planned'], includedWithApp: true },
  ],
  filters: {},
  sort: {},
};

const loadAlbumsMock = vi.fn();
const resetPaginationMock = vi.fn();
const setPageMock = vi.fn(async () => {});
let navigationRevision = 1;

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  DEFAULT_COMPLEX_STATUSES: [
    { id: 'cs_listened', name: 'Listened', statuses: ['completed', 'dropped'], includedWithApp: true },
    { id: 'cs_all', name: 'All', statuses: ['completed', 'dropped', 'planned'], includedWithApp: true },
  ],
  normalizeSortState: value => value,
}));

vi.mock('../public/js/render.js', () => ({
  loadAlbums: loadAlbumsMock,
  resetPagination: resetPaginationMock,
}));

vi.mock('../public/js/sidebar.js', () => ({
  syncFilterControlsFromState: vi.fn(),
  updateStatusFilterBtn: vi.fn(),
  updateImportTypeFilterBtn: vi.fn(),
  updateRatedFilterBtn: vi.fn(),
  updateTypeFilterBtn: vi.fn(),
  updateSortFieldBtn: vi.fn(),
  updateSortOrderBtn: vi.fn(),
}));

vi.mock('../public/js/navigation.js', () => ({
  getNavigationRevision: vi.fn(() => navigationRevision),
  setPage: setPageMock,
}));

describe('stats top artist jump', () => {
  beforeEach(() => {
    vi.resetModules();
    stateMock.navigation = {
      page: 'stats',
      scrollPositions: {
        collection: 120,
        stats: 0,
        wrapped: 0,
      },
    };
    stateMock.complexStatuses = [
      { id: 'cs_all', name: 'All', statuses: ['completed', 'dropped', 'planned'], includedWithApp: true },
    ];
    stateMock.filters = {};
    stateMock.sort = {};
    navigationRevision = 1;
    loadAlbumsMock.mockReset();
    resetPaginationMock.mockReset();
    setPageMock.mockReset();
  });

  it('does not force collection if the user navigates before the album load finishes', async () => {
    let resolveLoad;
    loadAlbumsMock.mockImplementation(() => new Promise(resolve => {
      resolveLoad = resolve;
    }));

    const { handleStatsOpenTopArtist } = await import('../public/js/top-artist-jump.js');

    const jumpPromise = handleStatsOpenTopArtist({ detail: { artistName: 'Sade' } });
    await Promise.resolve();

    expect(stateMock.filters.artist).toBe('Sade');
    expect(stateMock.navigation.scrollPositions.collection).toBe(0);
    stateMock.navigation.page = 'wrapped';
    navigationRevision += 1;
    resolveLoad(true);

    await expect(jumpPromise).resolves.toBe(false);
    expect(setPageMock).not.toHaveBeenCalled();
  });

  it('opens collection after the current top-artist load applies', async () => {
    loadAlbumsMock.mockResolvedValue(true);

    const { handleStatsOpenTopArtist } = await import('../public/js/top-artist-jump.js');

    await expect(handleStatsOpenTopArtist({ detail: { artistName: 'Sade' } })).resolves.toBe(true);

    expect(loadAlbumsMock).toHaveBeenCalledWith({
      gateStartupArt: true,
      renderAlbums: expect.any(Function),
    });
    expect(setPageMock).toHaveBeenCalledWith('collection', {
      suppressTransitions: true,
      skipCollectionLoad: true,
    });
  });

  it('does not open collection when the album load is superseded', async () => {
    loadAlbumsMock.mockResolvedValue(false);

    const { handleStatsOpenTopArtist } = await import('../public/js/top-artist-jump.js');

    await expect(handleStatsOpenTopArtist({ detail: { artistName: 'Sade' } })).resolves.toBe(false);

    expect(setPageMock).not.toHaveBeenCalled();
  });
});
