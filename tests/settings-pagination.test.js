import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  view: 'list',
  pagination: {
    currentPage: 3,
    perPage: { list: null, grid: null },
    mode: { list: 'unlimited', grid: 'unlimited' },
    showPageCount: true,
    showFirstLastButtons: false,
    visibilityMode: 'hover',
  },
  quickActionsToolbarVisibilityMode: 'visible',
  personalization: {
    opacity: {},
    backgroundDisplay: {},
    secondaryBackgroundDisplay: {},
    opacityPresets: [],
    themes: [],
    backgrounds: { userImages: [], presetImages: [], loading: false },
    secondaryBackgrounds: { userImages: [], presetImages: [], loading: false },
  },
};

const makeClassList = () => ({
  toggle: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
});

const elMock = {
  pageModeList: { value: '', addEventListener: vi.fn() },
  pageSuggestedList: { value: '', classList: makeClassList() },
  pageCustomWrapList: { classList: makeClassList() },
  pageCustomList: { value: '', addEventListener: vi.fn(), focus: vi.fn() },
  pageModeGrid: { value: '', addEventListener: vi.fn() },
  pageSuggestedGrid: { value: '', classList: makeClassList() },
  pageCustomWrapGrid: { classList: makeClassList() },
  pageCustomGrid: { value: '', addEventListener: vi.fn(), focus: vi.fn() },
  btnPageCustomListUp: { addEventListener: vi.fn() },
  btnPageCustomListDown: { addEventListener: vi.fn() },
  btnPageCustomGridUp: { addEventListener: vi.fn() },
  btnPageCustomGridDown: { addEventListener: vi.fn() },
  toggleFirstLastPageButtons: { checked: false, addEventListener: vi.fn() },
  toggleShowPageCount: { checked: false, addEventListener: vi.fn() },
  selectPageControlVisibility: { value: 'hover', addEventListener: vi.fn() },
  selectQuickActionsVisibility: { value: 'visible', addEventListener: vi.fn() },
};

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
  apiFetch: vi.fn(),
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
  DEFAULT_COLOR_SCHEME_PRESET_ID: 'bunan-blue',
  COLOR_SCHEME_PRESETS: [],
  PAGE_SUGGESTED: { list: 18, grid: 18 },
}));

const renderMock = vi.fn();
const loadAlbumsMock = vi.fn();
const resetPaginationMock = vi.fn();

vi.mock('../public/js/render.js', () => ({
  render: renderMock,
  loadAlbums: loadAlbumsMock,
  resetPagination: resetPaginationMock,
  openArtLightbox: vi.fn(),
}));

vi.mock('../public/js/utils.js', () => ({
  escHtml: value => value,
}));

vi.mock('../public/js/image-ready.js', () => ({
  waitForImageReady: vi.fn(async () => true),
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

vi.mock('../public/js/app-shell.js', () => ({
  syncAppShellLayout: vi.fn(),
}));

vi.mock('../public/js/preferences.js', () => ({
  patchPreferences: vi.fn(),
}));

describe('applyPaginationSetting', () => {
  beforeEach(() => {
    localStorage.clear();
    renderMock.mockReset();
    loadAlbumsMock.mockReset();
    resetPaginationMock.mockReset();
    stateMock.view = 'list';
    stateMock.pagination.currentPage = 3;
    stateMock.pagination.perPage = { list: null, grid: null };
    stateMock.pagination.mode = { list: 'unlimited', grid: 'unlimited' };
    stateMock.quickActionsToolbarVisibilityMode = 'visible';
    document.body.classList.remove('u-buttons-hover-only');
  });

  it('reloads albums immediately when changing pagination for the active view', async () => {
    const { applyPaginationSetting } = await import('../public/js/settings.js');

    const result = applyPaginationSetting('list', 'suggested');

    expect(result).toBe(true);
    expect(stateMock.pagination.perPage.list).toBe(18);
    expect(loadAlbumsMock).toHaveBeenCalledOnce();
    expect(renderMock).not.toHaveBeenCalled();
    expect(resetPaginationMock).toHaveBeenCalledOnce();
  });

  it('only rerenders locally when changing pagination for an inactive view', async () => {
    const { applyPaginationSetting } = await import('../public/js/settings.js');

    const result = applyPaginationSetting('grid', 'suggested');

    expect(result).toBe(true);
    expect(stateMock.pagination.perPage.grid).toBe(18);
    expect(renderMock).toHaveBeenCalledOnce();
    expect(loadAlbumsMock).not.toHaveBeenCalled();
  });

  it('defaults both views to suggested pagination when nothing is stored yet', async () => {
    const { initPaginationSettings } = await import('../public/js/settings.js');

    initPaginationSettings();

    expect(stateMock.pagination.perPage.list).toBe(18);
    expect(stateMock.pagination.perPage.grid).toBe(18);
    expect(stateMock.pagination.mode.list).toBe('suggested');
    expect(stateMock.pagination.mode.grid).toBe('suggested');
    expect(elMock.pageModeList.value).toBe('suggested');
    expect(elMock.pageModeGrid.value).toBe('suggested');
  });

  it('defaults quick actions toolbar visibility to visible when nothing is stored', async () => {
    const { initQuickActionsToolbarSettings } = await import('../public/js/settings.js');

    initQuickActionsToolbarSettings();

    expect(stateMock.quickActionsToolbarVisibilityMode).toBe('visible');
    expect(elMock.selectQuickActionsVisibility.value).toBe('visible');
    expect(document.body.classList.contains('u-buttons-hover-only')).toBe(false);
  });

  it('applies hover-only quick actions toolbar visibility', async () => {
    const { setQuickActionsToolbarVisibilityMode } = await import('../public/js/settings.js');

    setQuickActionsToolbarVisibilityMode('hover');

    expect(stateMock.quickActionsToolbarVisibilityMode).toBe('hover');
    expect(elMock.selectQuickActionsVisibility.value).toBe('hover');
    expect(document.body.classList.contains('u-buttons-hover-only')).toBe(true);
    expect(localStorage.getItem('ts_quickActionsVisibility')).toBe('hover');
  });
});
