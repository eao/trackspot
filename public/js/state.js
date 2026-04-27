// =============================================================================
// Shared application state, DOM references, and constants.
// =============================================================================

import { COLOR_SCHEME_PRESETS as GENERATED_COLOR_SCHEME_PRESETS } from './color-scheme-presets.generated.js';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, message: data.error || 'Unknown error', data };
  return data;
}

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------
// All mutable state lives here in one object. Nothing is stored in the DOM.
// When state changes, we call the relevant render function to update the UI.

export const state = {
  // Current page of albums as returned by the server, in server sort order.
  albums: [],
  albumsLoaded: false,
  albumsLoading: false,
  albumListMeta: {
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
  },
  albumDetailsCache: {},

  // Current filter values.
  filters: {
      search:          '',
      artist:          '',
      artistMatchExact: false,  // true when set via artist popover
      year:            '',
      ratingMin:       '',
      ratingMax:       '',
      statusFilter:    'cs_listened',  // true status key or complex status ID
      importTypeFilter: 'all', // 'spotify' | 'manual' | 'all'
      ratedFilter:     'both',  // 'both' | 'rated' | 'unrated'
      typeAlbum:       true,
      typeEP:          true,
      typeSingle:      true,
      typeCompilation: true,
      typeOther:       true,
    },

  // Current sort.
  sort: {
    field: 'date_listened_planned',
    order: 'desc',
  },
  savedFilterPreset: null,

  navigation: {
    page: 'collection', // 'collection' | 'stats' | 'wrapped'
    collectionView: 'list', // 'list' | 'grid'
    wrappedYear: null,
    scrollPositions: {
      collection: 0,
      stats: 0,
      wrapped: 0,
    },
  },

  // Legacy alias for the collection page layout. New page-level navigation
  // should go through state.navigation instead.
  view: 'list', // 'list' | 'grid'

  // Pagination settings and ephemeral page position.
  pagination: {
    currentPage: 1,
    perPage: {
      list: 18,
      grid: 18,
    },
    mode: {
      list: 'suggested',
      grid: 'suggested',
    },
    showPageCount: true,
    showFirstLastButtons: false,
    visibilityMode: 'hover',
  },

  // Modal state.
  modal: {
    open:      false,
    mode:      null,   // 'log' | 'edit'
    step:      null,   // 'fetch' | 'details'
    albumId:   null,   // set when editing an existing album
    isManual:  false,  // true when user chose manual entry
    isFetching: false, // true while Spotify fetch is in flight
    isSaving:  false,  // true while save is in flight
    // Pending metadata from Spotify fetch or manual entry.
    // This is what gets submitted to POST /api/albums.
    pendingMeta: null,
  },

  // Delete confirmation state.
  deleteTarget: null, // { id, name } | null

  // Debug mode — enables extra art buttons in edit modal.
  debugMode: false,

  // Top bar scroll behavior ('fixed' | 'scroll' | 'smart').
  headerScrollMode: 'smart',
  listArtClickToEnlarge: true,
  reserveSidebarSpace: false,
  showRepeatsField: true,
  showPriorityField: false,
  showRefetchArt: false,
  showPlannedAtField: false,
  preferencesHydrated: false,
  grinchMode: false,
  accentPeriod: true,
  earlyWrapped: false,
  seasonalThemeHistory: {},
  wrappedName: '',
  contentWidthPx: 1000,
  welcomeTour: {
    active: false,
    replay: false,
    completedAt: null,
    skippedAt: null,
    samplesAddedAt: null,
    sampleCount: 0,
    lockSessionId: null,
  },

  // Complex status filters (loaded from server preferences at init).
  complexStatuses: [],

  // U-shaped button config (order + enabled). Loaded from localStorage at init.
  uButtons: [],
  uButtonsEnabled: {
    list: false,
    grid: false,
  },
  quickActionsToolbarVisibilityMode: 'visible',

  // CSV import progress shown in Settings.
  csvImport: {
    job: null,
    isStarting: false,
  },

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

// ---------------------------------------------------------------------------
// DOM element references
// ---------------------------------------------------------------------------
// Gathered once at startup. Avoids repeated querySelector calls.

export const el = {
  // Header
  headerTitle:       document.getElementById('header-title'),
  headerTitleText:   document.getElementById('header-title-text'),
  btnToggleUButtons: document.getElementById('btn-toggle-u-buttons'),
  btnToggleSidebar:  document.getElementById('btn-toggle-sidebar'),
  btnPersonalization: document.getElementById('btn-personalization'),
  btnSettings:       document.getElementById('btn-settings'),
  btnLogNew:       document.getElementById('btn-log-new'),
  btnViewList:     document.getElementById('btn-view-list'),
  btnViewGrid:     document.getElementById('btn-view-grid'),
  btnStats:        document.getElementById('btn-stats'),
  btnWrapped:      document.getElementById('btn-wrapped'),

  // Sidebar
  filterSearch:    document.getElementById('filter-search'),
  filterArtist:    document.getElementById('filter-artist'),
  filterArtistExact: document.getElementById('filter-artist-exact'),
  filterYear:      document.getElementById('filter-year'),
  filterRatingMin: document.getElementById('filter-rating-min'),
  filterRatingMax: document.getElementById('filter-rating-max'),
  filterStatusBtn:      document.getElementById('filter-status-btn'),
  filterStatusDropdown: document.getElementById('filter-status-dropdown'),
  filterStatusWrap:     document.querySelector('.status-filter-wrap'),
  filterImportTypeBtn:      document.getElementById('filter-import-type-btn'),
  filterImportTypeDropdown: document.getElementById('filter-import-type-dropdown'),
  filterImportTypeWrap:     document.querySelector('.import-type-filter-wrap'),
  sortFieldWrap:        document.querySelector('.sort-field-wrap'),
  filterRatedBtn:      document.getElementById('filter-rated-btn'),
  filterRatedDropdown: document.getElementById('filter-rated-dropdown'),
  filterTypeBtn:     document.getElementById('filter-type-btn'),
  filterTypeDropdown: document.getElementById('filter-type-dropdown'),
  sortFieldBtn:      document.getElementById('sort-field-btn'),
  sortFieldDropdown: document.getElementById('sort-field-dropdown'),
  sortOrder:         document.getElementById('sort-order'),
  btnClearFilters:   document.getElementById('btn-clear-filters'),
  btnSaveFilters:    document.getElementById('btn-save-filters'),
  btnRestoreFilters: document.getElementById('btn-restore-filters'),

  // Content
  albumCount:      document.getElementById('album-count'),
  pageCollection:  document.getElementById('page-collection'),
  pageStats:       document.getElementById('page-stats'),
  pageWrapped:     document.getElementById('page-wrapped'),
  viewList:        document.getElementById('view-list'),
  viewGrid:        document.getElementById('view-grid'),
  emptyState:      document.getElementById('empty-state'),

  // Modal
  modalOverlay:    document.getElementById('modal-overlay'),
  modalTitle:      document.getElementById('modal-title'),
  modalClose:      document.getElementById('modal-close'),
  btnShowAlbumInfo: document.getElementById('btn-show-album-info'),
  stepDetails:     document.getElementById('step-details'),
  metaArtWrap:     document.getElementById('meta-art-wrap'),
  metadataArtActions: document.getElementById('metadata-art-actions'),
  metaArt:         document.getElementById('meta-art'),
  metaArtUploadLabel: document.getElementById('meta-art-upload-label'),
  metaArtUpload:   document.getElementById('meta-art-upload'),
  metaAlbumName:   document.getElementById('meta-album-name'),
  metaArtistNames: document.getElementById('meta-artist-names'),
  metaArtistNamesList: document.getElementById('artist-name-list'),
  metaReleaseDate: document.getElementById('meta-release-date'),
  metaTrackCount: document.getElementById('meta-track-count'),
  btnTrackCountUp: document.getElementById('btn-track-count-up'),
  btnTrackCountDown: document.getElementById('btn-track-count-down'),
  metaDuration:    document.getElementById('meta-duration'),
  fieldReleaseDate: document.getElementById('field-release-date'),
  fieldTrackCount: document.getElementById('field-track-count'),
  fieldDuration:    document.getElementById('field-duration'),
  metaArtistId:    document.getElementById('meta-artist-id'),
  fieldArtistId:   document.getElementById('field-artist-id'),
  fieldManualMetaRow: document.getElementById('field-manual-meta-row'),
  metaAlbumType:   document.getElementById('meta-album-type'),
  fieldAlbumType:  document.getElementById('field-album-type'),
  metaAlbumLink:   document.getElementById('meta-album-link'),
  fieldAlbumLink:  document.getElementById('field-album-link'),
  metaArtistLink:  document.getElementById('meta-artist-link'),
  fieldArtistLink: document.getElementById('field-artist-link'),
  fieldManualLinksRow: document.getElementById('field-manual-links-row'),
  btnTrimArtistId: document.getElementById('btn-trim-artist-id'),
  fieldPlannedAtRow: document.getElementById('field-planned-at-row'),
  inputPlannedAt: document.getElementById('input-planned-at'),
  btnPlannedDateToday: document.getElementById('btn-planned-date-today'),
  btnPlannedDateClear: document.getElementById('btn-planned-date-clear'),
  inputListenedAt: document.getElementById('input-listened-at'),
  inputRating:     document.getElementById('input-rating'),
  btnRatingUp5:    document.getElementById('btn-rating-up-5'),
  btnRatingDown5:  document.getElementById('btn-rating-down-5'),
  btnRatingUp:     document.getElementById('btn-rating-up'),
  btnRatingDown:   document.getElementById('btn-rating-down'),
  ratingDisplay:   document.getElementById('rating-display'),
  inputNotes:      document.getElementById('input-notes'),
  fetchError:      document.getElementById('fetch-error'),
  btnCancel:       document.getElementById('btn-cancel'),
  btnSave:         document.getElementById('btn-save'),
  btnModalDelete:  document.getElementById('btn-modal-delete'),
  btnDateToday:    document.getElementById('btn-date-today'),
  btnDateClear:    document.getElementById('btn-date-clear'),
  inputStatus:     document.getElementById('input-status'),
  fieldRepeatsRow: document.getElementById('field-repeats-row'),
  inputRepeats:    document.getElementById('input-repeats'),
  btnRepeatsUp:    document.getElementById('btn-repeats-up'),
  btnRepeatsDown:  document.getElementById('btn-repeats-down'),
  fieldPriorityRow: document.getElementById('field-priority-row'),
  inputPriority:   document.getElementById('input-priority'),
  btnPriorityUp:   document.getElementById('btn-priority-up'),
  btnPriorityDown: document.getElementById('btn-priority-down'),

  // Art action buttons (edit modal)
  btnRefetchArt:      document.getElementById('btn-refetch-art'),
  btnDeleteArt:       document.getElementById('btn-delete-art'),
  btnRandomArt:       document.getElementById('btn-random-art'),
  artRefetchPreview:  document.getElementById('art-refetch-preview'),
  artRefetchImg:      document.getElementById('art-refetch-img'),
  artRefetchCompare:  document.getElementById('art-refetch-compare'),
  btnArtRefetchCancel:  document.getElementById('btn-art-refetch-cancel'),
  btnArtRefetchReplace: document.getElementById('btn-art-refetch-replace'),

  // Delete modal
  deleteOverlay:   document.getElementById('delete-overlay'),
  deleteMessage:   document.getElementById('delete-message'),
  btnDeleteCancel: document.getElementById('btn-delete-cancel'),
  btnDeleteConfirm:document.getElementById('btn-delete-confirm'),
  artLightboxOverlay: document.getElementById('art-lightbox-overlay'),
  artLightboxImage: document.getElementById('art-lightbox-image'),

  // Settings modal
  settingsOverlay:   document.getElementById('settings-overlay'),
  settingsClose:     document.getElementById('settings-close'),
  btnSettingsClose:  document.getElementById('btn-settings-close'),
  personalizationOverlay: document.getElementById('personalization-overlay'),
  personalizationClose: document.getElementById('personalization-close'),
  btnPersonalizationClose: document.getElementById('btn-personalization-close'),
  personalizationThemeSelect: document.getElementById('select-personalization-theme'),
  personalizationThemeDescription: document.getElementById('personalization-theme-description'),
  personalizationThemeGalleryUser: document.getElementById('personalization-theme-gallery-user'),
  personalizationThemeGalleryPreset: document.getElementById('personalization-theme-gallery-preset'),
  personalizationThemeStatus: document.getElementById('personalization-theme-status'),
  personalizationThemePreviewButton: document.getElementById('btn-personalization-theme-preview'),
  personalizationThemePreviewImage: document.getElementById('img-personalization-theme-preview'),
  personalizationThemeUploadPreview: document.getElementById('btn-personalization-theme-upload-preview'),
  personalizationThemePreviewInput: document.getElementById('input-personalization-theme-preview'),
  personalizationThemeName: document.getElementById('input-personalization-theme-name'),
  personalizationThemeDescriptionInput: document.getElementById('input-personalization-theme-description'),
  personalizationThemeSelectionWarning: document.getElementById('personalization-theme-selection-warning'),
  personalizationThemeEditorWarning: document.getElementById('personalization-theme-editor-warning'),
  personalizationThemeNew: document.getElementById('btn-personalization-theme-new'),
  personalizationThemeSave: document.getElementById('btn-personalization-theme-save'),
  personalizationThemeUpdate: document.getElementById('btn-personalization-theme-update'),
  personalizationThemeDelete: document.getElementById('btn-personalization-theme-delete'),
  personalizationThemeEditorMessage: document.getElementById('personalization-theme-editor-message'),
  personalizationColorSchemeSelect: document.getElementById('select-personalization-color-scheme'),
  personalizationColorSchemeDescription: document.getElementById('personalization-color-scheme-description'),
  personalizationColorSchemeDownload: document.getElementById('btn-personalization-color-scheme-download'),
  personalizationCustomThemeCurrent: document.getElementById('personalization-custom-theme-current'),
  personalizationUploadThemeCss: document.getElementById('btn-personalization-upload-theme-css'),
  personalizationThemeCssInput: document.getElementById('input-personalization-theme-css'),
  personalizationClearThemeCss: document.getElementById('btn-personalization-clear-theme-css'),
  appBackgroundPrimary: document.getElementById('app-background-primary'),
  appBackgroundSecondary: document.getElementById('app-background-secondary'),
  personalizationBackgroundTabPrimary: document.getElementById('btn-personalization-background-tab-primary'),
  personalizationBackgroundTabSecondary: document.getElementById('btn-personalization-background-tab-secondary'),
  personalizationBackgroundPanelPrimary: document.getElementById('personalization-background-panel-primary'),
  personalizationBackgroundPanelSecondary: document.getElementById('personalization-background-panel-secondary'),
  personalizationUploadBackground: document.getElementById('btn-personalization-upload-background'),
  personalizationUploadInput: document.getElementById('input-personalization-background'),
  personalizationClearBackground: document.getElementById('btn-personalization-clear-background'),
  personalizationBackgroundCurrent: document.getElementById('personalization-background-current'),
  personalizationUserImages: document.getElementById('personalization-user-images'),
  personalizationPresetImages: document.getElementById('personalization-preset-images'),
  personalizationBackgroundPositionX: document.getElementById('select-personalization-background-position-x'),
  personalizationBackgroundPositionY: document.getElementById('select-personalization-background-position-y'),
  personalizationBackgroundFill: document.getElementById('select-personalization-background-fill'),
  personalizationBackgroundCustomScaleRow: document.getElementById('personalization-background-custom-scale-row'),
  personalizationBackgroundCustomScale: document.getElementById('input-personalization-background-custom-scale'),
  personalizationUploadSecondaryBackground: document.getElementById('btn-personalization-upload-secondary-background'),
  personalizationSecondaryUploadInput: document.getElementById('input-personalization-secondary-background'),
  personalizationClearSecondaryBackground: document.getElementById('btn-personalization-clear-secondary-background'),
  personalizationSecondaryBackgroundCurrent: document.getElementById('personalization-secondary-background-current'),
  personalizationSecondaryUserImages: document.getElementById('personalization-secondary-user-images'),
  personalizationSecondaryPresetImages: document.getElementById('personalization-secondary-preset-images'),
  personalizationSecondaryBackgroundPositionX: document.getElementById('select-personalization-secondary-background-position-x'),
  personalizationSecondaryBackgroundPositionY: document.getElementById('select-personalization-secondary-background-position-y'),
  personalizationSecondaryBackgroundFill: document.getElementById('select-personalization-secondary-background-fill'),
  personalizationSecondaryBackgroundCustomScaleRow: document.getElementById('personalization-secondary-background-custom-scale-row'),
  personalizationSecondaryBackgroundCustomScale: document.getElementById('input-personalization-secondary-background-custom-scale'),
  personalizationOpacityPresetSelect: document.getElementById('select-personalization-opacity-preset'),
  personalizationOpacityPresetName: document.getElementById('input-personalization-opacity-preset-name'),
  personalizationOpacityPresetSave: document.getElementById('btn-personalization-opacity-preset-save'),
  personalizationOpacityPresetUpdate: document.getElementById('btn-personalization-opacity-preset-update'),
  personalizationOpacityPresetDelete: document.getElementById('btn-personalization-opacity-preset-delete'),
  personalizationOpacityControlsDetails: document.getElementById('personalization-opacity-controls-details'),
  personalizationBackgroundStatus: document.getElementById('personalization-background-status'),
  pageModeList:      document.getElementById('page-mode-list'),
  pageDescList:      document.getElementById('page-desc-list'),
  pageSuggestedList: document.getElementById('page-suggested-list'),
  pageCustomWrapList: document.getElementById('page-custom-wrap-list'),
  pageCustomList:    document.getElementById('page-custom-list'),
  btnPageCustomListUp: document.getElementById('btn-page-custom-list-up'),
  btnPageCustomListDown: document.getElementById('btn-page-custom-list-down'),
  pageModeGrid:      document.getElementById('page-mode-grid'),
  pageDescGrid:      document.getElementById('page-desc-grid'),
  pageSuggestedGrid: document.getElementById('page-suggested-grid'),
  pageCustomWrapGrid: document.getElementById('page-custom-wrap-grid'),
  pageCustomGrid:    document.getElementById('page-custom-grid'),
  btnPageCustomGridUp: document.getElementById('btn-page-custom-grid-up'),
  btnPageCustomGridDown: document.getElementById('btn-page-custom-grid-down'),
  selectPageControlVisibility: document.getElementById('select-page-control-visibility'),
  toggleShowPageCount: document.getElementById('toggle-show-page-count'),
  toggleFirstLastPageButtons: document.getElementById('toggle-first-last-page-buttons'),
  btnDownloadCsv:    document.getElementById('btn-download-csv'),
  btnDownloadBackup: document.getElementById('btn-download-backup'),
  btnDownloadBackupDb: document.getElementById('btn-download-backup-db'),
  btnDownloadBackupEssential: document.getElementById('btn-download-backup-essential'),
  btnMergeBackup:    document.getElementById('btn-merge-backup'),
  btnRestoreBackup:  document.getElementById('btn-restore-backup'),
  inputImportCsv:    document.getElementById('input-import-csv'),
  csvImportFileName: document.getElementById('csv-import-file-name'),
  selectImportDefaultStatus: document.getElementById('select-import-default-status'),
  btnCsvFormatHelp:  document.getElementById('btn-csv-format-help'),
  btnImportCsv:      document.getElementById('btn-import-csv'),
  csvImportProgress: document.getElementById('csv-import-progress'),
  csvImportHeading:  document.getElementById('csv-import-heading'),
  csvImportMeta:     document.getElementById('csv-import-meta'),
  btnCloseImportCsv: document.getElementById('btn-close-import-csv'),
  btnOpenImportReport: document.getElementById('btn-open-import-report'),
  btnCancelImportCsv: document.getElementById('btn-cancel-import-csv'),
  csvImportCounts:   document.getElementById('csv-import-counts'),
  btnBulkRefetchArt: document.getElementById('btn-bulk-refetch-art'),
  btnResetAllSettings: document.getElementById('btn-reset-all-settings'),
  btnClearLocalStorage: document.getElementById('btn-clear-local-storage'),
  btnReplayWelcomeTour: document.getElementById('btn-replay-welcome-tour'),
  btnRemoveWelcomeSamples: document.getElementById('btn-remove-welcome-samples'),
  welcomeSamplesRow: document.getElementById('welcome-samples-row'),
  toggleShowRepeatsField: document.getElementById('toggle-show-repeats-field'),
  toggleShowPriorityField: document.getElementById('toggle-show-priority-field'),
  toggleShowRefetchArt: document.getElementById('toggle-show-refetch-art'),
  toggleShowPlannedAtField: document.getElementById('toggle-show-planned-at-field'),
  toggleDebugControls: document.getElementById('toggle-debug-controls'),
  toggleShowWipeDb:    document.getElementById('toggle-show-wipe-db'),
  toggleEarlyWrapped:  document.getElementById('toggle-early-wrapped'),
  toggleListArtEnlarge: document.getElementById('toggle-list-art-enlarge'),
  toggleReserveSidebarSpace: document.getElementById('toggle-reserve-sidebar-space'),
  toggleGrinchMode: document.getElementById('toggle-grinch-mode'),
  toggleAccentPeriod: document.getElementById('toggle-accent-period'),
  inputWrappedName: document.getElementById('input-wrapped-name'),
  inputContentWidth: document.getElementById('input-content-width'),
  btnContentWidthUp: document.getElementById('btn-content-width-up'),
  btnContentWidthDown: document.getElementById('btn-content-width-down'),
  selectHeaderScroll:  document.getElementById('select-header-scroll'),
  settingsStatus:    document.getElementById('settings-status'),
  earlyWrappedConfirmOverlay: document.getElementById('early-wrapped-confirm-overlay'),
  earlyWrappedConfirmFloater: document.getElementById('early-wrapped-confirm-floater'),
  earlyWrappedConfirmText: document.getElementById('early-wrapped-confirm-text'),
  btnEarlyWrappedConfirmLeft: document.getElementById('btn-early-wrapped-confirm-left'),
  btnEarlyWrappedConfirmRight: document.getElementById('btn-early-wrapped-confirm-right'),
  settingsWipeSection: document.getElementById('settings-wipe-section'),
  btnWipeDb:           document.getElementById('btn-wipe-db'),
  csvFormatOverlay:    document.getElementById('csv-format-overlay'),
  csvFormatClose:      document.getElementById('csv-format-close'),
  btnCsvFormatClose:   document.getElementById('btn-csv-format-close'),

  // Pager
  pageCount:         document.getElementById('page-count'),
  pageControls:      document.getElementById('page-controls'),
  pageControlFirst:  document.getElementById('page-control-first'),
  pageControlPrev:   document.getElementById('page-control-prev'),
  pageControlNext:   document.getElementById('page-control-next'),
  pageControlLast:   document.getElementById('page-control-last'),

  // U-shaped buttons (bar)
  uBtnSidebar:         document.getElementById('u-btn-sidebar'),
  uBtnSortOrder:       document.getElementById('u-btn-sort-order'),
  uBtnSort:            document.getElementById('u-btn-sort'),
  uBtnStatusFilter:    document.getElementById('u-btn-status-filter'),
  uBtnRestoreFilters:  document.getElementById('u-btn-restore-filters'),
  uButtonList:         document.getElementById('u-button-list'),
  selectQuickActionsVisibility: document.getElementById('select-quick-actions-visibility'),

  // Header tooltip
  headerTooltip:   document.getElementById('header-tooltip'),
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SORT_SVG_UP   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>';
export const SORT_SVG_DOWN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';

export const STATUS_LABELS = {
  completed: 'Completed',
  planned:   'Planned',
  dropped:   'Dropped',
};

export const STATUS_FILTER_LABELS = {
  completed: 'Completed',
  dropped:   'Dropped',
  planned:   'Planned',
};

export const IMPORT_TYPE_FILTER_LABELS = {
  spotify: 'Spotify',
  manual:  'Manual',
  all:     'All',
};

export const LS_PREFIX = 'ts_';

export const FILTER_PRESET_KEY    = 'ts_filterPreset';
export const LS_U_BUTTONS         = 'ts_uButtons';
export const LS_QUICK_ACTIONS_VISIBILITY = 'ts_quickActionsVisibility';
export const LS_DEBUG_CONTROLS    = 'ts_debugControls';
export const LS_U_BUTTONS_ENABLED_LIST = 'ts_uButtonsEnabledList';
export const LS_U_BUTTONS_ENABLED_GRID = 'ts_uButtonsEnabledGrid';
export const LS_SIDEBAR_COLLAPSED_LIST = 'ts_sidebarCollapsedList';
export const LS_HEADER_SCROLL          = 'ts_headerScroll';
export const LS_SIDEBAR_COLLAPSED_GRID = 'ts_sidebarCollapsedGrid';
export const LS_SHOW_WIPE_DB           = 'ts_showWipeDb';
export const LS_SHOW_REPEATS_FIELD     = 'ts_showRepeatsField';
export const LS_SHOW_PRIORITY_FIELD    = 'ts_showPriorityField';
export const LS_SHOW_REFETCH_ART       = 'ts_showRefetchArt';
export const LS_SHOW_PLANNED_AT_FIELD  = 'ts_showPlannedAtField';
export const LS_LIST_ART_ENLARGE       = 'ts_listArtEnlarge';
export const LS_RESERVE_SIDEBAR_SPACE  = 'ts_reserveSidebarSpace';
export const LS_GRINCH_MODE            = 'ts_grinchMode';
export const LS_CONTENT_WIDTH          = 'ts_contentWidth';
export const LS_PAGE_SIZE_LIST         = 'ts_pageSizeList';
export const LS_PAGE_SIZE_GRID         = 'ts_pageSizeGrid';
export const LS_PAGE_MODE_LIST         = 'ts_pageModeList';
export const LS_PAGE_MODE_GRID         = 'ts_pageModeGrid';
export const LS_SHOW_FIRST_LAST_PAGES  = 'ts_showFirstLastPages';
export const LS_PAGE_CONTROL_VISIBILITY = 'ts_pageControlVisibility';
export const LS_SHOW_PAGE_COUNT        = 'ts_showPageCount';
export const LS_PERSONALIZATION_OPACITY = 'ts_personalizationOpacity';
export const LS_COLOR_SCHEME_PRESET = 'ts_colorSchemePreset';
export const LS_CUSTOM_THEME_CSS = 'ts_customThemeCss';
export const LS_CUSTOM_THEME_CSS_NAME = 'ts_customThemeCssName';
export const LS_BACKGROUND_IMAGE_SELECTION = 'ts_backgroundImageSelection';
export const LS_BACKGROUND_IMAGE_DISPLAY = 'ts_backgroundImageDisplay';
export const LS_SECONDARY_BACKGROUND_IMAGE_SELECTION = 'ts_secondaryBackgroundImageSelection';
export const LS_SECONDARY_BACKGROUND_IMAGE_DISPLAY = 'ts_secondaryBackgroundImageDisplay';
export const LS_OPACITY_CONTROLS_EXPANDED = 'ts_opacityControlsExpanded';
export const LS_APPLIED_THEME_ID = 'ts_appliedThemeId';

export const DEFAULT_COLOR_SCHEME_PRESET_ID = 'bunan-blue';
export const COLOR_SCHEME_PRESETS = GENERATED_COLOR_SCHEME_PRESETS;

export const DEFAULT_PERSONALIZATION_OPACITY = {
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

export const DEFAULT_PERSONALIZATION_BACKGROUND_DISPLAY = {
  positionX: 'center',
  positionY: 'center',
  fill: 'cover',
  customScale: 1,
};

export const DEFAULT_SECONDARY_PERSONALIZATION_BACKGROUND_DISPLAY = {
  positionX: 'right',
  positionY: 'top',
  fill: 'original-size',
  customScale: 1,
};

export const DEFAULT_OPACITY_PRESETS = [
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
];

export const PAGE_SUGGESTED = {
  list: 18,
  grid: 18,
};

export const PAGE_ICON_FIRST = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-first-icon lucide-chevron-first"><path d="m17 18-6-6 6-6"/><path d="M7 6v12"/></svg>';
export const PAGE_ICON_PREV = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left-icon lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>';
export const PAGE_ICON_NEXT = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right-icon lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>';
export const PAGE_ICON_LAST = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-last-icon lucide-chevron-last"><path d="m7 18 6-6-6-6"/><path d="M17 6v12"/></svg>';

export const DEFAULT_COMPLEX_STATUSES = [
  { id: 'cs_listened', name: 'Listened', statuses: ['completed', 'dropped'], includedWithApp: true },
  { id: 'cs_all',      name: 'All',      statuses: ['completed', 'dropped', 'planned'], includedWithApp: true },
];

export const TYPE_FILTER_KEYS = ['typeAlbum','typeEP','typeSingle','typeCompilation','typeOther'];
export const TYPE_FILTER_LABELS = { typeAlbum: 'Album', typeEP: 'EP', typeSingle: 'Single', typeCompilation: 'Compilation', typeOther: 'Other' };

export const U_BUTTON_DEFS = [
  { id: 'sidebar',         label: 'Toggle sidebar' },
  { id: 'status-filter',   label: 'Status filter' },
  { id: 'sort',            label: 'Sort field' },
  { id: 'sort-order',      label: 'Sort direction' },
  { id: 'restore-filters', label: 'Restore saved filters & sort' },
];

export const SORT_FIELD_LABELS = {
  date_listened: 'Date listened',
  date_planned: 'Date planned',
  date_listened_planned: 'Date logged',
  date_logged:   'Server timestamp',
  date_edited:   'Date last edited',
  release_date:  'Release date',
  rating:        'Rating',
  artist:        'Artist',
  album:         'Album',
  duration:      'Duration',
  track_count:   'Track count',
  notes_length:  'Note length',
  notes:         'Notes (alphabetical)',
  repeats:       'Repeat listens',
  priority:      'Priority',
};

export const LIST_COLUMNS = [
  { label: '#',        sortKey: null,            style: 'row-index' },
  { label: '',         sortKey: null,            style: '' },           // art
  { label: 'Rating',   sortKey: 'rating',        style: 'row-rating' },
  { label: 'Album / Artist + Notes', sortKey: 'album', style: '' },    // combined
  { label: 'Year',     sortKey: 'release_date',  style: 'row-year' },
  { label: 'Logged', sortKey: 'date_listened_planned', style: 'row-date' },
];

export function normalizeSortField(field) {
  if (field === 'year') return 'release_date';
  return Object.prototype.hasOwnProperty.call(SORT_FIELD_LABELS, field)
    ? field
    : 'date_listened_planned';
}

export function normalizeSortState(sort = {}) {
  return {
    field: normalizeSortField(sort.field),
    order: sort.order === 'asc' ? 'asc' : 'desc',
  };
}

export const RATED_FILTER_ICONS = {
  both:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="7"/><circle cx="15" cy="15" r="7"/></svg>`,
  rated:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  unrated: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};
