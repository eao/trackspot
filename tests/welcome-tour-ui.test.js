import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  albums: [],
  albumDetailsCache: {},
  albumListMeta: {},
  albumsLoaded: false,
  albumsLoading: false,
  complexStatuses: [{ id: 'cs_all', name: 'All', statuses: [] }],
  filters: {},
  sort: {},
  navigation: {
    page: 'collection',
    collectionView: 'list',
    wrappedYear: null,
  },
  view: 'list',
  earlyWrapped: true,
  quickActionsToolbarVisibilityMode: 'visible',
  welcomeTour: {
    active: false,
    replay: false,
    lockSessionId: null,
    sampleCount: 0,
  },
};

const apiFetchMock = vi.fn(async url => {
  if (url === '/api/welcome-tour/status') {
    return {
      preferences: {},
      sampleCount: 0,
      shouldAutoStart: false,
    };
  }
  if (url === '/api/welcome-tour/lock') {
    return { sessionId: 'tour-session' };
  }
  return {};
});

const renderMock = vi.fn();
const setPageMock = vi.fn(async page => {
  stateMock.navigation.page = page;
  stateMock.view = stateMock.navigation.collectionView;
});
const setUButtonsMock = vi.fn();
const applyCollectionViewStateMock = vi.fn(view => {
  stateMock.navigation.page = 'collection';
  stateMock.navigation.collectionView = view;
  stateMock.view = view;
  if (view === 'grid') {
    setUButtonsMock(true);
  }
});

vi.mock('../public/js/state.js', () => ({
  apiFetch: apiFetchMock,
  state: stateMock,
  DEFAULT_COMPLEX_STATUSES: [{ id: 'cs_all', name: 'All', statuses: [] }],
}));

vi.mock('../public/js/render.js', () => ({
  render: renderMock,
  loadAlbums: vi.fn(),
}));

vi.mock('../public/js/navigation.js', () => ({
  setPage: setPageMock,
}));

vi.mock('../public/js/sidebar.js', () => ({
  applyCollectionViewState: applyCollectionViewStateMock,
  syncFilterControlsFromState: vi.fn(),
  updateImportTypeFilterBtn: vi.fn(),
  updateRatedFilterBtn: vi.fn(),
  updateRestoreBtn: vi.fn(),
  updateSortFieldBtn: vi.fn(),
  updateSortOrderBtn: vi.fn(),
  updateStatusFilterBtn: vi.fn(),
  updateTypeFilterBtn: vi.fn(),
}));

vi.mock('../public/js/modal.js', () => ({
  openLogModal: vi.fn(),
  closeModal: vi.fn(),
}));

vi.mock('../public/js/settings.js', () => ({
  applyThemeByName: vi.fn(),
  closePersonalization: vi.fn(),
  closeSettings: vi.fn(),
  openPersonalization: vi.fn(),
  openSettings: vi.fn(),
  refreshWelcomeTourSettings: vi.fn(async () => ({})),
  restorePersonalizationFromStorage: vi.fn(async () => {}),
  setEarlyWrappedEnabled: vi.fn(),
  setQuickActionsToolbarVisibilityMode: vi.fn(),
  setUButtons: setUButtonsMock,
}));

vi.mock('../public/js/preferences.js', () => ({
  applyPreferencesToState: vi.fn(),
}));

vi.mock('../public/js/dashboard.js', () => ({
  invalidateDashboardCache: vi.fn(),
}));

async function flushTourStep() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('welcome tour UI preparation', () => {
  beforeEach(() => {
    vi.resetModules();
    apiFetchMock.mockClear();
    renderMock.mockClear();
    setPageMock.mockClear();
    setUButtonsMock.mockClear();
    applyCollectionViewStateMock.mockClear();
    localStorage.clear();
    globalThis.document.body.className = '';
    globalThis.document.body.innerHTML = `
      <button id="btn-view-list"></button>
      <button id="btn-view-grid"></button>
      <div id="u-buttons"></div>
    `;
    window.innerWidth = 1024;
    stateMock.albums = [];
    stateMock.albumDetailsCache = {};
    stateMock.albumListMeta = {};
    stateMock.albumsLoaded = false;
    stateMock.albumsLoading = false;
    stateMock.navigation = {
      page: 'collection',
      collectionView: 'list',
      wrappedYear: null,
    };
    stateMock.view = 'list';
    stateMock.welcomeTour = {
      active: false,
      replay: false,
      lockSessionId: null,
      sampleCount: 0,
    };
  });

  it('keeps quick actions disabled while preparing the grid-view step', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 7; i += 1) {
      globalThis.document.querySelector('[data-action="next"]')?.click();
      await flushTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Grid View');
    expect(applyCollectionViewStateMock).toHaveBeenLastCalledWith('grid', expect.objectContaining({
      load: false,
      suppressTransitions: true,
      preservePage: true,
    }));
    expect(setUButtonsMock).toHaveBeenLastCalledWith(false);
  });
});
