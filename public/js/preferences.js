import { apiFetch, state } from './state.js';

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
  };
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
