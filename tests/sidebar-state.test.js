import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  navigation: {
    page: 'collection',
    collectionView: 'grid',
  },
  view: 'grid',
  reserveSidebarSpace: false,
  filters: {
    ratedFilter: 'both',
  },
  sort: {
    field: 'date_listened_planned',
    order: 'desc',
  },
  uButtons: [],
  complexStatuses: [],
  pagination: {
    currentPage: 1,
  },
};

const elMock = {
  viewGrid: null,
  btnViewList: null,
  btnViewGrid: null,
  btnStats: null,
  btnWrapped: null,
  sortFieldBtn: null,
  sortFieldDropdown: null,
  sortOrder: null,
  uBtnSortOrder: null,
  filterRatedBtn: null,
  filterStatusBtn: null,
  filterStatusDropdown: null,
  filterImportTypeBtn: null,
  filterImportTypeDropdown: null,
  filterTypeBtn: null,
  filterTypeDropdown: null,
  btnRestoreFilters: null,
  uBtnRestoreFilters: null,
};

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
  apiFetch: vi.fn(),
  STATUS_LABELS: {},
  STATUS_FILTER_LABELS: {},
  IMPORT_TYPE_FILTER_LABELS: {},
  TYPE_FILTER_KEYS: [],
  TYPE_FILTER_LABELS: {},
  SORT_FIELD_LABELS: {
    date_listened_planned: 'Date logged',
  },
  normalizeSortState: sort => ({
    field: sort?.field === 'year' ? 'release_date' : (sort?.field ?? 'date_listened_planned'),
    order: sort?.order === 'asc' ? 'asc' : 'desc',
  }),
  SORT_SVG_UP: 'up',
  SORT_SVG_DOWN: 'down',
  RATED_FILTER_ICONS: {
    both: '<svg></svg>',
  },
  LS_COMPLEX_STATUSES: 'ts_complexStatuses',
  LS_U_BUTTONS: 'ts_uButtons',
  LS_U_BUTTONS_ENABLED_LIST: 'ts_uButtonsEnabledList',
  LS_U_BUTTONS_ENABLED_GRID: 'ts_uButtonsEnabledGrid',
  LS_SIDEBAR_COLLAPSED_LIST: 'ts_sidebarCollapsedList',
  LS_SIDEBAR_COLLAPSED_GRID: 'ts_sidebarCollapsedGrid',
  LS_DEBUG_CONTROLS: 'ts_debugControls',
  FILTER_PRESET_KEY: 'ts_filterPreset',
  DEFAULT_COMPLEX_STATUSES: [],
  U_BUTTON_DEFS: [],
}));

vi.mock('../public/js/filter-utils.js', () => ({
  applyAlbumFilters: albums => albums,
}));

const renderMock = vi.fn();
const loadAlbumsMock = vi.fn();
const resetPaginationMock = vi.fn();

vi.mock('../public/js/render.js', () => ({
  render: renderMock,
  loadAlbums: loadAlbumsMock,
  resetPagination: resetPaginationMock,
}));

vi.mock('../public/js/modal.js', () => ({
  openEditModal: vi.fn(),
}));

vi.mock('../public/js/sidebar-layout.js', () => ({
  shouldAnimateGridSidebarToggle: vi.fn(() => true),
}));

vi.mock('../public/js/view-switch.js', () => ({
  shouldHideSidebarImmediatelyOnViewSwitch: vi.fn(() => false),
}));

const syncAppShellLayoutMock = vi.fn();

vi.mock('../public/js/app-shell.js', () => ({
  syncAppShellLayout: syncAppShellLayoutMock,
}));

const setUButtonsMock = vi.fn();

vi.mock('../public/js/settings.js', () => ({
  openSettings: vi.fn(),
  closeSettings: vi.fn(),
  openPersonalization: vi.fn(),
  closePersonalization: vi.fn(),
  generateCsv: vi.fn(),
  downloadFullBackup: vi.fn(),
  downloadDbBackup: vi.fn(),
  downloadEssentialBackup: vi.fn(),
  mergeBackup: vi.fn(),
  restoreBackup: vi.fn(),
  handleBulkRefetchArt: vi.fn(),
  setDebugMode: vi.fn(),
  resetAllSettings: vi.fn(),
  setUButtons: setUButtonsMock,
}));

describe('sidebar animation state cleanup', () => {
  beforeEach(() => {
    vi.resetModules();
    renderMock.mockReset();
    loadAlbumsMock.mockReset();
    resetPaginationMock.mockReset();
    syncAppShellLayoutMock.mockReset();
    setUButtonsMock.mockReset();

    localStorage.clear();
    globalThis.document.body.className = 'view-grid';
    globalThis.document.body.innerHTML = `
      <button id="btn-view-list"></button>
      <button id="btn-view-grid"></button>
      <button id="btn-stats" class="active"></button>
      <button id="btn-wrapped"></button>
      <button id="sort-order"></button>
      <button id="u-btn-sort-order"></button>
      <button id="filter-rated-btn"></button>
      <button id="filter-status-btn"></button>
      <div id="filter-status-dropdown"></div>
      <button id="filter-import-type-btn"></button>
      <div id="filter-import-type-dropdown"></div>
      <button id="filter-type-btn"></button>
      <div id="filter-type-dropdown"></div>
      <button id="btn-restore-filters"></button>
      <button id="u-btn-restore-filters"></button>
      <button id="sort-field-btn"></button>
      <div id="sort-field-dropdown"></div>
      <aside class="sidebar"></aside>
      <div class="content"></div>
      <div id="view-grid"></div>
    `;

    stateMock.view = 'grid';
    stateMock.navigation.page = 'collection';
    stateMock.navigation.collectionView = 'grid';
    stateMock.reserveSidebarSpace = false;

    elMock.btnViewList = globalThis.document.getElementById('btn-view-list');
    elMock.btnViewGrid = globalThis.document.getElementById('btn-view-grid');
    elMock.btnStats = globalThis.document.getElementById('btn-stats');
    elMock.btnWrapped = globalThis.document.getElementById('btn-wrapped');
    elMock.sortOrder = globalThis.document.getElementById('sort-order');
    elMock.uBtnSortOrder = globalThis.document.getElementById('u-btn-sort-order');
    elMock.filterRatedBtn = globalThis.document.getElementById('filter-rated-btn');
    elMock.filterStatusBtn = globalThis.document.getElementById('filter-status-btn');
    elMock.filterStatusDropdown = globalThis.document.getElementById('filter-status-dropdown');
    elMock.filterImportTypeBtn = globalThis.document.getElementById('filter-import-type-btn');
    elMock.filterImportTypeDropdown = globalThis.document.getElementById('filter-import-type-dropdown');
    elMock.filterTypeBtn = globalThis.document.getElementById('filter-type-btn');
    elMock.filterTypeDropdown = globalThis.document.getElementById('filter-type-dropdown');
    elMock.btnRestoreFilters = globalThis.document.getElementById('btn-restore-filters');
    elMock.uBtnRestoreFilters = globalThis.document.getElementById('u-btn-restore-filters');
    elMock.sortFieldBtn = globalThis.document.getElementById('sort-field-btn');
    elMock.sortFieldDropdown = globalThis.document.getElementById('sort-field-dropdown');
    elMock.viewGrid = globalThis.document.getElementById('view-grid');

    globalThis.document.querySelector('.sidebar').getAnimations = () => [];

    const card = globalThis.document.createElement('div');
    card.className = 'album-card';
    card.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 160,
      height: 220,
      right: 160,
      bottom: 220,
    });
    card.getAnimations = () => [];
    card.animate = vi.fn(() => ({ cancel: vi.fn() }));
    elMock.viewGrid.appendChild(card);

    Object.defineProperty(elMock.viewGrid, 'offsetWidth', {
      configurable: true,
      value: 320,
    });
  });

  it('cancels the finished grid sidebar animation so it cannot leave a stale hidden transform behind', async () => {
    const sidebar = globalThis.document.querySelector('.sidebar');
    let resolveFinished;
    const cancel = vi.fn();

    sidebar.getAnimations = () => [];
    sidebar.animate = vi.fn(() => ({
      cancel,
      finished: new Promise(resolve => {
        resolveFinished = resolve;
      }),
    }));

    const { animateGridSidebarToggle } = await import('../public/js/sidebar.js');

    animateGridSidebarToggle();
    resolveFinished();
    await Promise.resolve();

    expect(cancel).toHaveBeenCalled();
    expect(sidebar.style.transition).toBe('');
  });

  it('cancels any in-flight grid sidebar animation before switching back to list view', async () => {
    const sidebar = globalThis.document.querySelector('.sidebar');
    const cancel = vi.fn();

    sidebar.getAnimations = () => [];
    sidebar.animate = vi.fn(() => ({
      cancel,
      finished: new Promise(() => {}),
    }));

    localStorage.setItem('ts_sidebarCollapsedList', '0');

    const { animateGridSidebarToggle, setView } = await import('../public/js/sidebar.js');

    animateGridSidebarToggle();
    setView('list');

    expect(cancel).toHaveBeenCalled();
    expect(stateMock.view).toBe('list');
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(false);
  });

  it('clears startup-hidden visibility when collection view state is applied after a dashboard refresh', async () => {
    const sidebar = globalThis.document.querySelector('.sidebar');
    sidebar.classList.add('startup-hidden');
    sidebar.style.visibility = 'hidden';
    sidebar.getAnimations = () => [];

    const { applyCollectionViewState } = await import('../public/js/sidebar.js');

    applyCollectionViewState('list', { load: false, suppressTransitions: true });

    expect(sidebar.classList.contains('startup-hidden')).toBe(false);
    expect(sidebar.style.visibility).toBe('');
  });

  it('syncs top-bar collection view highlights when applying collection view state directly', async () => {
    elMock.btnViewGrid.classList.add('active');

    const { applyCollectionViewState } = await import('../public/js/sidebar.js');

    applyCollectionViewState('list', { load: false, suppressTransitions: true });

    expect(elMock.btnViewList.classList.contains('active')).toBe(true);
    expect(elMock.btnViewGrid.classList.contains('active')).toBe(false);
    expect(elMock.btnStats.classList.contains('active')).toBe(false);

    applyCollectionViewState('grid', { load: false, suppressTransitions: true });

    expect(elMock.btnViewList.classList.contains('active')).toBe(false);
    expect(elMock.btnViewGrid.classList.contains('active')).toBe(true);
  });
});
