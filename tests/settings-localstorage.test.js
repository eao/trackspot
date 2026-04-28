import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  albums: [],
  modal: {
    open: false,
    mode: null,
  },
  pagination: {
    currentPage: 1,
    perPage: { list: null, grid: null },
    mode: { list: 'unlimited', grid: 'unlimited' },
    showPageCount: true,
    showFirstLastButtons: false,
    visibilityMode: 'hover',
  },
  complexStatuses: [],
  uButtons: [],
  quickActionsToolbarVisibilityMode: 'visible',
  view: 'list',
  reserveSidebarSpace: false,
  preferencesHydrated: false,
  grinchMode: false,
  accentPeriod: true,
  earlyWrapped: false,
  seasonalThemeHistory: {},
  contentWidthPx: 1000,
  personalization: {
    opacity: {
      backgroundImage: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImage: 100,
      secondaryBackgroundImageBlur: 0,
      header: 100,
      quickActionsToolbar: 100,
      sidebar: 100,
      rowHeaderBackground: 100,
      row: 100,
      rowArt: 100,
      rowText: 100,
      card: 100,
      cardArt: 100,
      cardText: 100,
      styleBackgroundGradient: 0,
    },
    colorSchemePresetId: 'bunan-blue',
    customThemeCss: '',
    customThemeCssName: '',
    backgroundDisplay: {
      positionX: 'center',
      positionY: 'center',
      fill: 'cover',
      customScale: 1,
    },
    secondaryBackgroundDisplay: {
      positionX: 'right',
      positionY: 'top',
      fill: 'original-size',
      customScale: 1,
    },
    opacityPresets: [],
    opacityPresetsLoaded: false,
    activeOpacityPresetId: null,
    opacityControlsExpanded: false,
    backgroundSelection: null,
    secondaryBackgroundSelection: null,
    activeBackgroundTab: 'primary',
    themes: [],
    themesLoaded: false,
    selectedThemeId: null,
    appliedThemeId: null,
    appliedThemeDirty: false,
    themeDraft: {
      name: '',
      description: '',
      previewImage: null,
      previewImageFile: null,
      previewThumbnailFile: null,
      previewObjectUrl: '',
      previewThumbnailObjectUrl: '',
    },
    backgrounds: {
      userImages: [],
      presetImages: [],
      loading: false,
    },
    secondaryBackgrounds: {
      userImages: [],
      presetImages: [],
      loading: false,
    },
  },
};

const colorSchemeSelectEl = globalThis.document.createElement('select');
const colorSchemeDescriptionEl = globalThis.document.createElement('span');
const customThemeCurrentEl = globalThis.document.createElement('span');
const colorSchemeDownloadBtnEl = globalThis.document.createElement('button');
const uploadThemeCssBtnEl = globalThis.document.createElement('button');
const themeCssInputEl = globalThis.document.createElement('input');
const clearThemeCssBtnEl = globalThis.document.createElement('button');

const elMock = {
  settingsStatus: { textContent: '', style: { color: '' } },
  toggleShowRepeatsField: { checked: false },
  toggleShowPriorityField: { checked: false },
  toggleShowRefetchArt: { checked: false },
  toggleShowPlannedAtField: { checked: false },
  toggleListArtEnlarge: { checked: false },
  toggleReserveSidebarSpace: { checked: false },
  toggleGrinchMode: { checked: false },
  toggleAccentPeriod: { checked: true },
  inputContentWidth: { value: '', focus: vi.fn() },
  toggleDebugControls: { checked: false },
  personalizationBackgroundStatus: { textContent: '', style: { color: '' } },
  personalizationColorSchemeSelect: colorSchemeSelectEl,
  personalizationColorSchemeDescription: colorSchemeDescriptionEl,
  personalizationColorSchemeDownload: colorSchemeDownloadBtnEl,
  personalizationCustomThemeCurrent: customThemeCurrentEl,
  personalizationUploadThemeCss: uploadThemeCssBtnEl,
  personalizationThemeCssInput: themeCssInputEl,
  personalizationClearThemeCss: clearThemeCssBtnEl,
  personalizationThemeSelect: globalThis.document.createElement('select'),
  personalizationThemeDescription: globalThis.document.createElement('span'),
  personalizationThemeGalleryUser: null,
  personalizationThemeGalleryPreset: null,
  personalizationThemeStatus: globalThis.document.createElement('span'),
  personalizationThemePreviewButton: globalThis.document.createElement('button'),
  personalizationThemePreviewImage: globalThis.document.createElement('img'),
  personalizationThemeUploadPreview: { addEventListener: vi.fn() },
  personalizationThemePreviewInput: { addEventListener: vi.fn(), click: vi.fn(), files: [] },
  personalizationThemeName: globalThis.document.createElement('input'),
  personalizationThemeDescriptionInput: globalThis.document.createElement('input'),
  personalizationThemeSelectionWarning: { textContent: '', style: { color: '' } },
  personalizationThemeNew: { addEventListener: vi.fn() },
  personalizationThemeSave: { addEventListener: vi.fn() },
  personalizationThemeUpdate: { addEventListener: vi.fn(), disabled: false },
  personalizationThemeDelete: { addEventListener: vi.fn(), disabled: false },
  personalizationThemeEditorMessage: { textContent: '', style: { color: '' } },
  personalizationBackgroundTabPrimary: { classList: { toggle: vi.fn() }, setAttribute: vi.fn() },
  personalizationBackgroundTabSecondary: { classList: { toggle: vi.fn() }, setAttribute: vi.fn() },
  personalizationBackgroundPanelPrimary: { classList: { toggle: vi.fn() } },
  personalizationBackgroundPanelSecondary: { classList: { toggle: vi.fn() } },
  personalizationBackgroundCurrent: { textContent: '' },
  personalizationUserImages: null,
  personalizationPresetImages: null,
  personalizationBackgroundPositionX: { value: '' },
  personalizationBackgroundPositionY: { value: '' },
  personalizationBackgroundFill: { value: '' },
  personalizationBackgroundCustomScaleRow: { classList: { toggle: vi.fn() } },
  personalizationBackgroundCustomScale: { value: '' },
  personalizationSecondaryBackgroundCurrent: { textContent: '' },
  personalizationSecondaryUserImages: null,
  personalizationSecondaryPresetImages: null,
  personalizationSecondaryBackgroundPositionX: { value: '' },
  personalizationSecondaryBackgroundPositionY: { value: '' },
  personalizationSecondaryBackgroundFill: { value: '' },
  personalizationSecondaryBackgroundCustomScaleRow: { classList: { toggle: vi.fn() } },
  personalizationSecondaryBackgroundCustomScale: { value: '' },
  personalizationUploadBackground: { addEventListener: vi.fn() },
  personalizationUploadInput: { addEventListener: vi.fn(), click: vi.fn(), files: [] },
  personalizationClearBackground: { addEventListener: vi.fn() },
  personalizationUploadSecondaryBackground: { addEventListener: vi.fn() },
  personalizationSecondaryUploadInput: { addEventListener: vi.fn(), click: vi.fn(), files: [] },
  personalizationClearSecondaryBackground: { addEventListener: vi.fn() },
  pageModeList: { value: '' },
  pageModeGrid: { value: '' },
  pageCustomList: { value: '' },
  pageCustomGrid: { value: '' },
  toggleShowPageCount: { checked: false },
  selectPageControlVisibility: { value: '' },
  selectQuickActionsVisibility: { value: '' },
  pageSuggestedList: { value: '', classList: { add: vi.fn(), remove: vi.fn() } },
  pageSuggestedGrid: { value: '', classList: { add: vi.fn(), remove: vi.fn() } },
  pageCustomWrapList: { classList: { add: vi.fn(), remove: vi.fn() } },
  pageCustomWrapGrid: { classList: { add: vi.fn(), remove: vi.fn() } },
  toggleFirstLastPageButtons: { checked: false },
  toggleShowWipeDb: { checked: false },
  toggleEarlyWrapped: { checked: false, addEventListener: vi.fn() },
  settingsWipeSection: { classList: { add: vi.fn(), toggle: vi.fn() } },
  earlyWrappedConfirmOverlay: { classList: { add: vi.fn(), remove: vi.fn() }, setAttribute: vi.fn() },
  earlyWrappedConfirmFloater: { classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() } },
  earlyWrappedConfirmText: { innerHTML: '' },
  btnEarlyWrappedConfirmLeft: { dataset: {}, textContent: '', className: '', addEventListener: vi.fn() },
  btnEarlyWrappedConfirmRight: { dataset: {}, textContent: '', className: '', addEventListener: vi.fn() },
  selectHeaderScroll: { value: '' },
};

function resetThemeUiState() {
  colorSchemeSelectEl.innerHTML = '';
  colorSchemeDescriptionEl.textContent = '';
  customThemeCurrentEl.textContent = '';
  themeCssInputEl.value = '';
  clearThemeCssBtnEl.disabled = false;
  if (elMock.personalizationThemeGalleryUser) {
    elMock.personalizationThemeGalleryUser.innerHTML = '';
  }
  if (elMock.personalizationThemeGalleryPreset) {
    elMock.personalizationThemeGalleryPreset.innerHTML = '';
  }
  stateMock.personalization.colorSchemePresetId = 'bunan-blue';
  stateMock.personalization.customThemeCss = '';
  stateMock.personalization.customThemeCssName = '';
  stateMock.preferencesHydrated = false;
  stateMock.grinchMode = false;
  stateMock.accentPeriod = true;
  stateMock.earlyWrapped = false;
  stateMock.seasonalThemeHistory = {};
  elMock.toggleGrinchMode.checked = false;
  elMock.toggleAccentPeriod.checked = true;
  elMock.toggleEarlyWrapped.checked = false;
  stateMock.personalization.opacityPresetsLoaded = false;
  stateMock.personalization.themes = [];
  stateMock.personalization.themesLoaded = false;
  stateMock.personalization.selectedThemeId = null;
  stateMock.personalization.appliedThemeId = null;
  stateMock.personalization.appliedThemeDirty = false;
  stateMock.personalization.themeDraft = {
    name: '',
    description: '',
    previewImage: null,
    previewImageFile: null,
    previewThumbnailFile: null,
    previewObjectUrl: '',
    previewThumbnailObjectUrl: '',
  };
  globalThis.document.getElementById('trackspot-theme-preset-style')?.remove();
  globalThis.document.getElementById('trackspot-theme-custom-style')?.remove();
}

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
  DEFAULT_COLOR_SCHEME_PRESET_ID: 'bunan-blue',
  COLOR_SCHEME_PRESETS: [
    {
      id: 'bunan-blue',
      name: 'Bunan Blue',
      description: 'Trackspot’s default blue-and-slate palette.',
      vars: {
        '--bg-base': '#0f1117',
        '--accent': '#4f8ef7',
      },
    },
    {
      id: 'evergreen-night',
      name: 'Evergreen Night',
      description: 'Cool evergreen surfaces with mint accents.',
      vars: {
        '--bg-base': '#0d1513',
        '--accent': '#5cc49a',
      },
    },
    {
      id: 'signal-amber',
      name: 'Signal Amber',
      description: 'Warm amber highlights over a dark studio backdrop.',
      vars: {
        '--bg-base': '#14110d',
        '--accent': '#f0a54a',
      },
    },
  ],
  DEFAULT_PERSONALIZATION_OPACITY: {
    backgroundImage: 45,
    backgroundImageBlur: 0,
    secondaryBackgroundImage: 100,
    secondaryBackgroundImageBlur: 0,
    header: 100,
    quickActionsToolbar: 100,
    sidebar: 100,
    rowHeaderBackground: 100,
    row: 100,
    rowArt: 100,
    rowText: 100,
    card: 100,
    cardArt: 100,
    cardText: 100,
    styleBackgroundGradient: 0,
  },
  DEFAULT_PERSONALIZATION_BACKGROUND_DISPLAY: {
    positionX: 'center',
    positionY: 'center',
    fill: 'cover',
    customScale: 1,
  },
  DEFAULT_SECONDARY_PERSONALIZATION_BACKGROUND_DISPLAY: {
    positionX: 'right',
    positionY: 'top',
    fill: 'original-size',
    customScale: 1,
  },
  DEFAULT_OPACITY_PRESETS: [
    {
      id: 'default-opaque',
      name: 'Default Opaque',
      builtIn: true,
      opacity: {
        header: 100,
        quickActionsToolbar: 100,
        sidebar: 100,
        rowHeaderBackground: 100,
        row: 100,
        rowArt: 100,
        rowText: 100,
        card: 100,
        cardArt: 100,
        cardText: 100,
        styleBackgroundGradient: 0,
      },
    },
  ],
  DEFAULT_COMPLEX_STATUSES: [],
  PAGE_SUGGESTED: {
    list: 18,
    grid: 18,
  },
}));

vi.mock('../public/js/render.js', () => ({
  render: vi.fn(),
  loadAlbums: vi.fn(),
  resetPagination: vi.fn(),
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

const syncAppShellLayoutMock = vi.fn();

vi.mock('../public/js/app-shell.js', () => ({
  syncAppShellLayout: syncAppShellLayoutMock,
}));

describe('clearLocalStorage', () => {
  beforeEach(() => {
    globalThis.document.body.className = '';
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();
    elMock.settingsStatus.textContent = '';
    elMock.settingsStatus.style.color = '';
    elMock.inputContentWidth.value = '';
    syncAppShellLayoutMock.mockReset();
    localStorage.clear();
    localStorage.setItem('ts_headerScroll', 'smart');
    localStorage.setItem('unrelated', 'keep-me');
  });

  it('clears all localStorage after confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { clearLocalStorage } = await import('../public/js/settings.js');

    const cleared = clearLocalStorage();

    expect(cleared).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(elMock.settingsStatus.textContent).toBe('localStorage cleared. Refresh the page to reload defaults.');
    expect(elMock.settingsStatus.style.color).toBe('var(--text-muted)');
  });

  it('leaves localStorage untouched when cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { clearLocalStorage } = await import('../public/js/settings.js');

    const cleared = clearLocalStorage();

    expect(cleared).toBe(false);
    expect(localStorage.getItem('ts_headerScroll')).toBe('smart');
    expect(localStorage.getItem('unrelated')).toBe('keep-me');
    expect(elMock.settingsStatus.textContent).toBe('');
  });
});

describe('resetAllSettings', () => {
  beforeEach(() => {
    globalThis.document.body.className = 'reserve-sidebar-space sidebar-collapsed';
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();
    localStorage.clear();
    localStorage.setItem('ts_reserveSidebarSpace', '1');
    localStorage.setItem('ts_listArtEnlarge', '0');
    localStorage.setItem('ts_contentWidth', '3200');
    localStorage.setItem('ts_colorSchemePreset', 'signal-amber');
    localStorage.setItem('ts_customThemeCss', ':root { --accent: #123456; }');
    localStorage.setItem('ts_customThemeCssName', 'my-theme.css');
    localStorage.setItem('ts_quickActionsVisibility', 'hover');
    localStorage.setItem('ts_backgroundImageSelection', JSON.stringify({
      kind: 'preset',
      id: 'Stargazing.png',
      name: 'Stargazing',
      url: '/backgrounds/presets/Stargazing.png',
    }));
    localStorage.setItem('ts_personalizationOpacity', JSON.stringify({ header: 45, card: 60 }));
    localStorage.setItem('ts_sidebarCollapsedList', '1');
    stateMock.view = 'list';
    stateMock.reserveSidebarSpace = true;
    stateMock.contentWidthPx = 3200;
    stateMock.quickActionsToolbarVisibilityMode = 'hover';
    globalThis.document.body.classList.add('u-buttons-hover-only');
    stateMock.personalization.opacity = {
      backgroundImage: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImage: 100,
      secondaryBackgroundImageBlur: 0,
      header: 45,
      quickActionsToolbar: 100,
      sidebar: 100,
      rowHeaderBackground: 100,
      row: 100,
      rowArt: 100,
      rowText: 100,
      card: 60,
      cardArt: 100,
      cardText: 100,
      styleBackgroundGradient: 0,
    };
    stateMock.personalization.colorSchemePresetId = 'signal-amber';
    stateMock.personalization.customThemeCss = ':root { --accent: #123456; }';
    stateMock.personalization.customThemeCssName = 'my-theme.css';
    stateMock.personalization.backgroundSelection = {
      kind: 'preset',
      id: 'Stargazing.png',
      name: 'Stargazing',
      url: '/backgrounds/presets/Stargazing.png',
    };
    stateMock.personalization.secondaryBackgroundSelection = {
      kind: 'preset',
      id: 'Nebula.png',
      name: 'Nebula',
      url: '/backgrounds/secondary/presets/Nebula.png',
    };
  });

  it('restores the reserve-sidebar-space option to its default off state', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { resetAllSettings } = await import('../public/js/settings.js');

    resetAllSettings();

    expect(stateMock.reserveSidebarSpace).toBe(false);
    expect(elMock.toggleReserveSidebarSpace.checked).toBe(false);
    expect(globalThis.document.body.classList.contains('reserve-sidebar-space')).toBe(false);
    expect(localStorage.getItem('ts_reserveSidebarSpace')).toBeNull();
  });

  it('restores the accent period preference to its default on state', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    stateMock.accentPeriod = false;
    elMock.toggleAccentPeriod.checked = false;
    const { resetAllSettings } = await import('../public/js/settings.js');

    resetAllSettings();

    expect(stateMock.accentPeriod).toBe(true);
    expect(elMock.toggleAccentPeriod.checked).toBe(true);
  });

  it('restores the early wrapped preference to its default off state', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    stateMock.earlyWrapped = true;
    elMock.toggleEarlyWrapped.checked = true;
    const { resetAllSettings } = await import('../public/js/settings.js');

    resetAllSettings();

    expect(stateMock.earlyWrapped).toBe(false);
    expect(elMock.toggleEarlyWrapped.checked).toBe(false);
  });

  it('restores content width settings to their default values', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { resetAllSettings } = await import('../public/js/settings.js');

    resetAllSettings();

    expect(stateMock.contentWidthPx).toBe(1000);
    expect(elMock.inputContentWidth.value).toBe('1000');
    expect(localStorage.getItem('ts_contentWidth')).toBeNull();
  });

  it('restores quick actions toolbar visibility to visible', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { resetAllSettings } = await import('../public/js/settings.js');

    resetAllSettings();

    expect(stateMock.quickActionsToolbarVisibilityMode).toBe('visible');
    expect(elMock.selectQuickActionsVisibility.value).toBe('visible');
    expect(globalThis.document.body.classList.contains('u-buttons-hover-only')).toBe(false);
    expect(localStorage.getItem('ts_quickActionsVisibility')).toBeNull();
  });

  it('restores personalization opacity settings to their default values', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { resetAllSettings } = await import('../public/js/settings.js');

    resetAllSettings();

    expect(stateMock.personalization.opacity.header).toBe(100);
    expect(stateMock.personalization.opacity.card).toBe(100);
    expect(stateMock.personalization.backgroundSelection).toBeNull();
    expect(stateMock.personalization.secondaryBackgroundSelection).toBeNull();
    expect(localStorage.getItem('ts_backgroundImageSelection')).toBeNull();
    expect(localStorage.getItem('ts_secondaryBackgroundImageSelection')).toBeNull();
    expect(localStorage.getItem('ts_personalizationOpacity')).toBe(JSON.stringify({
      backgroundImage: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImage: 100,
      secondaryBackgroundImageBlur: 0,
      header: 100,
      quickActionsToolbar: 100,
      sidebar: 100,
      rowHeaderBackground: 100,
      row: 100,
      rowArt: 100,
      rowText: 100,
      card: 100,
      cardArt: 100,
      cardText: 100,
      styleBackgroundGradient: 0,
    }));
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-opacity-header')).toBe('100%');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-opacity-card-alpha')).toBe('1');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-image-blur')).toBe('0px');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-secondary-background-image-blur')).toBe('0px');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-image-url')).toBe('none');
  });

  it('restores the default color scheme and clears custom CSS overrides', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { resetAllSettings } = await import('../public/js/settings.js');

    resetAllSettings();

    expect(stateMock.personalization.colorSchemePresetId).toBe('bunan-blue');
    expect(stateMock.personalization.customThemeCss).toBe('');
    expect(stateMock.personalization.customThemeCssName).toBe('');
    expect(localStorage.getItem('ts_colorSchemePreset')).toBe('bunan-blue');
    expect(localStorage.getItem('ts_customThemeCss')).toBeNull();
    expect(globalThis.document.getElementById('trackspot-theme-preset-style')?.textContent).toContain('Bunan Blue');
    expect(globalThis.document.getElementById('trackspot-theme-custom-style')?.textContent).toBe('');
  });
});

describe('content width settings', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();
    elMock.inputContentWidth.value = '';
    syncAppShellLayoutMock.mockReset();
    stateMock.contentWidthPx = 1000;
  });

  it('restores the saved content width from localStorage', async () => {
    localStorage.setItem('ts_contentWidth', '3400');
    const { restoreContentWidthSettings } = await import('../public/js/settings.js');

    restoreContentWidthSettings();

    expect(stateMock.contentWidthPx).toBe(3400);
    expect(elMock.inputContentWidth.value).toBe('3400');
    expect(syncAppShellLayoutMock).toHaveBeenCalled();
  });

  it('restores saved personalization opacity values from localStorage', async () => {
    localStorage.setItem('ts_personalizationOpacity', JSON.stringify({
      backgroundImage: 9,
      backgroundImageBlur: 50,
      header: 42,
      quickActionsToolbar: 88,
      rowHeaderBackground: 66,
      rowText: 57,
      secondaryBackgroundImageBlur: 25,
    }));
    const { restorePersonalizationSettings } = await import('../public/js/settings.js');

    restorePersonalizationSettings();

    expect(stateMock.personalization.opacity.backgroundImage).toBe(9);
    expect(stateMock.personalization.opacity.backgroundImageBlur).toBe(50);
    expect(stateMock.personalization.opacity.header).toBe(42);
    expect(stateMock.personalization.opacity.quickActionsToolbar).toBe(88);
    expect(stateMock.personalization.opacity.rowHeaderBackground).toBe(66);
    expect(stateMock.personalization.opacity.rowText).toBe(57);
    expect(stateMock.personalization.opacity.secondaryBackgroundImageBlur).toBe(25);
    expect(stateMock.personalization.opacity.card).toBe(100);
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-opacity-background-image')).toBe('9%');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-image-blur')).toBe('12px');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-secondary-background-image-blur')).toBe('6px');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-opacity-header')).toBe('42%');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-opacity-row-header-background-alpha')).toBe('0.66');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-opacity-row-text-alpha')).toBe('0.57');
  });

  it('restores the saved color scheme preset and custom CSS override', async () => {
    localStorage.setItem('ts_colorSchemePreset', 'evergreen-night');
    localStorage.setItem('ts_customThemeCss', ':root { --accent: #123456; }');
    localStorage.setItem('ts_customThemeCssName', 'forest-tweak.css');
    const { restorePersonalizationSettings } = await import('../public/js/settings.js');

    restorePersonalizationSettings();

    expect(stateMock.personalization.colorSchemePresetId).toBe('evergreen-night');
    expect(stateMock.personalization.customThemeCss).toBe(':root { --accent: #123456; }');
    expect(stateMock.personalization.customThemeCssName).toBe('forest-tweak.css');
    expect(elMock.personalizationColorSchemeSelect.value).toBe('evergreen-night');
    expect(elMock.personalizationColorSchemeDescription.textContent).toBe('Cool evergreen surfaces with mint accents.');
    expect(elMock.personalizationCustomThemeCurrent.textContent).toBe('Custom override active: forest-tweak.css');
    expect(elMock.personalizationClearThemeCss.disabled).toBe(false);
    expect(globalThis.document.getElementById('trackspot-theme-preset-style')?.textContent).toContain('Evergreen Night');
    expect(globalThis.document.getElementById('trackspot-theme-custom-style')?.textContent).toContain('--accent: #123456;');
  });

  it('does not let legacy preference keys override hydrated shared preferences', async () => {
    localStorage.setItem('ts_grinchMode', '1');
    localStorage.setItem('ts_seasonalThemeHistory', JSON.stringify({ christmas: 2024 }));
    stateMock.preferencesHydrated = true;
    stateMock.grinchMode = false;
    stateMock.seasonalThemeHistory = { christmas: 2026 };
    const { restorePersonalizationSettings } = await import('../public/js/settings.js');

    restorePersonalizationSettings();

    expect(stateMock.grinchMode).toBe(false);
    expect(stateMock.seasonalThemeHistory).toEqual({ christmas: 2026 });
  });

  it('restores the saved background image selection from localStorage', async () => {
    localStorage.setItem('ts_backgroundImageSelection', JSON.stringify({
      kind: 'preset',
      id: 'Flower Girl.jpg',
      name: 'Flower Girl',
      url: '/backgrounds/presets/Flower%20Girl.jpg',
    }));
    const { restorePersonalizationSettings } = await import('../public/js/settings.js');

    restorePersonalizationSettings();

    expect(stateMock.personalization.backgroundSelection).toEqual({
      kind: 'preset',
      id: 'Flower Girl.jpg',
      name: 'Flower Girl',
      url: '/backgrounds/presets/Flower%20Girl.jpg',
      thumbnailUrl: null,
      naturalWidth: null,
      naturalHeight: null,
    });
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-image-url'))
      .toBe('url("/backgrounds/presets/Flower%20Girl.jpg")');
  });

  it('restores saved background positioning and fill settings from localStorage', async () => {
    localStorage.setItem('ts_backgroundImageDisplay', JSON.stringify({
      positionX: 'right',
      positionY: 'bottom',
      fill: 'fit-width',
    }));
    const { restorePersonalizationSettings } = await import('../public/js/settings.js');

    restorePersonalizationSettings();

    expect(stateMock.personalization.backgroundDisplay).toEqual({
      positionX: 'right',
      positionY: 'bottom',
      fill: 'fit-width',
      customScale: 1,
    });
    expect(elMock.personalizationBackgroundPositionX.value).toBe('right');
    expect(elMock.personalizationBackgroundPositionY.value).toBe('bottom');
    expect(elMock.personalizationBackgroundFill.value).toBe('fit-width');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-position-x')).toBe('right');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-position-y')).toBe('bottom');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-size')).toBe('100% auto');
  });

  it('restores saved secondary background settings with original-size fill', async () => {
    localStorage.setItem('ts_secondaryBackgroundImageSelection', JSON.stringify({
      kind: 'preset',
      id: 'Nebula.jpg',
      name: 'Nebula',
      url: '/backgrounds/secondary/presets/Nebula.jpg',
    }));
    localStorage.setItem('ts_secondaryBackgroundImageDisplay', JSON.stringify({
      positionX: 'left',
      positionY: 'bottom',
      fill: 'original-size',
    }));
    const { restorePersonalizationSettings } = await import('../public/js/settings.js');

    restorePersonalizationSettings();

    expect(stateMock.personalization.secondaryBackgroundSelection).toEqual({
      kind: 'preset',
      id: 'Nebula.jpg',
      name: 'Nebula',
      url: '/backgrounds/secondary/presets/Nebula.jpg',
      thumbnailUrl: null,
      naturalWidth: null,
      naturalHeight: null,
    });
    expect(stateMock.personalization.secondaryBackgroundDisplay).toEqual({
      positionX: 'left',
      positionY: 'bottom',
      fill: 'original-size',
      customScale: 1,
    });
    expect(elMock.personalizationSecondaryBackgroundPositionX.value).toBe('left');
    expect(elMock.personalizationSecondaryBackgroundPositionY.value).toBe('bottom');
    expect(elMock.personalizationSecondaryBackgroundFill.value).toBe('original-size');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-secondary-background-image-url'))
      .toBe('url("/backgrounds/secondary/presets/Nebula.jpg")');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-secondary-background-size')).toBe('auto');
  });

  it('restores saved custom-scale background settings and computes pixel sizing from stored dimensions', async () => {
    localStorage.setItem('ts_backgroundImageSelection', JSON.stringify({
      kind: 'preset',
      id: 'Aurora.gif',
      name: 'Aurora',
      url: '/backgrounds/presets/Aurora.gif',
      naturalWidth: 1600,
      naturalHeight: 900,
    }));
    localStorage.setItem('ts_backgroundImageDisplay', JSON.stringify({
      positionX: 'center',
      positionY: 'top',
      fill: 'custom-scale',
      customScale: 0.512820513,
    }));
    const { restorePersonalizationSettings } = await import('../public/js/settings.js');

    restorePersonalizationSettings();

    expect(stateMock.personalization.backgroundDisplay).toEqual({
      positionX: 'center',
      positionY: 'top',
      fill: 'custom-scale',
      customScale: 0.51282,
    });
    expect(elMock.personalizationBackgroundFill.value).toBe('custom-scale');
    expect(elMock.personalizationBackgroundCustomScale.value).toBe('0.51282');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-size')).toBe('820.512px 461.538px');
  });

  it('rejects invalid values below the minimum except 0', async () => {
    const { setContentWidthPx } = await import('../public/js/settings.js');

    expect(setContentWidthPx('599')).toBe(false);
    expect(stateMock.contentWidthPx).toBe(1000);

    expect(setContentWidthPx('0')).toBe(true);
    expect(stateMock.contentWidthPx).toBe(0);
    expect(elMock.inputContentWidth.value).toBe('0');
    expect(syncAppShellLayoutMock).toHaveBeenCalled();
  });
});

describe('personalization background galleries', () => {
  beforeEach(async () => {
    localStorage.clear();
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();
    stateMock.personalization.backgroundSelection = null;
    stateMock.personalization.secondaryBackgroundSelection = null;
    stateMock.personalization.backgrounds.userImages = [];
    stateMock.personalization.backgrounds.presetImages = [];
    stateMock.personalization.secondaryBackgrounds.userImages = [];
    stateMock.personalization.secondaryBackgrounds.presetImages = [];
    elMock.personalizationOverlay = globalThis.document.createElement('div');
    elMock.personalizationUserImages = globalThis.document.createElement('div');
    elMock.personalizationPresetImages = globalThis.document.createElement('div');
    elMock.personalizationSecondaryUserImages = globalThis.document.createElement('div');
    elMock.personalizationSecondaryPresetImages = globalThis.document.createElement('div');
    elMock.personalizationBackgroundTabPrimary = { classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
    elMock.personalizationBackgroundTabSecondary = { classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
    elMock.personalizationBackgroundPanelPrimary = { classList: { toggle: vi.fn() } };
    elMock.personalizationBackgroundPanelSecondary = { classList: { toggle: vi.fn() } };

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockReset();
  });

  it('renders uploaded and preset background images alphabetically', async () => {
    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockResolvedValue({
      userImages: [
        {
          kind: 'user',
          id: '200__zeta.jpg',
          name: 'Zeta',
          url: '/backgrounds/user/200__zeta.jpg',
          thumbnailUrl: '/backgrounds/user-thumbnails/200__zeta.jpg',
          canDelete: true,
        },
        {
          kind: 'user',
          id: '100__alpha.jpg',
          name: 'Alpha',
          url: '/backgrounds/user/100__alpha.jpg',
          thumbnailUrl: '/backgrounds/user-thumbnails/100__alpha.jpg',
          canDelete: true,
        },
      ],
      presetImages: [
        {
          kind: 'preset',
          id: 'Sunrise.jpg',
          name: 'Sunrise',
          url: '/backgrounds/presets/Sunrise.jpg',
          thumbnailUrl: '/backgrounds/preset-thumbnails/Sunrise.jpg',
          canDelete: false,
        },
        {
          kind: 'preset',
          id: 'aurora.jpg',
          name: 'aurora',
          url: '/backgrounds/presets/aurora.jpg',
          thumbnailUrl: '/backgrounds/preset-thumbnails/aurora.jpg',
          canDelete: false,
        },
      ],
      secondaryUserImages: [
        {
          kind: 'user',
          id: '200__zenith.jpg',
          name: 'Zenith',
          url: '/backgrounds/secondary/user/200__zenith.jpg',
          thumbnailUrl: '/backgrounds/secondary/user-thumbnails/200__zenith.jpg',
          canDelete: true,
        },
        {
          kind: 'user',
          id: '100__comet.jpg',
          name: 'Comet',
          url: '/backgrounds/secondary/user/100__comet.jpg',
          thumbnailUrl: '/backgrounds/secondary/user-thumbnails/100__comet.jpg',
          canDelete: true,
        },
      ],
      secondaryPresetImages: [
        {
          kind: 'preset',
          id: 'Starfall.jpg',
          name: 'Starfall',
          url: '/backgrounds/secondary/presets/Starfall.jpg',
          thumbnailUrl: '/backgrounds/secondary/preset-thumbnails/Starfall.jpg',
          canDelete: false,
        },
        {
          kind: 'preset',
          id: 'aurora-side.jpg',
          name: 'aurora side',
          url: '/backgrounds/secondary/presets/aurora-side.jpg',
          thumbnailUrl: '/backgrounds/secondary/preset-thumbnails/aurora-side.jpg',
          canDelete: false,
        },
      ],
    });

    const { openPersonalization } = await import('../public/js/settings.js');
    openPersonalization();
    await Promise.resolve();
    await Promise.resolve();

    const userNames = [...elMock.personalizationUserImages.querySelectorAll('.background-card-name')]
      .map(node => node.textContent);
    const presetNames = [...elMock.personalizationPresetImages.querySelectorAll('.background-card-name')]
      .map(node => node.textContent);
    const secondaryUserNames = [...elMock.personalizationSecondaryUserImages.querySelectorAll('.background-card-name')]
      .map(node => node.textContent);
    const secondaryPresetNames = [...elMock.personalizationSecondaryPresetImages.querySelectorAll('.background-card-name')]
      .map(node => node.textContent);

    expect(userNames).toEqual(['Alpha', 'Zeta']);
    expect(presetNames).toEqual(['aurora', 'Sunrise']);
    expect(secondaryUserNames).toEqual(['Comet', 'Zenith']);
    expect(secondaryPresetNames).toEqual(['aurora side', 'Starfall']);
  });

  it('opens the lightbox when a background thumbnail is clicked', async () => {
    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockResolvedValue({
      userImages: [],
      presetImages: [
        {
          kind: 'preset',
          id: 'Sunrise.jpg',
          name: 'Sunrise',
          url: '/backgrounds/presets/Sunrise.jpg',
          thumbnailUrl: '/backgrounds/preset-thumbnails/Sunrise.jpg',
          canDelete: false,
        },
      ],
      secondaryUserImages: [],
      secondaryPresetImages: [],
    });

    const { openArtLightbox } = await import('../public/js/render.js');
    openArtLightbox.mockReset();

    const { openPersonalization } = await import('../public/js/settings.js');
    openPersonalization();
    await Promise.resolve();
    await Promise.resolve();

    elMock.personalizationPresetImages.querySelector('.background-card-preview')?.click();

    expect(openArtLightbox).toHaveBeenCalledWith('/backgrounds/presets/Sunrise.jpg', 'Sunrise');
  });
});

describe('theme background application', () => {
  beforeEach(async () => {
    localStorage.clear();
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();

    stateMock.personalization.opacity = {
      backgroundImage: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImage: 100,
      secondaryBackgroundImageBlur: 0,
      header: 100,
      quickActionsToolbar: 100,
      sidebar: 100,
      rowHeaderBackground: 100,
      row: 100,
      rowArt: 100,
      rowText: 100,
      card: 100,
      cardArt: 100,
      cardText: 100,
      styleBackgroundGradient: 0,
    };
    stateMock.personalization.backgroundSelection = null;
    stateMock.personalization.secondaryBackgroundSelection = null;
    stateMock.personalization.backgroundDisplay = {
      positionX: 'center',
      positionY: 'center',
      fill: 'cover',
      customScale: 1,
    };
    stateMock.personalization.secondaryBackgroundDisplay = {
      positionX: 'right',
      positionY: 'top',
      fill: 'original-size',
      customScale: 1,
    };
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.appliedThemeDirty = false;
    stateMock.personalization.activeOpacityPresetId = null;
    stateMock.personalization.opacityPresets = [];
    stateMock.personalization.opacityPresetsLoaded = false;
    stateMock.personalization.themeDraft = {
      name: '',
      description: '',
      previewImage: null,
      previewImageFile: null,
      previewThumbnailFile: null,
      previewObjectUrl: '',
      previewThumbnailObjectUrl: '',
    };

    elMock.personalizationThemeSelect = globalThis.document.createElement('select');
    elMock.personalizationThemeDescription = globalThis.document.createElement('span');
    elMock.personalizationThemeStatus = globalThis.document.createElement('span');
    elMock.personalizationThemePreviewButton = globalThis.document.createElement('button');
    elMock.personalizationThemePreviewImage = globalThis.document.createElement('img');
    elMock.personalizationThemeName = globalThis.document.createElement('input');
    elMock.personalizationThemeDescriptionInput = globalThis.document.createElement('input');
    elMock.personalizationBackgroundTabPrimary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundTabSecondary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationSecondaryBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationOpacityPresetSelect = globalThis.document.createElement('select');
    elMock.personalizationOpacityPresetName = globalThis.document.createElement('input');

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockReset();
  });

  it('re-reveals theme background images after switching through a theme without images', async () => {
    const noImageTheme = {
      id: 'no-image',
      name: 'No Image',
      description: 'No background image.',
      previewImage: null,
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: null,
      primaryBackgroundDisplay: {
        positionX: 'center',
        positionY: 'center',
        fill: 'cover',
        customScale: 1,
      },
      secondaryBackgroundSelection: null,
      secondaryBackgroundDisplay: {
        positionX: 'right',
        positionY: 'top',
        fill: 'original-size',
        customScale: 1,
      },
      backgroundImageOpacity: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImageOpacity: 100,
      secondaryBackgroundImageBlur: 0,
      includedWithApp: false,
      canEdit: true,
      canDelete: true,
    };
    const imageTheme = {
      ...noImageTheme,
      id: 'with-image',
      name: 'With Image',
      description: 'Uses a preset background.',
      primaryBackgroundSelection: {
        kind: 'preset',
        id: 'aurora.jpg',
        name: 'Aurora',
        url: '/backgrounds/presets/aurora.jpg',
      },
    };

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes: [noImageTheme, imageTheme] };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const { waitForImageReady } = await import('../public/js/image-ready.js');
    waitForImageReady.mockReset();

    let resolveFirstImageLoad;
    let resolveSecondImageLoad;
    waitForImageReady
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveFirstImageLoad = resolve;
      }))
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveSecondImageLoad = resolve;
      }));

    const flushAsyncWork = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    elMock.personalizationThemeSelect.value = noImageTheme.id;
    elMock.personalizationThemeSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe(noImageTheme.id);
    expect(stateMock.personalization.backgroundSelection).toBeNull();
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-image-url')).toBe('none');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-rendered-opacity')).toBe('0');

    elMock.personalizationThemeSelect.value = imageTheme.id;
    elMock.personalizationThemeSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    expect(waitForImageReady).toHaveBeenNthCalledWith(1, '/backgrounds/presets/aurora.jpg');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-image-url'))
      .toBe('url("/backgrounds/presets/aurora.jpg")');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-rendered-opacity')).toBe('0');

    resolveFirstImageLoad(true);
    await flushAsyncWork();

    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-rendered-opacity')).toBe('0.45');

    elMock.personalizationThemeSelect.value = noImageTheme.id;
    elMock.personalizationThemeSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-image-url')).toBe('none');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-rendered-opacity')).toBe('0');

    elMock.personalizationThemeSelect.value = imageTheme.id;
    elMock.personalizationThemeSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    expect(waitForImageReady).toHaveBeenNthCalledWith(2, '/backgrounds/presets/aurora.jpg');
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-rendered-opacity')).toBe('0');

    resolveSecondImageLoad(true);
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe(imageTheme.id);
    expect(globalThis.document.documentElement.style.getPropertyValue('--ts-background-rendered-opacity')).toBe('0.45');
  });

  it('keeps the theme opacity preset active when another preset has identical values', async () => {
    const glassOpacity = {
      header: 35,
      quickActionsToolbar: 50,
      sidebar: 60,
      rowHeaderBackground: 35,
      row: 35,
      rowArt: 85,
      rowText: 100,
      card: 25,
      cardArt: 85,
      cardText: 100,
      styleBackgroundGradient: 0,
    };
    const glassReference = {
      id: 'glass-reference',
      name: 'glass-reference',
      includedWithApp: false,
      canEdit: true,
      canDelete: true,
      opacity: glassOpacity,
    };
    const glass = {
      id: 'glass',
      name: 'Glass',
      includedWithApp: true,
      canEdit: false,
      canDelete: false,
      opacity: glassOpacity,
    };
    const theme = {
      id: 'borealis-tunic',
      name: 'Borealis Tunic',
      description: 'Aurora theme.',
      previewImage: null,
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: glass.id,
      primaryBackgroundSelection: null,
      primaryBackgroundDisplay: {
        positionX: 'center',
        positionY: 'center',
        fill: 'cover',
        customScale: 1,
      },
      secondaryBackgroundSelection: null,
      secondaryBackgroundDisplay: {
        positionX: 'right',
        positionY: 'top',
        fill: 'original-size',
        customScale: 1,
      },
      backgroundImageOpacity: 50,
      backgroundImageBlur: 0,
      secondaryBackgroundImageOpacity: 100,
      secondaryBackgroundImageBlur: 0,
      includedWithApp: true,
      canEdit: false,
      canDelete: false,
    };

    stateMock.personalization.opacityPresets = [glassReference, glass];
    stateMock.personalization.opacityPresetsLoaded = true;
    stateMock.personalization.themes = [theme];
    stateMock.personalization.themesLoaded = true;

    const { applyTheme } = await import('../public/js/settings.js');
    await applyTheme(theme);

    expect(stateMock.personalization.activeOpacityPresetId).toBe(glass.id);
    expect(elMock.personalizationOpacityPresetSelect.value).toBe(glass.id);
    expect(stateMock.personalization.appliedThemeDirty).toBe(false);
    expect(elMock.personalizationThemeSelectionWarning.textContent).toBe('');
  });
});

describe('default theme initialization', () => {
  beforeEach(async () => {
    localStorage.clear();
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();

    stateMock.personalization.opacity = {
      backgroundImage: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImage: 100,
      secondaryBackgroundImageBlur: 0,
      header: 100,
      quickActionsToolbar: 100,
      sidebar: 100,
      rowHeaderBackground: 100,
      row: 100,
      rowArt: 100,
      rowText: 100,
      card: 100,
      cardArt: 100,
      cardText: 100,
      styleBackgroundGradient: 0,
    };
    stateMock.personalization.backgroundSelection = null;
    stateMock.personalization.secondaryBackgroundSelection = null;
    stateMock.personalization.backgroundDisplay = {
      positionX: 'center',
      positionY: 'center',
      fill: 'cover',
      customScale: 1,
    };
    stateMock.personalization.secondaryBackgroundDisplay = {
      positionX: 'right',
      positionY: 'top',
      fill: 'original-size',
      customScale: 1,
    };
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.appliedThemeDirty = false;
    stateMock.personalization.activeOpacityPresetId = null;
    stateMock.personalization.opacityPresets = [];
    stateMock.personalization.opacityPresetsLoaded = false;
    stateMock.personalization.themeDraft = {
      name: '',
      description: '',
      previewImage: null,
      previewImageFile: null,
      previewThumbnailFile: null,
      previewObjectUrl: '',
      previewThumbnailObjectUrl: '',
    };

    elMock.personalizationThemeSelect = globalThis.document.createElement('select');
    elMock.personalizationThemeDescription = globalThis.document.createElement('span');
    elMock.personalizationThemeStatus = globalThis.document.createElement('span');
    elMock.personalizationThemePreviewButton = globalThis.document.createElement('button');
    elMock.personalizationThemePreviewImage = globalThis.document.createElement('img');
    elMock.personalizationThemeName = globalThis.document.createElement('input');
    elMock.personalizationThemeDescriptionInput = globalThis.document.createElement('input');
    elMock.personalizationBackgroundTabPrimary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundTabSecondary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationSecondaryBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationOpacityPresetSelect = globalThis.document.createElement('select');
    elMock.personalizationOpacityPresetName = globalThis.document.createElement('input');

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockReset();
  });

  it('auto-applies Basic Blue for brand-new users', async () => {
    const basicBlueTheme = {
      id: 'basic-blue',
      name: 'Basic Blue',
      description: 'Default theme.',
      previewImage: {
        fileName: 'basic-blue.png',
        url: '/theme-previews/basic-blue.png',
        thumbnailUrl: '/theme-previews-thumbs/basic-blue.jpg',
      },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: null,
      primaryBackgroundDisplay: {
        positionX: 'center',
        positionY: 'center',
        fill: 'cover',
        customScale: 1,
      },
      secondaryBackgroundSelection: null,
      secondaryBackgroundDisplay: {
        positionX: 'right',
        positionY: 'top',
        fill: 'original-size',
        customScale: 1,
      },
      backgroundImageOpacity: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImageOpacity: 100,
      secondaryBackgroundImageBlur: 0,
      includedWithApp: true,
      canEdit: false,
      canDelete: false,
    };

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes: [basicBlueTheme] };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const { waitForImageReady } = await import('../public/js/image-ready.js');
    waitForImageReady.mockReset();

    const flushAsyncWork = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('basic-blue');
    expect(stateMock.personalization.selectedThemeId).toBe('basic-blue');
    expect(localStorage.getItem('ts_appliedThemeId')).toBe('basic-blue');
    expect(localStorage.getItem('ts_defaultThemeInitialized')).toBe('1');
  });

  it('does not auto-apply Basic Blue for existing users', async () => {
    localStorage.setItem('ts_headerScroll', 'smart');

    const basicBlueTheme = {
      id: 'basic-blue',
      name: 'Basic Blue',
      description: 'Default theme.',
      previewImage: {
        fileName: 'basic-blue.png',
        url: '/theme-previews/basic-blue.png',
        thumbnailUrl: '/theme-previews-thumbs/basic-blue.jpg',
      },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: null,
      primaryBackgroundDisplay: {
        positionX: 'center',
        positionY: 'center',
        fill: 'cover',
        customScale: 1,
      },
      secondaryBackgroundSelection: null,
      secondaryBackgroundDisplay: {
        positionX: 'right',
        positionY: 'top',
        fill: 'original-size',
        customScale: 1,
      },
      backgroundImageOpacity: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImageOpacity: 100,
      secondaryBackgroundImageBlur: 0,
      includedWithApp: true,
      canEdit: false,
      canDelete: false,
    };

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes: [basicBlueTheme] };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const flushAsyncWork = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBeNull();
    expect(stateMock.personalization.selectedThemeId).toBeNull();
    expect(localStorage.getItem('ts_appliedThemeId')).toBeNull();
    expect(localStorage.getItem('ts_defaultThemeInitialized')).toBeNull();
  });
});

describe('seasonal theme auto-switching', () => {
  const buildTheme = ({
    id,
    name,
    colorSchemePresetId = 'bunan-blue',
    includedWithApp = true,
  }) => ({
    id,
    name,
    description: `${name} description.`,
    previewImage: {
      fileName: `${id}.png`,
      url: `/theme-previews/${id}.png`,
      thumbnailUrl: `/theme-previews-thumbs/${id}.jpg`,
    },
    colorSchemePresetId,
    opacityPresetId: 'default-opaque',
    primaryBackgroundSelection: null,
    primaryBackgroundDisplay: {
      positionX: 'center',
      positionY: 'center',
      fill: 'cover',
      customScale: 1,
    },
    secondaryBackgroundSelection: null,
    secondaryBackgroundDisplay: {
      positionX: 'right',
      positionY: 'top',
      fill: 'original-size',
      customScale: 1,
    },
    backgroundImageOpacity: 45,
    backgroundImageBlur: 0,
    secondaryBackgroundImageOpacity: 100,
    secondaryBackgroundImageBlur: 0,
    includedWithApp,
    canEdit: !includedWithApp,
    canDelete: !includedWithApp,
  });

  const flushAsyncWork = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();

    stateMock.personalization.opacity = {
      backgroundImage: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImage: 100,
      secondaryBackgroundImageBlur: 0,
      header: 100,
      quickActionsToolbar: 100,
      sidebar: 100,
      rowHeaderBackground: 100,
      row: 100,
      rowArt: 100,
      rowText: 100,
      card: 100,
      cardArt: 100,
      cardText: 100,
      styleBackgroundGradient: 0,
    };
    stateMock.personalization.backgroundSelection = null;
    stateMock.personalization.secondaryBackgroundSelection = null;
    stateMock.personalization.backgroundDisplay = {
      positionX: 'center',
      positionY: 'center',
      fill: 'cover',
      customScale: 1,
    };
    stateMock.personalization.secondaryBackgroundDisplay = {
      positionX: 'right',
      positionY: 'top',
      fill: 'original-size',
      customScale: 1,
    };
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.appliedThemeDirty = false;
    stateMock.personalization.activeOpacityPresetId = null;
    stateMock.personalization.opacityPresets = [];
    stateMock.personalization.opacityPresetsLoaded = false;
    stateMock.personalization.themeDraft = {
      name: '',
      description: '',
      previewImage: null,
      previewImageFile: null,
      previewThumbnailFile: null,
      previewObjectUrl: '',
      previewThumbnailObjectUrl: '',
    };
    stateMock.grinchMode = false;
    elMock.toggleGrinchMode.checked = false;

    elMock.personalizationThemeSelect = globalThis.document.createElement('select');
    elMock.personalizationThemeDescription = globalThis.document.createElement('span');
    elMock.personalizationThemeStatus = globalThis.document.createElement('span');
    elMock.personalizationThemePreviewButton = globalThis.document.createElement('button');
    elMock.personalizationThemePreviewImage = globalThis.document.createElement('img');
    elMock.personalizationThemeName = globalThis.document.createElement('input');
    elMock.personalizationThemeDescriptionInput = globalThis.document.createElement('input');
    elMock.personalizationBackgroundTabPrimary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundTabSecondary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationSecondaryBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationOpacityPresetSelect = globalThis.document.createElement('select');
    elMock.personalizationOpacityPresetName = globalThis.document.createElement('input');

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-applies Christmastime once per year for existing users', async () => {
    localStorage.setItem('ts_headerScroll', 'smart');
    localStorage.setItem('ts_appliedThemeId', 'ocean');

    const themes = [
      buildTheme({ id: 'basic-blue', name: 'Basic Blue' }),
      buildTheme({ id: 'christmastime', name: 'Christmastime' }),
      buildTheme({ id: 'ocean', name: 'Ocean', colorSchemePresetId: 'evergreen-night', includedWithApp: false }),
    ];

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');

    vi.setSystemTime(new Date('2026-12-10T12:00:00'));
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('christmastime');
    expect(localStorage.getItem('ts_appliedThemeId')).toBe('christmastime');
    expect(localStorage.getItem('ts_seasonalThemeHistory')).toBe(JSON.stringify({ christmas: 2026 }));

    localStorage.setItem('ts_appliedThemeId', 'ocean');
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;

    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('ocean');
    expect(localStorage.getItem('ts_appliedThemeId')).toBe('ocean');

    vi.setSystemTime(new Date('2027-12-10T12:00:00'));
    localStorage.setItem('ts_appliedThemeId', 'ocean');
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;

    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('christmastime');
    expect(localStorage.getItem('ts_seasonalThemeHistory')).toBe(JSON.stringify({ christmas: 2027 }));
  });

  it('auto-applies Found in the Archives once per year on April 1 for existing users', async () => {
    localStorage.setItem('ts_headerScroll', 'smart');
    localStorage.setItem('ts_appliedThemeId', 'ocean');

    const themes = [
      buildTheme({ id: 'basic-blue', name: 'Basic Blue' }),
      buildTheme({ id: 'found-in-the-archives', name: 'Found in the Archives' }),
      buildTheme({ id: 'ocean', name: 'Ocean', colorSchemePresetId: 'evergreen-night', includedWithApp: false }),
    ];

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');

    vi.setSystemTime(new Date('2026-04-01T12:00:00'));
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('found-in-the-archives');
    expect(localStorage.getItem('ts_appliedThemeId')).toBe('found-in-the-archives');
    expect(localStorage.getItem('ts_seasonalThemeHistory')).toBe(JSON.stringify({ aprilFools: 2026 }));

    localStorage.setItem('ts_appliedThemeId', 'ocean');
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;

    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('ocean');
    expect(localStorage.getItem('ts_appliedThemeId')).toBe('ocean');

    vi.setSystemTime(new Date('2027-04-01T12:00:00'));
    localStorage.setItem('ts_appliedThemeId', 'ocean');
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;

    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('found-in-the-archives');
    expect(localStorage.getItem('ts_seasonalThemeHistory')).toBe(JSON.stringify({ aprilFools: 2027 }));
  });

  it('skips Christmastime for first-ever December users and also skips the rest of that year', async () => {
    const themes = [
      buildTheme({ id: 'basic-blue', name: 'Basic Blue' }),
      buildTheme({ id: 'christmastime', name: 'Christmastime' }),
      buildTheme({ id: 'ocean', name: 'Ocean', colorSchemePresetId: 'evergreen-night', includedWithApp: false }),
    ];

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');

    vi.setSystemTime(new Date('2026-12-05T12:00:00'));
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('basic-blue');
    expect(localStorage.getItem('ts_defaultThemeInitialized')).toBe('1');
    expect(localStorage.getItem('ts_seasonalThemeHistory')).toBe(JSON.stringify({ christmas: 2026 }));

    localStorage.setItem('ts_appliedThemeId', 'ocean');
    localStorage.setItem('ts_headerScroll', 'smart');
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;

    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('ocean');
    expect(localStorage.getItem('ts_appliedThemeId')).toBe('ocean');
  });

  it('skips Found in the Archives for first-ever April 1 users and also skips the rest of that year', async () => {
    const themes = [
      buildTheme({ id: 'basic-blue', name: 'Basic Blue' }),
      buildTheme({ id: 'found-in-the-archives', name: 'Found in the Archives' }),
      buildTheme({ id: 'ocean', name: 'Ocean', colorSchemePresetId: 'evergreen-night', includedWithApp: false }),
    ];

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');

    vi.setSystemTime(new Date('2026-04-01T12:00:00'));
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('basic-blue');
    expect(localStorage.getItem('ts_defaultThemeInitialized')).toBe('1');
    expect(localStorage.getItem('ts_seasonalThemeHistory')).toBe(JSON.stringify({ aprilFools: 2026 }));

    localStorage.setItem('ts_appliedThemeId', 'ocean');
    localStorage.setItem('ts_headerScroll', 'smart');
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;

    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBe('ocean');
    expect(localStorage.getItem('ts_appliedThemeId')).toBe('ocean');
  });

  it('does not auto-switch seasonal themes when Grinch mode is enabled', async () => {
    localStorage.setItem('ts_headerScroll', 'smart');
    localStorage.setItem('ts_appliedThemeId', 'ocean');
    localStorage.setItem('ts_grinchMode', '1');

    const themes = [
      buildTheme({ id: 'basic-blue', name: 'Basic Blue' }),
      buildTheme({ id: 'found-in-the-archives', name: 'Found in the Archives' }),
      buildTheme({ id: 'christmastime', name: 'Christmastime' }),
      buildTheme({ id: 'ocean', name: 'Ocean', colorSchemePresetId: 'evergreen-night', includedWithApp: false }),
    ];

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');

    vi.setSystemTime(new Date('2026-12-10T12:00:00'));
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.grinchMode).toBe(true);
    expect(stateMock.personalization.appliedThemeId).toBe('ocean');
    expect(localStorage.getItem('ts_seasonalThemeHistory')).toBeNull();
  });
});

describe('included-with-app theme editor controls', () => {
  beforeEach(async () => {
    localStorage.clear();
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();

    stateMock.personalization.opacity = {
      backgroundImage: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImage: 100,
      secondaryBackgroundImageBlur: 0,
      header: 100,
      quickActionsToolbar: 100,
      sidebar: 100,
      rowHeaderBackground: 100,
      row: 100,
      rowArt: 100,
      rowText: 100,
      card: 100,
      cardArt: 100,
      cardText: 100,
      styleBackgroundGradient: 0,
    };
    stateMock.personalization.backgroundSelection = null;
    stateMock.personalization.secondaryBackgroundSelection = null;
    stateMock.personalization.backgroundDisplay = {
      positionX: 'center',
      positionY: 'center',
      fill: 'cover',
      customScale: 1,
    };
    stateMock.personalization.secondaryBackgroundDisplay = {
      positionX: 'right',
      positionY: 'top',
      fill: 'original-size',
      customScale: 1,
    };
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.appliedThemeDirty = false;
    stateMock.personalization.activeOpacityPresetId = null;
    stateMock.personalization.opacityPresets = [];
    stateMock.personalization.opacityPresetsLoaded = false;
    stateMock.personalization.themeDraft = {
      name: '',
      description: '',
      previewImage: null,
      previewImageFile: null,
      previewThumbnailFile: null,
      previewObjectUrl: '',
      previewThumbnailObjectUrl: '',
    };

    elMock.personalizationThemeSelect = globalThis.document.createElement('select');
    elMock.personalizationThemeDescription = globalThis.document.createElement('span');
    elMock.personalizationThemeStatus = globalThis.document.createElement('span');
    elMock.personalizationThemePreviewButton = globalThis.document.createElement('button');
    elMock.personalizationThemePreviewImage = globalThis.document.createElement('img');
    elMock.personalizationThemeUploadPreview = globalThis.document.createElement('button');
    elMock.personalizationThemePreviewInput = globalThis.document.createElement('input');
    elMock.personalizationThemeName = globalThis.document.createElement('input');
    elMock.personalizationThemeDescriptionInput = globalThis.document.createElement('input');
    elMock.personalizationThemeEditorWarning = { textContent: '', style: { color: '' } };
    elMock.personalizationBackgroundTabPrimary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundTabSecondary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationSecondaryBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationOpacityPresetSelect = globalThis.document.createElement('select');
    elMock.personalizationOpacityPresetName = globalThis.document.createElement('input');

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockReset();
  });

  it('disables preview upload, name, and description editing for included-with-app themes', async () => {
    localStorage.setItem('ts_headerScroll', 'smart');

    const basicBlueTheme = {
      id: 'basic-blue',
      name: 'Basic Blue',
      description: 'Default theme.',
      previewImage: {
        fileName: 'basic-blue.png',
        url: '/theme-previews/basic-blue.png',
        thumbnailUrl: '/theme-previews-thumbs/basic-blue.jpg',
      },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: null,
      primaryBackgroundDisplay: {
        positionX: 'center',
        positionY: 'center',
        fill: 'cover',
        customScale: 1,
      },
      secondaryBackgroundSelection: null,
      secondaryBackgroundDisplay: {
        positionX: 'right',
        positionY: 'top',
        fill: 'original-size',
        customScale: 1,
      },
      backgroundImageOpacity: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImageOpacity: 100,
      secondaryBackgroundImageBlur: 0,
      includedWithApp: true,
      canEdit: false,
      canDelete: false,
    };

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes: [basicBlueTheme] };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const flushAsyncWork = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    elMock.personalizationThemeSelect.value = 'basic-blue';
    elMock.personalizationThemeSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    expect(elMock.personalizationThemeUploadPreview.disabled).toBe(true);
    expect(elMock.personalizationThemeName.disabled).toBe(true);
    expect(elMock.personalizationThemeDescriptionInput.disabled).toBe(true);
    expect(elMock.personalizationThemeEditorWarning.textContent).toBe('Theme is bundled with the app so cannot be edited.');
  });
});

describe('pre-applied theme draft hydration', () => {
  beforeEach(async () => {
    localStorage.clear();
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();

    stateMock.personalization.opacity = {
      backgroundImage: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImage: 100,
      secondaryBackgroundImageBlur: 0,
      header: 100,
      quickActionsToolbar: 100,
      sidebar: 100,
      rowHeaderBackground: 100,
      row: 100,
      rowArt: 100,
      rowText: 100,
      card: 100,
      cardArt: 100,
      cardText: 100,
      styleBackgroundGradient: 0,
    };
    stateMock.personalization.backgroundSelection = null;
    stateMock.personalization.secondaryBackgroundSelection = null;
    stateMock.personalization.backgroundDisplay = {
      positionX: 'center',
      positionY: 'center',
      fill: 'cover',
      customScale: 1,
    };
    stateMock.personalization.secondaryBackgroundDisplay = {
      positionX: 'right',
      positionY: 'top',
      fill: 'original-size',
      customScale: 1,
    };
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.appliedThemeDirty = false;
    stateMock.personalization.activeOpacityPresetId = null;
    stateMock.personalization.opacityPresets = [];
    stateMock.personalization.opacityPresetsLoaded = false;
    stateMock.personalization.themeDraft = {
      name: '',
      description: '',
      previewImage: null,
      previewImageFile: null,
      previewThumbnailFile: null,
      previewObjectUrl: '',
      previewThumbnailObjectUrl: '',
    };

    elMock.personalizationThemeSelect = globalThis.document.createElement('select');
    elMock.personalizationThemeDescription = globalThis.document.createElement('span');
    elMock.personalizationThemeStatus = globalThis.document.createElement('span');
    elMock.personalizationThemePreviewButton = globalThis.document.createElement('button');
    elMock.personalizationThemePreviewImage = globalThis.document.createElement('img');
    elMock.personalizationThemeUploadPreview = globalThis.document.createElement('button');
    elMock.personalizationThemePreviewInput = globalThis.document.createElement('input');
    elMock.personalizationThemeName = globalThis.document.createElement('input');
    elMock.personalizationThemeDescriptionInput = globalThis.document.createElement('input');
    elMock.personalizationThemeEditorWarning = { textContent: '', style: { color: '' } };
    elMock.personalizationBackgroundTabPrimary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundTabSecondary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationSecondaryBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationOpacityPresetSelect = globalThis.document.createElement('select');
    elMock.personalizationOpacityPresetName = globalThis.document.createElement('input');

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockReset();
  });

  it('hydrates preview, name, and description for a theme that is already applied on first load', async () => {
    localStorage.setItem('ts_headerScroll', 'smart');
    localStorage.setItem('ts_appliedThemeId', 'basic-blue');

    const basicBlueTheme = {
      id: 'basic-blue',
      name: 'Basic Blue',
      description: 'Default blue theme.',
      previewImage: {
        fileName: 'basic-blue.png',
        url: '/theme-previews/basic-blue.png',
        thumbnailUrl: '/theme-previews-thumbs/basic-blue.jpg',
      },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: null,
      primaryBackgroundDisplay: {
        positionX: 'center',
        positionY: 'center',
        fill: 'cover',
        customScale: 1,
      },
      secondaryBackgroundSelection: null,
      secondaryBackgroundDisplay: {
        positionX: 'right',
        positionY: 'top',
        fill: 'original-size',
        customScale: 1,
      },
      backgroundImageOpacity: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImageOpacity: 100,
      secondaryBackgroundImageBlur: 0,
      includedWithApp: true,
      canEdit: false,
      canDelete: false,
    };

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes: [basicBlueTheme] };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const flushAsyncWork = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(stateMock.personalization.selectedThemeId).toBe('basic-blue');
    expect(stateMock.personalization.themeDraft.name).toBe('Basic Blue');
    expect(stateMock.personalization.themeDraft.description).toBe('Default blue theme.');
    expect(stateMock.personalization.themeDraft.previewImage).toEqual({
      fileName: 'basic-blue.png',
      url: '/theme-previews/basic-blue.png',
      thumbnailUrl: '/theme-previews-thumbs/basic-blue.jpg',
    });
    expect(elMock.personalizationThemeName.value).toBe('Basic Blue');
    expect(elMock.personalizationThemeDescriptionInput.value).toBe('Default blue theme.');
    expect(elMock.personalizationThemePreviewImage.src).toContain('/theme-previews-thumbs/basic-blue.jpg');
  });
});

describe('theme thumbnail picker', () => {
  beforeEach(async () => {
    localStorage.clear();
    globalThis.document.documentElement.style.cssText = '';
    resetThemeUiState();

    stateMock.personalization.opacity = {
      backgroundImage: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImage: 100,
      secondaryBackgroundImageBlur: 0,
      header: 100,
      quickActionsToolbar: 100,
      sidebar: 100,
      rowHeaderBackground: 100,
      row: 100,
      rowArt: 100,
      rowText: 100,
      card: 100,
      cardArt: 100,
      cardText: 100,
      styleBackgroundGradient: 0,
    };
    stateMock.personalization.backgroundSelection = null;
    stateMock.personalization.secondaryBackgroundSelection = null;
    stateMock.personalization.backgroundDisplay = {
      positionX: 'center',
      positionY: 'center',
      fill: 'cover',
      customScale: 1,
    };
    stateMock.personalization.secondaryBackgroundDisplay = {
      positionX: 'right',
      positionY: 'top',
      fill: 'original-size',
      customScale: 1,
    };
    stateMock.personalization.themes = [];
    stateMock.personalization.themesLoaded = false;
    stateMock.personalization.selectedThemeId = null;
    stateMock.personalization.appliedThemeId = null;
    stateMock.personalization.appliedThemeDirty = false;
    stateMock.personalization.activeOpacityPresetId = null;
    stateMock.personalization.opacityPresets = [];
    stateMock.personalization.opacityPresetsLoaded = false;
    stateMock.personalization.themeDraft = {
      name: '',
      description: '',
      previewImage: null,
      previewImageFile: null,
      previewThumbnailFile: null,
      previewObjectUrl: '',
      previewThumbnailObjectUrl: '',
    };

    elMock.personalizationThemeSelect = globalThis.document.createElement('select');
    elMock.personalizationThemeDescription = globalThis.document.createElement('span');
    elMock.personalizationThemeGalleryUser = globalThis.document.createElement('div');
    elMock.personalizationThemeGalleryPreset = globalThis.document.createElement('div');
    elMock.personalizationThemeStatus = globalThis.document.createElement('span');
    elMock.personalizationThemePreviewButton = globalThis.document.createElement('button');
    elMock.personalizationThemePreviewImage = globalThis.document.createElement('img');
    elMock.personalizationThemeUploadPreview = globalThis.document.createElement('button');
    elMock.personalizationThemePreviewInput = globalThis.document.createElement('input');
    elMock.personalizationThemeName = globalThis.document.createElement('input');
    elMock.personalizationThemeDescriptionInput = globalThis.document.createElement('input');
    elMock.personalizationThemeSelectionWarning = { textContent: '', style: { color: '' } };
    elMock.personalizationThemeEditorWarning = { textContent: '', style: { color: '' } };
    elMock.personalizationBackgroundTabPrimary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundTabSecondary = globalThis.document.createElement('button');
    elMock.personalizationBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationSecondaryBackgroundPositionX = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundPositionY = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundFill = globalThis.document.createElement('select');
    elMock.personalizationSecondaryBackgroundCustomScale = globalThis.document.createElement('input');
    elMock.personalizationOpacityPresetSelect = globalThis.document.createElement('select');
    elMock.personalizationOpacityPresetName = globalThis.document.createElement('input');

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockReset();
  });

  it('renders the same ordered theme list as the dropdown and keeps both selectors in sync', async () => {
    localStorage.setItem('ts_headerScroll', 'smart');

    const themes = [
      {
        id: 'basic-blue',
        name: 'Basic Blue',
        description: 'Default theme.',
        previewImage: {
          fileName: 'basic-blue.png',
          url: '/theme-previews/basic-blue.png',
          thumbnailUrl: '/theme-previews-thumbs/basic-blue.jpg',
        },
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
        primaryBackgroundSelection: null,
        primaryBackgroundDisplay: {
          positionX: 'center',
          positionY: 'center',
          fill: 'cover',
          customScale: 1,
        },
        secondaryBackgroundSelection: null,
        secondaryBackgroundDisplay: {
          positionX: 'right',
          positionY: 'top',
          fill: 'original-size',
          customScale: 1,
        },
        backgroundImageOpacity: 45,
        backgroundImageBlur: 0,
        secondaryBackgroundImageOpacity: 100,
        secondaryBackgroundImageBlur: 0,
        includedWithApp: true,
        canEdit: false,
        canDelete: false,
      },
      {
        id: 'aurora-night',
        name: 'Aurora Night',
        description: 'Green accents.',
        previewImage: {
          fileName: 'aurora-night.png',
          url: '/theme-previews/aurora-night.png',
          thumbnailUrl: '/theme-previews-thumbs/aurora-night.jpg',
        },
        colorSchemePresetId: 'evergreen-night',
        opacityPresetId: 'default-opaque',
        primaryBackgroundSelection: null,
        primaryBackgroundDisplay: {
          positionX: 'center',
          positionY: 'center',
          fill: 'cover',
          customScale: 1,
        },
        secondaryBackgroundSelection: null,
        secondaryBackgroundDisplay: {
          positionX: 'right',
          positionY: 'top',
          fill: 'original-size',
          customScale: 1,
        },
        backgroundImageOpacity: 45,
        backgroundImageBlur: 0,
        secondaryBackgroundImageOpacity: 100,
        secondaryBackgroundImageBlur: 0,
        includedWithApp: false,
        canEdit: true,
        canDelete: true,
      },
    ];

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const flushAsyncWork = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    const dropdownOptions = [...elMock.personalizationThemeSelect.querySelectorAll('option')]
      .map(option => option.textContent);
    const userThemeNames = [...elMock.personalizationThemeGalleryUser.querySelectorAll('.background-card-name')]
      .map(node => node.textContent);
    const presetThemeNames = [...elMock.personalizationThemeGalleryPreset.querySelectorAll('.background-card-name')]
      .map(node => node.textContent);

    expect(dropdownOptions).toEqual(['No theme', 'Aurora Night', 'Basic Blue']);
    expect(userThemeNames).toEqual(['Aurora Night']);
    expect(presetThemeNames).toEqual(['Basic Blue']);

    elMock.personalizationThemeSelect.value = 'aurora-night';
    elMock.personalizationThemeSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    expect(stateMock.personalization.selectedThemeId).toBe('aurora-night');
    expect(elMock.personalizationThemeSelect.value).toBe('aurora-night');
    expect([...elMock.personalizationThemeGalleryUser.querySelectorAll('.background-card.active .background-card-name')]
      .map(node => node.textContent)).toEqual(['Aurora Night']);

    const basicBlueUseButton = [...elMock.personalizationThemeGalleryPreset.querySelectorAll('.background-card')]
      .find(card => card.querySelector('.background-card-name')?.textContent === 'Basic Blue')
      ?.querySelector('.btn');
    basicBlueUseButton?.click();
    await flushAsyncWork();

    expect(stateMock.personalization.selectedThemeId).toBe('basic-blue');
    expect(elMock.personalizationThemeSelect.value).toBe('basic-blue');
    expect([...elMock.personalizationThemeGalleryPreset.querySelectorAll('.background-card.active .background-card-name')]
      .map(node => node.textContent)).toEqual(['Basic Blue']);
  });

  it('renders invalid themes as unavailable but still deleteable', async () => {
    localStorage.setItem('ts_headerScroll', 'smart');
    localStorage.setItem('ts_appliedThemeId', 'broken-theme');
    vi.stubGlobal('confirm', vi.fn(() => true));

    const invalidTheme = {
      id: 'broken-theme',
      name: 'Broken Theme',
      description: 'Missing dependency.',
      previewImage: null,
      colorSchemePresetId: 'missing-scheme',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: null,
      primaryBackgroundDisplay: {
        positionX: 'center',
        positionY: 'center',
        fill: 'cover',
        customScale: 1,
      },
      secondaryBackgroundSelection: null,
      secondaryBackgroundDisplay: {
        positionX: 'right',
        positionY: 'top',
        fill: 'original-size',
        customScale: 1,
      },
      backgroundImageOpacity: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImageOpacity: 100,
      secondaryBackgroundImageBlur: 0,
      includedWithApp: false,
      canEdit: false,
      canDelete: true,
      invalid: true,
      invalidReason: 'Theme "Broken Theme" references a missing color scheme.',
    };
    const basicTheme = {
      ...invalidTheme,
      id: 'basic-blue',
      name: 'Basic Blue',
      description: 'Default theme.',
      previewImage: {
        fileName: 'basic-blue.png',
        url: '/theme-previews/basic-blue.png',
        thumbnailUrl: '/theme-previews-thumbs/basic-blue.jpg',
      },
      colorSchemePresetId: 'bunan-blue',
      includedWithApp: true,
      canEdit: false,
      canDelete: false,
      invalid: false,
      invalidReason: '',
    };

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async (path, options = {}) => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes: [basicTheme, invalidTheme] };
      if (path === '/api/themes/broken-theme' && options.method === 'DELETE') {
        return { ok: true, theme: invalidTheme };
      }
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const flushAsyncWork = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    const brokenOption = [...elMock.personalizationThemeSelect.querySelectorAll('option')]
      .find(option => option.value === 'broken-theme');
    const invalidCard = [...elMock.personalizationThemeGalleryUser.querySelectorAll('.background-card')]
      .find(card => card.querySelector('.background-card-name')?.textContent === 'Broken Theme');
    const unavailableButton = [...invalidCard.querySelectorAll('button')]
      .find(button => button.textContent === 'Unavailable');
    const deleteButton = [...invalidCard.querySelectorAll('button')]
      .find(button => button.textContent === 'Delete');

    expect(stateMock.personalization.appliedThemeId).toBeNull();
    expect(localStorage.getItem('ts_appliedThemeId')).toBeNull();
    expect(brokenOption?.textContent).toBe('Broken Theme (unavailable)');
    expect(brokenOption?.disabled).toBe(true);
    expect(invalidCard.classList.contains('is-invalid')).toBe(true);
    expect(invalidCard.querySelector('.background-card-meta')?.textContent)
      .toBe('Theme "Broken Theme" references a missing color scheme.');
    expect(unavailableButton?.disabled).toBe(true);

    unavailableButton.click();
    await flushAsyncWork();

    expect(stateMock.personalization.appliedThemeId).toBeNull();

    deleteButton.click();
    await flushAsyncWork();

    expect(apiFetch).toHaveBeenCalledWith('/api/themes/broken-theme', { method: 'DELETE' });
    expect(stateMock.personalization.themes.some(theme => theme.id === 'broken-theme')).toBe(false);
    expect(elMock.personalizationThemeGalleryUser.querySelector('.background-gallery-empty')?.textContent)
      .toBe('You haven\'t made any themes.');
  });

  it('shows an empty thumbnail in Your themes when no user-created themes exist and opens the lightbox from theme thumbnails', async () => {
    localStorage.setItem('ts_headerScroll', 'smart');

    const themes = [
      {
        id: 'basic-blue',
        name: 'Basic Blue',
        description: 'Default theme.',
        previewImage: {
          fileName: 'basic-blue.png',
          url: '/theme-previews/basic-blue.png',
          thumbnailUrl: '/theme-previews-thumbs/basic-blue.jpg',
        },
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
        primaryBackgroundSelection: null,
        primaryBackgroundDisplay: {
          positionX: 'center',
          positionY: 'center',
          fill: 'cover',
          customScale: 1,
        },
        secondaryBackgroundSelection: null,
        secondaryBackgroundDisplay: {
          positionX: 'right',
          positionY: 'top',
          fill: 'original-size',
          customScale: 1,
        },
        backgroundImageOpacity: 45,
        backgroundImageBlur: 0,
        secondaryBackgroundImageOpacity: 100,
        secondaryBackgroundImageBlur: 0,
        includedWithApp: true,
        canEdit: false,
        canDelete: false,
      },
    ];

    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockImplementation(async path => {
      if (path === '/api/opacity-presets') return { presets: [] };
      if (path === '/api/themes') return { themes };
      throw new Error(`Unexpected apiFetch call: ${path}`);
    });

    const { openArtLightbox } = await import('../public/js/render.js');
    openArtLightbox.mockReset();

    const flushAsyncWork = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    const { initPersonalizationSettings, restorePersonalizationSettings } = await import('../public/js/settings.js');
    restorePersonalizationSettings();
    initPersonalizationSettings();
    await flushAsyncWork();

    expect(elMock.personalizationThemeGalleryUser.querySelector('.background-gallery-empty')?.textContent)
      .toBe('You haven\'t made any themes.');

    elMock.personalizationThemeGalleryPreset.querySelector('.background-card-preview')?.click();

    expect(openArtLightbox).toHaveBeenCalledWith('/theme-previews/basic-blue.png', 'Basic Blue');
  });
});
