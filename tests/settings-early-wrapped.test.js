import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  stateMock,
  elMock,
  patchPreferencesMock,
} = vi.hoisted(() => ({
  stateMock: {
    modal: {
      open: false,
      mode: null,
    },
    personalization: {
      opacityControlsExpanded: false,
      activeBackgroundTab: 'primary',
      activeOpacityPresetId: null,
      selectedThemeId: null,
      backgroundSelection: null,
      secondaryBackgroundSelection: null,
      themes: [],
      themesLoaded: false,
      opacityPresets: [],
      opacityPresetsLoaded: false,
      themeDraft: {
        name: '',
        description: '',
        previewImage: null,
        previewImageFile: null,
        previewThumbnailFile: null,
        previewObjectUrl: '',
        previewThumbnailObjectUrl: '',
      },
    },
    pagination: {
      perPage: { list: null, grid: null },
      mode: { list: 'unlimited', grid: 'unlimited' },
      showPageCount: true,
      showFirstLastButtons: false,
      visibilityMode: 'hover',
    },
    uButtons: [],
    quickActionsToolbarVisibilityMode: 'visible',
    complexStatuses: [],
    grinchMode: false,
    accentPeriod: true,
    earlyWrapped: false,
    seasonalThemeHistory: {},
    contentWidthPx: 1000,
    reserveSidebarSpace: false,
    listArtClickToEnlarge: true,
  },
  elMock: {},
  patchPreferencesMock: vi.fn(async () => ({})),
}));

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
  apiFetch: vi.fn(),
  LS_PREFIX: 'ts_',
  LS_HEADER_SCROLL: 'ts_headerScroll',
  LS_SHOW_WIPE_DB: 'ts_showWipeDb',
  LS_SHOW_REPEATS_FIELD: 'ts_showRepeats',
  LS_SHOW_PRIORITY_FIELD: 'ts_showPriority',
  LS_SHOW_REFETCH_ART: 'ts_showRefetch',
  LS_SHOW_PLANNED_AT_FIELD: 'ts_showPlannedAt',
  LS_LIST_ART_ENLARGE: 'ts_listArtEnlarge',
  LS_RESERVE_SIDEBAR_SPACE: 'ts_reserveSidebar',
  LS_GRINCH_MODE: 'ts_grinchMode',
  LS_CONTENT_WIDTH: 'ts_contentWidth',
  LS_PAGE_SIZE_LIST: 'ts_pageSizeList',
  LS_PAGE_SIZE_GRID: 'ts_pageSizeGrid',
  LS_PAGE_MODE_LIST: 'ts_pageModeList',
  LS_PAGE_MODE_GRID: 'ts_pageModeGrid',
  LS_SHOW_FIRST_LAST_PAGES: 'ts_showFirstLast',
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
  LS_OPACITY_CONTROLS_EXPANDED: 'ts_opacityExpanded',
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
  render: vi.fn(),
  loadAlbums: vi.fn(),
  resetPagination: vi.fn(),
  openArtLightbox: vi.fn(),
}));

vi.mock('../public/js/utils.js', () => ({
  escHtml: value => String(value),
}));

vi.mock('../public/js/image-ready.js', () => ({
  waitForImageReady: vi.fn(async () => true),
}));

vi.mock('../public/js/preferences.js', () => ({
  patchPreferences: patchPreferencesMock,
}));

vi.mock('../public/js/header-title.js', () => ({
  syncHeaderTitleText: vi.fn(),
}));

vi.mock('../public/js/layout-width.js', () => ({
  DEFAULT_CONTENT_WIDTH_PX: 1000,
  parseStoredContentWidthPx: vi.fn(() => 1000),
  validateContentWidthPx: vi.fn(value => Number.parseInt(String(value), 10)),
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
  getDefaultFilterPreset: vi.fn(() => ({ filters: {}, sort: {} })),
  saveDefaultFilterPreset: vi.fn(),
}));

describe('early wrapped settings flow', () => {
  beforeEach(() => {
    vi.resetModules();
    patchPreferencesMock.mockReset();
    patchPreferencesMock.mockResolvedValue({});
    localStorage.clear();
    document.body.className = '';

    stateMock.earlyWrapped = false;
    stateMock.accentPeriod = true;

    elMock.settingsStatus = { textContent: '', style: { color: '' } };
    elMock.toggleEarlyWrapped = document.createElement('input');
    elMock.toggleEarlyWrapped.type = 'checkbox';
    elMock.earlyWrappedConfirmOverlay = document.createElement('div');
    elMock.earlyWrappedConfirmOverlay.classList.add('hidden');
    elMock.earlyWrappedConfirmFloater = document.createElement('div');
    elMock.earlyWrappedConfirmText = document.createElement('p');
    elMock.earlyWrappedCheatToast = document.createElement('div');
    elMock.btnEarlyWrappedConfirmLeft = document.createElement('button');
    elMock.btnEarlyWrappedConfirmRight = document.createElement('button');

    elMock.toggleAccentPeriod = null;
    elMock.toggleGrinchMode = null;
    elMock.inputContentWidth = null;
    elMock.settingsOverlay = document.createElement('div');

    const audioPlay = vi.fn(() => Promise.resolve());
    const AudioMock = vi.fn(function MockAudio() {
      this.currentTime = 0;
      this.play = audioPlay;
    });
    vi.stubGlobal('Audio', AudioMock);
  });

  it('persists direct changes through the server-backed preference', async () => {
    const { setEarlyWrappedEnabled } = await import('../public/js/settings.js');

    await setEarlyWrappedEnabled(true);

    expect(stateMock.earlyWrapped).toBe(true);
    expect(elMock.toggleEarlyWrapped.checked).toBe(true);
    expect(patchPreferencesMock).toHaveBeenCalledWith({ earlyWrapped: true });
  });

  it('requires the three-step gag flow before enabling the toggle', async () => {
    const { initEarlyWrappedSettingsUi } = await import('../public/js/settings.js');
    initEarlyWrappedSettingsUi();

    elMock.toggleEarlyWrapped.checked = true;
    elMock.toggleEarlyWrapped.dispatchEvent(new Event('change'));

    expect(stateMock.earlyWrapped).toBe(false);
    expect(elMock.toggleEarlyWrapped.checked).toBe(false);
    expect(elMock.earlyWrappedConfirmOverlay.classList.contains('hidden')).toBe(false);
    expect(elMock.earlyWrappedConfirmText.innerHTML).toContain('spoil the surprise');
    expect(elMock.btnEarlyWrappedConfirmLeft.textContent).toBe('Cancel');
    expect(elMock.btnEarlyWrappedConfirmRight.textContent).toBe('Ok');

    elMock.btnEarlyWrappedConfirmRight.click();

    expect(elMock.earlyWrappedConfirmText.innerHTML).toContain('<em>really</em>');
    expect(elMock.btnEarlyWrappedConfirmLeft.textContent).toBe('Ok');
    expect(elMock.btnEarlyWrappedConfirmRight.textContent).toBe('Cancel');
    expect(elMock.btnEarlyWrappedConfirmRight.className).toContain('btn-primary');

    elMock.btnEarlyWrappedConfirmLeft.click();

    expect(elMock.earlyWrappedConfirmText.innerHTML).toContain('<strong><em>really</em></strong>');
    expect(elMock.earlyWrappedConfirmFloater.classList.contains('early-wrapped-confirm-moving')).toBe(true);

    elMock.btnEarlyWrappedConfirmRight.click();

    expect(stateMock.earlyWrapped).toBe(true);
    expect(elMock.toggleEarlyWrapped.checked).toBe(true);
    expect(elMock.earlyWrappedConfirmOverlay.classList.contains('hidden')).toBe(true);
    expect(patchPreferencesMock).toHaveBeenCalledWith({ earlyWrapped: true });
  });

  it('turns off without opening any confirmation flow', async () => {
    stateMock.earlyWrapped = true;
    const { initEarlyWrappedSettingsUi } = await import('../public/js/settings.js');
    initEarlyWrappedSettingsUi();

    elMock.toggleEarlyWrapped.checked = false;
    elMock.toggleEarlyWrapped.dispatchEvent(new Event('change'));

    expect(stateMock.earlyWrapped).toBe(false);
    expect(elMock.earlyWrappedConfirmOverlay.classList.contains('hidden')).toBe(true);
    expect(patchPreferencesMock).toHaveBeenCalledWith({ earlyWrapped: false });
  });

  it('keeps the accent period body class and startup cache in sync', async () => {
    elMock.toggleAccentPeriod = document.createElement('input');
    elMock.toggleAccentPeriod.type = 'checkbox';
    const { setAccentPeriod } = await import('../public/js/settings.js');

    await setAccentPeriod(false);

    expect(stateMock.accentPeriod).toBe(false);
    expect(elMock.toggleAccentPeriod.checked).toBe(false);
    expect(document.body.classList.contains('accent-period-enabled')).toBe(false);
    expect(localStorage.getItem('ts_accentPeriod')).toBe('0');
    expect(patchPreferencesMock).toHaveBeenCalledWith({ accentPeriod: false });
  });

  it('updates the accent period startup cache even when server persistence is skipped', async () => {
    elMock.toggleAccentPeriod = document.createElement('input');
    elMock.toggleAccentPeriod.type = 'checkbox';
    document.body.classList.remove('accent-period-enabled');
    const { setAccentPeriod } = await import('../public/js/settings.js');

    setAccentPeriod(true, { persist: false });

    expect(stateMock.accentPeriod).toBe(true);
    expect(elMock.toggleAccentPeriod.checked).toBe(true);
    expect(document.body.classList.contains('accent-period-enabled')).toBe(true);
    expect(localStorage.getItem('ts_accentPeriod')).toBe('1');
    expect(patchPreferencesMock).not.toHaveBeenCalledWith({ accentPeriod: true });
  });

  it('plays the sound and blocks Enter and Space on the moving third-step ok button', async () => {
    vi.useFakeTimers();
    const { initEarlyWrappedSettingsUi } = await import('../public/js/settings.js');
    initEarlyWrappedSettingsUi();

    elMock.toggleEarlyWrapped.checked = true;
    elMock.toggleEarlyWrapped.dispatchEvent(new Event('change'));
    elMock.btnEarlyWrappedConfirmRight.click();
    elMock.btnEarlyWrappedConfirmLeft.click();

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    elMock.btnEarlyWrappedConfirmRight.dispatchEvent(enterEvent);

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    elMock.btnEarlyWrappedConfirmRight.dispatchEvent(spaceEvent);

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(stateMock.earlyWrapped).toBe(false);
    expect(globalThis.Audio).toHaveBeenCalledWith('/sounds/ha-got-eeem.mp3');
    const audioInstance = globalThis.Audio.mock.results[0]?.value;
    expect(audioInstance.play).toHaveBeenCalledTimes(2);
    expect(elMock.earlyWrappedCheatToast.textContent).toBe("Nope. You'll have to click the button the old-fashioned way.");
    expect(elMock.earlyWrappedCheatToast.classList.contains('hidden')).toBe(false);
    expect(elMock.earlyWrappedCheatToast.classList.contains('early-wrapped-cheat-toast-visible')).toBe(true);
    vi.advanceTimersByTime(6000);
    expect(elMock.earlyWrappedCheatToast.classList.contains('early-wrapped-cheat-toast-visible')).toBe(false);
    expect(elMock.earlyWrappedCheatToast.classList.contains('hidden')).toBe(false);
    vi.advanceTimersByTime(100);
    expect(elMock.earlyWrappedCheatToast.classList.contains('hidden')).toBe(true);
    expect(elMock.earlyWrappedCheatToast.textContent).toBe('');
    vi.useRealTimers();
    expect(patchPreferencesMock).not.toHaveBeenCalledWith({ earlyWrapped: true });
  });
});
