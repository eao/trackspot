import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

const stateMock = {
  albums: [],
  albumsLoaded: false,
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
    stateMock.albumDetailsCache = {};
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
    });

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
  });
});
