import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  apiFetchMock,
  stateMock,
} = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  stateMock: {
    preferencesHydrated: false,
    complexStatuses: [],
    grinchMode: false,
    accentPeriod: true,
    earlyWrapped: false,
    seasonalThemeHistory: {},
    wrappedName: '',
    welcomeTour: {},
    contentWidthPx: 1000,
    pagination: {
      perPage: { list: 18, grid: 18 },
      mode: { list: 'suggested', grid: 'suggested' },
      showFirstLastButtons: false,
      showPageCount: true,
      visibilityMode: 'hover',
    },
    quickActionsToolbarVisibilityMode: 'visible',
    savedFilterPreset: null,
    headerScrollMode: 'smart',
    listArtClickToEnlarge: true,
    reserveSidebarSpace: false,
    showRepeatsField: true,
    showPriorityField: false,
    showRefetchArt: false,
    showPlannedAtField: false,
    uButtons: [],
    uButtonsEnabled: { list: false, grid: false },
  },
}));

vi.mock('../public/js/state.js', () => ({
  apiFetch: apiFetchMock,
  state: stateMock,
  FILTER_PRESET_KEY: 'ts_filterPreset',
  LS_HEADER_SCROLL: 'ts_headerScroll',
  LS_LIST_ART_ENLARGE: 'ts_listArtEnlarge',
  LS_RESERVE_SIDEBAR_SPACE: 'ts_reserveSidebarSpace',
  LS_SHOW_REPEATS_FIELD: 'ts_showRepeatsField',
  LS_SHOW_PRIORITY_FIELD: 'ts_showPriorityField',
  LS_SHOW_REFETCH_ART: 'ts_showRefetchArt',
  LS_SHOW_PLANNED_AT_FIELD: 'ts_showPlannedAtField',
  LS_PAGE_SIZE_LIST: 'ts_pageSizeList',
  LS_PAGE_SIZE_GRID: 'ts_pageSizeGrid',
  LS_PAGE_MODE_LIST: 'ts_pageModeList',
  LS_PAGE_MODE_GRID: 'ts_pageModeGrid',
  LS_SHOW_FIRST_LAST_PAGES: 'ts_showFirstLastPages',
  LS_SHOW_PAGE_COUNT: 'ts_showPageCount',
  LS_U_BUTTONS: 'ts_uButtons',
  LS_CONTENT_WIDTH: 'ts_contentWidth',
  LS_PAGE_CONTROL_VISIBILITY: 'ts_pageControlVisibility',
  LS_QUICK_ACTIONS_VISIBILITY: 'ts_quickActionsVisibility',
  PAGE_SUGGESTED: { list: 18, grid: 18 },
}));

function makePreferences(overrides = {}) {
  return {
    preferences: {
      complexStatuses: [],
      grinchMode: false,
      accentPeriod: true,
      earlyWrapped: false,
      seasonalThemeHistory: {},
      wrappedName: '',
      welcomeTourCompletedAt: null,
      welcomeTourSkippedAt: null,
      welcomeSamplesAddedAt: null,
      contentWidthPx: 1000,
      pageControlVisibility: 'hover',
      quickActionsToolbarVisibility: 'visible',
      filterPreset: null,
      headerScrollMode: 'smart',
      listArtClickToEnlarge: true,
      reserveSidebarSpace: false,
      paginationMode: 'suggested',
      paginationPageSize: 18,
      showFirstLastPages: false,
      showPageCount: true,
      showRepeatsField: true,
      showPriorityField: false,
      showRefetchArt: false,
      showPlannedAtField: false,
      uButtons: [],
      ...overrides,
    },
  };
}

function resetStateMock() {
  stateMock.preferencesHydrated = false;
  stateMock.complexStatuses = [];
  stateMock.grinchMode = false;
  stateMock.accentPeriod = true;
  stateMock.earlyWrapped = false;
  stateMock.seasonalThemeHistory = {};
  stateMock.wrappedName = '';
  stateMock.welcomeTour = {};
  stateMock.contentWidthPx = 1000;
  stateMock.pagination = {
    perPage: { list: 18, grid: 18 },
    mode: { list: 'suggested', grid: 'suggested' },
    showFirstLastButtons: false,
    showPageCount: true,
    visibilityMode: 'hover',
  };
  stateMock.quickActionsToolbarVisibilityMode = 'visible';
  stateMock.savedFilterPreset = null;
  stateMock.headerScrollMode = 'smart';
  stateMock.listArtClickToEnlarge = true;
  stateMock.reserveSidebarSpace = false;
  stateMock.showRepeatsField = true;
  stateMock.showPriorityField = false;
  stateMock.showRefetchArt = false;
  stateMock.showPlannedAtField = false;
  stateMock.uButtons = [];
  stateMock.uButtonsEnabled = { list: false, grid: false };
}

describe('client preferences persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    apiFetchMock.mockReset();
    localStorage.clear();
    resetStateMock();
  });

  it('queues patch requests and does not apply full snapshots over optimistic state', async () => {
    const pending = [];
    apiFetchMock.mockImplementation((path, options) => new Promise(resolve => {
      pending.push({
        path,
        body: JSON.parse(options.body),
        resolve,
      });
    }));
    const { patchPreferences } = await import('../public/js/preferences.js');

    stateMock.contentWidthPx = 1600;
    const first = patchPreferences({ contentWidthPx: 1600 });
    stateMock.reserveSidebarSpace = true;
    const second = patchPreferences({ reserveSidebarSpace: true });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(apiFetchMock).toHaveBeenCalledOnce();
    expect(pending[0].body).toEqual({ contentWidthPx: 1600 });

    pending[0].resolve(makePreferences({ contentWidthPx: 1600, reserveSidebarSpace: false }));
    await first;

    expect(stateMock.reserveSidebarSpace).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(pending[1].body).toEqual({ reserveSidebarSpace: true });

    pending[1].resolve(makePreferences({ contentWidthPx: 1600, reserveSidebarSpace: true }));
    await second;
    expect(stateMock.reserveSidebarSpace).toBe(true);
  });

  it('migrates legacy localStorage settings in one normalized patch and removes keys after success', async () => {
    localStorage.setItem('ts_contentWidth', '1600');
    localStorage.setItem('ts_pageControlVisibility', 'static');
    localStorage.setItem('ts_quickActionsVisibility', 'hover');
    localStorage.setItem('ts_filterPreset', JSON.stringify({
      filters: { search: 'autechre' },
      sort: { field: 'rating', order: 'desc' },
    }));
    localStorage.setItem('ts_headerScroll', 'fixed');
    localStorage.setItem('ts_listArtEnlarge', '0');
    localStorage.setItem('ts_reserveSidebarSpace', '1');
    localStorage.setItem('ts_showRepeatsField', '0');
    localStorage.setItem('ts_showPriorityField', '1');
    localStorage.setItem('ts_showRefetchArt', '1');
    localStorage.setItem('ts_showPlannedAtField', '1');
    localStorage.setItem('ts_pageSizeList', '40');
    localStorage.setItem('ts_pageModeList', 'custom');
    localStorage.setItem('ts_pageSizeGrid', '99');
    localStorage.setItem('ts_pageModeGrid', 'unlimited');
    localStorage.setItem('ts_showFirstLastPages', '1');
    localStorage.setItem('ts_showPageCount', '0');
    localStorage.setItem('ts_uButtons', JSON.stringify([
      { id: 'u-btn-sort', enabled: true },
      { id: 'u-btn-sidebar', enabled: false },
    ]));
    apiFetchMock.mockImplementation(async (_path, options) => makePreferences(JSON.parse(options.body)));
    const { migrateLocalStoragePreferencesToServer } = await import('../public/js/preferences.js');

    await migrateLocalStoragePreferencesToServer();

    expect(apiFetchMock).toHaveBeenCalledOnce();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify({
        contentWidthPx: 1600,
        pageControlVisibility: 'static',
        quickActionsToolbarVisibility: 'hover',
        filterPreset: {
          filters: { search: 'autechre' },
          sort: { field: 'rating', order: 'desc' },
        },
        headerScrollMode: 'fixed',
        listArtClickToEnlarge: false,
        reserveSidebarSpace: true,
        showRepeatsField: false,
        showPriorityField: true,
        showRefetchArt: true,
        showPlannedAtField: true,
        paginationMode: 'custom',
        paginationPageSize: 40,
        showFirstLastPages: true,
        showPageCount: false,
        uButtons: [
          { id: 'u-btn-sort', enabled: true },
          { id: 'u-btn-sidebar', enabled: false },
        ],
      }),
    });
    [
      'ts_contentWidth',
      'ts_pageControlVisibility',
      'ts_quickActionsVisibility',
      'ts_filterPreset',
      'ts_headerScroll',
      'ts_listArtEnlarge',
      'ts_reserveSidebarSpace',
      'ts_showRepeatsField',
      'ts_showPriorityField',
      'ts_showRefetchArt',
      'ts_showPlannedAtField',
      'ts_pageSizeList',
      'ts_pageSizeGrid',
      'ts_pageModeList',
      'ts_pageModeGrid',
      'ts_showFirstLastPages',
      'ts_showPageCount',
      'ts_uButtons',
    ].forEach(key => expect(localStorage.getItem(key)).toBeNull());
  });

  it('keeps legacy localStorage settings when migration patch fails', async () => {
    localStorage.setItem('ts_contentWidth', '1400');
    localStorage.setItem('ts_headerScroll', 'scroll');
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { migrateLocalStoragePreferencesToServer } = await import('../public/js/preferences.js');

    await expect(migrateLocalStoragePreferencesToServer()).rejects.toThrow('network down');

    expect(localStorage.getItem('ts_contentWidth')).toBe('1400');
    expect(localStorage.getItem('ts_headerScroll')).toBe('scroll');
  });

  it('normalizes malformed preference values before applying them to state', async () => {
    const { applyPreferencesToState } = await import('../public/js/preferences.js');

    applyPreferencesToState({
      complexStatuses: 'bad',
      contentWidthPx: 'small',
      pageControlVisibility: 'float',
      quickActionsToolbarVisibility: 'sometimes',
      filterPreset: 'bad',
      headerScrollMode: 'sticky',
      paginationMode: 'forever',
      paginationPageSize: 'nope',
      showFirstLastPages: 'yes',
      uButtons: [
        { id: 'u-btn-sort', enabled: false },
        { id: 123, enabled: true },
        { id: 'u-btn-sidebar' },
      ],
    });

    expect(stateMock.preferencesHydrated).toBe(true);
    expect(stateMock.contentWidthPx).toBe(1000);
    expect(stateMock.pagination.visibilityMode).toBe('hover');
    expect(stateMock.quickActionsToolbarVisibilityMode).toBe('visible');
    expect(stateMock.savedFilterPreset).toBeNull();
    expect(stateMock.headerScrollMode).toBe('smart');
    expect(stateMock.pagination.mode).toEqual({ list: 'suggested', grid: 'suggested' });
    expect(stateMock.pagination.perPage).toEqual({ list: 18, grid: 18 });
    expect(stateMock.pagination.showFirstLastButtons).toBe(true);
    expect(stateMock.pagination.showPageCount).toBe(true);
    expect(stateMock.complexStatuses.map(status => status.id)).toEqual(['cs_listened', 'cs_all']);
    expect(stateMock.uButtons).toEqual([
      { id: 'u-btn-sort', enabled: false },
      { id: 'u-btn-sidebar', enabled: true },
    ]);
  });

  it('applies client defaults when fetched preferences payload is empty', async () => {
    apiFetchMock.mockResolvedValue({});
    const { fetchPreferences } = await import('../public/js/preferences.js');

    const preferences = await fetchPreferences();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/preferences');
    expect(preferences).toEqual(expect.objectContaining({
      contentWidthPx: 1000,
      pageControlVisibility: 'hover',
      quickActionsToolbarVisibility: 'visible',
      paginationMode: 'suggested',
      paginationPageSize: 18,
    }));
    expect(stateMock.preferencesHydrated).toBe(true);
    expect(stateMock.complexStatuses.map(status => status.id)).toEqual(['cs_listened', 'cs_all']);
    expect(stateMock.pagination.perPage).toEqual({ list: 18, grid: 18 });
  });
});
