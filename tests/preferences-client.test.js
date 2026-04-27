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

describe('client preferences persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    apiFetchMock.mockReset();
    localStorage.clear();
    stateMock.reserveSidebarSpace = false;
    stateMock.contentWidthPx = 1000;
    stateMock.quickActionsToolbarVisibilityMode = 'visible';
    stateMock.uButtonsEnabled = { list: false, grid: false };
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
});
