const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const PREFERENCES_PATH = process.env.PREFERENCES_PATH || path.join(DATA_DIR, 'preferences.json');

const DEFAULT_COMPLEX_STATUSES = [
  { id: 'cs_listened', name: 'Listened', statuses: ['completed', 'dropped'], includedWithApp: true },
  { id: 'cs_all', name: 'All', statuses: ['completed', 'dropped', 'planned'], includedWithApp: true },
];

const VALID_STATUSES = ['completed', 'planned', 'dropped'];
const DEFAULT_CONTENT_WIDTH_PX = 1000;
const MIN_CONTENT_WIDTH_PX = 600;
const VALID_PAGE_CONTROL_VISIBILITY = ['hover', 'static'];
const VALID_QUICK_ACTIONS_VISIBILITY = ['visible', 'hover'];

function createStoreError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cloneComplexStatuses(statuses) {
  return statuses.map(status => ({
    ...status,
    statuses: [...status.statuses],
    includedWithApp: !!status.includedWithApp,
  }));
}

function normalizeComplexStatuses(value) {
  if (!Array.isArray(value)) {
    return cloneComplexStatuses(DEFAULT_COMPLEX_STATUSES);
  }

  const normalized = value
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      id: typeof item.id === 'string' ? item.id.trim() : '',
      name: typeof item.name === 'string' ? item.name.trim() : '',
      statuses: Array.isArray(item.statuses)
        ? item.statuses.filter(status => VALID_STATUSES.includes(status))
        : [],
      includedWithApp: false,
    }))
    .filter(item => item.id && item.name && item.statuses.length);

  const seenIds = new Set();
  const deduped = normalized.filter(item => {
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  });

  const listenedStatuses = ['completed', 'dropped'];
  const allStatuses = ['completed', 'dropped', 'planned'];
  const setsEqual = (left, right) => left.length === right.length && [...left].sort().join(',') === [...right].sort().join(',');

  const withDefaults = deduped.filter(item => item.id !== 'cs_listened' && item.id !== 'cs_all');
  const listened = deduped.find(item => item.id === 'cs_listened' && setsEqual(item.statuses, listenedStatuses));
  const all = deduped.find(item => item.id === 'cs_all' && setsEqual(item.statuses, allStatuses));

  return [
    listened
      ? { ...listened, includedWithApp: true }
      : { id: 'cs_listened', name: 'Listened', statuses: listenedStatuses, includedWithApp: true },
    all
      ? { ...all, includedWithApp: true }
      : { id: 'cs_all', name: 'All', statuses: allStatuses, includedWithApp: true },
    ...withDefaults.map(item => ({ ...item, includedWithApp: false })),
  ];
}

function normalizeSeasonalThemeHistory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((result, [key, year]) => {
    const normalizedKey = typeof key === 'string' ? key.trim() : '';
    const parsedYear = Number.parseInt(String(year), 10);
    if (normalizedKey && Number.isInteger(parsedYear) && parsedYear > 0) {
      result[normalizedKey] = parsedYear;
    }
    return result;
  }, {});
}

function normalizeWrappedName(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeOptionalTimestamp(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeContentWidthPx(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return DEFAULT_CONTENT_WIDTH_PX;
  if (parsed === 0) return 0;
  if (parsed < MIN_CONTENT_WIDTH_PX) return DEFAULT_CONTENT_WIDTH_PX;
  return parsed;
}

function normalizePageControlVisibility(value) {
  return VALID_PAGE_CONTROL_VISIBILITY.includes(value) ? value : 'hover';
}

function normalizeQuickActionsToolbarVisibility(value) {
  return VALID_QUICK_ACTIONS_VISIBILITY.includes(value) ? value : 'visible';
}

function normalizePreferences(rawValue = {}) {
  return {
    complexStatuses: normalizeComplexStatuses(rawValue.complexStatuses),
    grinchMode: !!rawValue.grinchMode,
    accentPeriod: rawValue.accentPeriod === undefined ? true : !!rawValue.accentPeriod,
    earlyWrapped: !!rawValue.earlyWrapped,
    seasonalThemeHistory: normalizeSeasonalThemeHistory(rawValue.seasonalThemeHistory),
    wrappedName: normalizeWrappedName(rawValue.wrappedName),
    welcomeTourCompletedAt: normalizeOptionalTimestamp(rawValue.welcomeTourCompletedAt),
    welcomeTourSkippedAt: normalizeOptionalTimestamp(rawValue.welcomeTourSkippedAt),
    welcomeSamplesAddedAt: normalizeOptionalTimestamp(rawValue.welcomeSamplesAddedAt),
    contentWidthPx: normalizeContentWidthPx(rawValue.contentWidthPx),
    pageControlVisibility: normalizePageControlVisibility(rawValue.pageControlVisibility),
    quickActionsToolbarVisibility: normalizeQuickActionsToolbarVisibility(rawValue.quickActionsToolbarVisibility),
  };
}

function ensurePreferencesDir() {
  fs.mkdirSync(path.dirname(PREFERENCES_PATH), { recursive: true });
}

function readPreferencesFile() {
  ensurePreferencesDir();
  if (!fs.existsSync(PREFERENCES_PATH)) {
    return normalizePreferences();
  }

  try {
    const raw = JSON.parse(fs.readFileSync(PREFERENCES_PATH, 'utf8'));
    return normalizePreferences(raw);
  } catch (error) {
    throw createStoreError(500, `Could not parse preferences: ${error.message}`);
  }
}

function writePreferencesFile(value) {
  ensurePreferencesDir();
  fs.writeFileSync(PREFERENCES_PATH, `${JSON.stringify(value, null, 2)}\n`);
}

function getPreferences() {
  return readPreferencesFile();
}

function updatePreferences(patch = {}) {
  const current = readPreferencesFile();
  const next = normalizePreferences({
    ...current,
    ...patch,
  });
  writePreferencesFile(next);
  return next;
}

module.exports = {
  DEFAULT_COMPLEX_STATUSES,
  PREFERENCES_PATH,
  getPreferences,
  updatePreferences,
  normalizePreferences,
  normalizeComplexStatuses,
  normalizeSeasonalThemeHistory,
  normalizeWrappedName,
  normalizeOptionalTimestamp,
  normalizeContentWidthPx,
  normalizePageControlVisibility,
  normalizeQuickActionsToolbarVisibility,
  createStoreError,
};
