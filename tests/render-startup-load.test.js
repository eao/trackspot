import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

const stateMock = {
  albums: [],
  albumsLoaded: false,
  albumsLoading: false,
  albumsLoadingBlocksCollection: false,
  albumsError: null,
  albumDetailsCache: {},
  albumListMeta: {
    totalCount: 0,
    filteredCount: 0,
    currentPage: 1,
    totalPages: 1,
    startIndex: 0,
    endIndex: 0,
    isPaged: false,
    perPage: null,
    pageCount: 0,
    trackedListenedMs: 0,
  },
  complexStatuses: [],
  filters: {},
  sort: { field: 'date_logged', order: 'desc' },
  view: 'list',
  listArtClickToEnlarge: true,
  pagination: {
    currentPage: 9,
    perPage: { list: 2, grid: null },
    mode: { list: 'unlimited', grid: 'unlimited' },
    showPageCount: true,
    showFirstLastButtons: false,
    visibilityMode: 'hover',
  },
};

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: {
    viewList: { innerHTML: '' },
    headerTooltip: { textContent: '' },
    pageControls: { classList: { toggle: vi.fn() } },
    pageCount: { classList: { toggle: vi.fn() }, textContent: '' },
    pageControlFirst: { classList: { toggle: vi.fn() }, disabled: false, innerHTML: '' },
    pageControlPrev: { disabled: false, innerHTML: '' },
    pageControlNext: { disabled: false, innerHTML: '' },
    pageControlLast: { classList: { toggle: vi.fn() }, disabled: false, innerHTML: '' },
    artLightboxImage: { removeAttribute: vi.fn() },
    artLightboxOverlay: { classList: { add: vi.fn() }, setAttribute: vi.fn() },
    emptyState: { classList: { toggle: vi.fn() } },
    viewGrid: { classList: { toggle: vi.fn() } },
    albumCount: { textContent: '' },
  },
  apiFetch: apiFetchMock,
  PAGE_ICON_FIRST: '',
  PAGE_ICON_PREV: '',
  PAGE_ICON_NEXT: '',
  PAGE_ICON_LAST: '',
}));

vi.mock('../public/js/utils.js', () => ({
  formatDate: vi.fn(),
  formatRating: vi.fn(),
  formatDuration: vi.fn(),
  formatAlbumMetaTooltip: vi.fn(() => ''),
  artUrl: vi.fn(),
  escHtml: value => value,
  getSafeExternalHref: value => value || null,
  renderNotesHtml: vi.fn(),
  normalizeAlbumCollectionClientShape: albums => albums,
}));

vi.mock('../public/js/artists.js', () => ({
  renderArtistSpans: vi.fn(),
}));

vi.mock('../public/js/modal.js', () => ({
  openEditModal: vi.fn(),
}));

vi.mock('../public/js/sidebar.js', () => ({
  updateSortOrderBtn: vi.fn(),
  updateSortFieldBtn: vi.fn(),
  applyFilters: albums => albums,
}));

describe('loadAlbums startup gating', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    stateMock.albums = [];
    stateMock.albumsLoaded = false;
    stateMock.albumsLoading = false;
    stateMock.albumsLoadingBlocksCollection = false;
    stateMock.albumsError = null;
    stateMock.albumDetailsCache = {};
    stateMock.complexStatuses = [];
    stateMock.albumListMeta = {
      totalCount: 0,
      filteredCount: 0,
      currentPage: 1,
      totalPages: 1,
      startIndex: 0,
      endIndex: 0,
      isPaged: false,
      perPage: null,
      pageCount: 0,
      trackedListenedMs: 0,
    };
    stateMock.pagination.currentPage = 9;
    stateMock.pagination.perPage = { list: 2, grid: null };
    stateMock.pagination.mode = { list: 'unlimited', grid: 'unlimited' };
    stateMock.filters = {
      search: '',
      artist: '',
      artistMatchExact: false,
      year: '',
      ratingMin: '',
      ratingMax: '',
      statusFilter: '',
      importTypeFilter: 'all',
      ratedFilter: 'both',
      typeAlbum: true,
      typeEP: true,
      typeSingle: true,
      typeCompilation: true,
      typeOther: true,
    };
    apiFetchMock.mockReset();
  });

  function mockEmptyAlbumResponse(meta = {}) {
    apiFetchMock.mockResolvedValue({
      albums: [],
      meta: {
        totalCount: 0,
        filteredCount: 0,
        currentPage: stateMock.pagination.currentPage,
        totalPages: 1,
        startIndex: 0,
        endIndex: 0,
        isPaged: false,
        perPage: stateMock.pagination.perPage.list,
        pageCount: 0,
        trackedListenedMs: 0,
        ...meta,
      },
    });
  }

  async function loadAlbumsAndReadParams() {
    const { loadAlbums } = await import('../public/js/render.js');
    mockEmptyAlbumResponse();

    await loadAlbums({
      preservePage: true,
      renderAlbums: vi.fn(),
    });

    const path = apiFetchMock.mock.calls.at(-1)?.[0];
    return new URL(path, 'http://trackspot.test').searchParams;
  }

  function flushPromises() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  it('waits for startup art gating before rendering on initial load', async () => {
    const { loadAlbums } = await import('../public/js/render.js');
    apiFetchMock.mockResolvedValue({
      albums: [
        { id: 1, album_name: 'One' },
        { id: 2, album_name: 'Two' },
      ],
      meta: {
        totalCount: 10,
        filteredCount: 2,
        currentPage: 1,
        totalPages: 1,
        startIndex: 0,
        endIndex: 2,
        isPaged: false,
        perPage: 2,
        pageCount: 2,
        trackedListenedMs: 1234,
      },
    });

    const order = [];
    const preloadVisibleAlbumArt = vi.fn(async albums => {
      order.push(`preload:${albums.length}`);
    });
    const renderAlbums = vi.fn(() => {
      order.push('render');
    });

    const result = await loadAlbums({
      gateStartupArt: true,
      preloadVisibleAlbumArt,
      renderAlbums,
    });

    expect(result).toBe(true);
    expect(stateMock.albumsLoaded).toBe(true);
    expect(stateMock.pagination.currentPage).toBe(1);
    expect(preloadVisibleAlbumArt).toHaveBeenCalledWith([
      { id: 1, album_name: 'One' },
      { id: 2, album_name: 'Two' },
    ]);
    expect(stateMock.albumListMeta.filteredCount).toBe(2);
    expect(order).toEqual(['preload:2', 'render']);
  });

  it('ignores stale responses when a newer load finishes first', async () => {
    const { loadAlbums } = await import('../public/js/render.js');
    let resolveFirstRequest;
    let resolveSecondRequest;
    apiFetchMock
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveFirstRequest = resolve;
      }))
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveSecondRequest = resolve;
      }));

    const firstRender = vi.fn();
    const secondRender = vi.fn();

    const firstLoad = loadAlbums({
      preservePage: true,
      renderAlbums: firstRender,
    });

    stateMock.filters.search = 'fresh query';

    const secondLoad = loadAlbums({
      preservePage: true,
      renderAlbums: secondRender,
    });

    resolveSecondRequest({
      albums: [{ id: 2, album_name: 'Newest Result' }],
      meta: {
        totalCount: 1,
        filteredCount: 1,
        currentPage: 3,
        totalPages: 1,
        startIndex: 0,
        endIndex: 1,
        isPaged: false,
        perPage: 2,
        pageCount: 1,
        trackedListenedMs: 0,
      },
    });
    await expect(secondLoad).resolves.toBe(true);

    expect(stateMock.albums).toEqual([{ id: 2, album_name: 'Newest Result' }]);
    expect(stateMock.pagination.currentPage).toBe(3);
    expect(secondRender).toHaveBeenCalledOnce();

    resolveFirstRequest({
      albums: [{ id: 1, album_name: 'Stale Result' }],
      meta: {
        totalCount: 1,
        filteredCount: 1,
        currentPage: 1,
        totalPages: 1,
        startIndex: 0,
        endIndex: 1,
        isPaged: false,
        perPage: 2,
        pageCount: 1,
        trackedListenedMs: 0,
      },
    });
    await expect(firstLoad).resolves.toBe(false);

    expect(stateMock.albums).toEqual([{ id: 2, album_name: 'Newest Result' }]);
    expect(stateMock.pagination.currentPage).toBe(3);
    expect(firstRender).not.toHaveBeenCalled();
  });

  it('can render an active loading state before a collection reload resolves', async () => {
    const { loadAlbums } = await import('../public/js/render.js');
    let resolveRequest;
    apiFetchMock.mockImplementation(() => new Promise(resolve => {
      resolveRequest = resolve;
    }));
    const renderAlbums = vi.fn();

    const loadPromise = loadAlbums({
      preservePage: true,
      renderAlbums,
      showLoading: true,
    });

    expect(stateMock.albumsLoading).toBe(true);
    expect(stateMock.albumsLoadingBlocksCollection).toBe(true);
    expect(renderAlbums).toHaveBeenCalledOnce();

    resolveRequest({
      albums: [{ id: 3, album_name: 'Loaded' }],
      meta: {
        totalCount: 1,
        filteredCount: 1,
        currentPage: 9,
        totalPages: 1,
        startIndex: 0,
        endIndex: 1,
        isPaged: false,
        perPage: 2,
        pageCount: 1,
        trackedListenedMs: 0,
      },
    });
    await expect(loadPromise).resolves.toBe(true);

    expect(stateMock.albumsLoading).toBe(false);
    expect(stateMock.albumsLoadingBlocksCollection).toBe(false);
    expect(renderAlbums).toHaveBeenCalledTimes(2);
  });

  it('keeps already loaded album pages visible during preserve-page reloads', async () => {
    const { loadAlbums } = await import('../public/js/render.js');
    stateMock.albumsLoaded = true;
    stateMock.albums = [{ id: 1, album_name: 'Existing Page' }];
    let resolveRequest;
    apiFetchMock.mockImplementation(() => new Promise(resolve => {
      resolveRequest = resolve;
    }));
    const renderAlbums = vi.fn();

    const loadPromise = loadAlbums({
      preservePage: true,
      renderAlbums,
      showLoading: true,
    });

    expect(stateMock.albumsLoading).toBe(true);
    expect(stateMock.albumsLoadingBlocksCollection).toBe(false);
    expect(stateMock.albums).toEqual([{ id: 1, album_name: 'Existing Page' }]);
    expect(renderAlbums).toHaveBeenCalledOnce();

    resolveRequest({
      albums: [{ id: 2, album_name: 'Next Page' }],
      meta: {
        totalCount: 2,
        filteredCount: 2,
        currentPage: 2,
        totalPages: 2,
        startIndex: 1,
        endIndex: 2,
        isPaged: true,
        perPage: 1,
        pageCount: 1,
        trackedListenedMs: 0,
      },
    });
    await expect(loadPromise).resolves.toBe(true);

    expect(stateMock.albums).toEqual([{ id: 2, album_name: 'Next Page' }]);
    expect(stateMock.albumsLoading).toBe(false);
    expect(stateMock.albumsLoadingBlocksCollection).toBe(false);
    expect(renderAlbums).toHaveBeenCalledTimes(2);
  });

  it('serves cached album pages without a second album-page request when the revision matches', async () => {
    const { loadAlbums, clearAlbumPageCache } = await import('../public/js/render.js');
    clearAlbumPageCache();
    apiFetchMock
      .mockResolvedValueOnce({
        albums: [{ id: 7, album_name: 'Cached Page' }],
        meta: {
          totalCount: 1,
          filteredCount: 1,
          currentPage: 9,
          totalPages: 1,
          startIndex: 0,
          endIndex: 1,
          isPaged: false,
          perPage: 2,
          pageCount: 1,
          trackedListenedMs: 0,
          revision: 'rev-1',
        },
      })
      .mockResolvedValueOnce({ revision: 'rev-1' });

    await loadAlbums({
      preservePage: true,
      renderAlbums: vi.fn(),
      useCache: true,
    });
    expect(apiFetchMock).toHaveBeenCalledOnce();

    stateMock.albums = [];
    await loadAlbums({
      preservePage: true,
      renderAlbums: vi.fn(),
      useCache: true,
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock.mock.calls.map(call => call[0])).toEqual([
      '/api/albums?sort=date_logged&order=desc&page=9&per_page=2&types=ALBUM%2CEP%2CSINGLE%2CCOMPILATION&include_other=1',
      '/api/albums/revision',
    ]);
    expect(stateMock.albums).toEqual([{ id: 7, album_name: 'Cached Page' }]);
  });

  it('refreshes a cached album page in the background when the server revision changes', async () => {
    const { loadAlbums, clearAlbumPageCache } = await import('../public/js/render.js');
    clearAlbumPageCache();
    const renderAlbums = vi.fn();
    apiFetchMock
      .mockResolvedValueOnce({
        albums: [{ id: 7, album_name: 'Cached Page' }],
        meta: {
          totalCount: 1,
          filteredCount: 1,
          currentPage: 9,
          totalPages: 1,
          startIndex: 0,
          endIndex: 1,
          isPaged: false,
          perPage: 2,
          pageCount: 1,
          trackedListenedMs: 0,
          revision: 'rev-1',
        },
      })
      .mockResolvedValueOnce({ revision: 'rev-2' })
      .mockResolvedValueOnce({
        albums: [{ id: 8, album_name: 'Fresh Page' }],
        meta: {
          totalCount: 1,
          filteredCount: 1,
          currentPage: 9,
          totalPages: 1,
          startIndex: 0,
          endIndex: 1,
          isPaged: false,
          perPage: 2,
          pageCount: 1,
          trackedListenedMs: 0,
          revision: 'rev-2',
        },
      });

    await loadAlbums({
      preservePage: true,
      renderAlbums,
      useCache: true,
    });
    stateMock.albums = [];
    await loadAlbums({
      preservePage: true,
      renderAlbums,
      useCache: true,
    });

    expect(stateMock.albums).toEqual([{ id: 7, album_name: 'Cached Page' }]);
    expect(renderAlbums).toHaveBeenCalledTimes(2);

    await flushPromises();
    await flushPromises();

    expect(apiFetchMock.mock.calls.map(call => call[0])).toEqual([
      '/api/albums?sort=date_logged&order=desc&page=9&per_page=2&types=ALBUM%2CEP%2CSINGLE%2CCOMPILATION&include_other=1',
      '/api/albums/revision',
      '/api/albums?sort=date_logged&order=desc&page=9&per_page=2&types=ALBUM%2CEP%2CSINGLE%2CCOMPILATION&include_other=1',
    ]);
    expect(stateMock.albums).toEqual([{ id: 8, album_name: 'Fresh Page' }]);
    expect(renderAlbums).toHaveBeenCalledTimes(3);
  });

  it('keeps the cached album page visible when background refresh fails', async () => {
    const { loadAlbums, clearAlbumPageCache } = await import('../public/js/render.js');
    clearAlbumPageCache();
    const renderAlbums = vi.fn();
    apiFetchMock
      .mockResolvedValueOnce({
        albums: [{ id: 7, album_name: 'Cached Page' }],
        meta: {
          totalCount: 1,
          filteredCount: 1,
          currentPage: 9,
          totalPages: 1,
          startIndex: 0,
          endIndex: 1,
          isPaged: false,
          perPage: 2,
          pageCount: 1,
          trackedListenedMs: 0,
          revision: 'rev-1',
        },
      })
      .mockResolvedValueOnce({ revision: 'rev-2' })
      .mockRejectedValueOnce(new Error('Network down'));

    await loadAlbums({
      preservePage: true,
      renderAlbums,
      useCache: true,
    });
    stateMock.albums = [];
    await loadAlbums({
      preservePage: true,
      renderAlbums,
      useCache: true,
    });

    expect(stateMock.albums).toEqual([{ id: 7, album_name: 'Cached Page' }]);
    expect(renderAlbums).toHaveBeenCalledTimes(2);

    await flushPromises();
    await flushPromises();

    expect(apiFetchMock.mock.calls.map(call => call[0])).toEqual([
      '/api/albums?sort=date_logged&order=desc&page=9&per_page=2&types=ALBUM%2CEP%2CSINGLE%2CCOMPILATION&include_other=1',
      '/api/albums/revision',
      '/api/albums?sort=date_logged&order=desc&page=9&per_page=2&types=ALBUM%2CEP%2CSINGLE%2CCOMPILATION&include_other=1',
    ]);
    expect(stateMock.albums).toEqual([{ id: 7, album_name: 'Cached Page' }]);
    expect(stateMock.albumsError).toBeNull();
    expect(stateMock.albumsLoading).toBe(false);
    expect(renderAlbums).toHaveBeenCalledTimes(2);
  });

  it('bypasses cached album pages after explicit invalidation', async () => {
    const { loadAlbums, clearAlbumPageCache } = await import('../public/js/render.js');
    clearAlbumPageCache();
    apiFetchMock
      .mockResolvedValueOnce({
        albums: [{ id: 7, album_name: 'Cached Page' }],
        meta: {
          totalCount: 1,
          filteredCount: 1,
          currentPage: 9,
          totalPages: 1,
          startIndex: 0,
          endIndex: 1,
          isPaged: false,
          perPage: 2,
          pageCount: 1,
          trackedListenedMs: 0,
        },
      })
      .mockResolvedValueOnce({
        albums: [{ id: 8, album_name: 'Fresh Page' }],
        meta: {
          totalCount: 1,
          filteredCount: 1,
          currentPage: 9,
          totalPages: 1,
          startIndex: 0,
          endIndex: 1,
          isPaged: false,
          perPage: 2,
          pageCount: 1,
          trackedListenedMs: 0,
        },
      });

    await loadAlbums({
      preservePage: true,
      renderAlbums: vi.fn(),
      useCache: true,
    });
    await loadAlbums({
      preservePage: true,
      renderAlbums: vi.fn(),
      useCache: true,
      invalidateCache: true,
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(stateMock.albums).toEqual([{ id: 8, album_name: 'Fresh Page' }]);
  });

  it('scrolls to the top when requested for pagination navigation loads', async () => {
    const { loadAlbums } = await import('../public/js/render.js');
    apiFetchMock.mockResolvedValue({
      albums: [{ id: 1, album_name: 'One' }],
      meta: {
        totalCount: 10,
        filteredCount: 1,
        currentPage: 2,
        totalPages: 10,
        startIndex: 1,
        endIndex: 2,
        isPaged: true,
        perPage: 2,
        pageCount: 1,
        trackedListenedMs: 0,
      },
    });

    await loadAlbums({
      preservePage: true,
      scrollToTop: true,
      renderAlbums: vi.fn(),
    });

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
  });

  it('builds the server query from complex status, exact artist, filters, sort, and pagination state', async () => {
    stateMock.complexStatuses = [
      { id: 'cs_listened_or_dropped', statuses: ['completed', 'dropped'] },
    ];
    stateMock.filters = {
      search: 'dream pop',
      artist: 'Cocteau Twins',
      artistMatchExact: true,
      year: '1988',
      ratingMin: '70',
      ratingMax: '95',
      statusFilter: 'cs_listened_or_dropped',
      importTypeFilter: 'spotify',
      ratedFilter: 'rated',
      typeAlbum: true,
      typeEP: true,
      typeSingle: false,
      typeCompilation: true,
      typeOther: false,
    };
    stateMock.sort = { field: 'artist', order: 'asc' };
    stateMock.pagination.currentPage = 4;
    stateMock.pagination.perPage.list = 25;

    const params = await loadAlbumsAndReadParams();

    expect(params.get('sort')).toBe('artist');
    expect(params.get('order')).toBe('asc');
    expect(params.get('page')).toBe('4');
    expect(params.get('per_page')).toBe('25');
    expect(params.get('search')).toBe('dream pop');
    expect(params.get('artist')).toBe('Cocteau Twins');
    expect(params.get('artist_exact')).toBe('1');
    expect(params.get('year')).toBe('1988');
    expect(params.get('rating_min')).toBe('70');
    expect(params.get('rating_max')).toBe('95');
    expect(params.get('statuses')).toBe('completed,dropped');
    expect(params.get('import_type')).toBe('spotify');
    expect(params.get('rated')).toBe('rated');
    expect(params.get('types')).toBe('ALBUM,EP,COMPILATION');
    expect(params.get('include_other')).toBe('0');
  });

  it('still sends include_other when only the Other album type is enabled', async () => {
    stateMock.filters.typeAlbum = false;
    stateMock.filters.typeEP = false;
    stateMock.filters.typeSingle = false;
    stateMock.filters.typeCompilation = false;
    stateMock.filters.typeOther = true;

    const params = await loadAlbumsAndReadParams();

    expect(params.has('types')).toBe(false);
    expect(params.get('include_other')).toBe('1');
  });

  it('omits per_page when pagination is unlimited', async () => {
    stateMock.pagination.perPage.list = null;

    const params = await loadAlbumsAndReadParams();

    expect(params.has('per_page')).toBe(false);
  });
});
