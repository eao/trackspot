import { beforeEach, describe, expect, it, vi } from 'vitest';

let viewListWidth = 950;

const contentInnerEl = globalThis.document.createElement('div');
const viewListEl = globalThis.document.createElement('div');
const viewGridEl = globalThis.document.createElement('div');
const emptyStateEl = globalThis.document.createElement('div');
const pageControlsEl = globalThis.document.createElement('div');
const pageCountEl = globalThis.document.createElement('div');
const pageControlFirstEl = globalThis.document.createElement('button');
const pageControlPrevEl = globalThis.document.createElement('button');
const pageControlNextEl = globalThis.document.createElement('button');
const pageControlLastEl = globalThis.document.createElement('button');
const headerTooltipEl = globalThis.document.createElement('div');
const albumCountEl = globalThis.document.createElement('div');
const artLightboxImageEl = globalThis.document.createElement('img');
const artLightboxOverlayEl = globalThis.document.createElement('div');
const artLightboxCloseEl = globalThis.document.createElement('button');
const openEditModalMock = vi.fn();
const apiFetchMock = vi.fn();

Object.defineProperty(viewListEl, 'clientWidth', {
  get() {
    return viewListEl.classList.contains('hide-list-year-column')
      ? viewListWidth + 48
      : viewListWidth;
  },
});

Object.defineProperty(contentInnerEl, 'clientWidth', {
  get() {
    return viewListWidth;
  },
});

if (!contentInnerEl.contains(viewListEl)) {
  contentInnerEl.appendChild(viewListEl);
}

class ResizeObserverMock {
  constructor(callback) {
    this.callback = callback;
  }

  observe() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const stateMock = {
  albums: [],
  albumsLoaded: true,
  albumsLoading: false,
  albumsError: null,
  albumListMeta: null,
  filters: {
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
  },
  sort: { field: 'album', order: 'asc' },
  view: 'list',
  listArtClickToEnlarge: false,
  complexStatuses: [],
  pagination: {
    currentPage: 1,
    perPage: { list: null, grid: null },
    mode: { list: 'unlimited', grid: 'unlimited' },
    showPageCount: true,
    showFirstLastButtons: false,
    visibilityMode: 'hover',
  },
};

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: {
    viewList: viewListEl,
    viewGrid: viewGridEl,
    emptyState: emptyStateEl,
    pageControls: pageControlsEl,
    pageCount: pageCountEl,
    pageControlFirst: pageControlFirstEl,
    pageControlPrev: pageControlPrevEl,
    pageControlNext: pageControlNextEl,
    pageControlLast: pageControlLastEl,
    headerTooltip: headerTooltipEl,
    albumCount: albumCountEl,
    artLightboxImage: artLightboxImageEl,
    artLightboxOverlay: artLightboxOverlayEl,
    artLightboxClose: artLightboxCloseEl,
  },
  apiFetch: (...args) => apiFetchMock(...args),
  PAGE_ICON_FIRST: '',
  PAGE_ICON_PREV: '',
  PAGE_ICON_NEXT: '',
  PAGE_ICON_LAST: '',
}));

vi.mock('../public/js/utils.js', () => ({
  formatDate: value => value || '—',
  formatRating: value => value === null || value === undefined ? '—' : String(value),
  formatDuration: () => '42:00',
  formatAlbumMetaTooltip: album => album.track_count != null ? `Album・${album.track_count} tracks` : '',
  artUrl: imagePath => imagePath ? '/images/test.jpg' : null,
  escHtml: value => value,
  getSafeExternalHref: value => value || null,
  renderNotesHtml: value => value,
  normalizeAlbumCollectionClientShape: albums => albums,
}));

vi.mock('../public/js/artists.js', () => ({
  renderArtistSpans: artists => {
    const span = globalThis.document.createElement('span');
    span.textContent = Array.isArray(artists) ? artists.map(artist => artist.name).join(', ') : '';
    return span;
  },
}));

vi.mock('../public/js/modal.js', () => ({
  openEditModal: openEditModalMock,
}));

vi.mock('../public/js/sidebar.js', () => ({
  updateSortOrderBtn: vi.fn(),
  updateSortFieldBtn: vi.fn(),
  applyFilters: albums => albums,
}));

vi.mock('../public/js/startup-render.js', () => ({
  preloadStartupAlbumArt: vi.fn(),
}));

vi.mock('../public/js/art-lightbox-close.js', () => ({
  getArtLightboxFallbackTargetRect: vi.fn(),
  maybeDesyncArtLightboxClose: vi.fn(),
}));

describe('list view responsive layout stages', () => {
  beforeEach(() => {
    vi.resetModules();
    viewListWidth = 950;
    globalThis.document.body.innerHTML = '';
    globalThis.document.body.className = '';
    if (!contentInnerEl.contains(viewListEl)) {
      contentInnerEl.appendChild(viewListEl);
    }
    globalThis.document.body.appendChild(contentInnerEl);
    globalThis.document.body.appendChild(artLightboxOverlayEl);
    viewListEl.innerHTML = '';
    viewListEl.className = '';
    viewGridEl.className = '';
    emptyStateEl.className = '';
    pageControlsEl.className = '';
    pageCountEl.className = '';
    albumCountEl.textContent = '';
    headerTooltipEl.textContent = '';
    artLightboxOverlayEl.className = 'hidden';
    artLightboxImageEl.removeAttribute('src');
    openEditModalMock.mockReset();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      albums: [],
      meta: {
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
    });
    stateMock.sort = { field: 'album', order: 'asc' };
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
    stateMock.complexStatuses = [];
    stateMock.view = 'list';
    stateMock.albumsLoaded = true;
    stateMock.albumsLoading = false;
    stateMock.albumsError = null;
    stateMock.albumListMeta = null;
    stateMock.albums = [
      {
        id: 1,
        album_name: 'Modal Soul',
        artists: [{ name: 'Nujabes' }],
        album_type: 'ALBUM',
        track_count: 20,
        notes: 'Gentle classic.',
        release_date: '2005-11-11',
        release_year: 2005,
        listened_at: '2026-04-15',
        duration_ms: 2520000,
        rating: 95,
      },
    ];
  });

  it('keeps the wide desktop layout and full main header labels', async () => {
    const { render } = await import('../public/js/render.js');

    render();

    const ratingLabel = viewListEl.querySelector('.row-rating-header .album-row-header-label')?.textContent;
    const headerLabels = [...viewListEl.querySelectorAll('.row-main-header .album-row-header-label')]
      .map(element => element.textContent);

    expect(viewListEl.classList.contains('list-layout-compact-main')).toBe(false);
    expect(viewListEl.classList.contains('hide-list-listened-column')).toBe(false);
    expect(viewListEl.classList.contains('hide-list-year-column')).toBe(false);
    expect(viewListEl.classList.contains('hide-list-notes-column')).toBe(false);
    expect(ratingLabel).toBe('Rating');
    expect(headerLabels).toEqual(['Album', 'Artist', 'Duration']);
  });

  it('switches the rating header to R and the main header to A/A/D before hiding columns', async () => {
    const { render } = await import('../public/js/render.js');

    viewListWidth = 780;
    render();

    const ratingLabel = viewListEl.querySelector('.row-rating-header .album-row-header-label')?.textContent;
    const headerLabels = [...viewListEl.querySelectorAll('.row-main-header .album-row-header-label')]
      .map(element => element.textContent);

    expect(viewListEl.classList.contains('list-layout-compact-main')).toBe(true);
    expect(viewListEl.classList.contains('hide-list-listened-column')).toBe(false);
    expect(viewListEl.classList.contains('hide-list-year-column')).toBe(false);
    expect(viewListEl.classList.contains('hide-list-notes-column')).toBe(false);
    expect(ratingLabel).toBe('R');
    expect(headerLabels).toEqual(['A', 'A', 'D']);
  });

  it('hides Listened before Year while keeping Notes visible', async () => {
    const { render } = await import('../public/js/render.js');

    viewListWidth = 680;
    render();

    expect(viewListEl.classList.contains('hide-list-listened-column')).toBe(true);
    expect(viewListEl.classList.contains('hide-list-year-column')).toBe(false);
    expect(viewListEl.classList.contains('hide-list-notes-column')).toBe(false);
  });

  it('uses the desktop-mobile layout before hiding Notes', async () => {
    const { render } = await import('../public/js/render.js');

    viewListWidth = 600;
    render();

    const ratingLabel = viewListEl.querySelector('.row-rating-header .album-row-header-label')?.textContent;

    expect(viewListEl.classList.contains('list-layout-desktop-mobile')).toBe(true);
    expect(viewListEl.classList.contains('hide-list-listened-column')).toBe(true);
    expect(viewListEl.classList.contains('hide-list-year-column')).toBe(true);
    expect(viewListEl.classList.contains('hide-list-notes-column')).toBe(false);
    expect(ratingLabel).toBe('R');
    expect(globalThis.document.body.classList.contains('list-layout-last-two-stages')).toBe(true);
  });

  it('keeps Year hidden once that stage is entered instead of re-showing on the next render', async () => {
    const { render } = await import('../public/js/render.js');

    viewListWidth = 600;
    render();
    expect(viewListEl.classList.contains('hide-list-year-column')).toBe(true);

    render();
    expect(viewListEl.classList.contains('hide-list-year-column')).toBe(true);
  });

  it('hides Notes only in phone layout and keeps Duration in the main stack', async () => {
    const { render } = await import('../public/js/render.js');

    viewListWidth = 500;
    render();

    expect(viewListEl.classList.contains('list-layout-phone')).toBe(true);
    expect(viewListEl.classList.contains('hide-list-notes-column')).toBe(true);
    expect(globalThis.document.body.classList.contains('list-layout-final-stage')).toBe(true);
    expect(globalThis.document.body.classList.contains('list-layout-last-two-stages')).toBe(true);
    expect(viewListEl.querySelector('.row-duration')?.textContent).toBe('42:00');
  });

  it('attaches the album type and track count tooltip to the duration cell', async () => {
    const { render } = await import('../public/js/render.js');

    render();

    const durationEl = viewListEl.querySelector('.row-duration');

    expect(durationEl?.dataset.tooltip).toBe('Album・20 tracks');
    expect(durationEl?.dataset.tooltipSide).toBe('right');
    expect(durationEl?.dataset.tooltipDelay).toBe('0');
    expect(durationEl?.dataset.tooltipGap).toBe('4');
  });

  it('uses note-length sort when clicking the Notes header', async () => {
    const { render } = await import('../public/js/render.js');

    stateMock.sort = { field: 'album', order: 'asc' };
    render();

    const notesHeader = viewListEl.querySelector('.row-notes-header .album-row-header-sortable');
    notesHeader?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(stateMock.sort.field).toBe('notes_length');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('attaches the release date tooltip above the list year cell', async () => {
    const { render } = await import('../public/js/render.js');

    render();

    const yearEl = viewListEl.querySelector('.row-year .release-date-tooltip-target');

    expect(yearEl?.dataset.tooltip).toBe('2005-11-11');
    expect(yearEl?.dataset.tooltipSide).toBeUndefined();
    expect(yearEl?.dataset.tooltipDelay).toBe('0');
    expect(yearEl?.dataset.tooltipGap).toBe('4');
  });

  it('attaches the release date tooltip above the grid year cell', async () => {
    const { render } = await import('../public/js/render.js');

    render();

    const yearEl = viewGridEl.querySelector('.card-year .release-date-tooltip-target');

    expect(yearEl?.dataset.tooltip).toBe('2005-11-11');
    expect(yearEl?.dataset.tooltipSide).toBeUndefined();
    expect(yearEl?.dataset.tooltipDelay).toBe('0');
    expect(yearEl?.dataset.tooltipGap).toBe('4');
  });

  it('does not open the album modal when clicking a note link in list view', async () => {
    const { render } = await import('../public/js/render.js');

    stateMock.albums = [
      {
        id: 1,
        album_name: 'Modal Soul',
        artists: [{ name: 'Nujabes' }],
        album_type: 'ALBUM',
        track_count: 20,
        notes: '<a href="https://example.com">Example</a>',
        release_year: 2005,
        listened_at: '2026-04-15',
        duration_ms: 2520000,
        rating: 95,
      },
    ];

    render();

    const noteLink = viewListEl.querySelector('.row-notes a');
    noteLink?.addEventListener('click', event => event.preventDefault(), { once: true });
    noteLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(openEditModalMock).not.toHaveBeenCalled();
  });

  it('opens list rows and grid cards with Enter and Space', async () => {
    const { render } = await import('../public/js/render.js');

    render();

    const row = viewListEl.querySelector('.album-row:not(.album-row-header)');
    expect(row?.getAttribute('role')).toBe('button');
    expect(row?.tabIndex).toBe(0);
    expect(row?.getAttribute('aria-label')).toBe('Edit Modal Soul by Nujabes');

    row?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }));
    expect(openEditModalMock).toHaveBeenLastCalledWith(1);

    openEditModalMock.mockClear();
    const card = viewGridEl.querySelector('.album-card');
    expect(card?.getAttribute('role')).toBe('button');
    expect(card?.tabIndex).toBe(0);

    card?.dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    }));
    expect(openEditModalMock).toHaveBeenLastCalledWith(1);
  });

  it('returns focus to the list art button after keyboard-opening the art preview', async () => {
    const { closeArtLightbox, render } = await import('../public/js/render.js');

    stateMock.listArtClickToEnlarge = true;
    stateMock.albums = [
      {
        id: 1,
        album_name: 'Modal Soul',
        artists: [{ name: 'Nujabes' }],
        image_path: 'images/modal-soul.jpg',
        album_type: 'ALBUM',
        track_count: 20,
        notes: '',
        release_year: 2005,
        listened_at: '2026-04-15',
        duration_ms: 2520000,
        rating: 95,
      },
    ];

    render();

    const artButton = viewListEl.querySelector('.row-art-wrap');
    expect(artButton?.getAttribute('role')).toBe('button');

    artButton.focus();
    artButton.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }));

    closeArtLightbox();

    expect(document.activeElement).toBe(artButton);
  });

  it('does not open the album modal when keyboard events start inside a note link', async () => {
    const { render } = await import('../public/js/render.js');

    stateMock.albums = [
      {
        id: 1,
        album_name: 'Modal Soul',
        artists: [{ name: 'Nujabes' }],
        album_type: 'ALBUM',
        track_count: 20,
        notes: '<a href="https://example.com">Example</a>',
        release_year: 2005,
        listened_at: '2026-04-15',
        duration_ms: 2520000,
        rating: 95,
      },
    ];

    render();

    viewListEl.querySelector('.row-notes a')?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }));

    expect(openEditModalMock).not.toHaveBeenCalled();
  });

  it('uses distinct empty-library, filtered-empty, and load-error messages', async () => {
    const { render } = await import('../public/js/render.js');
    emptyStateEl.innerHTML = '<p></p>';

    stateMock.albums = [];
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
    render();
    expect(emptyStateEl.querySelector('p')?.textContent).toBe('No albums logged yet.');

    stateMock.albumListMeta = {
      ...stateMock.albumListMeta,
      totalCount: 4,
      filteredCount: 0,
    };
    render();
    expect(emptyStateEl.querySelector('p')?.textContent).toBe('No albums match your filters.');

    stateMock.view = 'grid';
    stateMock.albumsError = 'Network down.';
    stateMock.albumListMeta = {
      ...stateMock.albumListMeta,
      filteredCount: 4,
    };
    render();

    expect(emptyStateEl.querySelector('p')?.textContent).toBe('Failed to load albums. Network down.');
    expect(emptyStateEl.classList.contains('hidden')).toBe(false);
    expect(viewGridEl.classList.contains('hidden')).toBe(true);
  });

  it('restores the wider desktop layout when the list grows again', async () => {
    const { render } = await import('../public/js/render.js');

    viewListWidth = 500;
    render();

    viewListWidth = 950;
    render();

    const ratingLabel = viewListEl.querySelector('.row-rating-header .album-row-header-label')?.textContent;
    const headerLabels = [...viewListEl.querySelectorAll('.row-main-header .album-row-header-label')]
      .map(element => element.textContent);

    expect(viewListEl.classList.contains('list-layout-compact-main')).toBe(false);
    expect(viewListEl.classList.contains('hide-list-listened-column')).toBe(false);
    expect(viewListEl.classList.contains('hide-list-year-column')).toBe(false);
    expect(viewListEl.classList.contains('hide-list-notes-column')).toBe(false);
    expect(globalThis.document.body.classList.contains('list-layout-final-stage')).toBe(false);
    expect(globalThis.document.body.classList.contains('list-layout-last-two-stages')).toBe(false);
    expect(ratingLabel).toBe('Rating');
    expect(headerLabels).toEqual(['Album', 'Artist', 'Duration']);
  });

  it('applies the startup-only staggered slide-in animation to grid cards when starting on grid view', async () => {
    vi.useFakeTimers();
    stateMock.view = 'grid';
    stateMock.albums = [
      {
        id: 1,
        album_name: 'Grid One',
        artists: [{ name: 'Artist One' }],
        notes: '',
        release_year: 2001,
        listened_at: '2026-04-15',
        duration_ms: 2520000,
        rating: 95,
      },
      {
        id: 2,
        album_name: 'Grid Two',
        artists: [{ name: 'Artist Two' }],
        notes: '',
        release_year: 2002,
        listened_at: '2026-04-15',
        duration_ms: 2520000,
        rating: 90,
      },
      {
        id: 3,
        album_name: 'Grid Three',
        artists: [{ name: 'Artist Three' }],
        notes: '',
        release_year: 2003,
        listened_at: '2026-04-15',
        duration_ms: 2520000,
        rating: 85,
      },
      {
        id: 4,
        album_name: 'Grid Four',
        artists: [{ name: 'Artist Four' }],
        notes: '',
        release_year: 2004,
        listened_at: '2026-04-15',
        duration_ms: 2520000,
        rating: 80,
      },
    ];

    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const originalGetComputedStyle = globalThis.window.getComputedStyle.bind(globalThis.window);
    Element.prototype.getBoundingClientRect = function getBoundingClientRectMock() {
      if (this.classList?.contains('album-card')) {
        const id = Number(this.dataset.id);
        const row = id >= 3 ? 1 : 0;
        return {
          left: row === 0 ? (id === 1 ? 0 : 220) : (id === 3 ? 0 : 220),
          top: row === 0 ? 0 : 280,
          width: 200,
          height: 260,
          right: 200,
          bottom: row === 0 ? 260 : 540,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };
    globalThis.window.getComputedStyle = vi.fn(element => {
      if (element.classList?.contains('slide-in')) {
        return {
          animationName: 'row-slide-in-move, row-fade-in',
          animationDuration: '1.25s, 0.5s',
          animationDelay: element.style.animationDelay || '0ms',
        };
      }
      return originalGetComputedStyle(element);
    });

    const { render } = await import('../public/js/render.js');
    render();

    const cards = Array.from(viewGridEl.querySelectorAll('.album-card'));
    expect(cards).toHaveLength(4);
    expect(cards.map(card => card.classList.contains('slide-in'))).toEqual([true, true, true, true]);
    expect(cards.map(card => card.style.animationDelay)).toEqual(['0ms', '0ms', '150ms', '150ms']);
    expect(viewListEl.querySelectorAll('.album-row.slide-in')).toHaveLength(0);

    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    globalThis.window.getComputedStyle = originalGetComputedStyle;
    vi.useRealTimers();
  });

  it('preserves startup animation until albums exist instead of consuming it on an empty first render', async () => {
    vi.useFakeTimers();
    stateMock.view = 'list';
    stateMock.albums = [];

    const originalGetComputedStyle = globalThis.window.getComputedStyle.bind(globalThis.window);
    globalThis.window.getComputedStyle = vi.fn(element => {
      if (element.classList?.contains('slide-in') || element.classList?.contains('fade-in')) {
        return {
          animationName: element.classList.contains('fade-in') ? 'row-fade-in' : 'row-slide-in-move, row-fade-in',
          animationDuration: element.classList.contains('fade-in') ? '1.25s' : '1.25s, 0.5s',
          animationDelay: element.style.animationDelay || '0ms',
        };
      }
      return originalGetComputedStyle(element);
    });

    const { render } = await import('../public/js/render.js');

    render();
    expect(viewListEl.querySelectorAll('.slide-in')).toHaveLength(0);

    stateMock.albums = [
      {
        id: 1,
        album_name: 'Animated Later',
        artists: [{ name: 'Artist One' }],
        album_type: 'ALBUM',
        track_count: 10,
        notes: '',
        release_year: 2005,
        listened_at: '2026-04-15',
        duration_ms: 2520000,
        rating: 95,
      },
    ];

    render();

    expect(viewListEl.querySelector('.album-row.slide-in')).not.toBeNull();
    expect(viewListEl.querySelector('.album-row-header.fade-in')).not.toBeNull();

    globalThis.window.getComputedStyle = originalGetComputedStyle;
    vi.useRealTimers();
  });
});
