import {
  apiFetch,
  state,
  FILTER_PRESET_KEY,
  LS_HEADER_SCROLL,
  LS_LIST_ART_ENLARGE,
  LS_RESERVE_SIDEBAR_SPACE,
  LS_SHOW_REPEATS_FIELD,
  LS_SHOW_PRIORITY_FIELD,
  LS_SHOW_REFETCH_ART,
  LS_SHOW_PLANNED_AT_FIELD,
  LS_PAGE_SIZE_LIST,
  LS_PAGE_SIZE_GRID,
  LS_PAGE_MODE_LIST,
  LS_PAGE_MODE_GRID,
  LS_SHOW_FIRST_LAST_PAGES,
  LS_SHOW_PAGE_COUNT,
  LS_U_BUTTONS,
  LS_CONTENT_WIDTH,
  LS_PAGE_CONTROL_VISIBILITY,
  LS_QUICK_ACTIONS_VISIBILITY,
  PAGE_SUGGESTED,
} from './state.js';
import {
  DEFAULT_CONTENT_WIDTH_PX,
  parseStoredContentWidthPx,
} from './layout-width.js';

const LS_ACCENT_PERIOD = 'ts_accentPeriod';
const LS_STARTUP_PREFERENCES_CACHE = 'ts_startupPreferencesCache';
let preferencePatchQueue = Promise.resolve();

function cacheAccentPeriodPreference(enabled) {
  localStorage.setItem(LS_ACCENT_PERIOD, enabled ? '1' : '0');
}

function writeStartupPreferencesCacheFromState() {
  const cache = {
    contentWidthPx: state.contentWidthPx,
    quickActionsToolbarVisibility: state.quickActionsToolbarVisibilityMode,
    reserveSidebarSpace: !!state.reserveSidebarSpace,
  };
  localStorage.setItem(LS_STARTUP_PREFERENCES_CACHE, JSON.stringify(cache));
}

export function getDefaultPreferences() {
  return {
    complexStatuses: [
      { id: 'cs_listened', name: 'Listened', statuses: ['completed', 'dropped'], includedWithApp: true },
      { id: 'cs_all', name: 'All', statuses: ['completed', 'dropped', 'planned'], includedWithApp: true },
    ],
    grinchMode: false,
    accentPeriod: true,
    earlyWrapped: false,
    seasonalThemeHistory: {},
    wrappedName: '',
    welcomeTourCompletedAt: null,
    welcomeTourSkippedAt: null,
    welcomeSamplesAddedAt: null,
    contentWidthPx: DEFAULT_CONTENT_WIDTH_PX,
    pageControlVisibility: 'hover',
    quickActionsToolbarVisibility: 'visible',
    filterPreset: null,
    headerScrollMode: 'smart',
    listArtClickToEnlarge: true,
    reserveSidebarSpace: false,
    paginationMode: 'suggested',
    paginationPageSize: PAGE_SUGGESTED.list,
    showFirstLastPages: false,
    showPageCount: true,
    showRepeatsField: true,
    showPriorityField: false,
    showRefetchArt: false,
    showPlannedAtField: false,
    uButtons: [],
  };
}

function normalizeVisibilityMode(value, validModes, fallback) {
  return validModes.includes(value) ? value : fallback;
}

function normalizeHeaderScrollMode(value) {
  return ['fixed', 'scroll', 'smart'].includes(value) ? value : 'smart';
}

function normalizePaginationMode(value) {
  return ['suggested', 'custom', 'unlimited'].includes(value) ? value : 'suggested';
}

function parseStoredPageSize(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePaginationPageSize(value, mode = 'suggested') {
  const normalizedMode = normalizePaginationMode(mode);
  if (normalizedMode === 'unlimited') return null;
  if (normalizedMode === 'suggested') return PAGE_SUGGESTED.list;
  return parseStoredPageSize(value) ?? PAGE_SUGGESTED.list;
}

function normalizeFilterPreset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    filters: value.filters && typeof value.filters === 'object' && !Array.isArray(value.filters)
      ? { ...value.filters }
      : {},
    sort: value.sort && typeof value.sort === 'object' && !Array.isArray(value.sort)
      ? { ...value.sort }
      : {},
  };
}

function parseJsonStorageObject(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonStorageArray(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function applyPreferencesToState(preferences = {}) {
  const defaults = getDefaultPreferences();
  state.preferencesHydrated = true;
  state.complexStatuses = Array.isArray(preferences.complexStatuses)
    ? preferences.complexStatuses.map(item => ({
      ...item,
      statuses: [...(item.statuses || [])],
      includedWithApp: !!item.includedWithApp,
    }))
    : defaults.complexStatuses.map(item => ({
      ...item,
      statuses: [...item.statuses],
      includedWithApp: !!item.includedWithApp,
    }));
  state.grinchMode = !!preferences.grinchMode;
  state.accentPeriod = preferences.accentPeriod === undefined
    ? defaults.accentPeriod
    : !!preferences.accentPeriod;
  cacheAccentPeriodPreference(state.accentPeriod);
  state.earlyWrapped = preferences.earlyWrapped === undefined
    ? defaults.earlyWrapped
    : !!preferences.earlyWrapped;
  state.seasonalThemeHistory = preferences.seasonalThemeHistory && typeof preferences.seasonalThemeHistory === 'object'
    ? { ...preferences.seasonalThemeHistory }
    : {};
  state.wrappedName = typeof preferences.wrappedName === 'string'
    ? preferences.wrappedName
    : defaults.wrappedName;
  if (!state.welcomeTour || typeof state.welcomeTour !== 'object') {
    state.welcomeTour = {};
  }
  state.welcomeTour.completedAt = typeof preferences.welcomeTourCompletedAt === 'string'
    ? preferences.welcomeTourCompletedAt
    : null;
  state.welcomeTour.skippedAt = typeof preferences.welcomeTourSkippedAt === 'string'
    ? preferences.welcomeTourSkippedAt
    : null;
  state.welcomeTour.samplesAddedAt = typeof preferences.welcomeSamplesAddedAt === 'string'
    ? preferences.welcomeSamplesAddedAt
    : null;
  state.contentWidthPx = parseStoredContentWidthPx(
    preferences.contentWidthPx,
    defaults.contentWidthPx,
  );
  state.pagination.visibilityMode = normalizeVisibilityMode(
    preferences.pageControlVisibility,
    ['hover', 'static'],
    defaults.pageControlVisibility,
  );
  state.quickActionsToolbarVisibilityMode = normalizeVisibilityMode(
    preferences.quickActionsToolbarVisibility,
    ['visible', 'hover'],
    defaults.quickActionsToolbarVisibility,
  );
  state.savedFilterPreset = normalizeFilterPreset(preferences.filterPreset);
  state.headerScrollMode = normalizeHeaderScrollMode(preferences.headerScrollMode);
  state.listArtClickToEnlarge = preferences.listArtClickToEnlarge === undefined
    ? true
    : !!preferences.listArtClickToEnlarge;
  state.reserveSidebarSpace = !!preferences.reserveSidebarSpace;
  const paginationMode = normalizePaginationMode(preferences.paginationMode);
  const paginationPageSize = normalizePaginationPageSize(preferences.paginationPageSize, paginationMode);
  state.pagination.perPage.list = paginationPageSize;
  state.pagination.perPage.grid = paginationPageSize;
  state.pagination.mode.list = paginationMode;
  state.pagination.mode.grid = paginationMode;
  state.pagination.showFirstLastButtons = !!preferences.showFirstLastPages;
  state.pagination.showPageCount = preferences.showPageCount === undefined
    ? true
    : !!preferences.showPageCount;
  state.showRepeatsField = preferences.showRepeatsField === undefined ? true : !!preferences.showRepeatsField;
  state.showPriorityField = !!preferences.showPriorityField;
  state.showRefetchArt = !!preferences.showRefetchArt;
  state.showPlannedAtField = !!preferences.showPlannedAtField;
  state.uButtons = Array.isArray(preferences.uButtons)
    ? preferences.uButtons.map(button => ({
      id: typeof button?.id === 'string' ? button.id : '',
      enabled: button?.enabled !== false,
    })).filter(button => button.id)
    : [];
  writeStartupPreferencesCacheFromState();
}

export async function fetchPreferences() {
  const response = await apiFetch('/api/preferences');
  const preferences = response?.preferences ?? getDefaultPreferences();
  applyPreferencesToState(preferences);
  return preferences;
}

export async function patchPreferences(patch = {}, options = {}) {
  const { apply = false } = options;
  writeStartupPreferencesCacheFromState();
  const request = preferencePatchQueue.catch(() => {}).then(() => apiFetch('/api/preferences', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }));
  preferencePatchQueue = request.catch(() => {});
  const response = await request;
  const preferences = response?.preferences ?? getDefaultPreferences();
  if (apply) {
    applyPreferencesToState(preferences);
  }
  return preferences;
}

export async function migrateLocalStoragePreferencesToServer() {
  const patch = {};

  if (localStorage.getItem(LS_CONTENT_WIDTH) !== null) {
    patch.contentWidthPx = parseStoredContentWidthPx(
      localStorage.getItem(LS_CONTENT_WIDTH),
      DEFAULT_CONTENT_WIDTH_PX,
    );
  }

  const pageControlVisibility = localStorage.getItem(LS_PAGE_CONTROL_VISIBILITY);
  if (pageControlVisibility !== null) {
    patch.pageControlVisibility = normalizeVisibilityMode(
      pageControlVisibility,
      ['hover', 'static'],
      'hover',
    );
  }

  const quickActionsToolbarVisibility = localStorage.getItem(LS_QUICK_ACTIONS_VISIBILITY);
  if (quickActionsToolbarVisibility !== null) {
    patch.quickActionsToolbarVisibility = normalizeVisibilityMode(
      quickActionsToolbarVisibility,
      ['visible', 'hover'],
      'visible',
    );
  }

  const filterPreset = parseJsonStorageObject(FILTER_PRESET_KEY);
  if (filterPreset) {
    patch.filterPreset = normalizeFilterPreset(filterPreset);
  }

  if (localStorage.getItem(LS_HEADER_SCROLL) !== null) {
    patch.headerScrollMode = normalizeHeaderScrollMode(localStorage.getItem(LS_HEADER_SCROLL));
  }

  if (localStorage.getItem(LS_LIST_ART_ENLARGE) !== null) {
    patch.listArtClickToEnlarge = localStorage.getItem(LS_LIST_ART_ENLARGE) !== '0';
  }

  if (localStorage.getItem(LS_RESERVE_SIDEBAR_SPACE) !== null) {
    patch.reserveSidebarSpace = localStorage.getItem(LS_RESERVE_SIDEBAR_SPACE) === '1';
  }

  if (localStorage.getItem(LS_SHOW_REPEATS_FIELD) !== null) {
    patch.showRepeatsField = localStorage.getItem(LS_SHOW_REPEATS_FIELD) !== '0';
  }

  if (localStorage.getItem(LS_SHOW_PRIORITY_FIELD) !== null) {
    patch.showPriorityField = localStorage.getItem(LS_SHOW_PRIORITY_FIELD) === '1';
  }

  if (localStorage.getItem(LS_SHOW_REFETCH_ART) !== null) {
    patch.showRefetchArt = localStorage.getItem(LS_SHOW_REFETCH_ART) === '1';
  }

  if (localStorage.getItem(LS_SHOW_PLANNED_AT_FIELD) !== null) {
    patch.showPlannedAtField = localStorage.getItem(LS_SHOW_PLANNED_AT_FIELD) === '1';
  }

  const hasCanonicalPagination = localStorage.getItem(LS_PAGE_SIZE_LIST) !== null
    || localStorage.getItem(LS_PAGE_MODE_LIST) !== null;
  const storedPageSize = hasCanonicalPagination
    ? localStorage.getItem(LS_PAGE_SIZE_LIST)
    : localStorage.getItem(LS_PAGE_SIZE_GRID);
  const storedPageMode = hasCanonicalPagination
    ? localStorage.getItem(LS_PAGE_MODE_LIST)
    : localStorage.getItem(LS_PAGE_MODE_GRID);
  if (storedPageSize !== null || storedPageMode !== null) {
    const paginationMode = normalizePaginationMode(storedPageMode);
    patch.paginationMode = paginationMode;
    patch.paginationPageSize = normalizePaginationPageSize(storedPageSize, paginationMode);
  }

  if (localStorage.getItem(LS_SHOW_FIRST_LAST_PAGES) !== null) {
    patch.showFirstLastPages = localStorage.getItem(LS_SHOW_FIRST_LAST_PAGES) === '1';
  }

  if (localStorage.getItem(LS_SHOW_PAGE_COUNT) !== null) {
    patch.showPageCount = localStorage.getItem(LS_SHOW_PAGE_COUNT) !== '0';
  }

  if (localStorage.getItem(LS_U_BUTTONS) !== null) {
    patch.uButtons = parseJsonStorageArray(LS_U_BUTTONS);
  }

  if (!Object.keys(patch).length) return null;

  const preferences = await patchPreferences(patch, { apply: true });
  [
    LS_CONTENT_WIDTH,
    LS_PAGE_CONTROL_VISIBILITY,
    LS_QUICK_ACTIONS_VISIBILITY,
    FILTER_PRESET_KEY,
    LS_HEADER_SCROLL,
    LS_LIST_ART_ENLARGE,
    LS_RESERVE_SIDEBAR_SPACE,
    LS_SHOW_REPEATS_FIELD,
    LS_SHOW_PRIORITY_FIELD,
    LS_SHOW_REFETCH_ART,
    LS_SHOW_PLANNED_AT_FIELD,
    LS_PAGE_SIZE_LIST,
    LS_PAGE_SIZE_GRID,
    LS_PAGE_MODE_LIST,
    LS_PAGE_MODE_GRID,
    LS_SHOW_FIRST_LAST_PAGES,
    LS_SHOW_PAGE_COUNT,
    LS_U_BUTTONS,
  ].forEach(key => localStorage.removeItem(key));
  return preferences;
}
