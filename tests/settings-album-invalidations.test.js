import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  albums: [],
  albumsLoaded: false,
  albumsLoading: false,
  albumDetailsCache: {},
  albumListMeta: {},
  csvImport: {
    job: null,
    isStarting: false,
  },
  welcomeTour: {
    sampleCount: 0,
  },
};

function makeElement(tagName = 'div') {
  return globalThis.document.createElement(tagName);
}

const elMock = {
  settingsStatus: makeElement('div'),
  csvImportProgress: makeElement('div'),
  csvImportHeading: makeElement('div'),
  csvImportMeta: makeElement('div'),
  csvImportCounts: makeElement('div'),
  btnImportCsv: makeElement('button'),
  btnCancelImportCsv: makeElement('button'),
  btnOpenImportReport: makeElement('button'),
  btnCloseImportCsv: makeElement('button'),
  csvImportFileName: makeElement('span'),
  btnMergeBackup: makeElement('button'),
  btnRestoreBackup: makeElement('button'),
  welcomeSamplesRow: makeElement('div'),
  btnRemoveWelcomeSamples: makeElement('button'),
};

const apiFetchMock = vi.fn();
const loadAlbumsMock = vi.fn(async () => true);
const renderMock = vi.fn();
const invalidateDashboardCacheMock = vi.fn();

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
  apiFetch: apiFetchMock,
  LS_PREFIX: 'ts_',
  LS_HEADER_SCROLL: 'ts_headerScroll',
  LS_SHOW_WIPE_DB: 'ts_showWipeDb',
  LS_SHOW_REPEATS_FIELD: 'ts_showRepeatsField',
  LS_SHOW_PRIORITY_FIELD: 'ts_showPriorityField',
  LS_SHOW_REFETCH_ART: 'ts_showRefetchArt',
  LS_SHOW_PLANNED_AT_FIELD: 'ts_showPlannedAtField',
  LS_LIST_ART_ENLARGE: 'ts_listArtEnlarge',
  LS_RESERVE_SIDEBAR_SPACE: 'ts_reserveSidebarSpace',
  LS_GRINCH_MODE: 'ts_grinchMode',
  LS_CONTENT_WIDTH: 'ts_contentWidth',
  LS_PAGE_SIZE_LIST: 'ts_pageSizeList',
  LS_PAGE_SIZE_GRID: 'ts_pageSizeGrid',
  LS_PAGE_MODE_LIST: 'ts_pageModeList',
  LS_PAGE_MODE_GRID: 'ts_pageModeGrid',
  LS_SHOW_FIRST_LAST_PAGES: 'ts_showFirstLastPages',
  LS_PAGE_CONTROL_VISIBILITY: 'ts_pageControlVisibility',
  LS_SHOW_PAGE_COUNT: 'ts_showPageCount',
  LS_QUICK_ACTIONS_VISIBILITY: 'ts_quickActionsVisibility',
  LS_U_BUTTONS_ENABLED_LIST: 'ts_uButtonsEnabledList',
  LS_U_BUTTONS_ENABLED_GRID: 'ts_uButtonsEnabledGrid',
  LS_PERSONALIZATION_OPACITY: 'ts_personalizationOpacity',
  LS_COLOR_SCHEME_PRESET: 'ts_colorSchemePreset',
  LS_CUSTOM_THEME_CSS: 'ts_customThemeCss',
  LS_CUSTOM_THEME_CSS_NAME: 'ts_customThemeCssName',
  LS_BACKGROUND_IMAGE_SELECTION: 'ts_backgroundImageSelection',
  LS_BACKGROUND_IMAGE_DISPLAY: 'ts_backgroundImageDisplay',
  LS_SECONDARY_BACKGROUND_IMAGE_SELECTION: 'ts_secondaryBackgroundImageSelection',
  LS_SECONDARY_BACKGROUND_IMAGE_DISPLAY: 'ts_secondaryBackgroundImageDisplay',
  LS_OPACITY_CONTROLS_EXPANDED: 'ts_opacityControlsExpanded',
  LS_APPLIED_THEME_ID: 'ts_appliedThemeId',
  DEFAULT_COMPLEX_STATUSES: [],
  DEFAULT_PERSONALIZATION_OPACITY: {},
  DEFAULT_PERSONALIZATION_BACKGROUND_DISPLAY: {},
  DEFAULT_SECONDARY_PERSONALIZATION_BACKGROUND_DISPLAY: {},
  DEFAULT_OPACITY_PRESETS: [],
  DEFAULT_COLOR_SCHEME_PRESET_ID: 'default',
  COLOR_SCHEME_PRESETS: [],
  PAGE_SUGGESTED: { list: 18, grid: 18 },
}));

vi.mock('../public/js/render.js', () => ({
  render: renderMock,
  loadAlbums: loadAlbumsMock,
  resetPagination: vi.fn(),
  openArtLightbox: vi.fn(),
}));

vi.mock('../public/js/utils.js', () => ({
  escHtml: value => String(value ?? ''),
}));

vi.mock('../public/js/image-ready.js', () => ({
  waitForImageReady: vi.fn(async () => true),
}));

vi.mock('../public/js/preferences.js', () => ({
  applyPreferencesToState: vi.fn(),
  patchPreferences: vi.fn(async () => ({})),
}));

vi.mock('../public/js/wrapped-name.js', () => ({
  setWrappedName: vi.fn(),
}));

vi.mock('../public/js/header-title.js', () => ({
  syncHeaderTitleText: vi.fn(),
}));

vi.mock('../public/js/layout-width.js', () => ({
  DEFAULT_CONTENT_WIDTH_PX: 1000,
  parseStoredContentWidthPx: vi.fn(() => 1000),
  validateContentWidthPx: vi.fn(value => ({ ok: true, value })),
}));

vi.mock('../public/js/header-scroll.js', () => ({
  syncHeaderScrollBaseline: vi.fn(),
}));

vi.mock('../public/js/app-shell.js', () => ({
  syncAppShellLayout: vi.fn(),
}));

vi.mock('../public/js/sidebar.js', () => ({
  saveComplexStatuses: vi.fn(),
  renderComplexStatusList: vi.fn(),
  renderStatusDropdown: vi.fn(),
  updateRestoreBtn: vi.fn(),
  applyFilterState: vi.fn(),
  renderUButtonBar: vi.fn(),
  renderUButtonList: vi.fn(),
  loadUButtons: vi.fn(() => []),
  getDefaultFilterPreset: vi.fn(() => ({
    filters: { statusFilter: 'cs_listened' },
    sort: { field: 'date_listened_planned', order: 'desc' },
  })),
  saveDefaultFilterPreset: vi.fn(),
}));

vi.mock('../public/js/dashboard.js', () => ({
  invalidateDashboardCache: invalidateDashboardCacheMock,
}));

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function resetElement(element) {
  element.textContent = '';
  element.className = '';
  element.disabled = false;
  element.style.color = '';
}

function resetState() {
  stateMock.albums = [{ id: 1, album_name: 'Cached' }];
  stateMock.albumsLoaded = false;
  stateMock.albumsLoading = true;
  stateMock.albumDetailsCache = {
    1: { id: 1, album_name: 'Cached' },
  };
  stateMock.albumListMeta = {
    totalCount: 1,
    filteredCount: 1,
    currentPage: 1,
    totalPages: 1,
    startIndex: 0,
    endIndex: 1,
    isPaged: false,
    perPage: null,
    pageCount: 1,
    trackedListenedMs: 1000,
  };
  stateMock.csvImport = {
    job: null,
    isStarting: false,
  };
  stateMock.welcomeTour = {
    sampleCount: 2,
  };
}

function mockBackupFilePicker() {
  const createdInputs = [];
  const originalCreateElement = document.createElement.bind(document);
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(tagName => {
    const element = originalCreateElement(tagName);
    if (String(tagName).toLowerCase() === 'input') {
      createdInputs.push(element);
    }
    return element;
  });

  return {
    createElementSpy,
    async pickFile() {
      const input = createdInputs.at(-1);
      expect(input).toBeTruthy();
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File(['backup'], 'backup.zip', { type: 'application/zip' })],
      });
      input.dispatchEvent(new Event('change'));
      await flushAsyncWork();
    },
  };
}

describe('settings album mutation invalidation', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    resetState();
    apiFetchMock.mockReset();
    loadAlbumsMock.mockReset();
    loadAlbumsMock.mockResolvedValue(true);
    renderMock.mockReset();
    invalidateDashboardCacheMock.mockReset();
    globalThis.fetch = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => true));
    Object.values(elMock).forEach(resetElement);
  });

  it('refreshes album state when an active CSV import becomes terminal with imported rows', async () => {
    stateMock.csvImport.job = { id: 10, status: 'processing', imported_rows: 1 };
    apiFetchMock.mockResolvedValue({
      job: {
        id: 10,
        status: 'completed',
        imported_rows: 3,
        total_rows: 3,
        skipped_rows: 0,
        failed_rows: 0,
        warning_rows: 0,
        remaining_rows: 0,
        default_status: 'completed',
        filename: 'albums.csv',
      },
    });

    const { refreshCsvImportJob } = await import('../public/js/settings.js');
    await refreshCsvImportJob();

    expect(invalidateDashboardCacheMock).toHaveBeenCalledOnce();
    expect(stateMock.albumDetailsCache).toEqual({});
    expect(loadAlbumsMock).toHaveBeenCalledWith({ preservePage: true });
  });

  it('clears album-derived state after removing welcome samples', async () => {
    apiFetchMock.mockResolvedValue({
      removedCount: 2,
      status: { sampleCount: 0 },
    });

    const { removeWelcomeSampleAlbums } = await import('../public/js/settings.js');
    await removeWelcomeSampleAlbums();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/welcome-tour/samples', { method: 'DELETE' });
    expect(invalidateDashboardCacheMock).toHaveBeenCalledOnce();
    expect(stateMock.albumDetailsCache).toEqual({});
    expect(loadAlbumsMock).toHaveBeenCalledWith({ preservePage: true });
  });

  it('does not invalidate album state when welcome sample removal is locked', async () => {
    apiFetchMock.mockRejectedValue({
      status: 423,
      message: 'Finish or leave the Trackspot welcome tour before changing welcome samples.',
      data: { code: 'welcome_tour_active' },
    });

    const { removeWelcomeSampleAlbums } = await import('../public/js/settings.js');
    await removeWelcomeSampleAlbums();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/welcome-tour/samples', { method: 'DELETE' });
    expect(elMock.settingsStatus.textContent).toBe('Finish or leave the Trackspot welcome tour before changing welcome samples.');
    expect(invalidateDashboardCacheMock).not.toHaveBeenCalled();
    expect(stateMock.albumDetailsCache).toEqual({
      1: { id: 1, album_name: 'Cached' },
    });
    expect(loadAlbumsMock).not.toHaveBeenCalled();
  });

  it('invalidates album-derived state after a successful backup merge', async () => {
    const picker = mockBackupFilePicker();
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ added: 2, skipped: 1 }),
    });

    const { mergeBackup } = await import('../public/js/settings.js');
    await mergeBackup();
    await picker.pickFile();
    picker.createElementSpy.mockRestore();

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/backup/merge', expect.objectContaining({ method: 'POST' }));
    expect(invalidateDashboardCacheMock).toHaveBeenCalledOnce();
    expect(stateMock.albumDetailsCache).toEqual({});
    expect(loadAlbumsMock).toHaveBeenCalledOnce();
  });

  it('invalidates album-derived state after restore without restored app state', async () => {
    const picker = mockBackupFilePicker();
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ added: 4, appStateRestored: false }),
    });

    const { restoreBackup } = await import('../public/js/settings.js');
    await restoreBackup();
    await picker.pickFile();
    picker.createElementSpy.mockRestore();

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/backup/restore', expect.objectContaining({ method: 'POST' }));
    expect(invalidateDashboardCacheMock).toHaveBeenCalledOnce();
    expect(stateMock.albumDetailsCache).toEqual({});
    expect(loadAlbumsMock).toHaveBeenCalledOnce();
  });

  it('clears album details and dashboard cache after wiping the database', async () => {
    apiFetchMock.mockResolvedValue({});

    const { wipeDatabase } = await import('../public/js/settings.js');
    await wipeDatabase();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums/wipe', { method: 'DELETE' });
    expect(stateMock.albums).toEqual([]);
    expect(stateMock.albumDetailsCache).toEqual({});
    expect(stateMock.albumsLoaded).toBe(true);
    expect(stateMock.albumsLoading).toBe(false);
    expect(stateMock.albumListMeta.totalCount).toBe(0);
    expect(invalidateDashboardCacheMock).toHaveBeenCalledOnce();
    expect(renderMock).toHaveBeenCalledOnce();
  });
});
