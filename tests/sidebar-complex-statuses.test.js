import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  complexStatuses: [],
};

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: {},
  apiFetch: vi.fn(),
  STATUS_LABELS: {
    completed: 'Completed',
    dropped: 'Dropped',
    planned: 'Planned',
  },
  STATUS_FILTER_LABELS: {},
  IMPORT_TYPE_FILTER_LABELS: {},
  TYPE_FILTER_KEYS: [],
  TYPE_FILTER_LABELS: {},
  SORT_FIELD_LABELS: {},
  SORT_SVG_UP: '',
  SORT_SVG_DOWN: '',
  RATED_FILTER_ICONS: {},
  normalizeSortState: value => value,
  LS_U_BUTTONS: 'ts_uButtons',
  LS_U_BUTTONS_ENABLED_LIST: 'ts_uButtonsEnabledList',
  LS_U_BUTTONS_ENABLED_GRID: 'ts_uButtonsEnabledGrid',
  LS_SIDEBAR_COLLAPSED_LIST: 'ts_sidebarCollapsedList',
  LS_SIDEBAR_COLLAPSED_GRID: 'ts_sidebarCollapsedGrid',
  LS_DEBUG_CONTROLS: 'ts_debugControls',
  FILTER_PRESET_KEY: 'ts_filterPreset',
  DEFAULT_COMPLEX_STATUSES: [],
  U_BUTTON_DEFS: [],
}));

vi.mock('../public/js/filter-utils.js', () => ({
  applyAlbumFilters: albums => albums,
}));

vi.mock('../public/js/render.js', () => ({
  render: vi.fn(),
  loadAlbums: vi.fn(),
  resetPagination: vi.fn(),
}));

vi.mock('../public/js/modal.js', () => ({
  openEditModal: vi.fn(),
}));

vi.mock('../public/js/sidebar-layout.js', () => ({
  shouldAnimateGridSidebarToggle: vi.fn(() => false),
}));

vi.mock('../public/js/view-switch.js', () => ({
  shouldHideSidebarImmediatelyOnViewSwitch: vi.fn(() => false),
}));

vi.mock('../public/js/app-shell.js', () => ({
  syncAppShellLayout: vi.fn(),
}));

vi.mock('../public/js/preferences.js', () => ({
  patchPreferences: vi.fn(async () => ({})),
}));

vi.mock('../public/js/settings.js', () => ({
  openSettings: vi.fn(),
  closeSettings: vi.fn(),
  openPersonalization: vi.fn(),
  closePersonalization: vi.fn(),
  generateCsv: vi.fn(),
  downloadFullBackup: vi.fn(),
  downloadDbBackup: vi.fn(),
  downloadEssentialBackup: vi.fn(),
  mergeBackup: vi.fn(),
  restoreBackup: vi.fn(),
  handleBulkRefetchArt: vi.fn(),
  setDebugMode: vi.fn(),
  resetAllSettings: vi.fn(),
  setUButtons: vi.fn(),
}));

describe('complex status list', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="complex-status-list"></div>';
    stateMock.complexStatuses = [
      { id: 'cs_listened', name: 'Listened', statuses: ['completed', 'dropped'], includedWithApp: true },
      { id: 'cs_focus', name: 'Focus', statuses: ['planned'], includedWithApp: false },
    ];
  });

  it('disables deletion for built-in statuses while keeping user-created ones removable', async () => {
    const { renderComplexStatusList } = await import('../public/js/sidebar.js');

    renderComplexStatusList();

    const deleteButtons = Array.from(document.querySelectorAll('.complex-status-delete'));
    expect(deleteButtons).toHaveLength(2);

    expect(deleteButtons[0].disabled).toBe(true);
    expect(deleteButtons[0].title).toBe('Built-in filters cannot be deleted.');

    expect(deleteButtons[1].disabled).toBe(false);
    expect(deleteButtons[1].title).toBe('Delete');
  });
});
