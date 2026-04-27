import {
  apiFetch,
  state,
  LS_CONTENT_WIDTH,
  LS_PAGE_CONTROL_VISIBILITY,
  LS_QUICK_ACTIONS_VISIBILITY,
} from './state.js';
import {
  DEFAULT_CONTENT_WIDTH_PX,
  parseStoredContentWidthPx,
} from './layout-width.js';

const LS_ACCENT_PERIOD = 'ts_accentPeriod';

function cacheAccentPeriodPreference(enabled) {
  localStorage.setItem(LS_ACCENT_PERIOD, enabled ? '1' : '0');
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
  };
}

function normalizeVisibilityMode(value, validModes, fallback) {
  return validModes.includes(value) ? value : fallback;
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
}

export async function fetchPreferences() {
  const response = await apiFetch('/api/preferences');
  const preferences = response?.preferences ?? getDefaultPreferences();
  applyPreferencesToState(preferences);
  return preferences;
}

export async function patchPreferences(patch = {}) {
  const response = await apiFetch('/api/preferences', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  const preferences = response?.preferences ?? getDefaultPreferences();
  applyPreferencesToState(preferences);
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

  if (!Object.keys(patch).length) return null;

  const preferences = await patchPreferences(patch);
  localStorage.removeItem(LS_CONTENT_WIDTH);
  localStorage.removeItem(LS_PAGE_CONTROL_VISIBILITY);
  localStorage.removeItem(LS_QUICK_ACTIONS_VISIBILITY);
  return preferences;
}
