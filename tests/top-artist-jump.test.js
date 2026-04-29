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
  albums: [],
  albumsLoaded: true,
  albumsLoading: false,
  albumsError: null,
  albumListMeta: { totalCount: 1 },
  albumDetailsCache: {},
  pagination: {
    currentPage: 3,
  },
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
    stateMock.albums = [{ id: 1, album_name: 'Original' }];
    stateMock.albumsLoaded = true;
    stateMock.albumsLoading = false;
    stateMock.albumsError = null;
    stateMock.albumListMeta = { totalCount: 1 };
    stateMock.albumDetailsCache = { 1: { id: 1, album_name: 'Original' } };
    stateMock.pagination = {
      currentPage: 3,
    };
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
    expect(stateMock.filters).toEqual({});
    expect(stateMock.sort).toEqual({});
    expect(stateMock.navigation.scrollPositions.collection).toBe(120);
    expect(stateMock.albums).toEqual([{ id: 1, album_name: 'Original' }]);
    expect(stateMock.albumDetailsCache).toEqual({ 1: { id: 1, album_name: 'Original' } });
    expect(stateMock.pagination.currentPage).toBe(3);
  });

  it('keeps the artist preset when the user reaches collection before the jump load finishes', async () => {
    let resolveLoad;
    loadAlbumsMock.mockImplementation(() => new Promise(resolve => {
      resolveLoad = resolve;
    }));

    const { handleStatsOpenTopArtist } = await import('../public/js/top-artist-jump.js');

    const jumpPromise = handleStatsOpenTopArtist({ detail: { artistName: 'Sade' } });
    await Promise.resolve();

    expect(stateMock.filters.artist).toBe('Sade');
    stateMock.navigation.page = 'collection';
    navigationRevision += 1;
    resolveLoad(false);

    await expect(jumpPromise).resolves.toBe(true);
    expect(setPageMock).not.toHaveBeenCalled();
    expect(stateMock.filters.artist).toBe('Sade');
    expect(stateMock.filters.artistMatchExact).toBe(true);
    expect(stateMock.sort).toEqual({
      field: 'release_date',
      order: 'desc',
    });
    expect(stateMock.navigation.scrollPositions.collection).toBe(0);
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
