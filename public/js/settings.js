// =============================================================================
// Settings modal, CSV export, backup/restore, debug mode.
// =============================================================================

import {
  state, el, apiFetch, LS_PREFIX, LS_HEADER_SCROLL, LS_SHOW_WIPE_DB,
  LS_SHOW_REPEATS_FIELD, LS_SHOW_PRIORITY_FIELD, LS_SHOW_REFETCH_ART, LS_SHOW_PLANNED_AT_FIELD, LS_LIST_ART_ENLARGE,
  LS_RESERVE_SIDEBAR_SPACE, LS_GRINCH_MODE, LS_CONTENT_WIDTH,
  LS_PAGE_SIZE_LIST, LS_PAGE_SIZE_GRID, LS_PAGE_MODE_LIST, LS_PAGE_MODE_GRID, LS_SHOW_FIRST_LAST_PAGES, LS_PAGE_CONTROL_VISIBILITY, LS_SHOW_PAGE_COUNT,
  LS_QUICK_ACTIONS_VISIBILITY, LS_U_BUTTONS_ENABLED_LIST, LS_U_BUTTONS_ENABLED_GRID,
  LS_PERSONALIZATION_OPACITY, LS_COLOR_SCHEME_PRESET, LS_CUSTOM_THEME_CSS, LS_CUSTOM_THEME_CSS_NAME,
  LS_BACKGROUND_IMAGE_SELECTION, LS_BACKGROUND_IMAGE_DISPLAY,
  LS_SECONDARY_BACKGROUND_IMAGE_SELECTION, LS_SECONDARY_BACKGROUND_IMAGE_DISPLAY,
  LS_OPACITY_CONTROLS_EXPANDED, LS_APPLIED_THEME_ID,
  DEFAULT_COMPLEX_STATUSES, DEFAULT_PERSONALIZATION_OPACITY,
  DEFAULT_PERSONALIZATION_BACKGROUND_DISPLAY, DEFAULT_SECONDARY_PERSONALIZATION_BACKGROUND_DISPLAY,
  DEFAULT_OPACITY_PRESETS, DEFAULT_COLOR_SCHEME_PRESET_ID, COLOR_SCHEME_PRESETS, PAGE_SUGGESTED,
} from './state.js';
import { render, loadAlbums, resetPagination, openArtLightbox } from './render.js';
import { escHtml } from './utils.js';
import { waitForImageReady } from './image-ready.js';
import { applyPreferencesToState, patchPreferences } from './preferences.js';
import { setWrappedName } from './wrapped-name.js';
import { syncHeaderTitleText } from './header-title.js';
import {
  DEFAULT_CONTENT_WIDTH_PX,
  parseStoredContentWidthPx,
  validateContentWidthPx,
} from './layout-width.js';
import { syncHeaderScrollBaseline } from './header-scroll.js';
import { syncAppShellLayout } from './app-shell.js';
import { invalidateDashboardCache, refreshActiveDashboardPage } from './dashboard.js';
import { closeManagedModal, openManagedModal } from './modal-manager.js';
import {
  saveComplexStatuses, renderComplexStatusList, renderStatusDropdown,
  updateRestoreBtn, applyFilterState,
  renderUButtonBar, renderUButtonList, loadUButtons,
  getDefaultFilterPreset, saveDefaultFilterPreset,
} from './sidebar.js';

const LS_LAST_CSV_IMPORT_JOB_ID = 'ts_lastCsvImportJobId';
const LS_DISMISSED_CSV_IMPORT_JOB_ID = 'ts_dismissedCsvImportJobId';
const LS_DEFAULT_THEME_INITIALIZED = 'ts_defaultThemeInitialized';
const LS_SEASONAL_THEME_HISTORY = 'ts_seasonalThemeHistory';
const LS_ACCENT_PERIOD = 'ts_accentPeriod';
const CSV_IMPORT_POLL_MS = 3000;
let csvImportPollTimeout = null;
let personalizationControls = null;
let backgroundTransitionTokens = {
  primary: 0,
  secondary: 0,
};
let backgroundMetadataTokens = {
  primary: 0,
  secondary: 0,
};
let backgroundLoadedBySlot = {
  primary: false,
  secondary: false,
};
let earlyWrappedConfirmStepIndex = -1;
let earlyWrappedUiInitialized = false;
let earlyWrappedCheatToastTimeout = null;
let earlyWrappedCheatToastFadeTimeout = null;
let isSyncingThemeSelectUi = false;
const OPACITY_PRESET_CUSTOM_VALUE = '__custom__';
const THUMBNAIL_MAX_DIMENSION = 480;
const THEME_PRESET_STYLE_ID = 'trackspot-theme-preset-style';
const THEME_CUSTOM_STYLE_ID = 'trackspot-theme-custom-style';
const MAX_BACKGROUND_BLUR_PX = 24;
const CUSTOM_BACKGROUND_SCALE_FILL = 'custom-scale';
const MIN_CUSTOM_BACKGROUND_SCALE = 0.05;
const MAX_CUSTOM_BACKGROUND_SCALE = 5;
const CUSTOM_BACKGROUND_SCALE_PRECISION = 5;
const DEFAULT_INCLUDED_THEME_NAME = 'Basic Blue';
const APRIL_FOOLS_THEME_NAME = 'Found in the Archives';
const CHRISTMAS_THEME_NAME = 'Christmastime';
const EARLY_WRAPPED_CONFIRM_STEPS = [
  {
    textHtml: 'It would be better if you waited until the new year. Are you sure you want to spoil the surprise?',
    left: { label: 'Cancel', action: 'cancel', className: 'btn-ghost' },
    right: { label: 'Ok', action: 'ok', className: 'btn-primary' },
    moving: false,
  },
  {
    textHtml: 'Are you <em>really</em> sure?',
    left: { label: 'Ok', action: 'ok', className: 'btn-ghost' },
    right: { label: 'Cancel', action: 'cancel', className: 'btn-primary' },
    moving: false,
  },
  {
    textHtml: 'Are you <em>really</em> <strong><em>really</em></strong> sure?',
    left: { label: 'Cancel', action: 'cancel', className: 'btn-ghost' },
    right: { label: 'Ok', action: 'ok', className: 'btn-primary' },
    moving: true,
  },
];

function invalidateAlbumDerivedState(options = {}) {
  const { clearDetails = true } = options;
  invalidateDashboardCache();
  state.albumsError = null;
  if (clearDetails) {
    state.albumDetailsCache = {};
  }
}

async function refreshAlbumDependentViews(options = {}) {
  const {
    clearDetails = true,
    preservePage = true,
    reloadCollection = true,
  } = options;
  const activePage = state.navigation?.page || 'collection';

  invalidateAlbumDerivedState({ clearDetails });

  if (reloadCollection) {
    if (activePage === 'collection') {
      await loadAlbums({ preservePage });
    } else {
      await loadAlbums({
        preservePage,
        renderAlbums: () => {},
      });
    }
  } else if (activePage === 'collection') {
    render();
  }

  if (activePage === 'stats' || activePage === 'wrapped') {
    await refreshActiveDashboardPage();
  }
}
const EARLY_WRAPPED_CHEAT_TOAST_MESSAGE = "Nope. You'll have to click the button the old-fashioned way.";
const EARLY_WRAPPED_CHEAT_TOAST_MS = 6000;
const EARLY_WRAPPED_CHEAT_TOAST_FADE_MS = 100;
const SEASONAL_THEME_RULES = [
  {
    key: 'aprilFools',
    themeName: APRIL_FOOLS_THEME_NAME,
    isActive(now) {
      return now.getMonth() === 3 && now.getDate() === 1;
    },
  },
  {
    key: 'christmas',
    themeName: CHRISTMAS_THEME_NAME,
    isActive(now) {
      return now.getMonth() === 11 && now.getDate() >= 1 && now.getDate() <= 25;
    },
  },
];

const PERSONALIZATION_OPACITY_CONFIG = [
  { key: 'backgroundImage', cssVar: '--ts-opacity-background-image' },
  {
    key: 'backgroundImageBlur',
    cssVar: '--ts-background-image-blur',
    scaleCssVar: '--ts-background-image-blur-scale',
    valueType: 'blur',
    maxBlurPx: MAX_BACKGROUND_BLUR_PX,
  },
  { key: 'secondaryBackgroundImage', cssVar: '--ts-opacity-secondary-background-image' },
  {
    key: 'secondaryBackgroundImageBlur',
    cssVar: '--ts-secondary-background-image-blur',
    scaleCssVar: '--ts-secondary-background-image-blur-scale',
    valueType: 'blur',
    maxBlurPx: MAX_BACKGROUND_BLUR_PX,
  },
  { key: 'header', cssVar: '--ts-opacity-header' },
  { key: 'quickActionsToolbar', cssVar: '--ts-opacity-quick-actions-toolbar' },
  { key: 'sidebar', cssVar: '--ts-opacity-sidebar' },
  { key: 'rowHeaderBackground', cssVar: '--ts-opacity-row-header-background' },
  { key: 'row', cssVar: '--ts-opacity-row' },
  { key: 'rowArt', cssVar: '--ts-opacity-row-art' },
  { key: 'rowText', cssVar: '--ts-opacity-row-text' },
  { key: 'card', cssVar: '--ts-opacity-card' },
  { key: 'cardArt', cssVar: '--ts-opacity-card-art' },
  { key: 'cardText', cssVar: '--ts-opacity-card-text' },
  { key: 'styleBackgroundGradient', cssVar: '--ts-opacity-style-background-gradient' },
];

const THEME_IMAGE_OPACITY_KEYS = [
  'backgroundImage',
  'backgroundImageBlur',
  'secondaryBackgroundImage',
  'secondaryBackgroundImageBlur',
];

const OPACITY_PRESET_KEYS = PERSONALIZATION_OPACITY_CONFIG
  .map(({ key }) => key)
  .filter(key => !THEME_IMAGE_OPACITY_KEYS.includes(key));

const BACKGROUND_FILL_TO_CSS_SIZE = {
  'original-size': 'auto',
  cover: 'cover',
  'fit-height': 'auto 100%',
  'fit-width': '100% auto',
};

const BACKGROUND_SLOT_CONFIG = {
  primary: {
    key: 'primary',
    title: 'Background image',
    selectionKey: 'backgroundSelection',
    displayKey: 'backgroundDisplay',
    backgroundsKey: 'backgrounds',
    defaultDisplay: DEFAULT_PERSONALIZATION_BACKGROUND_DISPLAY,
    storageSelectionKey: LS_BACKGROUND_IMAGE_SELECTION,
    storageDisplayKey: LS_BACKGROUND_IMAGE_DISPLAY,
    opacityKey: 'backgroundImage',
    selectionCssVar: '--ts-background-image-url',
    positionXCssVar: '--ts-background-position-x',
    positionYCssVar: '--ts-background-position-y',
    sizeCssVar: '--ts-background-size',
    renderedOpacityCssVar: '--ts-background-rendered-opacity',
    currentRef: 'personalizationBackgroundCurrent',
    userImagesRef: 'personalizationUserImages',
    presetImagesRef: 'personalizationPresetImages',
    positionXRef: 'personalizationBackgroundPositionX',
    positionYRef: 'personalizationBackgroundPositionY',
    fillRef: 'personalizationBackgroundFill',
    customScaleRef: 'personalizationBackgroundCustomScale',
    customScaleRowRef: 'personalizationBackgroundCustomScaleRow',
    uploadButtonRef: 'personalizationUploadBackground',
    uploadInputRef: 'personalizationUploadInput',
    clearButtonRef: 'personalizationClearBackground',
    tabButtonRef: 'personalizationBackgroundTabPrimary',
    panelRef: 'personalizationBackgroundPanelPrimary',
    apiResponseUserKey: 'userImages',
    apiResponsePresetKey: 'presetImages',
    uploadEndpoint: '/api/backgrounds/upload',
    userDeleteEndpoint: id => `/api/backgrounds/user/${encodeURIComponent(id)}`,
    userThumbnailEndpoint: id => `/api/backgrounds/user/${encodeURIComponent(id)}/thumbnail`,
    presetThumbnailEndpoint: id => `/api/backgrounds/preset/${encodeURIComponent(id)}/thumbnail`,
    clearedMessage: 'Background image cleared.',
    selectedMessage: name => `${name} is now the background image.`,
    uploadStatusMessage: 'Uploading background image…',
    uploadDoneMessage: name => `${name} uploaded and selected as the background image.`,
    deleteConfirmMessage: name => `Delete "${name}" from your uploaded background images?`,
    deleteStatusMessage: name => `Deleting ${name}…`,
    deleteDoneMessage: name => `${name} was deleted.`,
  },
  secondary: {
    key: 'secondary',
    title: 'Secondary background image',
    selectionKey: 'secondaryBackgroundSelection',
    displayKey: 'secondaryBackgroundDisplay',
    backgroundsKey: 'secondaryBackgrounds',
    defaultDisplay: DEFAULT_SECONDARY_PERSONALIZATION_BACKGROUND_DISPLAY,
    storageSelectionKey: LS_SECONDARY_BACKGROUND_IMAGE_SELECTION,
    storageDisplayKey: LS_SECONDARY_BACKGROUND_IMAGE_DISPLAY,
    opacityKey: 'secondaryBackgroundImage',
    selectionCssVar: '--ts-secondary-background-image-url',
    positionXCssVar: '--ts-secondary-background-position-x',
    positionYCssVar: '--ts-secondary-background-position-y',
    sizeCssVar: '--ts-secondary-background-size',
    renderedOpacityCssVar: '--ts-secondary-background-rendered-opacity',
    currentRef: 'personalizationSecondaryBackgroundCurrent',
    userImagesRef: 'personalizationSecondaryUserImages',
    presetImagesRef: 'personalizationSecondaryPresetImages',
    positionXRef: 'personalizationSecondaryBackgroundPositionX',
    positionYRef: 'personalizationSecondaryBackgroundPositionY',
    fillRef: 'personalizationSecondaryBackgroundFill',
    customScaleRef: 'personalizationSecondaryBackgroundCustomScale',
    customScaleRowRef: 'personalizationSecondaryBackgroundCustomScaleRow',
    uploadButtonRef: 'personalizationUploadSecondaryBackground',
    uploadInputRef: 'personalizationSecondaryUploadInput',
    clearButtonRef: 'personalizationClearSecondaryBackground',
    tabButtonRef: 'personalizationBackgroundTabSecondary',
    panelRef: 'personalizationBackgroundPanelSecondary',
    apiResponseUserKey: 'secondaryUserImages',
    apiResponsePresetKey: 'secondaryPresetImages',
    uploadEndpoint: '/api/backgrounds/secondary/upload',
    userDeleteEndpoint: id => `/api/backgrounds/secondary/user/${encodeURIComponent(id)}`,
    userThumbnailEndpoint: id => `/api/backgrounds/secondary/user/${encodeURIComponent(id)}/thumbnail`,
    presetThumbnailEndpoint: id => `/api/backgrounds/secondary/preset/${encodeURIComponent(id)}/thumbnail`,
    clearedMessage: 'Secondary background image cleared.',
    selectedMessage: name => `${name} is now the secondary background image.`,
    uploadStatusMessage: 'Uploading secondary background image…',
    uploadDoneMessage: name => `${name} uploaded and selected as the secondary background image.`,
    deleteConfirmMessage: name => `Delete "${name}" from your uploaded secondary background images?`,
    deleteStatusMessage: name => `Deleting ${name}…`,
    deleteDoneMessage: name => `${name} was deleted.`,
  },
};

function getColorSchemePresetById(presetId) {
  return COLOR_SCHEME_PRESETS.find(preset => preset.id === presetId)
    ?? COLOR_SCHEME_PRESETS.find(preset => preset.id === DEFAULT_COLOR_SCHEME_PRESET_ID)
    ?? COLOR_SCHEME_PRESETS[0];
}

function cacheAccentPeriodPreference(enabled) {
  localStorage.setItem(LS_ACCENT_PERIOD, enabled ? '1' : '0');
}

function ensureThemeStyleElement(id) {
  let style = document.getElementById(id);
  if (style) return style;

  style = document.createElement('style');
  style.id = id;
  document.head.appendChild(style);
  return style;
}

function buildColorSchemeCss(preset) {
  const activePreset = preset ?? getColorSchemePresetById(DEFAULT_COLOR_SCHEME_PRESET_ID);
  const declarations = Object.entries(activePreset.vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

  let css = `/* Trackspot color scheme: ${activePreset.name} */\n:root {\n${declarations}\n}\n`;
  if (activePreset.css) css += `\n${activePreset.css}\n`;
  if (activePreset.wrappedCss) css += `\n/* Wrapped overrides for ${activePreset.name} */\n${activePreset.wrappedCss}\n`;
  return css;
}

function normalizeCustomThemeCssText(cssText) {
  if (typeof cssText !== 'string') return '';
  const withoutBom = cssText.replace(/^\uFEFF/, '');
  return withoutBom.trim() ? withoutBom : '';
}

function normalizeCustomThemeCssName(fileName) {
  if (typeof fileName !== 'string') return '';
  return fileName.trim();
}

function saveColorSchemePreset() {
  localStorage.setItem(LS_COLOR_SCHEME_PRESET, state.personalization.colorSchemePresetId);
}

function saveCustomThemeCss() {
  if (state.personalization.customThemeCss) {
    localStorage.setItem(LS_CUSTOM_THEME_CSS, state.personalization.customThemeCss);
    localStorage.setItem(LS_CUSTOM_THEME_CSS_NAME, state.personalization.customThemeCssName || 'custom-theme.css');
    return;
  }

  localStorage.removeItem(LS_CUSTOM_THEME_CSS);
  localStorage.removeItem(LS_CUSTOM_THEME_CSS_NAME);
}

function applyColorSchemePreset(presetId, options = {}) {
  const {
    persist = true,
    syncUi = true,
  } = options;
  const preset = getColorSchemePresetById(presetId);

  state.personalization.colorSchemePresetId = preset.id;
  ensureThemeStyleElement(THEME_PRESET_STYLE_ID).textContent = buildColorSchemeCss(preset);

  if (persist) saveColorSchemePreset();
  if (syncUi) syncColorSchemeUi();
  syncThemeUi();
}

function applyCustomThemeCss(cssText, fileName = '', options = {}) {
  const {
    persist = true,
    syncUi = true,
  } = options;
  const normalizedCss = normalizeCustomThemeCssText(cssText);
  const normalizedName = normalizedCss ? (normalizeCustomThemeCssName(fileName) || 'custom-theme.css') : '';

  state.personalization.customThemeCss = normalizedCss;
  state.personalization.customThemeCssName = normalizedName;
  ensureThemeStyleElement(THEME_CUSTOM_STYLE_ID).textContent = normalizedCss;

  if (persist) saveCustomThemeCss();
  if (syncUi) syncColorSchemeUi();
}

function syncColorSchemeUi() {
  const preset = getColorSchemePresetById(state.personalization.colorSchemePresetId);

  if (el.personalizationColorSchemeSelect) {
    el.personalizationColorSchemeSelect.innerHTML = '';
    COLOR_SCHEME_PRESETS.forEach(colorScheme => {
      const option = document.createElement('option');
      option.value = colorScheme.id;
      option.textContent = colorScheme.name;
      el.personalizationColorSchemeSelect.appendChild(option);
    });
    el.personalizationColorSchemeSelect.value = preset.id;
  }

  if (el.personalizationColorSchemeDescription) {
    el.personalizationColorSchemeDescription.textContent = preset.description;
  }

  if (el.personalizationCustomThemeCurrent) {
    el.personalizationCustomThemeCurrent.textContent = state.personalization.customThemeCss
      ? `Custom override active: ${state.personalization.customThemeCssName || 'custom-theme.css'}`
      : 'No custom CSS override uploaded.';
  }

  if (el.personalizationClearThemeCss) {
    el.personalizationClearThemeCss.disabled = !state.personalization.customThemeCss;
  }
}

function sanitizeDownloadName(value) {
  return (value || 'theme')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'theme';
}

function downloadTextFile(fileName, text, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function importCustomThemeCss(file) {
  if (!file) return;
  setPersonalizationBackgroundStatus(`Loading custom CSS from ${file.name}…`);

  try {
    const cssText = await file.text();
    if (!normalizeCustomThemeCssText(cssText)) {
      throw new Error('The selected CSS file is empty.');
    }

    applyCustomThemeCss(cssText, file.name);
    setPersonalizationBackgroundStatus(`Applied custom CSS from ${file.name}.`);
  } catch (error) {
    setPersonalizationBackgroundStatus(`Could not load custom CSS: ${error.message}`, true);
  } finally {
    if (el.personalizationThemeCssInput) el.personalizationThemeCssInput.value = '';
  }
}

function clampOpacityValueForKey(key, value) {
  const parsed = parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) return getDefaultOpacityValue(key);
  return Math.min(100, Math.max(0, parsed));
}

function getDefaultOpacityValue(key) {
  return DEFAULT_PERSONALIZATION_OPACITY[key] ?? 100;
}

function normalizeCustomBackgroundScale(value, fallback = 1) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;

  const rounded = Number(parsed.toFixed(CUSTOM_BACKGROUND_SCALE_PRECISION));
  return Math.min(MAX_CUSTOM_BACKGROUND_SCALE, Math.max(MIN_CUSTOM_BACKGROUND_SCALE, rounded));
}

function formatCustomBackgroundScale(value) {
  return normalizeCustomBackgroundScale(value, 1)
    .toFixed(CUSTOM_BACKGROUND_SCALE_PRECISION)
    .replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
}

function normalizeBackgroundDimension(value) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function formatBackgroundSizePx(value) {
  return Number(value.toFixed(CUSTOM_BACKGROUND_SCALE_PRECISION)).toString();
}

function convertBlurSliderValueToPx(value, maxBlurPx = MAX_BACKGROUND_BLUR_PX) {
  return Math.round((value / 100) * maxBlurPx * 100) / 100;
}

function convertBlurPxToBackgroundScale(blurPx) {
  return Math.round((1 + (blurPx / 400)) * 1000) / 1000;
}

function createOpacitySpinnerButton(direction, label) {
  const button = document.createElement('button');
  button.className = 'custom-spinner-btn opacity-spinner-btn';
  button.type = 'button';
  button.tabIndex = -1;
  button.dataset.opacityStep = direction;
  button.setAttribute('aria-label', label);
  button.innerHTML = direction === 'up'
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  return button;
}

function enhanceOpacityControl(row) {
  if (!row) return null;

  const wrapper = row.querySelector('.opacity-number-wrap');
  const input = row.querySelector('.opacity-number-input');
  if (!wrapper || !input) return null;

  if (!wrapper.querySelector('.spinner-input-wrap')) {
    const label = row.querySelector('.settings-row-label')?.textContent?.trim() || 'opacity';
    const spinnerWrap = document.createElement('div');
    spinnerWrap.className = 'spinner-input-wrap opacity-input-wrap';

    input.classList.add('input-with-spinner');
    spinnerWrap.appendChild(input);

    const suffix = document.createElement('span');
    suffix.className = 'opacity-number-suffix';
    suffix.textContent = '%';
    spinnerWrap.appendChild(suffix);

    const group = document.createElement('div');
    group.className = 'custom-spinner-group';
    group.setAttribute('aria-hidden', 'true');

    const spinner = document.createElement('div');
    spinner.className = 'custom-spinner';
    spinner.appendChild(createOpacitySpinnerButton('up', `Increase ${label}`));
    spinner.appendChild(createOpacitySpinnerButton('down', `Decrease ${label}`));
    group.appendChild(spinner);
    spinnerWrap.appendChild(group);

    wrapper.replaceChildren(spinnerWrap);
  }

  return {
    wrapper,
    input,
    spinUp: wrapper.querySelector('[data-opacity-step="up"]'),
    spinDown: wrapper.querySelector('[data-opacity-step="down"]'),
  };
}

function getPersonalizationControls() {
  if (personalizationControls) return personalizationControls;

  personalizationControls = PERSONALIZATION_OPACITY_CONFIG.map(config => {
    const row = el.personalizationOverlay?.querySelector(`[data-opacity-setting="${config.key}"]`) ?? null;
    const enhanced = enhanceOpacityControl(row);
    return {
      ...config,
      row,
      range: row?.querySelector('.opacity-slider') ?? null,
      input: enhanced?.input ?? null,
      spinUp: enhanced?.spinUp ?? null,
      spinDown: enhanced?.spinDown ?? null,
    };
  });

  return personalizationControls;
}

function savePersonalizationOpacity() {
  localStorage.setItem(LS_PERSONALIZATION_OPACITY, JSON.stringify(state.personalization.opacity));
}

function getBackgroundSlotConfig(slotKey = state.personalization.activeBackgroundTab || 'primary') {
  return BACKGROUND_SLOT_CONFIG[slotKey] ?? BACKGROUND_SLOT_CONFIG.primary;
}

function getBackgroundSelection(slotKey = 'primary') {
  return state.personalization[getBackgroundSlotConfig(slotKey).selectionKey];
}

function getBackgroundDisplay(slotKey = 'primary') {
  return state.personalization[getBackgroundSlotConfig(slotKey).displayKey];
}

function getBackgroundLibraryState(slotKey = 'primary') {
  return state.personalization[getBackgroundSlotConfig(slotKey).backgroundsKey];
}

function setRenderedBackgroundOpacity(slotKey, value, fadeDurationMs = 150, root = document.documentElement) {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  root.style.setProperty('--ts-background-fade-duration', `${fadeDurationMs}ms`);
  root.style.setProperty(slotConfig.renderedOpacityCssVar, String(value));
}

function syncRenderedBackgroundOpacity(slotKey = 'primary', fadeDurationMs = 150) {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  const hasSelection = !!getBackgroundSelection(slotKey);
  const opacity = hasSelection && backgroundLoadedBySlot[slotKey]
    ? clampOpacityValueForKey(slotConfig.opacityKey, state.personalization.opacity[slotConfig.opacityKey]) / 100
    : 0;
  setRenderedBackgroundOpacity(slotKey, opacity, fadeDurationMs);
}

function applyPersonalizationOpacityCss(opacity, root = document.documentElement) {
  PERSONALIZATION_OPACITY_CONFIG.forEach(({ key, cssVar, scaleCssVar, valueType = 'opacity', maxBlurPx }) => {
    const value = clampOpacityValueForKey(key, opacity[key]);
    if (valueType === 'blur') {
      const blurPx = convertBlurSliderValueToPx(value, maxBlurPx);
      root.style.setProperty(cssVar, `${blurPx}px`);
      if (scaleCssVar) root.style.setProperty(scaleCssVar, String(convertBlurPxToBackgroundScale(blurPx)));
      return;
    }

    root.style.setProperty(cssVar, `${value}%`);
    root.style.setProperty(`${cssVar}-alpha`, String(value / 100));
  });
  syncRenderedBackgroundOpacity('primary');
  syncRenderedBackgroundOpacity('secondary');
}

function syncPersonalizationOpacityControls() {
  getPersonalizationControls().forEach(({ key, range, input }) => {
    const value = clampOpacityValueForKey(key, state.personalization.opacity[key]);
    if (range) range.value = String(value);
    if (input) input.value = String(value);
  });
}

function normalizeBackgroundSelection(selection) {
  if (!selection || typeof selection !== 'object') return null;
  if ((selection.kind !== 'user' && selection.kind !== 'preset') || typeof selection.url !== 'string') return null;

  const id = typeof selection.id === 'string' && selection.id ? selection.id : null;
  if (!id) return null;

  return {
    kind: selection.kind,
    id,
    name: typeof selection.name === 'string' && selection.name ? selection.name : 'Background image',
    url: selection.url,
    thumbnailUrl: typeof selection.thumbnailUrl === 'string' && selection.thumbnailUrl ? selection.thumbnailUrl : null,
    naturalWidth: normalizeBackgroundDimension(selection.naturalWidth),
    naturalHeight: normalizeBackgroundDimension(selection.naturalHeight),
  };
}

function normalizeBackgroundDisplay(display, slotKey = 'primary') {
  const defaultDisplay = getBackgroundSlotConfig(slotKey).defaultDisplay;
  if (!display || typeof display !== 'object') return { ...defaultDisplay };

  return {
    positionX: ['left', 'center', 'right'].includes(display.positionX) ? display.positionX : defaultDisplay.positionX,
    positionY: ['top', 'center', 'bottom'].includes(display.positionY) ? display.positionY : defaultDisplay.positionY,
    fill: Object.hasOwn(BACKGROUND_FILL_TO_CSS_SIZE, display.fill) || display.fill === CUSTOM_BACKGROUND_SCALE_FILL
      ? display.fill
      : defaultDisplay.fill,
    customScale: normalizeCustomBackgroundScale(display.customScale, defaultDisplay.customScale),
  };
}

function selectionsMatch(left, right) {
  return !!left && !!right && left.kind === right.kind && left.id === right.id;
}

function saveBackgroundSelection(slotKey = 'primary') {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  const selection = getBackgroundSelection(slotKey);
  if (!selection) {
    localStorage.removeItem(slotConfig.storageSelectionKey);
    return;
  }

  localStorage.setItem(
    slotConfig.storageSelectionKey,
    JSON.stringify(selection),
  );
}

function applyBackgroundSelectionCss(slotKey, selection, root = document.documentElement) {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  const url = selection?.url;
  root.style.setProperty(slotConfig.selectionCssVar, url ? `url(${JSON.stringify(url)})` : 'none');
}

function saveBackgroundDisplay(slotKey = 'primary') {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  localStorage.setItem(slotConfig.storageDisplayKey, JSON.stringify(getBackgroundDisplay(slotKey)));
}

function resolveBackgroundCssSize(slotKey, display) {
  const normalized = normalizeBackgroundDisplay(display, slotKey);
  if (normalized.fill !== CUSTOM_BACKGROUND_SCALE_FILL) {
    return BACKGROUND_FILL_TO_CSS_SIZE[normalized.fill];
  }

  const selection = getBackgroundSelection(slotKey);
  const naturalWidth = normalizeBackgroundDimension(selection?.naturalWidth);
  const naturalHeight = normalizeBackgroundDimension(selection?.naturalHeight);
  if (!naturalWidth || !naturalHeight) return BACKGROUND_FILL_TO_CSS_SIZE['original-size'];

  return `${formatBackgroundSizePx(naturalWidth * normalized.customScale)}px ${formatBackgroundSizePx(naturalHeight * normalized.customScale)}px`;
}

function applyBackgroundDisplayCss(slotKey, display, root = document.documentElement) {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  const normalized = normalizeBackgroundDisplay(display, slotKey);
  root.style.setProperty(slotConfig.positionXCssVar, normalized.positionX);
  root.style.setProperty(slotConfig.positionYCssVar, normalized.positionY);
  root.style.setProperty(slotConfig.sizeCssVar, resolveBackgroundCssSize(slotKey, normalized));
}

function syncBackgroundDisplayControls(slotKey = 'primary') {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  const display = getBackgroundDisplay(slotKey);
  const positionX = el[slotConfig.positionXRef];
  const positionY = el[slotConfig.positionYRef];
  const fill = el[slotConfig.fillRef];
  const customScaleRow = el[slotConfig.customScaleRowRef];
  const customScale = el[slotConfig.customScaleRef];
  if (positionX) positionX.value = display.positionX;
  if (positionY) positionY.value = display.positionY;
  if (fill) fill.value = display.fill;
  if (customScale) customScale.value = formatCustomBackgroundScale(display.customScale);
  customScaleRow?.classList.toggle('hidden', display.fill !== CUSTOM_BACKGROUND_SCALE_FILL);
}

function setPersonalizationBackgroundStatus(message, isError = false) {
  if (!el.personalizationBackgroundStatus) return;
  el.personalizationBackgroundStatus.textContent = message;
  el.personalizationBackgroundStatus.style.color = isError ? 'var(--danger-hover)' : 'var(--text-muted)';
}

function syncBackgroundSelectionSummary(slotKey = 'primary') {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  const currentLabel = el[slotConfig.currentRef];
  if (!currentLabel) return;

  const selection = getBackgroundSelection(slotKey);
  if (!selection) {
    currentLabel.textContent = 'No background image selected.';
    return;
  }

  const sourceLabel = selection.kind === 'preset' ? 'Preset image' : 'Uploaded image';
  currentLabel.textContent = `${sourceLabel}: ${selection.name}`;
}

function compareBackgroundImages(left, right) {
  return (left?.name || '').localeCompare(right?.name || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  }) || (left?.id || '').localeCompare(right?.id || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function sortBackgroundImages(images) {
  if (!Array.isArray(images)) return [];
  return [...images].sort(compareBackgroundImages);
}

function getAllBackgroundImages(slotKey = 'primary') {
  const backgrounds = getBackgroundLibraryState(slotKey);
  return [
    ...backgrounds.userImages,
    ...backgrounds.presetImages,
  ];
}

function mergeBackgroundSelectionDetails(selection, existingSelection) {
  if (!selection) return null;
  if (!existingSelection || !selectionsMatch(selection, existingSelection)) return selection;

  return {
    ...selection,
    naturalWidth: normalizeBackgroundDimension(selection.naturalWidth) ?? normalizeBackgroundDimension(existingSelection.naturalWidth),
    naturalHeight: normalizeBackgroundDimension(selection.naturalHeight) ?? normalizeBackgroundDimension(existingSelection.naturalHeight),
  };
}

async function hydrateBackgroundSelectionDimensions(slotKey, selection) {
  if (!selection?.url) return;
  if (normalizeBackgroundDimension(selection.naturalWidth) && normalizeBackgroundDimension(selection.naturalHeight)) return;

  const token = ++backgroundMetadataTokens[slotKey];
  try {
    const image = await loadImageElement(selection.url);
    if (token !== backgroundMetadataTokens[slotKey]) return;

    const currentSelection = getBackgroundSelection(slotKey);
    if (!selectionsMatch(currentSelection, selection)) return;

    const naturalWidth = normalizeBackgroundDimension(image.naturalWidth || image.width);
    const naturalHeight = normalizeBackgroundDimension(image.naturalHeight || image.height);
    if (!naturalWidth || !naturalHeight) return;

    const nextSelection = {
      ...currentSelection,
      naturalWidth,
      naturalHeight,
    };
    state.personalization[getBackgroundSlotConfig(slotKey).selectionKey] = nextSelection;
    saveBackgroundSelection(slotKey);
    applyBackgroundDisplayCss(slotKey, getBackgroundDisplay(slotKey));
  } catch {
    // Ignore missing metadata and leave the current background sizing alone.
  }
}

async function revealBackgroundSelection(slotKey, selection) {
  const token = ++backgroundTransitionTokens[slotKey];
  backgroundLoadedBySlot[slotKey] = false;
  syncRenderedBackgroundOpacity(slotKey);

  if (!selection?.url) return;

  const ready = await waitForImageReady(selection.url);
  if (token !== backgroundTransitionTokens[slotKey]) return;

  backgroundLoadedBySlot[slotKey] = ready;
  syncRenderedBackgroundOpacity(slotKey, 1000);
}

function setBackgroundSelection(slotKey, selection, options = {}) {
  const {
    persist = true,
    render = true,
    reveal = true,
  } = options;
  const normalized = mergeBackgroundSelectionDetails(
    normalizeBackgroundSelection(selection),
    getBackgroundSelection(slotKey),
  );
  const slotConfig = getBackgroundSlotConfig(slotKey);

  state.personalization[slotConfig.selectionKey] = normalized;
  applyBackgroundSelectionCss(slotKey, normalized);
  applyBackgroundDisplayCss(slotKey, getBackgroundDisplay(slotKey));
  if (persist) saveBackgroundSelection(slotKey);
  syncBackgroundSelectionSummary(slotKey);
  if (render) renderPersonalizationBackgrounds();
  if (reveal) revealBackgroundSelection(slotKey, normalized).catch(() => {});
  if (normalized) hydrateBackgroundSelectionDimensions(slotKey, normalized).catch(() => {});
  syncThemeUi();
}

function setBackgroundDisplay(slotKey, display, options = {}) {
  const {
    persist = true,
    syncControls = true,
  } = options;
  const normalized = normalizeBackgroundDisplay(display, slotKey);
  const slotConfig = getBackgroundSlotConfig(slotKey);

  state.personalization[slotConfig.displayKey] = normalized;
  applyBackgroundDisplayCss(slotKey, normalized);
  if (persist) saveBackgroundDisplay(slotKey);
  if (syncControls) syncBackgroundDisplayControls(slotKey);
  syncThemeUi();
}

function opacityMatches(left, right) {
  return OPACITY_PRESET_KEYS.every(key => (
    clampOpacityValueForKey(key, left?.[key]) === clampOpacityValueForKey(key, right?.[key])
  ));
}

function normalizeOpacityPreset(preset, index = 0) {
  if (!preset || typeof preset !== 'object') return null;
  const name = typeof preset.name === 'string' ? preset.name.trim() : '';
  if (!name) return null;
  const includedWithApp = !!preset.includedWithApp;
  const invalid = !!preset.invalid;

  return {
    id: typeof preset.id === 'string' && preset.id ? preset.id : `custom-${index}-${Date.now()}`,
    name,
    includedWithApp,
    canEdit: preset.canEdit ?? (!includedWithApp && !invalid),
    canDelete: preset.canDelete ?? !includedWithApp,
    invalid,
    invalidReason: typeof preset.invalidReason === 'string' ? preset.invalidReason.trim() : '',
    opacity: OPACITY_PRESET_KEYS.reduce((result, key) => {
      result[key] = clampOpacityValueForKey(key, preset.opacity?.[key]);
      return result;
    }, {}),
  };
}

function normalizeStoredOpacityPresets(rawPresets) {
  if (!Array.isArray(rawPresets)) return [];

  return rawPresets
    .map((preset, index) => normalizeOpacityPreset(preset, index))
    .filter(Boolean);
}

function getFallbackOpacityPresets() {
  return DEFAULT_OPACITY_PRESETS
    .map((preset, index) => normalizeOpacityPreset({
      ...preset,
      includedWithApp: preset.includedWithApp ?? !!preset.builtIn,
      canEdit: false,
      canDelete: false,
    }, index))
    .filter(Boolean);
}

function getAllOpacityPresets() {
  if (state.personalization.opacityPresetsLoaded) return [...state.personalization.opacityPresets];
  if (state.personalization.opacityPresets.length) return [...state.personalization.opacityPresets];
  return getFallbackOpacityPresets();
}

function compareIncludedFirstByName(left, right) {
  const leftIncluded = !!left?.includedWithApp;
  const rightIncluded = !!right?.includedWithApp;
  if (leftIncluded !== rightIncluded) return leftIncluded ? 1 : -1;

  return (left?.name || '').localeCompare(right?.name || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  }) || (left?.id || '').localeCompare(right?.id || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function syncActiveOpacityPreset() {
  const presets = getAllOpacityPresets().filter(preset => !preset.invalid);
  const activePreset = presets.find(preset => preset.id === state.personalization.activeOpacityPresetId) ?? null;
  const match = activePreset && opacityMatches(activePreset.opacity, state.personalization.opacity)
    ? activePreset
    : presets.find(preset => opacityMatches(preset.opacity, state.personalization.opacity)) ?? null;
  state.personalization.activeOpacityPresetId = match?.id ?? null;
}

function getOpacityPresetById(presetId) {
  return getAllOpacityPresets().find(preset => preset.id === presetId) ?? null;
}

function getSelectedEditableOpacityPreset() {
  const presetId = el.personalizationOpacityPresetSelect?.value;
  if (!presetId || presetId === OPACITY_PRESET_CUSTOM_VALUE) return null;
  const preset = getOpacityPresetById(presetId);
  return preset?.canEdit ? preset : null;
}

function getSelectedDeletableOpacityPreset() {
  const presetId = el.personalizationOpacityPresetSelect?.value;
  if (!presetId || presetId === OPACITY_PRESET_CUSTOM_VALUE) return null;
  const preset = getOpacityPresetById(presetId);
  return preset?.canDelete ? preset : null;
}

function syncAppliedThemeDirtyState() {
  ensureThemeState();
  if (!state.personalization.themesLoaded && state.personalization.appliedThemeId) {
    state.personalization.appliedThemeDirty = false;
    return;
  }

  const activeTheme = state.personalization.themes.find(theme => theme.id === state.personalization.appliedThemeId) ?? null;
  if (!activeTheme || activeTheme.invalid) {
    state.personalization.appliedThemeDirty = false;
    if (state.personalization.appliedThemeId) {
      state.personalization.appliedThemeId = null;
      localStorage.removeItem(LS_APPLIED_THEME_ID);
    }
    return;
  }

  const matchesSelection = (left, right) => {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return left.kind === right.kind && left.id === right.id;
  };
  const matchesDisplay = (left, right) => (
    left?.positionX === right?.positionX
    && left?.positionY === right?.positionY
    && left?.fill === right?.fill
    && normalizeCustomBackgroundScale(left?.customScale, 1) === normalizeCustomBackgroundScale(right?.customScale, 1)
  );

  state.personalization.appliedThemeDirty = !(
    activeTheme.colorSchemePresetId === state.personalization.colorSchemePresetId
    && activeTheme.opacityPresetId === state.personalization.activeOpacityPresetId
    && activeTheme.backgroundImageOpacity === clampOpacityValueForKey('backgroundImage', state.personalization.opacity.backgroundImage)
    && activeTheme.backgroundImageBlur === clampOpacityValueForKey('backgroundImageBlur', state.personalization.opacity.backgroundImageBlur)
    && activeTheme.secondaryBackgroundImageOpacity === clampOpacityValueForKey('secondaryBackgroundImage', state.personalization.opacity.secondaryBackgroundImage)
    && activeTheme.secondaryBackgroundImageBlur === clampOpacityValueForKey('secondaryBackgroundImageBlur', state.personalization.opacity.secondaryBackgroundImageBlur)
    && matchesSelection(activeTheme.primaryBackgroundSelection, state.personalization.backgroundSelection)
    && matchesSelection(activeTheme.secondaryBackgroundSelection, state.personalization.secondaryBackgroundSelection)
    && matchesDisplay(activeTheme.primaryBackgroundDisplay, state.personalization.backgroundDisplay)
    && matchesDisplay(activeTheme.secondaryBackgroundDisplay, state.personalization.secondaryBackgroundDisplay)
  );
}

function syncOpacityPresetUi() {
  syncActiveOpacityPreset();
  syncAppliedThemeDirtyState();

  const selectedId = state.personalization.activeOpacityPresetId;
  const selectedPreset = getOpacityPresetById(selectedId);

  if (el.personalizationOpacityPresetSelect) {
    el.personalizationOpacityPresetSelect.innerHTML = '';

    const customOption = document.createElement('option');
    customOption.value = OPACITY_PRESET_CUSTOM_VALUE;
    customOption.textContent = 'Custom';
    el.personalizationOpacityPresetSelect.appendChild(customOption);

    getAllOpacityPresets().forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.invalid ? `${preset.name} (unavailable)` : preset.name;
      el.personalizationOpacityPresetSelect.appendChild(option);
    });

    el.personalizationOpacityPresetSelect.value = selectedPreset?.id ?? OPACITY_PRESET_CUSTOM_VALUE;
  }

  if (el.personalizationOpacityPresetName) {
    el.personalizationOpacityPresetName.value = selectedPreset?.canEdit ? selectedPreset.name : '';
  }

  if (el.personalizationOpacityPresetUpdate) el.personalizationOpacityPresetUpdate.disabled = !selectedPreset?.canEdit;
  if (el.personalizationOpacityPresetDelete) el.personalizationOpacityPresetDelete.disabled = !selectedPreset?.canDelete;
}

function normalizeTheme(theme) {
  if (!theme || typeof theme !== 'object') return null;
  const id = typeof theme.id === 'string' ? theme.id : '';
  const name = typeof theme.name === 'string' && theme.name.trim()
    ? theme.name.trim()
    : id;
  if (!name) return null;
  const includedWithApp = !!theme.includedWithApp;
  const invalid = !!theme.invalid;

  return {
    id,
    name,
    description: typeof theme.description === 'string' ? theme.description.trim() : '',
    previewImage: theme.previewImage && typeof theme.previewImage === 'object'
      ? {
          fileName: typeof theme.previewImage.fileName === 'string' ? theme.previewImage.fileName : '',
          url: typeof theme.previewImage.url === 'string' ? theme.previewImage.url : '',
          thumbnailUrl: typeof theme.previewImage.thumbnailUrl === 'string' ? theme.previewImage.thumbnailUrl : '',
        }
      : null,
    colorSchemePresetId: typeof theme.colorSchemePresetId === 'string' ? theme.colorSchemePresetId : '',
    colorSchemePresetName: typeof theme.colorSchemePresetName === 'string' ? theme.colorSchemePresetName : '',
    primaryBackgroundSelection: normalizeBackgroundSelection(theme.primaryBackgroundSelection),
    primaryBackgroundDisplay: normalizeBackgroundDisplay(theme.primaryBackgroundDisplay, 'primary'),
    secondaryBackgroundSelection: normalizeBackgroundSelection(theme.secondaryBackgroundSelection),
    secondaryBackgroundDisplay: normalizeBackgroundDisplay(theme.secondaryBackgroundDisplay, 'secondary'),
    backgroundImageOpacity: clampOpacityValueForKey('backgroundImage', theme.backgroundImageOpacity),
    backgroundImageBlur: clampOpacityValueForKey('backgroundImageBlur', theme.backgroundImageBlur),
    secondaryBackgroundImageOpacity: clampOpacityValueForKey('secondaryBackgroundImage', theme.secondaryBackgroundImageOpacity),
    secondaryBackgroundImageBlur: clampOpacityValueForKey('secondaryBackgroundImageBlur', theme.secondaryBackgroundImageBlur),
    opacityPresetId: typeof theme.opacityPresetId === 'string' ? theme.opacityPresetId : '',
    opacityPresetName: typeof theme.opacityPresetName === 'string' ? theme.opacityPresetName : '',
    includedWithApp,
    canEdit: theme.canEdit ?? (!includedWithApp && !invalid),
    canDelete: theme.canDelete ?? !includedWithApp,
    invalid,
    invalidReason: typeof theme.invalidReason === 'string' ? theme.invalidReason.trim() : '',
  };
}

function ensureThemeState() {
  if (!Array.isArray(state.personalization.themes)) {
    state.personalization.themes = [];
  }
  if (typeof state.personalization.themesLoaded !== 'boolean') {
    state.personalization.themesLoaded = false;
  }
  if (typeof state.personalization.selectedThemeId !== 'string' && state.personalization.selectedThemeId !== null) {
    state.personalization.selectedThemeId = null;
  }
  if (typeof state.personalization.appliedThemeId !== 'string' && state.personalization.appliedThemeId !== null) {
    state.personalization.appliedThemeId = null;
  }
  if (typeof state.personalization.appliedThemeDirty !== 'boolean') {
    state.personalization.appliedThemeDirty = false;
  }
  if (!state.personalization.themeDraft || typeof state.personalization.themeDraft !== 'object') {
    state.personalization.themeDraft = {
      name: '',
      description: '',
      previewImage: null,
      previewImageFile: null,
      previewThumbnailFile: null,
      previewObjectUrl: '',
      previewThumbnailObjectUrl: '',
    };
  }
}

function clearThemeDraftObjectUrls() {
  ensureThemeState();
  if (state.personalization.themeDraft.previewObjectUrl) {
    URL.revokeObjectURL(state.personalization.themeDraft.previewObjectUrl);
  }
  if (state.personalization.themeDraft.previewThumbnailObjectUrl) {
    URL.revokeObjectURL(state.personalization.themeDraft.previewThumbnailObjectUrl);
  }
  state.personalization.themeDraft.previewObjectUrl = '';
  state.personalization.themeDraft.previewThumbnailObjectUrl = '';
}

function setThemeDraftPreview(previewImage, options = {}) {
  ensureThemeState();
  const {
    previewImageFile = null,
    previewThumbnailFile = null,
    previewObjectUrl = '',
    previewThumbnailObjectUrl = '',
  } = options;
  clearThemeDraftObjectUrls();
  state.personalization.themeDraft.previewImage = previewImage ? { ...previewImage } : null;
  state.personalization.themeDraft.previewImageFile = previewImageFile;
  state.personalization.themeDraft.previewThumbnailFile = previewThumbnailFile;
  state.personalization.themeDraft.previewObjectUrl = previewObjectUrl;
  state.personalization.themeDraft.previewThumbnailObjectUrl = previewThumbnailObjectUrl;
}

function getSelectedTheme() {
  ensureThemeState();
  return state.personalization.themes.find(theme => theme.id === state.personalization.selectedThemeId) ?? null;
}

function hasExistingTrackspotPreferences() {
  return Object.keys(localStorage).some(key => (
    key.startsWith(LS_PREFIX)
    && key !== LS_DEFAULT_THEME_INITIALIZED
  ));
}

function shouldApplyInitialDefaultTheme() {
  return !state.personalization.appliedThemeId
    && !state.personalization.selectedThemeId
    && !localStorage.getItem(LS_DEFAULT_THEME_INITIALIZED)
    && !hasExistingTrackspotPreferences();
}

function markInitialDefaultThemeApplied() {
  localStorage.setItem(LS_DEFAULT_THEME_INITIALIZED, '1');
}

function normalizeSeasonalThemeHistory(rawValue) {
  let parsed = rawValue;

  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue || '{}') || {};
    } catch {
      parsed = {};
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  return Object.entries(parsed).reduce((result, [key, value]) => {
    const parsedYear = Number.parseInt(String(value), 10);
    if (key && Number.isInteger(parsedYear) && parsedYear > 0) {
      result[key] = parsedYear;
    }
    return result;
  }, {});
}

function getSeasonalThemeHistory() {
  return normalizeSeasonalThemeHistory(state.seasonalThemeHistory || {});
}

function saveSeasonalThemeHistory(history) {
  const normalized = normalizeSeasonalThemeHistory(history);
  state.seasonalThemeHistory = normalized;
  if (!Object.keys(normalized).length) {
    localStorage.removeItem(LS_SEASONAL_THEME_HISTORY);
  } else {
    localStorage.setItem(LS_SEASONAL_THEME_HISTORY, JSON.stringify(normalized));
  }
  return patchPreferences({
    seasonalThemeHistory: normalized,
  }).catch(error => {
    console.error('Failed to save seasonal theme history:', error);
    return null;
  });
}

function markSeasonalThemeHandled(seasonKey, year = new Date().getFullYear()) {
  if (!seasonKey || !Number.isInteger(year) || year <= 0) return;
  const history = getSeasonalThemeHistory();
  history[seasonKey] = year;
  saveSeasonalThemeHistory(history);
}

function getActiveSeasonalThemeRule(now = new Date()) {
  return SEASONAL_THEME_RULES.find(rule => typeof rule.isActive === 'function' && rule.isActive(now)) ?? null;
}

function maybeMarkCurrentSeasonHandledForBrandNewUser(now = new Date()) {
  const activeRule = getActiveSeasonalThemeRule(now);
  if (!activeRule) return;
  markSeasonalThemeHandled(activeRule.key, now.getFullYear());
}

async function maybeApplySeasonalTheme(now = new Date()) {
  if (state.grinchMode) return false;

  const activeRule = getActiveSeasonalThemeRule(now);
  if (!activeRule) return false;

  const currentYear = now.getFullYear();
  const history = getSeasonalThemeHistory();
  if (history[activeRule.key] === currentYear) return false;

  const seasonalTheme = state.personalization.themes.find(theme => !theme.invalid && theme.name === activeRule.themeName) ?? null;
  if (!seasonalTheme) return false;

  await applyTheme(seasonalTheme);
  markSeasonalThemeHandled(activeRule.key, currentYear);
  return true;
}

function isThemeDraftUninitialized() {
  ensureThemeState();
  return !state.personalization.themeDraft.name
    && !state.personalization.themeDraft.description
    && !state.personalization.themeDraft.previewImage
    && !state.personalization.themeDraft.previewImageFile
    && !state.personalization.themeDraft.previewThumbnailFile
    && !state.personalization.themeDraft.previewObjectUrl
    && !state.personalization.themeDraft.previewThumbnailObjectUrl;
}

function populateThemeDraftFromTheme(theme) {
  ensureThemeState();
  state.personalization.themeDraft.name = theme?.name ?? '';
  state.personalization.themeDraft.description = theme?.description ?? '';
  setThemeDraftPreview(theme?.previewImage ?? null);
}

function startNewThemeDraft() {
  ensureThemeState();
  state.personalization.selectedThemeId = null;
  state.personalization.themeDraft.name = '';
  state.personalization.themeDraft.description = '';
  setThemeDraftPreview(null);
  syncThemeUi();
}

function syncThemeUi() {
  ensureThemeState();
  syncAppliedThemeDirtyState();

  const themes = state.personalization.themes;

  if (el.personalizationThemeSelect) {
    isSyncingThemeSelectUi = true;
    el.personalizationThemeSelect.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'No theme';
    el.personalizationThemeSelect.appendChild(placeholderOption);

    themes.forEach(theme => {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.invalid ? `${theme.name} (unavailable)` : theme.name;
      option.disabled = !!theme.invalid;
      el.personalizationThemeSelect.appendChild(option);
    });

    el.personalizationThemeSelect.value = state.personalization.selectedThemeId || '';
    queueMicrotask(() => {
      isSyncingThemeSelectUi = false;
    });
  }

  const selectedTheme = getSelectedTheme();
  const appliedTheme = themes.find(theme => theme.id === state.personalization.appliedThemeId) ?? null;
  const draftPreview = state.personalization.themeDraft.previewImage;
  const isInvalidTheme = !!selectedTheme?.invalid;
  const isReadOnlyTheme = !!selectedTheme && !selectedTheme.canEdit;

  if (el.personalizationThemeDescription) {
    el.personalizationThemeDescription.textContent = isInvalidTheme
      ? (selectedTheme.invalidReason || 'Theme is unavailable.')
      : selectedTheme?.description
      || (selectedTheme ? 'No description.' : 'No theme selected.');
  }

  if (el.personalizationThemeStatus) {
    if (!selectedTheme) {
      el.personalizationThemeStatus.textContent = 'No theme is currently applied. Current personalization settings are being used directly.';
    } else if (isInvalidTheme) {
      el.personalizationThemeStatus.textContent = 'Theme is unavailable because one or more saved dependencies are missing.';
    } else if (isReadOnlyTheme && selectedTheme.id === appliedTheme?.id && state.personalization.appliedThemeDirty) {
      el.personalizationThemeStatus.textContent = 'Included with the app, currently applied, with manual changes that no longer match the saved theme.';
    } else if (isReadOnlyTheme && selectedTheme.id === appliedTheme?.id) {
      el.personalizationThemeStatus.textContent = 'Included with the app and currently applied.';
    } else if (isReadOnlyTheme) {
      el.personalizationThemeStatus.textContent = 'Included with the app. Duplicate it with "New" if you want an editable version.';
    } else if (selectedTheme.id === appliedTheme?.id && state.personalization.appliedThemeDirty) {
      el.personalizationThemeStatus.textContent = 'Currently applied, with manual changes that no longer match the saved theme.';
    } else if (selectedTheme.id === appliedTheme?.id) {
      el.personalizationThemeStatus.textContent = 'Currently applied.';
    } else {
      el.personalizationThemeStatus.textContent = 'Currently applied.';
    }
  }

  if (el.personalizationThemeSelectionWarning) {
    el.personalizationThemeSelectionWarning.textContent = state.personalization.appliedThemeDirty
      ? 'Warning: You have unsaved changes that differ from the current theme. If you select another theme now, those changes will be lost.'
      : '';
    el.personalizationThemeSelectionWarning.style.color = state.personalization.appliedThemeDirty
      ? 'var(--warning, #d8b14a)'
      : 'var(--text-muted)';
  }

  if (el.personalizationThemeEditorWarning) {
    el.personalizationThemeEditorWarning.textContent = isInvalidTheme
      ? (selectedTheme.invalidReason || 'Theme is unavailable.')
      : isReadOnlyTheme
        ? 'Theme is bundled with the app so cannot be edited.'
        : '';
    el.personalizationThemeEditorWarning.style.color = isInvalidTheme
      ? 'var(--danger)'
      : isReadOnlyTheme
      ? 'var(--warning, #d8b14a)'
      : 'var(--text-muted)';
  }

  if (el.personalizationThemeName) {
    el.personalizationThemeName.value = state.personalization.themeDraft.name || '';
    el.personalizationThemeName.disabled = isReadOnlyTheme;
  }
  if (el.personalizationThemeDescriptionInput) {
    el.personalizationThemeDescriptionInput.value = state.personalization.themeDraft.description || '';
    el.personalizationThemeDescriptionInput.disabled = isReadOnlyTheme;
  }

  if (el.personalizationThemePreviewButton) {
    const hasPreview = !!(draftPreview?.thumbnailUrl || draftPreview?.url);
    el.personalizationThemePreviewButton.classList.toggle('has-image', hasPreview);
    el.personalizationThemePreviewButton.disabled = !draftPreview?.url;
  }
  if (el.personalizationThemeUploadPreview) {
    el.personalizationThemeUploadPreview.disabled = isReadOnlyTheme;
  }
  if (el.personalizationThemePreviewInput) {
    el.personalizationThemePreviewInput.disabled = isReadOnlyTheme;
  }
  if (el.personalizationThemePreviewImage) {
    el.personalizationThemePreviewImage.src = draftPreview?.thumbnailUrl || draftPreview?.url || '';
    el.personalizationThemePreviewImage.alt = state.personalization.themeDraft.name
      ? `${state.personalization.themeDraft.name} theme preview`
      : 'Theme preview';
  }

  if (el.personalizationThemeUpdate) el.personalizationThemeUpdate.disabled = !selectedTheme?.canEdit;
  if (el.personalizationThemeDelete) el.personalizationThemeDelete.disabled = !selectedTheme?.canDelete;
  renderThemePickerGallery();
}

function setThemeEditorMessage(message = '', isError = false) {
  if (!el.personalizationThemeEditorMessage) return;
  el.personalizationThemeEditorMessage.textContent = message;
  el.personalizationThemeEditorMessage.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
}

async function deleteThemeFromUi(theme) {
  if (!theme?.canDelete) return;
  if (!window.confirm(`Delete the "${theme.name}" theme?`)) return;

  try {
    setThemeEditorMessage('');
    await apiFetch(`/api/themes/${encodeURIComponent(theme.id)}`, {
      method: 'DELETE',
    });
    state.personalization.themes = state.personalization.themes.filter(item => item.id !== theme.id);
    if (state.personalization.appliedThemeId === theme.id) {
      setAppliedThemeId(null);
    }
    if (state.personalization.selectedThemeId === theme.id) {
      startNewThemeDraft();
    } else {
      syncThemeUi();
    }
    setPersonalizationBackgroundStatus(`Deleted "${theme.name}".`);
  } catch (error) {
    setThemeEditorMessage(error.message, true);
  }
}

function createThemePickerCard(theme) {
  const isSelected = theme?.id === state.personalization.selectedThemeId;
  const isInvalid = !!theme?.invalid;
  const card = document.createElement('div');
  card.className = 'background-card';
  card.classList.toggle('active', isSelected);
  card.classList.toggle('is-invalid', isInvalid);

  const previewUrl = theme?.previewImage?.thumbnailUrl || theme?.previewImage?.url || '';
  if (previewUrl) {
    const preview = document.createElement('img');
    preview.className = 'background-card-preview';
    preview.alt = '';
    preview.loading = 'lazy';
    preview.src = previewUrl;
    attachLightboxToPreview(preview, theme?.previewImage?.url || previewUrl, theme.name);
    card.appendChild(preview);
  } else {
    const empty = document.createElement('div');
    empty.className = 'background-gallery-empty';
    empty.textContent = isInvalid ? 'Theme unavailable.' : 'No preview available.';
    card.appendChild(empty);
  }

  const info = document.createElement('div');
  info.className = 'background-card-info';

  const name = document.createElement('div');
  name.className = 'background-card-name';
  name.textContent = theme.name;
  info.appendChild(name);

  if (isInvalid) {
    const meta = document.createElement('div');
    meta.className = 'background-card-meta';
    meta.textContent = theme.invalidReason || 'Theme is unavailable.';
    info.appendChild(meta);
  }

  const actions = document.createElement('div');
  actions.className = 'background-card-actions';

  const useButton = document.createElement('button');
  useButton.className = `btn ${isSelected ? 'btn-primary' : 'btn-ghost'} btn-small`;
  useButton.type = 'button';
  useButton.textContent = isInvalid ? 'Unavailable' : isSelected ? 'Selected' : 'Use';
  useButton.disabled = isInvalid || isSelected;
  if (!isInvalid) {
    useButton.addEventListener('click', () => {
      applyTheme(theme).catch(error => {
        setPersonalizationBackgroundStatus(`Could not apply "${theme.name}": ${error.message}`, true);
      });
    });
  }
  actions.appendChild(useButton);

  if (isInvalid && theme.canEdit) {
    const repairButton = document.createElement('button');
    repairButton.className = 'btn btn-ghost btn-small';
    repairButton.type = 'button';
    repairButton.textContent = 'Repair';
    repairButton.addEventListener('click', () => {
      state.personalization.selectedThemeId = theme.id;
      populateThemeDraftFromTheme(theme);
      syncThemeUi();
      setThemeEditorMessage(theme.invalidReason || 'Theme is unavailable.', true);
    });
    actions.appendChild(repairButton);
  }

  if (theme.canDelete) {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn-ghost btn-small';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      deleteThemeFromUi(theme).catch(() => {});
    });
    actions.appendChild(deleteButton);
  }

  card.appendChild(info);
  card.appendChild(actions);
  return card;
}

function renderThemePickerGallery() {
  if (!el.personalizationThemeGalleryUser || !el.personalizationThemeGalleryPreset) return;

  el.personalizationThemeGalleryUser.innerHTML = '';
  el.personalizationThemeGalleryPreset.innerHTML = '';

  if (!state.personalization.themes.length) {
    const empty = document.createElement('div');
    empty.className = 'background-gallery-empty';
    empty.textContent = 'No themes are available.';
    el.personalizationThemeGalleryPreset.appendChild(empty);
    return;
  }

  const userThemes = state.personalization.themes.filter(theme => !theme.includedWithApp);
  const presetThemes = state.personalization.themes.filter(theme => theme.includedWithApp);

  if (!userThemes.length) {
    const empty = document.createElement('div');
    empty.className = 'background-gallery-empty';
    empty.textContent = 'You haven\'t made any themes.';
    el.personalizationThemeGalleryUser.appendChild(empty);
  } else {
    userThemes.forEach(theme => {
      el.personalizationThemeGalleryUser.appendChild(createThemePickerCard(theme));
    });
  }

  if (!presetThemes.length) {
    const empty = document.createElement('div');
    empty.className = 'background-gallery-empty';
    empty.textContent = 'No preset themes are available.';
    el.personalizationThemeGalleryPreset.appendChild(empty);
    return;
  }

  presetThemes.forEach(theme => {
    el.personalizationThemeGalleryPreset.appendChild(createThemePickerCard(theme));
  });
}

function setAppliedThemeId(themeId, options = {}) {
  const { persist = true } = options;
  ensureThemeState();
  state.personalization.appliedThemeId = themeId || null;
  if (persist) {
    if (state.personalization.appliedThemeId) {
      localStorage.setItem(LS_APPLIED_THEME_ID, state.personalization.appliedThemeId);
    } else {
      localStorage.removeItem(LS_APPLIED_THEME_ID);
    }
  }
  syncThemeUi();
}

function removeDeletedThemesFromState(deletedThemes = []) {
  ensureThemeState();
  if (!Array.isArray(deletedThemes) || !deletedThemes.length) return;
  const deletedIds = new Set(deletedThemes.map(theme => theme.id));
  state.personalization.themes = state.personalization.themes.filter(theme => !deletedIds.has(theme.id));
  if (deletedIds.has(state.personalization.selectedThemeId)) {
    startNewThemeDraft();
  }
  if (deletedIds.has(state.personalization.appliedThemeId)) {
    setAppliedThemeId(null);
  } else {
    syncThemeUi();
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be loaded.'));
    img.src = src;
  });
}

async function createThumbnailBlobFromUrl(url) {
  if (!url) return null;

  const image = await loadImageElement(url);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;

  const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.82);
  });
}

async function createThumbnailFileFromFile(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const blob = await createThumbnailBlobFromUrl(objectUrl);
    if (!blob) return null;
    const nameBase = (file.name || 'background').replace(/\.[^.]+$/, '');
    return new File([blob], `${nameBase}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadOpacityPresets(options = {}) {
  const { showError = false } = options;

  try {
    const data = await apiFetch('/api/opacity-presets');
    const presets = normalizeStoredOpacityPresets(data.presets).sort(compareIncludedFirstByName);
    state.personalization.opacityPresets = presets;
    state.personalization.opacityPresetsLoaded = true;
    syncOpacityPresetUi();
    syncThemeUi();
    return true;
  } catch (error) {
    if (showError) {
      setPersonalizationBackgroundStatus(`Could not load opacity presets: ${error.message}`, true);
    }
    return false;
  }
}

async function loadThemes(options = {}) {
  const { showError = false } = options;

  try {
    const data = await apiFetch('/api/themes');
    state.personalization.themes = (data.themes ?? []).map(normalizeTheme).filter(Boolean).sort(compareIncludedFirstByName);
    state.personalization.themesLoaded = true;
    const isKnownThemeId = themeId => state.personalization.themes.some(theme => theme.id === themeId);
    const isAvailableThemeId = themeId => state.personalization.themes.some(theme => theme.id === themeId && !theme.invalid);

    if (state.personalization.appliedThemeId
      && !isAvailableThemeId(state.personalization.appliedThemeId)) {
      setAppliedThemeId(null);
    }

    if (state.personalization.selectedThemeId
      && !isKnownThemeId(state.personalization.selectedThemeId)) {
      state.personalization.selectedThemeId = null;
    }

    if (!state.personalization.selectedThemeId && state.personalization.appliedThemeId) {
      state.personalization.selectedThemeId = state.personalization.appliedThemeId;
    }

    const selectedTheme = getSelectedTheme();
    if (selectedTheme && isThemeDraftUninitialized()) {
      populateThemeDraftFromTheme(selectedTheme);
    }

    if (shouldApplyInitialDefaultTheme()) {
      const defaultTheme = state.personalization.themes.find(theme => (
        !theme.invalid && theme.includedWithApp && theme.name === DEFAULT_INCLUDED_THEME_NAME
      )) ?? null;

      if (defaultTheme) {
        await applyTheme(defaultTheme);
        markInitialDefaultThemeApplied();
        maybeMarkCurrentSeasonHandledForBrandNewUser();
        return;
      }
    }

    if (await maybeApplySeasonalTheme()) {
      return;
    }

    syncThemeUi();
  } catch (error) {
    if (showError) {
      setPersonalizationBackgroundStatus(`Could not load themes: ${error.message}`, true);
    }
  }
}

async function handleThemePreviewUpload(file) {
  if (!file) return;

  try {
    const previewThumbnailFile = await createThumbnailFileFromFile(file);
    const previewObjectUrl = URL.createObjectURL(file);
    const previewThumbnailObjectUrl = previewThumbnailFile ? URL.createObjectURL(previewThumbnailFile) : previewObjectUrl;
    const previewImage = {
      fileName: file.name,
      url: previewObjectUrl,
      thumbnailUrl: previewThumbnailObjectUrl,
    };
    setThemeDraftPreview(previewImage, {
      previewImageFile: file,
      previewThumbnailFile,
      previewObjectUrl,
      previewThumbnailObjectUrl: previewThumbnailFile ? previewThumbnailObjectUrl : '',
    });
    syncThemeUi();
    setPersonalizationBackgroundStatus(`Loaded preview image "${file.name}".`);
  } catch (error) {
    setPersonalizationBackgroundStatus(`Could not load preview image: ${error.message}`, true);
  } finally {
    if (el.personalizationThemePreviewInput) el.personalizationThemePreviewInput.value = '';
  }
}

function buildThemeFormData(options = {}) {
  const {
    requireNewPreview = false,
  } = options;
  const name = state.personalization.themeDraft.name.trim();
  if (!name) {
    throw new Error('Enter a theme name before saving.');
  }
  if (!state.personalization.activeOpacityPresetId) {
    throw new Error('Themes must reference a saved opacity preset. Apply or save an opacity preset first.');
  }
  if (requireNewPreview && !state.personalization.themeDraft.previewImageFile) {
    throw new Error('Upload a preview image before creating a theme.');
  }

  const form = new FormData();
  form.append('name', name);
  form.append('description', state.personalization.themeDraft.description.trim());
  form.append('colorSchemePresetId', state.personalization.colorSchemePresetId);
  form.append('opacityPresetId', state.personalization.activeOpacityPresetId);
  form.append('backgroundImageOpacity', String(clampOpacityValueForKey('backgroundImage', state.personalization.opacity.backgroundImage)));
  form.append('backgroundImageBlur', String(clampOpacityValueForKey('backgroundImageBlur', state.personalization.opacity.backgroundImageBlur)));
  form.append('secondaryBackgroundImageOpacity', String(clampOpacityValueForKey('secondaryBackgroundImage', state.personalization.opacity.secondaryBackgroundImage)));
  form.append('secondaryBackgroundImageBlur', String(clampOpacityValueForKey('secondaryBackgroundImageBlur', state.personalization.opacity.secondaryBackgroundImageBlur)));
  form.append('primaryBackgroundSelection', JSON.stringify(getBackgroundSelection('primary')));
  form.append('primaryBackgroundDisplay', JSON.stringify(getBackgroundDisplay('primary')));
  form.append('secondaryBackgroundSelection', JSON.stringify(getBackgroundSelection('secondary')));
  form.append('secondaryBackgroundDisplay', JSON.stringify(getBackgroundDisplay('secondary')));
  form.append('includedWithApp', 'false');

  if (state.personalization.themeDraft.previewImageFile) {
    form.append('previewImage', state.personalization.themeDraft.previewImageFile);
  }
  if (state.personalization.themeDraft.previewThumbnailFile) {
    form.append('previewThumbnail', state.personalization.themeDraft.previewThumbnailFile);
  }
  return form;
}

export async function applyTheme(theme, options = {}) {
  const { persist = true } = options;
  if (!theme) return;
  if (theme.invalid) {
    throw new Error(theme.invalidReason || 'Theme is unavailable.');
  }

  if (!state.personalization.opacityPresetsLoaded) {
    const loaded = await loadOpacityPresets({ showError: true });
    if (!loaded) {
      throw new Error('Could not load opacity presets needed to apply this theme.');
    }
  }

  const opacityPreset = getOpacityPresetById(theme.opacityPresetId);
  if (!opacityPreset || opacityPreset.invalid) {
    throw new Error(`Theme "${theme.name}" references an unavailable opacity preset.`);
  }

  state.personalization.selectedThemeId = theme.id;
  state.personalization.activeOpacityPresetId = theme.opacityPresetId;
  populateThemeDraftFromTheme(theme);
  syncThemeUi();

  applyColorSchemePreset(theme.colorSchemePresetId, { persist });
  applyPersonalizationOpacity({
    ...state.personalization.opacity,
    ...opacityPreset.opacity,
    backgroundImage: theme.backgroundImageOpacity,
    backgroundImageBlur: theme.backgroundImageBlur,
    secondaryBackgroundImage: theme.secondaryBackgroundImageOpacity,
    secondaryBackgroundImageBlur: theme.secondaryBackgroundImageBlur,
  }, { persist });
  setBackgroundSelection('primary', theme.primaryBackgroundSelection, { persist, render: false });
  setBackgroundDisplay('primary', theme.primaryBackgroundDisplay, { persist });
  setBackgroundSelection('secondary', theme.secondaryBackgroundSelection, { persist, render: false });
  setBackgroundDisplay('secondary', theme.secondaryBackgroundDisplay, { persist });
  renderPersonalizationBackgrounds();
  setAppliedThemeId(theme.id, { persist });
  state.personalization.appliedThemeDirty = false;
  syncThemeUi();
}

export async function applyThemeByName(themeName, options = {}) {
  if (!state.personalization.themesLoaded) {
    await loadThemes();
  }
  const theme = state.personalization.themes.find(item => item.name === themeName) ?? null;
  if (!theme) throw new Error(`Theme "${themeName}" is not available.`);
  await applyTheme(theme, options);
  return theme;
}

export async function restorePersonalizationFromStorage() {
  restorePersonalizationSettings();
  if (!state.personalization.themesLoaded) {
    await loadThemes();
  } else {
    syncThemeUi();
  }
}

function getBackgroundThumbnailEndpoint(slotKey, image) {
  if (!image?.id) return null;
  const slotConfig = getBackgroundSlotConfig(slotKey);
  if (image.kind === 'user') return slotConfig.userThumbnailEndpoint(image.id);
  if (image.kind === 'preset') return slotConfig.presetThumbnailEndpoint(image.id);
  return null;
}

function getStoredBackgroundCollection(slotKey, kind) {
  const backgrounds = getBackgroundLibraryState(slotKey);
  return kind === 'preset'
    ? backgrounds.presetImages
    : backgrounds.userImages;
}

async function backfillBackgroundThumbnail(slotKey, image, preview) {
  if (!image?.id || !image?.url || image.thumbnailUrl) return;

  const endpoint = getBackgroundThumbnailEndpoint(slotKey, image);
  if (!endpoint) return;

  try {
    const blob = await createThumbnailBlobFromUrl(image.url);
    if (!blob) return;

    const form = new FormData();
    form.append('thumbnail', blob, `${image.id.replace(/\.[^.]+$/, '')}.jpg`);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form,
    });
    const data = await response.json();
    if (!response.ok || !data.image?.thumbnailUrl) return;

    const stored = getStoredBackgroundCollection(slotKey, image.kind).find(item => item.id === image.id);
    if (stored) stored.thumbnailUrl = data.image.thumbnailUrl;
    if (preview) {
      preview.src = data.image.thumbnailUrl;
      preview.classList.remove('background-card-preview-placeholder');
    }
  } catch {
    if (preview && !preview.getAttribute('src')) {
      preview.src = image.url;
      preview.classList.remove('background-card-preview-placeholder');
    }
  }
}

function attachLightboxToPreview(preview, url, label) {
  if (!preview || !url) return;
  preview.classList.add('clickable-thumbnail');
  preview.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openArtLightbox(url, label);
  });
}

function createBackgroundCard(slotKey, image) {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  const currentSelection = getBackgroundSelection(slotKey);
  const card = document.createElement('div');
  card.className = 'background-card';
  card.classList.toggle('active', selectionsMatch(currentSelection, image));

  const preview = document.createElement('img');
  preview.className = 'background-card-preview';
  preview.alt = '';
  preview.loading = 'lazy';
  if (image.thumbnailUrl) {
    preview.src = image.thumbnailUrl;
  } else if (image.kind === 'user') {
    preview.classList.add('background-card-preview-placeholder');
    backfillBackgroundThumbnail(slotKey, image, preview).catch(() => {});
  } else {
    preview.src = image.url;
    backfillBackgroundThumbnail(slotKey, image, preview).catch(() => {});
  }
  attachLightboxToPreview(preview, image.url, image.name);

  const info = document.createElement('div');
  info.className = 'background-card-info';

  const name = document.createElement('div');
  name.className = 'background-card-name';
  name.textContent = image.name;

  info.appendChild(name);

  const actions = document.createElement('div');
  actions.className = 'background-card-actions';

  const useButton = document.createElement('button');
  useButton.className = `btn ${selectionsMatch(currentSelection, image) ? 'btn-primary' : 'btn-ghost'} btn-small`;
  useButton.type = 'button';
  useButton.textContent = selectionsMatch(currentSelection, image) ? 'Selected' : 'Use';
  useButton.disabled = selectionsMatch(currentSelection, image);
  useButton.addEventListener('click', () => {
    setBackgroundSelection(slotKey, image);
    setPersonalizationBackgroundStatus(slotConfig.selectedMessage(image.name));
  });
  actions.appendChild(useButton);

  if (image.canDelete) {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn-ghost btn-small';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      await deletePersonalizationBackground(slotKey, image);
    });
    actions.appendChild(deleteButton);
  }

  card.appendChild(preview);
  card.appendChild(info);
  card.appendChild(actions);
  return card;
}

function renderBackgroundGallery(slotKey, container, images, emptyMessage) {
  if (!container) return;
  container.innerHTML = '';

  const sortedImages = sortBackgroundImages(images);

  if (!sortedImages.length) {
    const empty = document.createElement('div');
    empty.className = 'background-gallery-empty';
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  sortedImages.forEach(image => {
    container.appendChild(createBackgroundCard(slotKey, image));
  });
}

function renderPersonalizationBackgrounds() {
  Object.keys(BACKGROUND_SLOT_CONFIG).forEach(slotKey => {
    const backgrounds = getBackgroundLibraryState(slotKey);
    renderBackgroundGallery(
      slotKey,
      el[getBackgroundSlotConfig(slotKey).userImagesRef],
      backgrounds.userImages,
      'Upload a JPG, PNG, GIF, or WebP image to add it here.',
    );
    renderBackgroundGallery(
      slotKey,
      el[getBackgroundSlotConfig(slotKey).presetImagesRef],
      backgrounds.presetImages,
      'No preset background images are available.',
    );
    syncBackgroundSelectionSummary(slotKey);
  });
}

function syncBackgroundTabUi() {
  Object.keys(BACKGROUND_SLOT_CONFIG).forEach(slotKey => {
    const slotConfig = getBackgroundSlotConfig(slotKey);
    const isActive = state.personalization.activeBackgroundTab === slotKey;
    const button = el[slotConfig.tabButtonRef];
    const panel = el[slotConfig.panelRef];
    button?.classList.toggle('active', isActive);
    if (button) button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    panel?.classList.toggle('hidden', !isActive);
  });
}

function setActiveBackgroundTab(slotKey = 'primary') {
  state.personalization.activeBackgroundTab = getBackgroundSlotConfig(slotKey).key;
  syncBackgroundTabUi();
}

async function loadBackgroundLibrary() {
  Object.keys(BACKGROUND_SLOT_CONFIG).forEach(slotKey => {
    getBackgroundLibraryState(slotKey).loading = true;
  });
  setPersonalizationBackgroundStatus('Loading background images…');

  try {
    const data = await apiFetch('/api/backgrounds');
    Object.keys(BACKGROUND_SLOT_CONFIG).forEach(slotKey => {
      const slotConfig = getBackgroundSlotConfig(slotKey);
      const backgrounds = getBackgroundLibraryState(slotKey);
      backgrounds.userImages = sortBackgroundImages(data[slotConfig.apiResponseUserKey] ?? []);
      backgrounds.presetImages = sortBackgroundImages(data[slotConfig.apiResponsePresetKey] ?? []);

      const currentSelection = getBackgroundSelection(slotKey);
      if (currentSelection) {
        const replacement = getAllBackgroundImages(slotKey).find(image => selectionsMatch(currentSelection, image)) ?? null;
        setBackgroundSelection(slotKey, replacement, { persist: true, render: false });
      }
    });

    renderPersonalizationBackgrounds();
    setPersonalizationBackgroundStatus('');
  } catch (error) {
    renderPersonalizationBackgrounds();
    setPersonalizationBackgroundStatus(`Could not load background images: ${error.message}`, true);
  } finally {
    Object.keys(BACKGROUND_SLOT_CONFIG).forEach(slotKey => {
      getBackgroundLibraryState(slotKey).loading = false;
    });
  }
}

async function uploadPersonalizationBackground(slotKey, file) {
  if (!file) return;
  const slotConfig = getBackgroundSlotConfig(slotKey);

  setPersonalizationBackgroundStatus(slotConfig.uploadStatusMessage);
  const form = new FormData();
  form.append('background', file);
  const thumbnailFile = await createThumbnailFileFromFile(file).catch(() => null);
  if (thumbnailFile) form.append('thumbnail', thumbnailFile);

  try {
    const response = await fetch(slotConfig.uploadEndpoint, {
      method: 'POST',
      body: form,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Background image upload failed.');
    }

    const backgrounds = getBackgroundLibraryState(slotKey);
    backgrounds.userImages = sortBackgroundImages([
      data.image,
      ...backgrounds.userImages.filter(image => image.id !== data.image.id),
    ]);
    setBackgroundSelection(slotKey, data.image, { render: false });
    renderPersonalizationBackgrounds();
    setPersonalizationBackgroundStatus(slotConfig.uploadDoneMessage(data.image.name));
  } catch (error) {
    setPersonalizationBackgroundStatus(error.message, true);
  } finally {
    if (el[slotConfig.uploadInputRef]) el[slotConfig.uploadInputRef].value = '';
  }
}

async function deletePersonalizationBackground(slotKey, image) {
  if (!image?.id) return;
  const slotConfig = getBackgroundSlotConfig(slotKey);
  if (!window.confirm(slotConfig.deleteConfirmMessage(image.name))) return;

  setPersonalizationBackgroundStatus(slotConfig.deleteStatusMessage(image.name));

  try {
    const response = await apiFetch(slotConfig.userDeleteEndpoint(image.id), {
      method: 'DELETE',
    });

    const deletedThemes = response.deletedThemes ?? [];

    const backgrounds = getBackgroundLibraryState(slotKey);
    backgrounds.userImages = backgrounds.userImages.filter(item => item.id !== image.id);

    if (selectionsMatch(getBackgroundSelection(slotKey), image)) {
      setBackgroundSelection(slotKey, null, { render: false });
    }

    removeDeletedThemesFromState(deletedThemes);

    renderPersonalizationBackgrounds();
    setPersonalizationBackgroundStatus(
      deletedThemes.length
        ? `${slotConfig.deleteDoneMessage(image.name)} ${deletedThemes.length} dependent theme(s) were also deleted.`
        : slotConfig.deleteDoneMessage(image.name),
    );
  } catch (error) {
    if (error.status === 409 && error.data?.code === 'DEPENDENT_THEMES') {
      const dependentThemes = error.data.dependentThemes ?? [];
      const confirmed = window.confirm(
        `Deleting "${image.name}" will also delete ${dependentThemes.length} theme(s): ${dependentThemes.map(theme => theme.name).join(', ')}. Continue?`,
      );
      if (confirmed) {
        try {
          const response = await apiFetch(`${slotConfig.userDeleteEndpoint(image.id)}?cascadeThemes=1`, {
            method: 'DELETE',
          });
          const backgrounds = getBackgroundLibraryState(slotKey);
          backgrounds.userImages = backgrounds.userImages.filter(item => item.id !== image.id);
          if (selectionsMatch(getBackgroundSelection(slotKey), image)) {
            setBackgroundSelection(slotKey, null, { render: false });
          }
          removeDeletedThemesFromState(response.deletedThemes ?? []);
          renderPersonalizationBackgrounds();
          setPersonalizationBackgroundStatus(`${slotConfig.deleteDoneMessage(image.name)} ${dependentThemes.length} dependent theme(s) were also deleted.`);
          return;
        } catch (cascadeError) {
          setPersonalizationBackgroundStatus(`Could not delete ${image.name}: ${cascadeError.message}`, true);
          return;
        }
      }
      setPersonalizationBackgroundStatus('Background deletion canceled.');
      return;
    }
    setPersonalizationBackgroundStatus(`Could not delete ${image.name}: ${error.message}`, true);
  }
}

export function applyPersonalizationOpacity(opacity, options = {}) {
  const {
    persist = true,
    syncControls = true,
  } = options;
  const nextOpacity = { ...DEFAULT_PERSONALIZATION_OPACITY };

  PERSONALIZATION_OPACITY_CONFIG.forEach(({ key }) => {
    nextOpacity[key] = clampOpacityValueForKey(key, opacity[key] ?? DEFAULT_PERSONALIZATION_OPACITY[key]);
  });

  state.personalization.opacity = nextOpacity;
  applyPersonalizationOpacityCss(nextOpacity);

  if (persist) savePersonalizationOpacity();
  if (syncControls) syncPersonalizationOpacityControls();
  syncOpacityPresetUi();
  syncThemeUi();
}

function setPersonalizationOpacityValue(key, value) {
  applyPersonalizationOpacity({
    ...state.personalization.opacity,
    [key]: clampOpacityValueForKey(key, value),
  });
}

function buildOpacityPresetPayload(name) {
  return {
    name,
    includedWithApp: false,
    opacity: OPACITY_PRESET_KEYS.reduce((result, key) => {
      result[key] = clampOpacityValueForKey(key, state.personalization.opacity[key]);
      return result;
    }, {}),
  };
}

export function restorePersonalizationSettings() {
  let storedOpacity;
  const storedSelections = {};
  const storedDisplays = {};
  const storedColorSchemePresetId = localStorage.getItem(LS_COLOR_SCHEME_PRESET) || DEFAULT_COLOR_SCHEME_PRESET_ID;
  const storedCustomThemeCss = normalizeCustomThemeCssText(localStorage.getItem(LS_CUSTOM_THEME_CSS) || '');
  const storedCustomThemeCssName = normalizeCustomThemeCssName(localStorage.getItem(LS_CUSTOM_THEME_CSS_NAME) || '');

  try {
    storedOpacity = JSON.parse(localStorage.getItem(LS_PERSONALIZATION_OPACITY) || '{}') || {};
  } catch {
    storedOpacity = {};
  }

  Object.keys(BACKGROUND_SLOT_CONFIG).forEach(slotKey => {
    const slotConfig = getBackgroundSlotConfig(slotKey);
    try {
      storedSelections[slotKey] = JSON.parse(localStorage.getItem(slotConfig.storageSelectionKey) || 'null');
    } catch {
      storedSelections[slotKey] = null;
    }

    try {
      storedDisplays[slotKey] = JSON.parse(localStorage.getItem(slotConfig.storageDisplayKey) || '{}') || {};
    } catch {
      storedDisplays[slotKey] = {};
    }
  });

  state.personalization.opacityPresets = [];
  state.personalization.opacityPresetsLoaded = false;
  state.personalization.themes = [];
  state.personalization.themesLoaded = false;
  state.personalization.opacityControlsExpanded = localStorage.getItem(LS_OPACITY_CONTROLS_EXPANDED) === '1';
  state.personalization.activeBackgroundTab = 'primary';
  state.personalization.appliedThemeId = localStorage.getItem(LS_APPLIED_THEME_ID) || null;
  state.personalization.appliedThemeDirty = false;
  state.personalization.selectedThemeId = state.personalization.appliedThemeId;
  if (!state.preferencesHydrated && localStorage.getItem(LS_GRINCH_MODE) !== null) {
    state.grinchMode = localStorage.getItem(LS_GRINCH_MODE) === '1';
  }
  if (!state.preferencesHydrated && localStorage.getItem(LS_SEASONAL_THEME_HISTORY) !== null) {
    state.seasonalThemeHistory = normalizeSeasonalThemeHistory(localStorage.getItem(LS_SEASONAL_THEME_HISTORY) || '{}');
  }
  applyColorSchemePreset(storedColorSchemePresetId, { persist: false, syncUi: false });
  applyCustomThemeCss(storedCustomThemeCss, storedCustomThemeCssName, { persist: false, syncUi: false });
  applyPersonalizationOpacity(storedOpacity, { persist: false });
  Object.keys(BACKGROUND_SLOT_CONFIG).forEach(slotKey => {
    setBackgroundDisplay(slotKey, storedDisplays[slotKey], { persist: false, syncControls: false });
    setBackgroundSelection(slotKey, storedSelections[slotKey], { persist: false, render: false });
    syncBackgroundDisplayControls(slotKey);
  });
  syncColorSchemeUi();
  syncOpacityPresetUi();
  syncBackgroundTabUi();
  if (state.personalization.selectedThemeId) {
    const selectedTheme = getSelectedTheme();
    if (selectedTheme) populateThemeDraftFromTheme(selectedTheme);
  } else {
    startNewThemeDraft();
  }
  if (el.personalizationOpacityControlsDetails) {
    el.personalizationOpacityControlsDetails.open = state.personalization.opacityControlsExpanded;
  }
  if (el.toggleGrinchMode) {
    el.toggleGrinchMode.checked = state.grinchMode;
  }
  renderPersonalizationBackgrounds();
  setPersonalizationBackgroundStatus('');
}

export function resetPersonalizationOpacity() {
  applyPersonalizationOpacity(DEFAULT_PERSONALIZATION_OPACITY);
}

export function initPersonalizationSettings() {
  restorePersonalizationSettings();
  getPersonalizationControls().forEach(({ key, range, input, spinUp, spinDown }) => {
    if (!range || !input) return;

    range.addEventListener('input', () => {
      setPersonalizationOpacityValue(key, range.value);
    });

    input.addEventListener('input', () => {
      if (input.value.trim() === '') return;
      setPersonalizationOpacityValue(key, input.value);
    });

    const commitInput = () => {
      if (input.value.trim() === '') {
        syncPersonalizationOpacityControls();
        return;
      }
      setPersonalizationOpacityValue(key, input.value);
    };

    input.addEventListener('change', commitInput);
    input.addEventListener('blur', commitInput);

    const nudge = delta => {
      const current = Number.parseInt(input.value.trim(), 10);
      const base = Number.isInteger(current) ? current : state.personalization.opacity[key];
      setPersonalizationOpacityValue(key, base + delta);
      input.focus();
    };

    spinUp?.addEventListener('click', () => nudge(1));
    spinDown?.addEventListener('click', () => nudge(-1));
  });

  el.personalizationThemeSelect?.addEventListener('change', () => {
    if (isSyncingThemeSelectUi) return;
    setThemeEditorMessage('');
    const selectedId = el.personalizationThemeSelect.value || null;
    if (!selectedId) {
      setAppliedThemeId(null);
      startNewThemeDraft();
      return;
    }

    const theme = state.personalization.themes.find(item => item.id === selectedId) ?? null;
    if (!theme) {
      setAppliedThemeId(null);
      startNewThemeDraft();
      return;
    }
    if (theme.invalid) {
      state.personalization.selectedThemeId = null;
      syncThemeUi();
      setPersonalizationBackgroundStatus(`Could not apply "${theme.name}": ${theme.invalidReason || 'Theme is unavailable.'}`, true);
      return;
    }

    applyTheme(theme).catch(error => {
      setPersonalizationBackgroundStatus(`Could not apply "${theme.name}": ${error.message}`, true);
    });
  });

  el.personalizationThemeUploadPreview?.addEventListener('click', () => {
    setThemeEditorMessage('');
    el.personalizationThemePreviewInput?.click();
  });

  el.personalizationThemePreviewInput?.addEventListener('change', () => {
    const file = el.personalizationThemePreviewInput.files?.[0];
    handleThemePreviewUpload(file);
  });

  el.personalizationThemePreviewButton?.addEventListener('click', () => {
    const previewImage = state.personalization.themeDraft.previewImage;
    if (!previewImage?.url) return;
    openArtLightbox(previewImage.url, state.personalization.themeDraft.name || 'Theme preview');
  });

  el.personalizationThemeName?.addEventListener('input', () => {
    state.personalization.themeDraft.name = el.personalizationThemeName.value;
    setThemeEditorMessage('');
  });

  el.personalizationThemeDescriptionInput?.addEventListener('input', () => {
    state.personalization.themeDraft.description = el.personalizationThemeDescriptionInput.value;
    setThemeEditorMessage('');
  });

  el.personalizationThemeNew?.addEventListener('click', () => {
    setThemeEditorMessage('');
    startNewThemeDraft();
    setPersonalizationBackgroundStatus('Started a new theme draft.');
  });

  el.personalizationThemeSave?.addEventListener('click', async () => {
    try {
      setThemeEditorMessage('');
      const response = await fetch('/api/themes', {
        method: 'POST',
        body: buildThemeFormData({ requireNewPreview: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Theme save failed.');

      const theme = normalizeTheme(data.theme);
      state.personalization.themes = [...state.personalization.themes.filter(item => item.id !== theme.id), theme]
        .sort(compareIncludedFirstByName);
      state.personalization.themesLoaded = true;
      state.personalization.selectedThemeId = theme.id;
      populateThemeDraftFromTheme(theme);
      await applyTheme(theme);
      setPersonalizationBackgroundStatus(`Saved "${theme.name}".`);
    } catch (error) {
      setThemeEditorMessage(error.message, true);
    }
  });

  el.personalizationThemeUpdate?.addEventListener('click', async () => {
    const selectedTheme = getSelectedTheme();
    if (!selectedTheme?.canEdit) return;

    try {
      setThemeEditorMessage('');
      const response = await fetch(`/api/themes/${encodeURIComponent(selectedTheme.id)}`, {
        method: 'PATCH',
        body: buildThemeFormData({ requireNewPreview: false }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Theme update failed.');

      const updatedTheme = normalizeTheme(data.theme);
      state.personalization.themes = state.personalization.themes
        .map(theme => (theme.id === updatedTheme.id ? updatedTheme : theme))
        .sort(compareIncludedFirstByName);
      state.personalization.themesLoaded = true;
      state.personalization.selectedThemeId = updatedTheme.id;
      populateThemeDraftFromTheme(updatedTheme);
      if (state.personalization.appliedThemeId === updatedTheme.id) {
        state.personalization.appliedThemeDirty = false;
      }
      syncThemeUi();
      setPersonalizationBackgroundStatus(`Updated "${updatedTheme.name}".`);
    } catch (error) {
      setThemeEditorMessage(error.message, true);
    }
  });

  el.personalizationThemeDelete?.addEventListener('click', async () => {
    const selectedTheme = getSelectedTheme();
    await deleteThemeFromUi(selectedTheme);
  });

  el.personalizationColorSchemeSelect?.addEventListener('change', () => {
    applyColorSchemePreset(el.personalizationColorSchemeSelect.value);
    const preset = getColorSchemePresetById(el.personalizationColorSchemeSelect.value);
    const suffix = state.personalization.customThemeCss ? ' Your custom CSS override is still active.' : '';
    setPersonalizationBackgroundStatus(`Applied the "${preset.name}" color scheme.${suffix}`);
  });

  el.personalizationColorSchemeDownload?.addEventListener('click', () => {
    const preset = getColorSchemePresetById(el.personalizationColorSchemeSelect?.value);
    downloadTextFile(`trackspot-${sanitizeDownloadName(preset.name)}.css`, buildColorSchemeCss(preset), 'text/css;charset=utf-8');
    setPersonalizationBackgroundStatus(`Downloaded CSS for "${preset.name}".`);
  });

  el.personalizationUploadThemeCss?.addEventListener('click', () => {
    el.personalizationThemeCssInput?.click();
  });

  el.personalizationThemeCssInput?.addEventListener('change', () => {
    const file = el.personalizationThemeCssInput.files?.[0];
    importCustomThemeCss(file);
  });

  el.personalizationClearThemeCss?.addEventListener('click', () => {
    if (!state.personalization.customThemeCss) return;
    applyCustomThemeCss('', '', { persist: true, syncUi: true });
    setPersonalizationBackgroundStatus('Cleared the custom CSS override.');
  });

  Object.keys(BACKGROUND_SLOT_CONFIG).forEach(slotKey => {
    const slotConfig = getBackgroundSlotConfig(slotKey);
    const uploadButton = el[slotConfig.uploadButtonRef];
    const uploadInput = el[slotConfig.uploadInputRef];
    const clearButton = el[slotConfig.clearButtonRef];
    const positionX = el[slotConfig.positionXRef];
    const positionY = el[slotConfig.positionYRef];
    const fill = el[slotConfig.fillRef];
    const customScale = el[slotConfig.customScaleRef];
    const tabButton = el[slotConfig.tabButtonRef];

    uploadButton?.addEventListener('click', () => {
      uploadInput?.click();
    });

    uploadInput?.addEventListener('change', () => {
      const file = uploadInput.files?.[0];
      uploadPersonalizationBackground(slotKey, file);
    });

    clearButton?.addEventListener('click', () => {
      setBackgroundSelection(slotKey, null);
      setPersonalizationBackgroundStatus(slotConfig.clearedMessage);
    });

    positionX?.addEventListener('change', () => {
      setBackgroundDisplay(slotKey, {
        ...getBackgroundDisplay(slotKey),
        positionX: positionX.value,
      });
    });

    positionY?.addEventListener('change', () => {
      setBackgroundDisplay(slotKey, {
        ...getBackgroundDisplay(slotKey),
        positionY: positionY.value,
      });
    });

    fill?.addEventListener('change', () => {
      setBackgroundDisplay(slotKey, {
        ...getBackgroundDisplay(slotKey),
        fill: fill.value,
      });
    });

    const commitCustomScale = () => {
      if (!customScale) return;
      if (customScale.value.trim() === '') {
        syncBackgroundDisplayControls(slotKey);
        return;
      }

      setBackgroundDisplay(slotKey, {
        ...getBackgroundDisplay(slotKey),
        fill: CUSTOM_BACKGROUND_SCALE_FILL,
        customScale: customScale.value,
      });
    };

    customScale?.addEventListener('change', commitCustomScale);
    customScale?.addEventListener('blur', commitCustomScale);
    customScale?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitCustomScale();
    });

    tabButton?.addEventListener('click', () => {
      setActiveBackgroundTab(slotKey);
    });
  });

  el.personalizationOpacityPresetSelect?.addEventListener('change', () => {
    const selectedPreset = getOpacityPresetById(el.personalizationOpacityPresetSelect.value);
    if (selectedPreset?.invalid) {
      setPersonalizationBackgroundStatus(selectedPreset.invalidReason || 'Opacity preset is unavailable.', true);
      if (el.personalizationOpacityPresetName) {
        el.personalizationOpacityPresetName.value = '';
      }
      if (el.personalizationOpacityPresetUpdate) el.personalizationOpacityPresetUpdate.disabled = true;
      if (el.personalizationOpacityPresetDelete) el.personalizationOpacityPresetDelete.disabled = !selectedPreset.canDelete;
      return;
    }
    if (selectedPreset) {
      applyPersonalizationOpacity({
        ...state.personalization.opacity,
        ...selectedPreset.opacity,
      });
      setPersonalizationBackgroundStatus(`Applied the "${selectedPreset.name}" opacity preset.`);
    }
    if (el.personalizationOpacityPresetName) {
      el.personalizationOpacityPresetName.value = selectedPreset?.canEdit ? selectedPreset.name : '';
    }
    if (el.personalizationOpacityPresetUpdate) el.personalizationOpacityPresetUpdate.disabled = !selectedPreset?.canEdit;
    if (el.personalizationOpacityPresetDelete) el.personalizationOpacityPresetDelete.disabled = !selectedPreset?.canDelete;
  });

  el.personalizationOpacityPresetSave?.addEventListener('click', async () => {
    const name = el.personalizationOpacityPresetName?.value.trim() || '';
    if (!name) {
      setPersonalizationBackgroundStatus('Enter a name before saving an opacity preset.', true);
      el.personalizationOpacityPresetName?.focus();
      return;
    }

    try {
      const data = await apiFetch('/api/opacity-presets', {
        method: 'POST',
        body: JSON.stringify(buildOpacityPresetPayload(name)),
      });
      state.personalization.opacityPresets = [...state.personalization.opacityPresets, normalizeOpacityPreset(data.preset)]
        .sort(compareIncludedFirstByName);
      state.personalization.opacityPresetsLoaded = true;
      state.personalization.activeOpacityPresetId = data.preset.id;
      syncOpacityPresetUi();
      setPersonalizationBackgroundStatus(`Saved "${data.preset.name}" as an opacity preset.`);
    } catch (error) {
      setPersonalizationBackgroundStatus(error.message, true);
    }
  });

  el.personalizationOpacityPresetUpdate?.addEventListener('click', async () => {
    const selectedPreset = getSelectedEditableOpacityPreset();
    if (!selectedPreset) return;

    const name = el.personalizationOpacityPresetName?.value.trim() || '';
    if (!name) {
      setPersonalizationBackgroundStatus('Enter a name before updating an opacity preset.', true);
      el.personalizationOpacityPresetName?.focus();
      return;
    }

    try {
      const data = await apiFetch(`/api/opacity-presets/${encodeURIComponent(selectedPreset.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(buildOpacityPresetPayload(name)),
      });
      state.personalization.opacityPresets = state.personalization.opacityPresets.map(preset => (
        preset.id === data.preset.id ? normalizeOpacityPreset(data.preset) : preset
      )).sort(compareIncludedFirstByName);
      state.personalization.activeOpacityPresetId = data.preset.id;
      syncOpacityPresetUi();
      setPersonalizationBackgroundStatus(`Updated "${data.preset.name}".`);
    } catch (error) {
      setPersonalizationBackgroundStatus(error.message, true);
    }
  });

  el.personalizationOpacityPresetDelete?.addEventListener('click', async () => {
    const selectedPreset = getSelectedDeletableOpacityPreset();
    if (!selectedPreset) return;
    if (!window.confirm(`Delete the "${selectedPreset.name}" opacity preset?`)) return;

    try {
      const response = await apiFetch(`/api/opacity-presets/${encodeURIComponent(selectedPreset.id)}`, {
        method: 'DELETE',
      });
      state.personalization.opacityPresets = state.personalization.opacityPresets
        .filter(preset => preset.id !== selectedPreset.id);
      if (state.personalization.activeOpacityPresetId === selectedPreset.id) {
        state.personalization.activeOpacityPresetId = null;
      }
      removeDeletedThemesFromState(response.deletedThemes ?? []);
      syncOpacityPresetUi();
      setPersonalizationBackgroundStatus(
        response.deletedThemes?.length
          ? `Deleted "${selectedPreset.name}" and ${response.deletedThemes.length} dependent theme(s).`
          : `Deleted "${selectedPreset.name}".`,
      );
    } catch (error) {
      if (error.status === 409 && error.data?.code === 'DEPENDENT_THEMES') {
        const dependentThemes = error.data.dependentThemes ?? [];
        const confirmed = window.confirm(
          `Deleting "${selectedPreset.name}" will also delete ${dependentThemes.length} theme(s): ${dependentThemes.map(theme => theme.name).join(', ')}. Continue?`,
        );
        if (!confirmed) {
          setPersonalizationBackgroundStatus('Opacity preset deletion canceled.');
          return;
        }

        try {
          const response = await apiFetch(`/api/opacity-presets/${encodeURIComponent(selectedPreset.id)}?cascadeThemes=1`, {
            method: 'DELETE',
          });
          state.personalization.opacityPresets = state.personalization.opacityPresets
            .filter(preset => preset.id !== selectedPreset.id);
          if (state.personalization.activeOpacityPresetId === selectedPreset.id) {
            state.personalization.activeOpacityPresetId = null;
          }
          removeDeletedThemesFromState(response.deletedThemes ?? []);
          syncOpacityPresetUi();
          setPersonalizationBackgroundStatus(`Deleted "${selectedPreset.name}" and ${dependentThemes.length} dependent theme(s).`);
          return;
        } catch (cascadeError) {
          setPersonalizationBackgroundStatus(cascadeError.message, true);
          return;
        }
      }
      setPersonalizationBackgroundStatus(error.message, true);
    }
  });

  el.personalizationOpacityControlsDetails?.addEventListener('toggle', () => {
    state.personalization.opacityControlsExpanded = !!el.personalizationOpacityControlsDetails.open;
    localStorage.setItem(LS_OPACITY_CONTROLS_EXPANDED, state.personalization.opacityControlsExpanded ? '1' : '0');
  });

  loadOpacityPresets().catch(() => {});
  loadThemes().catch(() => {});
}

// ---------------------------------------------------------------------------
// Settings modal open / close
// ---------------------------------------------------------------------------

export function openSettings() {
  closePersonalization();
  if (!el.settingsOverlay) return;
  el.settingsOverlay.classList.remove('hidden');
  openManagedModal({
    overlay: el.settingsOverlay,
    dialog: el.settingsOverlay.querySelector('.modal') ?? el.settingsOverlay,
    initialFocus: el.settingsClose,
    onRequestClose: () => closeSettings(),
  });
  renderComplexStatusList();
  renderUButtonList();
  refreshWelcomeTourSettings().catch(() => {});
}

export function closeSettings(options = {}) {
  if (!el.settingsOverlay) return false;
  el.settingsOverlay.classList.add('hidden');
  closeEarlyWrappedConfirmation();
  closeCsvFormattingInstructions({ restoreFocus: false });
  closeManagedModal(el.settingsOverlay, options);
  return true;
}

export function openPersonalization() {
  closeSettings();
  if (!el.personalizationOverlay) return;
  setThemeEditorMessage('');
  syncColorSchemeUi();
  syncPersonalizationOpacityControls();
  syncBackgroundDisplayControls('primary');
  syncBackgroundDisplayControls('secondary');
  syncBackgroundTabUi();
  syncOpacityPresetUi();
  syncThemeUi();
  if (el.personalizationOpacityControlsDetails) {
    el.personalizationOpacityControlsDetails.open = state.personalization.opacityControlsExpanded;
  }
  renderPersonalizationBackgrounds();
  el.personalizationOverlay.classList.remove('hidden');
  openManagedModal({
    overlay: el.personalizationOverlay,
    dialog: el.personalizationOverlay.querySelector('.modal') ?? el.personalizationOverlay,
    initialFocus: el.personalizationClose,
    onRequestClose: () => closePersonalization(),
  });
  loadBackgroundLibrary().catch(() => {});
  loadOpacityPresets({ showError: true }).catch(() => {});
  loadThemes({ showError: true }).catch(() => {});
}

export function closePersonalization(options = {}) {
  if (!el.personalizationOverlay) return false;
  el.personalizationOverlay.classList.add('hidden');
  closeManagedModal(el.personalizationOverlay, options);
  return true;
}

export function openCsvFormattingInstructions() {
  el.csvFormatOverlay.classList.remove('hidden');
  openManagedModal({
    overlay: el.csvFormatOverlay,
    dialog: el.csvFormatOverlay.querySelector('.modal') ?? el.csvFormatOverlay,
    initialFocus: el.csvFormatClose,
    onRequestClose: () => closeCsvFormattingInstructions(),
  });
}

export function closeCsvFormattingInstructions(options = {}) {
  if (!el.csvFormatOverlay) return false;
  el.csvFormatOverlay.classList.add('hidden');
  closeManagedModal(el.csvFormatOverlay, options);
  return true;
}

export async function refreshWelcomeTourSettings() {
  if (!el.welcomeSamplesRow) return null;
  const status = await apiFetch('/api/welcome-tour/status');
  if (status.preferences) {
    applyPreferencesToState(status.preferences);
  }
  state.welcomeTour.sampleCount = status.sampleCount ?? 0;
  el.welcomeSamplesRow.classList.toggle('hidden', !(status.sampleCount > 0));
  if (el.btnRemoveWelcomeSamples) {
    el.btnRemoveWelcomeSamples.disabled = !(status.sampleCount > 0);
  }
  return status;
}

export async function removeWelcomeSampleAlbums() {
  if (!window.confirm('Remove the two welcome tour sample albums? This will not affect your other albums.')) return;
  try {
    const result = await apiFetch('/api/welcome-tour/samples', { method: 'DELETE' });
    if (result.status?.preferences) {
      applyPreferencesToState(result.status.preferences);
    }
    state.welcomeTour.sampleCount = result.status?.sampleCount ?? 0;
    el.welcomeSamplesRow?.classList.toggle('hidden', !(state.welcomeTour.sampleCount > 0));
    setSettingsStatus(`Removed ${result.removedCount ?? 0} sample album${result.removedCount === 1 ? '' : 's'}.`);
    await refreshAlbumDependentViews({ preservePage: true });
  } catch (error) {
    setSettingsStatus(error.message, true);
  }
}

function clearCsvImportPoll() {
  if (csvImportPollTimeout) {
    clearTimeout(csvImportPollTimeout);
    csvImportPollTimeout = null;
  }
}

function scheduleCsvImportPoll(delay = CSV_IMPORT_POLL_MS) {
  clearCsvImportPoll();
  csvImportPollTimeout = setTimeout(() => {
    refreshCsvImportJob().catch(() => {});
  }, delay);
}

function rememberCsvImportJobId(jobId) {
  if (!jobId) {
    localStorage.removeItem(LS_LAST_CSV_IMPORT_JOB_ID);
    return;
  }
  localStorage.setItem(LS_LAST_CSV_IMPORT_JOB_ID, String(jobId));
}

function dismissCsvImportJob(jobId) {
  if (!jobId) return;
  localStorage.setItem(LS_DISMISSED_CSV_IMPORT_JOB_ID, String(jobId));
}

function clearDismissedCsvImportJob(jobId = null) {
  const dismissed = localStorage.getItem(LS_DISMISSED_CSV_IMPORT_JOB_ID);
  if (!dismissed) return;
  if (jobId === null || dismissed === String(jobId)) {
    localStorage.removeItem(LS_DISMISSED_CSV_IMPORT_JOB_ID);
  }
}

function isCsvImportJobDismissed(jobId) {
  return jobId && localStorage.getItem(LS_DISMISSED_CSV_IMPORT_JOB_ID) === String(jobId);
}

function formatCsvImportHeading(job) {
  if (!job) return '';
  if (job.status === 'queued') return 'Waiting for Spotify/extension';
  if (job.status === 'processing') return 'Import in progress';
  if (job.status === 'canceled') return 'Import canceled';
  if (job.status === 'failed') return 'Import failed';
  return 'Import complete';
}

function shouldRefreshAlbumsAfterCsvJob(previousJob, nextJob) {
  const wasActive = previousJob && ['queued', 'processing'].includes(previousJob.status);
  const isTerminal = nextJob && ['completed', 'failed', 'canceled'].includes(nextJob.status);
  return wasActive && isTerminal && Number(nextJob.imported_rows || 0) > 0;
}

function renderCsvImportJob(job) {
  state.csvImport.job = job;
  const isDismissed = job && isCsvImportJobDismissed(job.id) && !['queued', 'processing'].includes(job.status);

  if (!job || isDismissed) {
    el.csvImportProgress.classList.add('hidden');
    el.csvImportHeading.textContent = '';
    el.csvImportMeta.textContent = '';
    el.csvImportCounts.textContent = '';
    el.btnImportCsv.disabled = state.csvImport.isStarting;
    el.btnCancelImportCsv.classList.add('hidden');
    el.btnOpenImportReport.classList.add('hidden');
    el.btnCloseImportCsv.classList.add('hidden');
    el.csvImportFileName.textContent = 'No file selected';
    return;
  }

  el.csvImportProgress.classList.remove('hidden');
  el.csvImportHeading.textContent = formatCsvImportHeading(job);
  el.csvImportMeta.textContent =
    `${job.filename || 'import.csv'} • default status: ${job.default_status} • job #${job.id}`;
  el.csvImportCounts.textContent =
    `${job.total_rows} total • ${job.imported_rows} imported • ${job.skipped_rows} skipped • ${job.failed_rows} failed • ${job.canceled_rows ?? 0} canceled • ${job.warning_rows} warned • ${job.remaining_rows} remaining`;

  const hasActiveJob = job.status === 'queued' || job.status === 'processing';
  const hasTerminalJob = ['completed', 'failed', 'canceled'].includes(job.status);
  el.btnImportCsv.disabled = state.csvImport.isStarting || hasActiveJob;
  el.btnCancelImportCsv.classList.toggle('hidden', !hasActiveJob);
  el.btnOpenImportReport.classList.toggle('hidden', !hasTerminalJob);
  el.btnCloseImportCsv.classList.toggle('hidden', !hasTerminalJob);
}

async function fetchCsvImportJobById(jobId) {
  if (!jobId) return null;
  const data = await apiFetch(`/api/imports/${jobId}`);
  return data.job;
}

export async function refreshCsvImportJob() {
  let job;
  const previousJob = state.csvImport.job;

  try {
    const active = await apiFetch('/api/imports/active');
    job = active.job || null;
  } catch (error) {
    renderCsvImportJob(state.csvImport.job);
    throw error;
  }

  if (!job) {
    const savedJobId = localStorage.getItem(LS_LAST_CSV_IMPORT_JOB_ID);
    if (savedJobId) {
      try {
        job = await fetchCsvImportJobById(savedJobId);
      } catch {
        job = null;
      }
    }
  }

  if (job) {
    rememberCsvImportJobId(job.id);
    if (job.status === 'queued' || job.status === 'processing') {
      clearDismissedCsvImportJob(job.id);
    }
  }
  renderCsvImportJob(job);

  if (shouldRefreshAlbumsAfterCsvJob(previousJob, job)) {
    await refreshAlbumDependentViews({ preservePage: true });
  }

  if (job && (job.status === 'queued' || job.status === 'processing')) {
    scheduleCsvImportPoll();
  } else {
    clearCsvImportPoll();
  }
}

async function startCsvImport() {
  const file = el.inputImportCsv.files?.[0];
  if (!file) {
    setSettingsStatus('Choose a CSV file first.', true);
    return;
  }

  state.csvImport.isStarting = true;
  el.btnImportCsv.disabled = true;
  setSettingsStatus('Starting CSV import…');

  try {
    const form = new FormData();
    form.append('file', file);
    form.append('defaultStatus', el.selectImportDefaultStatus.value);

    const response = await fetch('/api/imports/csv', {
      method: 'POST',
      body: form,
    });
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 409 && data.job) {
        rememberCsvImportJobId(data.job.id);
        renderCsvImportJob(data.job);
        scheduleCsvImportPoll();
      }
      throw new Error(data.error || 'CSV import could not be started.');
    }

    rememberCsvImportJobId(data.job.id);
    clearDismissedCsvImportJob(data.job.id);
    renderCsvImportJob(data.job);
    scheduleCsvImportPoll(1000);
    setSettingsStatus('CSV import queued. Spotify will pick it up through the Spicetify extension.');
    el.inputImportCsv.value = '';
    el.csvImportFileName.textContent = 'No file selected';
  } catch (error) {
    setSettingsStatus(error.message, true);
  } finally {
    state.csvImport.isStarting = false;
    renderCsvImportJob(state.csvImport.job);
  }
}

async function cancelCsvImport() {
  const job = state.csvImport.job;
  if (!job?.id || !['queued', 'processing'].includes(job.status)) return;
  if (!window.confirm('Cancel this CSV import? Already imported albums will stay in Trackspot.')) return;

  el.btnCancelImportCsv.disabled = true;
  setSettingsStatus('Canceling CSV import…');

  try {
    const data = await apiFetch(`/api/imports/${job.id}/cancel`, {
      method: 'POST',
    });
    const previousJob = state.csvImport.job;
    rememberCsvImportJobId(data.job.id);
    renderCsvImportJob(data.job);
    clearCsvImportPoll();
    setSettingsStatus('CSV import canceled. Already imported albums were kept.');
    if (shouldRefreshAlbumsAfterCsvJob(previousJob, data.job)) {
      await refreshAlbumDependentViews({ preservePage: true });
    }
  } catch (error) {
    setSettingsStatus(error.message, true);
  } finally {
    el.btnCancelImportCsv.disabled = false;
    renderCsvImportJob(state.csvImport.job);
  }
}

async function openCsvImportReport() {
  const job = state.csvImport.job;
  if (!job?.id) return;

  try {
    const report = await apiFetch(`/api/imports/${job.id}/report`);
    const popup = window.open('', '_blank', 'width=1100,height=780,resizable=yes,scrollbars=yes');
    if (!popup) {
      setSettingsStatus('Popup blocked. Allow popups to open the import report.', true);
      return;
    }

    const rowsHtml = report.rows.map(row => {
      const messages = [];
      if (row.error) messages.push(row.error);
      if (row.warnings?.length) messages.push(...row.warnings);
      const details = messages.length ? escHtml(messages.join(' ')) : '—';
      const raw = Array.isArray(row.raw_row) ? row.raw_row.map(cell => String(cell ?? '')).join(' | ') : '';

      return `<tr>
        <td>${row.row_index}</td>
        <td>${escHtml(row.status)}</td>
        <td>${escHtml(row.spotify_album_id || '')}</td>
        <td>${escHtml(row.desired_status || '')}</td>
        <td>${row.rating ?? '—'}</td>
        <td>${escHtml(row.listened_at || '') || '—'}</td>
        <td>${details}</td>
        <td>${escHtml(raw) || '—'}</td>
      </tr>`;
    }).join('');

    const title = escHtml(`CSV import report #${report.job.id}`);
    popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1117;
      --surface: #1a1f2e;
      --border: #2d3748;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #38bdf8;
    }
    body {
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 system-ui, sans-serif;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 22px;
    }
    p {
      margin: 0 0 16px;
      color: var(--muted);
    }
    .summary {
      margin-bottom: 18px;
      color: var(--muted);
    }
    .table-wrap {
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 980px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th {
      position: sticky;
      top: 0;
      background: #20283a;
      color: var(--text);
    }
    td {
      color: var(--text);
      word-break: break-word;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .muted {
      color: var(--muted);
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${escHtml(report.job.filename || 'import.csv')} • default status: ${escHtml(report.job.default_status)}</p>
  <div class="summary">
    ${report.job.total_rows} total • ${report.job.imported_rows} imported • ${report.job.skipped_rows} skipped • ${report.job.failed_rows} failed • ${report.job.canceled_rows ?? 0} canceled • ${report.job.warning_rows} warned
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Row</th>
          <th>Status</th>
          <th>Album ID</th>
          <th>Final status</th>
          <th>Rating</th>
          <th>Listen date</th>
          <th>Report</th>
          <th>Raw row</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</body>
</html>`);
    popup.document.close();
  } catch (error) {
    setSettingsStatus(`Could not open import report: ${error.message}`, true);
  }
}

function closeCsvImportSummary() {
  const job = state.csvImport.job;
  if (!job?.id || !['completed', 'failed', 'canceled'].includes(job.status)) return;
  dismissCsvImportJob(job.id);
  renderCsvImportJob(job);
}

export function initCsvImportControls() {
  el.btnCsvFormatHelp.addEventListener('click', () => {
    openCsvFormattingInstructions();
  });
  el.csvFormatClose.addEventListener('click', () => {
    closeCsvFormattingInstructions();
  });
  el.btnCsvFormatClose.addEventListener('click', () => {
    closeCsvFormattingInstructions();
  });
  el.csvFormatOverlay.addEventListener('click', e => {
    if (e.target === el.csvFormatOverlay) closeCsvFormattingInstructions();
  });

  el.btnImportCsv.addEventListener('click', () => {
    startCsvImport();
  });
  el.btnOpenImportReport.addEventListener('click', () => {
    openCsvImportReport();
  });
  el.btnCloseImportCsv.addEventListener('click', () => {
    closeCsvImportSummary();
  });
  el.btnCancelImportCsv.addEventListener('click', () => {
    cancelCsvImport();
  });

  el.inputImportCsv.addEventListener('change', () => {
    const file = el.inputImportCsv.files?.[0];
    if (file) {
      el.csvImportFileName.textContent = file.name;
      setSettingsStatus(`Selected ${file.name}.`);
    } else {
      el.csvImportFileName.textContent = 'No file selected';
    }
  });

  refreshCsvImportJob().catch(() => {});
}

// ---------------------------------------------------------------------------
// Pagination settings
// ---------------------------------------------------------------------------

function parseStoredPageSize(value) {
  if (value === null || value === '' || value === 'unlimited') return null;
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseStoredPageMode(value) {
  return value === 'suggested' || value === 'custom' ? value : 'unlimited';
}

function getCurrentCollectionView() {
  return state.navigation?.collectionView || state.view || 'list';
}

function getPaginationSettingView() {
  return 'list';
}

function getPageSettingViews() {
  return ['list', 'grid'];
}

function getPageMode(view) {
  return state.pagination.mode[view] ?? state.pagination.mode[getPaginationSettingView()];
}

function getPageStorageKey(view) {
  return view === 'list' ? LS_PAGE_SIZE_LIST : LS_PAGE_SIZE_GRID;
}

function getPageModeStorageKey(view) {
  return view === 'list' ? LS_PAGE_MODE_LIST : LS_PAGE_MODE_GRID;
}

function getPageControls(view) {
  return view === 'list'
    ? {
        mode: el.pageModeList,
        desc: el.pageDescList,
        suggested: el.pageSuggestedList,
        customWrap: el.pageCustomWrapList,
        custom: el.pageCustomList,
      }
    : {
        mode: el.pageModeGrid,
        desc: el.pageDescGrid,
        suggested: el.pageSuggestedGrid,
        customWrap: el.pageCustomWrapGrid,
        custom: el.pageCustomGrid,
      };
}

function hasPageControls(controls) {
  return !!(controls.mode && controls.suggested && controls.customWrap && controls.custom);
}

function syncSuggestedPageCopy(view, controls) {
  const suggested = PAGE_SUGGESTED[view];
  const suggestedOption = controls.mode?.querySelector?.('option[value="suggested"]');
  if (suggestedOption) {
    suggestedOption.textContent = `Suggested (${suggested})`;
  }

  if (controls.desc) {
    controls.desc.textContent = `Choose unlimited, the suggested ${suggested} albums per page, or enter your own positive integer.`;
  }
}

function syncPageControls(view) {
  const controls = getPageControls(view);
  if (!hasPageControls(controls)) return;
  const mode = getPageMode(view);
  const perPage = state.pagination.perPage[view];

  syncSuggestedPageCopy(view, controls);
  controls.mode.value = mode;
  controls.suggested.value = String(PAGE_SUGGESTED[view]);
  controls.custom.value = mode === 'custom' && perPage !== null ? String(perPage) : '';
  controls.suggested.classList.toggle('hidden', mode !== 'suggested');
  controls.customWrap.classList.toggle('hidden', mode !== 'custom');
}

function showCustomPageInput(view) {
  const controls = getPageControls(view);
  if (!hasPageControls(controls)) return;
  controls.mode.value = 'custom';
  controls.suggested.classList.add('hidden');
  controls.customWrap.classList.remove('hidden');
}

export function applyPaginationSetting(view, mode, customValue = '') {
  const settingView = getPaginationSettingView();
  let nextValue = null;
  const nextMode = mode === 'suggested' || mode === 'custom' ? mode : 'unlimited';
  if (mode === 'suggested') {
    nextValue = PAGE_SUGGESTED[settingView];
  } else if (mode === 'custom') {
    const parsed = parseInt(String(customValue).trim(), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      showCustomPageInput(settingView);
      return false;
    }
    nextValue = parsed;
  }

  getPageSettingViews().forEach(pageView => {
    state.pagination.perPage[pageView] = nextValue;
    state.pagination.mode[pageView] = nextMode;
  });
  const storageKey = getPageStorageKey(settingView);
  const modeStorageKey = getPageModeStorageKey(settingView);
  localStorage.removeItem(storageKey);
  localStorage.removeItem(modeStorageKey);
  localStorage.removeItem(LS_PAGE_SIZE_GRID);
  localStorage.removeItem(LS_PAGE_MODE_GRID);
  patchPreferences({
    paginationMode: nextMode,
    paginationPageSize: nextValue,
  }).catch(error => {
    console.error('Failed to save pagination preference:', error);
  });

  getPageSettingViews().forEach(syncPageControls);
  resetPagination();
  loadAlbums();
  return true;
}

export function setShowFirstLastPageButtons(enabled) {
  state.pagination.showFirstLastButtons = enabled;
  el.toggleFirstLastPageButtons.checked = enabled;
  localStorage.removeItem(LS_SHOW_FIRST_LAST_PAGES);
  patchPreferences({
    showFirstLastPages: state.pagination.showFirstLastButtons,
  }).catch(error => {
    console.error('Failed to save first/last page button preference:', error);
  });
  render();
}

export function setShowPageCount(enabled) {
  state.pagination.showPageCount = enabled;
  el.toggleShowPageCount.checked = enabled;
  localStorage.removeItem(LS_SHOW_PAGE_COUNT);
  patchPreferences({
    showPageCount: state.pagination.showPageCount,
  }).catch(error => {
    console.error('Failed to save page count preference:', error);
  });
  render();
}

export function setPageControlVisibilityMode(mode) {
  state.pagination.visibilityMode = mode === 'static' ? 'static' : 'hover';
  el.selectPageControlVisibility.value = state.pagination.visibilityMode;
  localStorage.removeItem(LS_PAGE_CONTROL_VISIBILITY);
  patchPreferences({
    pageControlVisibility: state.pagination.visibilityMode,
  }).catch(error => {
    console.error('Failed to save page control visibility:', error);
  });
  render();
}

export function setQuickActionsToolbarVisibilityMode(mode, options = {}) {
  const { persist = true } = options;
  state.quickActionsToolbarVisibilityMode = mode === 'hover' ? 'hover' : 'visible';
  if (el.selectQuickActionsVisibility) {
    el.selectQuickActionsVisibility.value = state.quickActionsToolbarVisibilityMode;
  }
  document.body.classList.toggle('u-buttons-hover-only', state.quickActionsToolbarVisibilityMode === 'hover');
  if (persist) {
    localStorage.removeItem(LS_QUICK_ACTIONS_VISIBILITY);
    patchPreferences({
      quickActionsToolbarVisibility: state.quickActionsToolbarVisibilityMode,
    }).catch(error => {
      console.error('Failed to save quick actions toolbar visibility:', error);
    });
  }
}

export function initQuickActionsToolbarSettings() {
  const storedVisibility = state.preferencesHydrated
    ? state.quickActionsToolbarVisibilityMode
    : localStorage.getItem(LS_QUICK_ACTIONS_VISIBILITY);
  setQuickActionsToolbarVisibilityMode(storedVisibility === 'hover' ? 'hover' : 'visible', { persist: false });

  el.selectQuickActionsVisibility?.addEventListener('change', () => {
    setQuickActionsToolbarVisibilityMode(el.selectQuickActionsVisibility.value);
  });
}

export function initPaginationSettings() {
  const storedPageSizeList = state.preferencesHydrated
    ? (state.pagination.perPage.list === null ? null : String(state.pagination.perPage.list))
    : localStorage.getItem(LS_PAGE_SIZE_LIST);
  const storedPageSizeGrid = state.preferencesHydrated
    ? (state.pagination.perPage.grid === null ? null : String(state.pagination.perPage.grid))
    : localStorage.getItem(LS_PAGE_SIZE_GRID);
  const storedPageModeList = state.preferencesHydrated
    ? state.pagination.mode.list
    : localStorage.getItem(LS_PAGE_MODE_LIST);
  const storedPageModeGrid = state.preferencesHydrated
    ? state.pagination.mode.grid
    : localStorage.getItem(LS_PAGE_MODE_GRID);
  const hasCanonicalPagination = storedPageSizeList !== null || storedPageModeList !== null;
  const storedPageSize = hasCanonicalPagination ? storedPageSizeList : storedPageSizeGrid;
  const storedPageMode = hasCanonicalPagination ? storedPageModeList : storedPageModeGrid;

  let sharedPageSize = parseStoredPageSize(storedPageSize);
  let sharedPageMode = parseStoredPageMode(storedPageMode);
  state.pagination.showPageCount = state.preferencesHydrated
    ? state.pagination.showPageCount
    : localStorage.getItem(LS_SHOW_PAGE_COUNT) !== '0';
  state.pagination.showFirstLastButtons = state.preferencesHydrated
    ? state.pagination.showFirstLastButtons
    : localStorage.getItem(LS_SHOW_FIRST_LAST_PAGES) === '1';
  const storedVisibilityMode = state.preferencesHydrated
    ? state.pagination.visibilityMode
    : localStorage.getItem(LS_PAGE_CONTROL_VISIBILITY);
  state.pagination.visibilityMode = storedVisibilityMode === 'static' ? 'static' : 'hover';

  if (storedPageSize === null && storedPageMode === null) {
    sharedPageSize = PAGE_SUGGESTED.list;
    sharedPageMode = 'suggested';
  } else if (sharedPageMode === 'suggested') {
    sharedPageSize = PAGE_SUGGESTED.list;
  } else if (sharedPageSize === null) {
    sharedPageMode = 'unlimited';
  }

  getPageSettingViews().forEach(view => {
    state.pagination.perPage[view] = sharedPageSize;
    state.pagination.mode[view] = sharedPageMode;
  });
  if (!state.preferencesHydrated && (storedPageSizeGrid !== null || storedPageModeGrid !== null)) {
    if (sharedPageSize === null) {
      localStorage.removeItem(LS_PAGE_SIZE_LIST);
    } else {
      localStorage.setItem(LS_PAGE_SIZE_LIST, String(sharedPageSize));
    }
    localStorage.setItem(LS_PAGE_MODE_LIST, sharedPageMode);
    localStorage.removeItem(LS_PAGE_SIZE_GRID);
    localStorage.removeItem(LS_PAGE_MODE_GRID);
  }

  syncPageControls('list');
  syncPageControls('grid');
  el.toggleShowPageCount.checked = state.pagination.showPageCount;
  el.toggleFirstLastPageButtons.checked = state.pagination.showFirstLastButtons;
  el.selectPageControlVisibility.value = state.pagination.visibilityMode;

  el.pageModeList.addEventListener('change', () => {
    if (el.pageModeList.value === 'custom') {
      showCustomPageInput('list');
      el.pageCustomList.focus();
      return;
    }
    applyPaginationSetting('list', el.pageModeList.value);
  });

  el.pageModeGrid?.addEventListener('change', () => {
    if (el.pageModeGrid.value === 'custom') {
      showCustomPageInput('grid');
      el.pageCustomGrid.focus();
      return;
    }
    applyPaginationSetting('grid', el.pageModeGrid.value);
  });

  el.pageCustomList.addEventListener('change', () => {
    if (!applyPaginationSetting('list', 'custom', el.pageCustomList.value)) el.pageCustomList.focus();
  });
  el.pageCustomGrid?.addEventListener('change', () => {
    if (!applyPaginationSetting('grid', 'custom', el.pageCustomGrid.value)) el.pageCustomGrid.focus();
  });

  el.pageCustomList.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!applyPaginationSetting('list', 'custom', el.pageCustomList.value)) el.pageCustomList.focus();
    }
  });
  el.pageCustomGrid?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!applyPaginationSetting('grid', 'custom', el.pageCustomGrid.value)) el.pageCustomGrid.focus();
    }
  });

  function nudgePageCustom(view, delta) {
    const controls = getPageControls(view);
    if (!hasPageControls(controls)) return;
    const min = controls.custom.min === '' ? 1 : parseInt(controls.custom.min, 10);
    const currentRaw = controls.custom.value.trim();
    const current = currentRaw === '' ? null : parseInt(currentRaw, 10);
    const next = Math.max(min, (Number.isInteger(current) ? current : min) + delta);
    controls.custom.value = String(next);
    applyPaginationSetting(view, 'custom', controls.custom.value);
    controls.custom.focus();
  }

  el.btnPageCustomListUp.addEventListener('click', () => nudgePageCustom('list', 1));
  el.btnPageCustomListDown.addEventListener('click', () => nudgePageCustom('list', -1));
  el.btnPageCustomGridUp?.addEventListener('click', () => nudgePageCustom('grid', 1));
  el.btnPageCustomGridDown?.addEventListener('click', () => nudgePageCustom('grid', -1));

  el.toggleFirstLastPageButtons.addEventListener('change', () => {
    setShowFirstLastPageButtons(el.toggleFirstLastPageButtons.checked);
  });

  el.toggleShowPageCount.addEventListener('change', () => {
    setShowPageCount(el.toggleShowPageCount.checked);
  });

  el.selectPageControlVisibility.addEventListener('change', () => {
    setPageControlVisibilityMode(el.selectPageControlVisibility.value);
  });
}

// ---------------------------------------------------------------------------
// Settings status message
// ---------------------------------------------------------------------------

export function setSettingsStatus(msg, isError = false) {
  el.settingsStatus.textContent = msg;
  el.settingsStatus.style.color = isError ? 'var(--danger-hover)' : 'var(--text-muted)';
}

function syncEarlyWrappedToggle() {
  if (el.toggleEarlyWrapped) {
    el.toggleEarlyWrapped.checked = !!state.earlyWrapped;
  }
}

function closeEarlyWrappedConfirmation() {
  earlyWrappedConfirmStepIndex = -1;
  el.earlyWrappedConfirmOverlay?.classList.add('hidden');
  el.earlyWrappedConfirmOverlay?.setAttribute('aria-hidden', 'true');
  el.earlyWrappedConfirmFloater?.classList.remove('early-wrapped-confirm-moving');
  hideEarlyWrappedCheatToast();
  if (el.btnEarlyWrappedConfirmLeft) el.btnEarlyWrappedConfirmLeft.dataset.action = '';
  if (el.btnEarlyWrappedConfirmRight) el.btnEarlyWrappedConfirmRight.dataset.action = '';
}

function hideEarlyWrappedCheatToast() {
  if (earlyWrappedCheatToastTimeout) {
    clearTimeout(earlyWrappedCheatToastTimeout);
    earlyWrappedCheatToastTimeout = null;
  }
  if (!el.earlyWrappedCheatToast) return;
  if (earlyWrappedCheatToastFadeTimeout) {
    clearTimeout(earlyWrappedCheatToastFadeTimeout);
  }
  el.earlyWrappedCheatToast.classList.remove('early-wrapped-cheat-toast-visible');
  earlyWrappedCheatToastFadeTimeout = setTimeout(() => {
    el.earlyWrappedCheatToast.classList.add('hidden');
    el.earlyWrappedCheatToast.textContent = '';
    earlyWrappedCheatToastFadeTimeout = null;
  }, EARLY_WRAPPED_CHEAT_TOAST_FADE_MS);
}

function showEarlyWrappedCheatToast() {
  if (!el.earlyWrappedCheatToast) return;
  if (earlyWrappedCheatToastTimeout) {
    clearTimeout(earlyWrappedCheatToastTimeout);
  }
  if (earlyWrappedCheatToastFadeTimeout) {
    clearTimeout(earlyWrappedCheatToastFadeTimeout);
    earlyWrappedCheatToastFadeTimeout = null;
  }
  el.earlyWrappedCheatToast.textContent = EARLY_WRAPPED_CHEAT_TOAST_MESSAGE;
  el.earlyWrappedCheatToast.classList.remove('hidden');
  el.earlyWrappedCheatToast.classList.remove('early-wrapped-cheat-toast-visible');
  void el.earlyWrappedCheatToast.offsetWidth;
  el.earlyWrappedCheatToast.classList.add('early-wrapped-cheat-toast-visible');
  earlyWrappedCheatToastTimeout = setTimeout(() => {
    hideEarlyWrappedCheatToast();
  }, EARLY_WRAPPED_CHEAT_TOAST_MS);
}

function renderEarlyWrappedConfirmationStep(stepIndex) {
  const step = EARLY_WRAPPED_CONFIRM_STEPS[stepIndex];
  if (!step) {
    closeEarlyWrappedConfirmation();
    return;
  }

  earlyWrappedConfirmStepIndex = stepIndex;
  if (el.earlyWrappedConfirmText) {
    el.earlyWrappedConfirmText.innerHTML = step.textHtml;
  }

  const syncButton = (button, config) => {
    if (!button || !config) return;
    button.textContent = config.label;
    button.dataset.action = config.action;
    button.className = `btn ${config.className}`;
  };

  syncButton(el.btnEarlyWrappedConfirmLeft, step.left);
  syncButton(el.btnEarlyWrappedConfirmRight, step.right);
  el.earlyWrappedConfirmFloater?.classList.toggle('early-wrapped-confirm-moving', !!step.moving);
  el.earlyWrappedConfirmOverlay?.classList.remove('hidden');
  el.earlyWrappedConfirmOverlay?.setAttribute('aria-hidden', 'false');
}

function openEarlyWrappedConfirmation() {
  syncEarlyWrappedToggle();
  renderEarlyWrappedConfirmationStep(0);
}

function handleEarlyWrappedConfirmationAction(action) {
  if (action === 'cancel') {
    closeEarlyWrappedConfirmation();
    syncEarlyWrappedToggle();
    return;
  }

  if (earlyWrappedConfirmStepIndex < EARLY_WRAPPED_CONFIRM_STEPS.length - 1) {
    renderEarlyWrappedConfirmationStep(earlyWrappedConfirmStepIndex + 1);
    return;
  }

  closeEarlyWrappedConfirmation();
  void setEarlyWrappedEnabled(true);
}

export function initEarlyWrappedSettingsUi() {
  setEarlyWrappedEnabled(state.earlyWrapped, { persist: false });
  closeEarlyWrappedConfirmation();

  if (earlyWrappedUiInitialized) return;
  earlyWrappedUiInitialized = true;

  if (el.toggleEarlyWrapped) {
    el.toggleEarlyWrapped.addEventListener('change', () => {
      if (el.toggleEarlyWrapped.checked && !state.earlyWrapped) {
        el.toggleEarlyWrapped.checked = false;
        openEarlyWrappedConfirmation();
        return;
      }
      closeEarlyWrappedConfirmation();
      void setEarlyWrappedEnabled(el.toggleEarlyWrapped.checked);
    });
  }

  const attachConfirmButtonHandlers = (button) => {
    if (!button) return;
    button.addEventListener('click', () => {
      handleEarlyWrappedConfirmationAction(button.dataset.action);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const step = EARLY_WRAPPED_CONFIRM_STEPS[earlyWrappedConfirmStepIndex];
      if (step?.moving && button.dataset.action === 'ok') {
        event.preventDefault();
        playGotEemSound();
        showEarlyWrappedCheatToast();
      }
    });
  };
  attachConfirmButtonHandlers(el.btnEarlyWrappedConfirmLeft);
  attachConfirmButtonHandlers(el.btnEarlyWrappedConfirmRight);
}

let gotEemAudio = null;
function playGotEemSound() {
  try {
    if (!gotEemAudio) {
      gotEemAudio = new Audio('/sounds/ha-got-eeem.mp3');
    }
    gotEemAudio.currentTime = 0;
    const playback = gotEemAudio.play();
    if (playback && typeof playback.catch === 'function') {
      playback.catch(error => {
        console.error('Failed to play got-eem sound:', error);
      });
    }
  } catch (error) {
    console.error('Failed to play got-eem sound:', error);
  }
}

// ---------------------------------------------------------------------------
// Debug toggle
// ---------------------------------------------------------------------------

export function setShowWipeDb(enabled) {
  el.settingsWipeSection.classList.toggle('hidden', !enabled);
  localStorage.setItem(LS_SHOW_WIPE_DB, enabled ? '1' : '0');
}

export function setListArtClickToEnlarge(enabled, options = {}) {
  const { persist = true } = options;
  state.listArtClickToEnlarge = enabled;
  el.toggleListArtEnlarge.checked = enabled;
  localStorage.removeItem(LS_LIST_ART_ENLARGE);
  if (persist) {
    patchPreferences({
      listArtClickToEnlarge: state.listArtClickToEnlarge,
    }).catch(error => {
      console.error('Failed to save list art enlarge preference:', error);
    });
  }
  render();
}

export function setReserveSidebarSpace(enabled, options = {}) {
  const { persist = true } = options;
  state.reserveSidebarSpace = enabled;
  document.body.classList.toggle('reserve-sidebar-space', enabled);
  el.toggleReserveSidebarSpace.checked = enabled;
  localStorage.removeItem(LS_RESERVE_SIDEBAR_SPACE);
  if (persist) {
    patchPreferences({
      reserveSidebarSpace: state.reserveSidebarSpace,
    }).catch(error => {
      console.error('Failed to save reserve sidebar space preference:', error);
    });
  }
  syncAppShellLayout();
}

export function setAccentPeriod(enabled, options = {}) {
  const { persist = true } = options;
  state.accentPeriod = !!enabled;
  document.body.classList.toggle('accent-period-enabled', state.accentPeriod);
  cacheAccentPeriodPreference(state.accentPeriod);
  if (el.toggleAccentPeriod) {
    el.toggleAccentPeriod.checked = state.accentPeriod;
  }
  syncHeaderTitleText();
  if (!persist) return;
  return patchPreferences({
    accentPeriod: state.accentPeriod,
  }).catch(error => {
    console.error('Failed to save accent period preference:', error);
    return null;
  });
}

export function setEarlyWrappedEnabled(enabled, options = {}) {
  const { persist = true } = options;
  state.earlyWrapped = !!enabled;
  syncEarlyWrappedToggle();
  if (!persist) return;
  return patchPreferences({
    earlyWrapped: state.earlyWrapped,
  }).catch(error => {
    console.error('Failed to save Early Wrapped preference:', error);
    return null;
  });
}

export function setGrinchMode(enabled, options = {}) {
  const { persist = true } = options;
  state.grinchMode = !!enabled;
  if (el.toggleGrinchMode) {
    el.toggleGrinchMode.checked = state.grinchMode;
  }
  if (!persist) return;
  localStorage.setItem(LS_GRINCH_MODE, state.grinchMode ? '1' : '0');
  return patchPreferences({
    grinchMode: state.grinchMode,
  }).catch(error => {
    console.error('Failed to save Grinch mode:', error);
    return null;
  });
}

function syncContentWidthControls() {
  if (!el.inputContentWidth) return;
  el.inputContentWidth.value = String(state.contentWidthPx);
}

export function setContentWidthPx(value, options = {}) {
  const { persist = true } = options;
  const parsed = validateContentWidthPx(value);
  if (parsed === null) {
    syncContentWidthControls();
    return false;
  }

  state.contentWidthPx = parsed;
  localStorage.removeItem(LS_CONTENT_WIDTH);
  syncContentWidthControls();
  syncAppShellLayout();
  if (persist) {
    patchPreferences({
      contentWidthPx: state.contentWidthPx,
    }).catch(error => {
      console.error('Failed to save content width:', error);
    });
  }
  return true;
}

export function restoreContentWidthSettings() {
  state.contentWidthPx = parseStoredContentWidthPx(
    state.preferencesHydrated ? state.contentWidthPx : localStorage.getItem(LS_CONTENT_WIDTH),
    DEFAULT_CONTENT_WIDTH_PX,
  );
  syncContentWidthControls();
  syncAppShellLayout();
}

export function setShowRefetchArtButton(enabled, options = {}) {
  const { persist = true } = options;
  state.showRefetchArt = !!enabled;
  el.toggleShowRefetchArt.checked = enabled;
  localStorage.removeItem(LS_SHOW_REFETCH_ART);
  if (persist) {
    patchPreferences({
      showRefetchArt: state.showRefetchArt,
    }).catch(error => {
      console.error('Failed to save refetch art visibility preference:', error);
    });
  }

  if (state.modal.open && state.modal.mode === 'edit') {
    import('./modal-art.js').then(module => module.showArtButtons()).catch(() => {});
  }
}

export function setShowPlannedAtField(enabled, options = {}) {
  const { persist = true } = options;
  state.showPlannedAtField = !!enabled;
  el.toggleShowPlannedAtField.checked = enabled;
  localStorage.removeItem(LS_SHOW_PLANNED_AT_FIELD);
  if (persist) {
    patchPreferences({
      showPlannedAtField: state.showPlannedAtField,
    }).catch(error => {
      console.error('Failed to save planned-date field visibility preference:', error);
    });
  }

  if (state.modal.open) {
    import('./modal.js').then(module => module.syncAlbumModalFieldVisibility()).catch(() => {});
  }
}

export function setShowPriorityField(enabled, options = {}) {
  const { persist = true } = options;
  state.showPriorityField = !!enabled;
  el.toggleShowPriorityField.checked = enabled;
  localStorage.removeItem(LS_SHOW_PRIORITY_FIELD);
  if (persist) {
    patchPreferences({
      showPriorityField: state.showPriorityField,
    }).catch(error => {
      console.error('Failed to save priority field visibility preference:', error);
    });
  }

  if (state.modal.open) {
    import('./modal.js').then(module => module.syncAlbumModalFieldVisibility()).catch(() => {});
  }
}

export function setShowRepeatsField(enabled, options = {}) {
  const { persist = true } = options;
  state.showRepeatsField = !!enabled;
  el.toggleShowRepeatsField.checked = enabled;
  localStorage.removeItem(LS_SHOW_REPEATS_FIELD);
  if (persist) {
    patchPreferences({
      showRepeatsField: state.showRepeatsField,
    }).catch(error => {
      console.error('Failed to save repeats field visibility preference:', error);
    });
  }

  if (state.modal.open) {
    import('./modal.js').then(module => module.syncAlbumModalFieldVisibility()).catch(() => {});
  }
}

export function setDebugMode(enabled) {
  state.debugMode = enabled;
  // If the edit modal is open, update button visibility.
  if (state.modal.open && state.modal.mode === 'edit') {
    import('./modal.js').then(module => module.syncAlbumModalDebugControls()).catch(() => {});
  }
}

export function setUButtons(enabled) {
  document.body.classList.toggle('u-buttons-enabled', enabled);
  const view = getCurrentCollectionView();
  if (state.uButtonsEnabled) {
    state.uButtonsEnabled[view] = !!enabled;
  }
  renderUButtonList();
}

export function setHeaderScrollMode(mode, options = {}) {
  const { persist = true } = options;
  state.headerScrollMode = mode;
  localStorage.removeItem(LS_HEADER_SCROLL);
  if (persist) {
    patchPreferences({
      headerScrollMode: state.headerScrollMode,
    }).catch(error => {
      console.error('Failed to save header scroll preference:', error);
    });
  }
  el.selectHeaderScroll.value = mode;
  syncHeaderScrollBaseline({
    currentY: window.scrollY || 0,
    forceVisible: mode === 'fixed',
    instant: true,
  });
}

// ---------------------------------------------------------------------------
// Reset all settings
// ---------------------------------------------------------------------------

export function resetAllSettings() {
  if (!window.confirm('Reset all settings to defaults? This will clear saved filters, sort preferences, and all other settings. This cannot be undone.')) return;

  Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => localStorage.removeItem(k));

  // Reset debug mode.
  el.toggleShowRepeatsField.checked = true;
  setShowRepeatsField(true, { persist: false });
  el.toggleShowPriorityField.checked = false;
  setShowPriorityField(false, { persist: false });
  el.toggleShowRefetchArt.checked = false;
  setShowRefetchArtButton(false, { persist: false });
  el.toggleShowPlannedAtField.checked = false;
  setShowPlannedAtField(false, { persist: false });
  el.toggleListArtEnlarge.checked = true;
  setListArtClickToEnlarge(true, { persist: false });
  el.toggleReserveSidebarSpace.checked = false;
  setReserveSidebarSpace(false, { persist: false });
  if (el.toggleGrinchMode) el.toggleGrinchMode.checked = false;
  setGrinchMode(false);
  if (el.toggleAccentPeriod) el.toggleAccentPeriod.checked = true;
  setAccentPeriod(true, { persist: false });
  if (el.toggleEarlyWrapped) el.toggleEarlyWrapped.checked = false;
  setEarlyWrappedEnabled(false, { persist: false });
  closeEarlyWrappedConfirmation();
  setWrappedName('');
  setContentWidthPx(DEFAULT_CONTENT_WIDTH_PX, { persist: false });
  applyColorSchemePreset(DEFAULT_COLOR_SCHEME_PRESET_ID);
  applyCustomThemeCss('', '', { persist: true, syncUi: true });
  resetPersonalizationOpacity();
  state.personalization.activeOpacityPresetId = null;
  syncOpacityPresetUi();
  setBackgroundDisplay('primary', DEFAULT_PERSONALIZATION_BACKGROUND_DISPLAY);
  setBackgroundDisplay('secondary', DEFAULT_SECONDARY_PERSONALIZATION_BACKGROUND_DISPLAY);
  state.personalization.activeBackgroundTab = 'primary';
  syncBackgroundTabUi();
  setAppliedThemeId(null);
  startNewThemeDraft();
  state.personalization.opacityControlsExpanded = false;
  if (el.personalizationOpacityControlsDetails) {
    el.personalizationOpacityControlsDetails.open = false;
  }
  localStorage.setItem(LS_OPACITY_CONTROLS_EXPANDED, '0');
  setBackgroundSelection('primary', null, { render: false });
  setBackgroundSelection('secondary', null, { render: false });
  renderPersonalizationBackgrounds();
  setPersonalizationBackgroundStatus('');
  el.toggleDebugControls.checked = false;
  setDebugMode(false);

  state.pagination.perPage.list = PAGE_SUGGESTED.list;
  state.pagination.perPage.grid = PAGE_SUGGESTED.grid;
  state.pagination.mode.list = 'suggested';
  state.pagination.mode.grid = 'suggested';
  state.pagination.showPageCount = true;
  state.pagination.showFirstLastButtons = false;
  state.pagination.visibilityMode = 'hover';
  el.pageModeList.value = 'suggested';
  if (el.pageModeGrid) el.pageModeGrid.value = 'suggested';
  el.pageCustomList.value = '';
  if (el.pageCustomGrid) el.pageCustomGrid.value = '';
  el.toggleShowPageCount.checked = true;
  el.selectPageControlVisibility.value = 'hover';
  el.pageSuggestedList.classList.remove('hidden');
  el.pageSuggestedGrid?.classList.remove('hidden');
  el.pageCustomWrapList.classList.add('hidden');
  el.pageCustomWrapGrid?.classList.add('hidden');
  el.pageSuggestedList.value = String(PAGE_SUGGESTED.list);
  if (el.pageSuggestedGrid) el.pageSuggestedGrid.value = String(PAGE_SUGGESTED.grid);
  el.toggleFirstLastPageButtons.checked = false;
  resetPagination();

  // Reset show-wipe-db toggle.
  el.toggleShowWipeDb.checked = false;
  el.settingsWipeSection.classList.add('hidden');

  // Reset header scroll mode.
  setHeaderScrollMode('smart', { persist: false });

  // Reset sidebar to default for current view (list: showing, grid: hidden).
  const defaultCollectionView = getCurrentCollectionView();
  document.body.classList.toggle('sidebar-collapsed', defaultCollectionView === 'grid');
  document.body.classList.toggle('collection-view-grid', defaultCollectionView === 'grid');
  document.body.classList.toggle('view-grid', defaultCollectionView === 'grid');
  syncAppShellLayout();

  // Reset U-buttons (default order/all enabled, per-view defaults).
  state.uButtons = loadUButtons({ preferState: false, preferStorage: false });
  state.uButtonsEnabled = { list: false, grid: false };
  localStorage.removeItem(LS_U_BUTTONS_ENABLED_LIST);
  localStorage.removeItem(LS_U_BUTTONS_ENABLED_GRID);
  setQuickActionsToolbarVisibilityMode('visible', { persist: false });
  const defaultOn = false;
  setUButtons(defaultOn);
  renderUButtonBar();
  renderUButtonList();

  // Reset complex statuses and filters/sort.
  state.complexStatuses = DEFAULT_COMPLEX_STATUSES.map(cs => ({ ...cs, statuses: [...cs.statuses] }));
  saveComplexStatuses();
  renderComplexStatusList();
  renderStatusDropdown();
  updateRestoreBtn();

  const defaultStatusFilter = state.complexStatuses.find(cs => cs.id === 'cs_listened')?.id ?? 'completed';
  saveDefaultFilterPreset(defaultStatusFilter);
  const defaultPreset = getDefaultFilterPreset(defaultStatusFilter);
  applyFilterState(
    defaultPreset.filters,
    defaultPreset.sort
  );

  patchPreferences({
    grinchMode: false,
    accentPeriod: true,
    earlyWrapped: false,
    seasonalThemeHistory: {},
    wrappedName: '',
    contentWidthPx: DEFAULT_CONTENT_WIDTH_PX,
    pageControlVisibility: 'hover',
    quickActionsToolbarVisibility: 'visible',
    filterPreset: getDefaultFilterPreset(defaultStatusFilter),
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
    uButtons: state.uButtons,
  }).catch(error => {
    console.error('Failed to reset server-backed preferences:', error);
  });
}

export function clearLocalStorage() {
  if (!window.confirm('Clear all localStorage data for this app? This cannot be undone.')) return false;

  localStorage.clear();
  setSettingsStatus('localStorage cleared. Refresh the page to reload defaults.');
  return true;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export function generateCsv() {
  if (!(state.albumListMeta?.totalCount > 0)) { setSettingsStatus('No albums to export!', true); return; }
  const a    = document.createElement('a');
  a.href     = '/api/backup/export-csv';
  a.click();
}

// ---------------------------------------------------------------------------
// Backup & restore
// ---------------------------------------------------------------------------

export function downloadFullBackup() {
  if (!(state.albumListMeta?.totalCount > 0)) { setSettingsStatus('No albums to export!', true); return; }
  setSettingsStatus('Preparing backup…');
  const a = document.createElement('a');
  a.href = '/api/backup/download';
  a.click();
  setTimeout(() => setSettingsStatus(''), 3000);
}

export function downloadDbBackup() {
  if (!(state.albumListMeta?.totalCount > 0)) { setSettingsStatus('No albums to export!', true); return; }
  setSettingsStatus('Preparing database backup…');
  const a = document.createElement('a');
  a.href = '/api/backup/download-db';
  a.click();
  setTimeout(() => setSettingsStatus(''), 3000);
}

export function downloadEssentialBackup() {
  if (!(state.albumListMeta?.totalCount > 0)) { setSettingsStatus('No albums to export!', true); return; }
  setSettingsStatus('Preparing essential backup…');
  const a = document.createElement('a');
  a.href = '/api/backup/download-essential';
  a.click();
  setTimeout(() => setSettingsStatus(''), 3000);
}

function pickBackupFile(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.addEventListener('change', () => {
    if (input.files[0]) callback(input.files[0]);
  });
  input.click();
}

export async function mergeBackup() {
  pickBackupFile(async file => {
    setSettingsStatus('Merging…');
    el.btnMergeBackup.disabled = true;
    try {
      const form = new FormData();
      form.append('backup', file);
      const res  = await fetch('/api/backup/merge', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Merge failed.');
      const imgParts = [];
      if (data.imagesCopied)   imgParts.push(`${data.imagesCopied} image${data.imagesCopied!==1?'s':''} copied from backup`);
      if (data.imagesRefetched) imgParts.push(`${data.imagesRefetched} image${data.imagesRefetched!==1?'s':''} re-fetched`);
      const imgMsg = imgParts.length ? `, ${imgParts.join(', ')}` : '';
      setSettingsStatus(`Done — added ${data.added}, skipped ${data.skipped}${imgMsg}.`);
      await refreshAlbumDependentViews({ preservePage: false });
    } catch (e) {
      setSettingsStatus(e.message, true);
    } finally {
      el.btnMergeBackup.disabled = false;
    }
  });
}

export async function restoreBackup() {
  if (!confirm('This will replace current albums and images with the backup. New full backups also replace settings, themes, opacity presets, and user backgrounds. This cannot be undone. Continue?')) return;
  pickBackupFile(async file => {
    setSettingsStatus('Restoring…');
    el.btnRestoreBackup.disabled = true;
    try {
      const form = new FormData();
      form.append('backup', file);
      const res  = await fetch('/api/backup/restore', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed.');
      const imgParts2 = [];
      if (data.imagesCopied)    imgParts2.push(`${data.imagesCopied} image${data.imagesCopied!==1?'s':''} copied from backup`);
      if (data.imagesRefetched) imgParts2.push(`${data.imagesRefetched} image${data.imagesRefetched!==1?'s':''} re-fetched`);
      if (data.appStateRestored) imgParts2.push('settings and personalization restored');
      const imgMsg2 = imgParts2.length ? `, ${imgParts2.join(', ')}` : '';
      const doneMessage = `Done. Restored ${data.added} album${data.added!==1?'s':''}${imgMsg2}.`;
      if (data.appStateRestored) {
        setSettingsStatus(`${doneMessage} Reloading restored settings…`);
        window.setTimeout(() => window.location.reload(), 500);
        return;
      }
      setSettingsStatus(doneMessage);
      await refreshAlbumDependentViews({ preservePage: false });
    } catch (e) {
      setSettingsStatus(e.message, true);
    } finally {
      el.btnRestoreBackup.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Wipe database
// ---------------------------------------------------------------------------

export async function wipeDatabase() {
  if (!confirm('Are you sure you want to wipe the entire database? This will permanently delete ALL albums and images. This cannot be undone.')) return;
  if (!confirm('Final warning: every album will be gone forever. Really wipe the database?')) return;

  try {
    await apiFetch('/api/albums/wipe', { method: 'DELETE' });
    state.albums = [];
    state.albumDetailsCache = {};
    state.albumsLoaded = true;
    state.albumsLoading = false;
    state.albumsError = null;
    state.albumListMeta = {
      totalCount: 0,
      filteredCount: 0,
      currentPage: 1,
      totalPages: 1,
      startIndex: 0,
      endIndex: 0,
      isPaged: false,
      perPage: null,
      pageCount: 0,
      trackedListenedMs: 0,
    };
    await refreshAlbumDependentViews({ reloadCollection: false });
    setSettingsStatus('Database wiped.');
  } catch (e) {
    setSettingsStatus(e.message, true);
  }
}

// ---------------------------------------------------------------------------
// Bulk art re-fetch (settings)
// ---------------------------------------------------------------------------

export async function handleBulkRefetchArt() {
  const missing = state.albums.filter(a => !a.image_path &&
    (a.image_url_large || a.image_url_medium || a.image_url_small));

  if (!missing.length) {
    setSettingsStatus('All albums already have art.');
    return;
  }

  el.btnBulkRefetchArt.disabled = true;
  setSettingsStatus(`Re-fetching art for ${missing.length} album${missing.length !== 1 ? 's' : ''}…`);

  let fetched = 0;
  for (const album of missing) {
    let delay = 1000;
    let success = false;
    while (!success) {
      try {
        const result = await apiFetch(`/api/albums/${album.id}/refetch-art`, { method: 'POST' });
        const idx = state.albums.findIndex(a => a.id === album.id);
        if (idx !== -1) state.albums[idx] = { ...state.albums[idx], image_path: result.image_path };
        fetched++;
        success = true;
      } catch {
        if (delay > 32000) break; // give up after max delay
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 32000);
      }
    }
  }

  setSettingsStatus(`Done — ${fetched}/${missing.length} album${missing.length !== 1 ? 's' : ''} without art re-fetched.`);
  el.btnBulkRefetchArt.disabled = false;
  render();
}
