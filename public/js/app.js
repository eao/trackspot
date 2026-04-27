// =============================================================================
// Entry point — initialization and top-level event binding.
// =============================================================================

import {
  state, el,
  STATUS_FILTER_LABELS, IMPORT_TYPE_FILTER_LABELS, FILTER_PRESET_KEY, DEFAULT_COMPLEX_STATUSES,
  normalizeSortState,
  LS_DEBUG_CONTROLS, LS_SIDEBAR_COLLAPSED_LIST, LS_SIDEBAR_COLLAPSED_GRID,
  LS_U_BUTTONS_ENABLED_LIST, LS_U_BUTTONS_ENABLED_GRID, LS_HEADER_SCROLL, LS_SHOW_WIPE_DB, LS_SHOW_REPEATS_FIELD, LS_SHOW_PRIORITY_FIELD, LS_SHOW_REFETCH_ART, LS_SHOW_PLANNED_AT_FIELD, LS_LIST_ART_ENLARGE, LS_RESERVE_SIDEBAR_SPACE,
} from './state.js';
import { todayISO } from './utils.js';
import { closeArtistPopover } from './artists.js';
import { loadAlbums, closeArtLightbox, resetPagination } from './render.js';
import { getLaunchAlbumId, maybeClearLaunchAlbumParam, openLaunchAlbumModal } from './launch.js';
import { runStartupFlow } from './startup-flow.js';
import { revealSidebarForStartup } from './startup-ui.js';
import {
  initSidebarEvents, initListEvents, initGridEvents,
  initComplexStatuses, initUButtons,
  loadUButtons,
  renderStatusDropdown, renderUButtonBar,
  updateSortOrderBtn, updateSortFieldBtn,
  updateStatusFilterBtn, updateImportTypeFilterBtn, updateRatedFilterBtn,
  updateTypeFilterBtn, updateRestoreBtn,
  applyCollectionViewState, toggleSidebarForCurrentView,
  renderImportTypeDropdown,
  getDefaultFilterPreset, saveDefaultFilterPreset, syncFilterControlsFromState,
} from './sidebar.js';
import {
  openLogModal,
  handleImageUpload, handleSaveNew, handleSaveEdit,
  openEditModal, closeModal,
  showAlbumInfoDebugWindow,
  openDeleteConfirm, closeDeleteConfirm, handleDeleteConfirm,
  updateRatingDisplay, showError,
} from './modal.js';
import {
  closeSettings, closePersonalization, setDebugMode, setUButtons,
  setHeaderScrollMode, setShowRepeatsField, setShowPriorityField, setShowPlannedAtField, setShowRefetchArtButton, setShowWipeDb, setListArtClickToEnlarge, setReserveSidebarSpace, setAccentPeriod, setGrinchMode, setContentWidthPx, restoreContentWidthSettings, clearLocalStorage, wipeDatabase, initPaginationSettings, initQuickActionsToolbarSettings, initCsvImportControls, initPersonalizationSettings, initEarlyWrappedSettingsUi, closeCsvFormattingInstructions,
  removeWelcomeSampleAlbums, refreshWelcomeTourSettings,
} from './settings.js';
import { syncAppShellLayout } from './app-shell.js';
import { setCollectionView, setPage, syncNavigationFromLocation } from './navigation.js';
import { fetchPreferences, migrateLocalStoragePreferencesToServer } from './preferences.js';
import { persistWrappedName, setWrappedName, syncWrappedNameSettingsInput } from './wrapped-name.js';
import { initHeaderScrollTracking } from './header-scroll.js';
import { getSteppedContentWidthPx } from './layout-width.js';
import { initWelcomeTourEvents, maybeStartWelcomeTour } from './welcome-tour.js';

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------

let layoutResizeTimeout = null;

function initTooltips() {
  const tooltip = document.createElement('div');
  tooltip.id = 'filter-tooltip';
  document.body.appendChild(tooltip);

  let timer = null;
  let activeTarget = null;

  function hideTooltip() {
    clearTimeout(timer);
    tooltip.classList.remove('visible');
    activeTarget = null;
  }

  function positionTooltip(target) {
    const targetRect = target.getBoundingClientRect();
    const ttW = tooltip.offsetWidth;
    const ttH = tooltip.offsetHeight;
    const side = target.dataset.tooltipSide;
    const gap = Number.parseInt(target.dataset.tooltipGap ?? '', 10);
    const offset = Number.isFinite(gap) ? gap : 8;

    if (side === 'right') {
      const top = Math.min(
        window.innerHeight - ttH - 4,
        Math.max(4, targetRect.top + (targetRect.height / 2) - (ttH / 2))
      );
      const left = Math.min(
        window.innerWidth - ttW - 4,
        Math.max(4, targetRect.right + offset)
      );
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      return;
    }

    const top = Math.max(4, targetRect.top - ttH - offset);
    const align = target.dataset.tooltipAlign;
    const left = align === 'left'
      ? targetRect.left
      : align === 'right'
        ? targetRect.right - ttW
        : targetRect.left + (targetRect.width / 2) - (ttW / 2);
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${Math.max(4, Math.min(window.innerWidth - ttW - 4, left))}px`;
  }

  function queueTooltip(target) {
    clearTimeout(timer);
    activeTarget = target;
    tooltip.classList.remove('visible');
    tooltip.textContent = target.dataset.tooltip;
    tooltip.style.top = '0px';
    tooltip.style.left = '-9999px';
    const parsedDelay = Number.parseInt(target.dataset.tooltipDelay ?? '', 10);
    const delay = Number.isFinite(parsedDelay) ? parsedDelay : 800;
    const showTooltip = () => {
      if (activeTarget !== target) return;
      positionTooltip(target);
      tooltip.classList.add('visible');
    };
    if (delay <= 0) {
      showTooltip();
      return;
    }
    timer = setTimeout(showTooltip, delay);
  }

  document.addEventListener('mouseover', e => {
    if (!(e.target instanceof Element)) return;
    const target = e.target.closest('[data-tooltip]');
    if (!target || activeTarget === target) return;
    queueTooltip(target);
  });

  document.addEventListener('mouseout', e => {
    if (!(e.target instanceof Element)) return;
    const target = e.target.closest('[data-tooltip]');
    if (!target || target !== activeTarget) return;
    if (e.relatedTarget instanceof Node && target.contains(e.relatedTarget)) return;
    hideTooltip();
  });
}

// ---------------------------------------------------------------------------
// Bind all event listeners
// ---------------------------------------------------------------------------

function initEvents() {
  let statsTopArtistJumpPending = false;

  function applyTopArtistCollectionPreset(artistName) {
    const normalizedArtistName = String(artistName ?? '').trim();
    if (!normalizedArtistName) return false;

    const allStatusFilter = state.complexStatuses.find(cs => cs.id === 'cs_all')?.id
      ?? DEFAULT_COMPLEX_STATUSES.find(cs => cs.id === 'cs_all')?.id
      ?? 'cs_all';

    state.filters = {
      search: '',
      artist: normalizedArtistName,
      artistMatchExact: true,
      year: '',
      ratingMin: '',
      ratingMax: '',
      statusFilter: allStatusFilter,
      importTypeFilter: 'all',
      ratedFilter: 'both',
      typeAlbum: true,
      typeEP: true,
      typeSingle: true,
      typeCompilation: true,
      typeOther: true,
    };
    state.sort = normalizeSortState({
      field: 'release_date',
      order: 'desc',
    });

    resetPagination();
    syncFilterControlsFromState();
    updateStatusFilterBtn();
    updateImportTypeFilterBtn();
    updateRatedFilterBtn();
    updateTypeFilterBtn();
    updateSortFieldBtn();
    updateSortOrderBtn();

    if (state.navigation?.scrollPositions) {
      state.navigation.scrollPositions.collection = 0;
    }

    return true;
  }


  function nudgeNumberInput(input, delta) {
    const min = input.min === '' ? null : parseInt(input.min, 10);
    const max = input.max === '' ? null : parseInt(input.max, 10);
    const currentRaw = input.value.trim();
    const current = currentRaw === '' ? null : parseInt(currentRaw, 10);
    let next = Number.isInteger(current) ? current + delta : (delta >= 0 ? (min ?? 0) : (max ?? (min ?? 0)));
    if (min !== null) next = Math.max(min, next);
    if (max !== null) next = Math.min(max, next);
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  }

  function nudgeRating(delta) {
    nudgeNumberInput(el.inputRating, delta);
  }

  // New stuff
  el.btnDateToday.addEventListener('click', () => {
    el.inputListenedAt.value = todayISO();
  });

  el.btnDateClear.addEventListener('click', () => {
    el.inputListenedAt.value = '';
  });

  el.btnPlannedDateToday.addEventListener('click', () => {
    el.inputPlannedAt.value = todayISO();
  });

  el.btnPlannedDateClear.addEventListener('click', () => {
    el.inputPlannedAt.value = '';
  });



  // Header.
  el.btnToggleSidebar.addEventListener('click', () => toggleSidebarForCurrentView());
  el.btnLogNew.addEventListener('click', openLogModal);
  el.btnViewList.addEventListener('click', () => {
    void setCollectionView('list');
  });
  el.btnViewGrid.addEventListener('click', () => {
    void setCollectionView('grid');
  });
  if (el.btnStats) {
    el.btnStats.addEventListener('click', () => {
      void setPage('stats');
    });
  }
  if (el.btnWrapped) {
    el.btnWrapped.addEventListener('click', () => {
      void setPage('wrapped');
    });
  }

  window.addEventListener('stats:open-top-artist', async event => {
    const artistName = event?.detail?.artistName;
    if (statsTopArtistJumpPending) return;
    if (!applyTopArtistCollectionPreset(artistName)) return;

    statsTopArtistJumpPending = true;
    try {
      await loadAlbums({
        gateStartupArt: true,
        renderAlbums: () => {},
      });
      await setPage('collection', {
        suppressTransitions: true,
        skipCollectionLoad: true,
      });
    } finally {
      statsTopArtistJumpPending = false;
    }
  });

  el.pageControlFirst.addEventListener('click', () => {
    state.pagination.currentPage = 1;
    loadAlbums({ preservePage: true, scrollToTop: true });
  });
  el.pageControlPrev.addEventListener('click', () => {
    state.pagination.currentPage = Math.max(1, state.pagination.currentPage - 1);
    loadAlbums({ preservePage: true, scrollToTop: true });
  });
  el.pageControlNext.addEventListener('click', () => {
    state.pagination.currentPage += 1;
    loadAlbums({ preservePage: true, scrollToTop: true });
  });
  el.pageControlLast.addEventListener('click', () => {
    state.pagination.currentPage = Number.MAX_SAFE_INTEGER;
    loadAlbums({ preservePage: true, scrollToTop: true });
  });

  // Sidebar filters & sort.
  initSidebarEvents();

  // List & grid click delegation.
  initListEvents();
  initGridEvents();

  el.btnShowAlbumInfo.addEventListener('click', showAlbumInfoDebugWindow);

  // Modal — details step.
  el.inputRating.addEventListener('input', e => {
    updateRatingDisplay(e.target.value);
  });
  el.inputRating.addEventListener('keydown', e => {
    if (e.key === 'PageUp') {
      e.preventDefault();
      nudgeRating(5);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      nudgeRating(-5);
    }
  });
  el.inputRating.addEventListener('wheel', e => {
    const isFocused = document.activeElement === el.inputRating;
    const isHovered = el.inputRating.matches(':hover');
    if (!isFocused || !isHovered) return;

    if (e.deltaY < 0) {
      e.preventDefault();
      nudgeRating(5);
    } else if (e.deltaY > 0) {
      e.preventDefault();
      nudgeRating(-5);
    }
  }, { passive: false });
  el.btnRatingUp5.addEventListener('click', () => nudgeRating(5));
  el.btnRatingDown5.addEventListener('click', () => nudgeRating(-5));
  el.btnRatingUp.addEventListener('click', () => nudgeRating(1));
  el.btnRatingDown.addEventListener('click', () => nudgeRating(-1));
  el.btnTrackCountUp.addEventListener('click', () => nudgeNumberInput(el.metaTrackCount, 1));
  el.btnTrackCountDown.addEventListener('click', () => nudgeNumberInput(el.metaTrackCount, -1));
  el.btnRepeatsUp.addEventListener('click', () => nudgeNumberInput(el.inputRepeats, 1));
  el.btnRepeatsDown.addEventListener('click', () => nudgeNumberInput(el.inputRepeats, -1));
  el.btnPriorityUp.addEventListener('click', () => nudgeNumberInput(el.inputPriority, 1));
  el.btnPriorityDown.addEventListener('click', () => nudgeNumberInput(el.inputPriority, -1));

  el.metaArtUpload.addEventListener('change', e => {
    handleImageUpload(e.target.files[0]);
  });

  el.btnTrimArtistId.addEventListener('click', () => {
    const val = el.metaArtistId.value.trim();
    if (!val) return;
    // Accept a full Spotify artist URL and extract just the ID.
    const match = val.match(/spotify\.com\/artist\/([A-Za-z0-9]+)/);
    if (match) {
      el.metaArtistId.value = match[1];
    } else if (/^[A-Za-z0-9]+$/.test(val)) {
      // Already a plain ID — nothing to do.
    } else {
      showError('Could not find a Spotify artist ID in that URL.');
    }
  });

  // Modal — save & cancel.
  el.btnSave.addEventListener('click', () => {
    if (state.modal.mode === 'log') {
      handleSaveNew();
    } else {
      handleSaveEdit();
    }
  });

  el.btnModalDelete.addEventListener('click', () => {
    if (state.modal.albumId) {
      closeModal();
      openDeleteConfirm(state.modal.albumId);
    }
  });
  el.btnCancel.addEventListener('click', closeModal);
  el.modalClose.addEventListener('click', closeModal);

  // Close modal on overlay click (clicking outside the modal box).
  el.modalOverlay.addEventListener('click', e => {
    if (e.target === el.modalOverlay) closeModal();
  });

  // Delete modal.
  el.btnDeleteConfirm.addEventListener('click', handleDeleteConfirm);
  el.btnDeleteCancel.addEventListener('click', closeDeleteConfirm);

  el.deleteOverlay.addEventListener('click', e => {
    if (e.target === el.deleteOverlay) closeDeleteConfirm();
  });

  el.artLightboxOverlay.addEventListener('click', e => {
    if (e.target === el.artLightboxOverlay || e.target === el.artLightboxImage) {
      closeArtLightbox();
    }
  });

  // Close modals on Escape key.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeArtistPopover();
      if (!el.artLightboxOverlay.classList.contains('hidden')) closeArtLightbox();
      if (!el.csvFormatOverlay.classList.contains('hidden')) closeCsvFormattingInstructions();
      if (!el.personalizationOverlay.classList.contains('hidden')) closePersonalization();
      if (!el.settingsOverlay.classList.contains('hidden')) closeSettings();
      if (!el.modalOverlay.classList.contains('hidden')) closeModal();
      if (!el.deleteOverlay.classList.contains('hidden')) closeDeleteConfirm();
    }
    if (e.key === 'Enter' && e.ctrlKey && state.modal.mode === 'edit' &&
        !el.modalOverlay.classList.contains('hidden')) {
      e.preventDefault();
      handleSaveEdit();
    }
  });
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
// Entry point — called once when the page loads.

function initSettings() {
  const initialCollectionView = state.navigation?.collectionView || 'list';

  initPaginationSettings();
  initQuickActionsToolbarSettings();
  initCsvImportControls();
  initPersonalizationSettings();

  // Restore repeats-field toggle.
  const showRepeatsOn = state.preferencesHydrated
    ? state.showRepeatsField
    : localStorage.getItem(LS_SHOW_REPEATS_FIELD) !== '0';
  el.toggleShowRepeatsField.checked = showRepeatsOn;
  setShowRepeatsField(showRepeatsOn, { persist: false });

  // Restore priority-field toggle.
  const showPriorityOn = state.preferencesHydrated
    ? state.showPriorityField
    : localStorage.getItem(LS_SHOW_PRIORITY_FIELD) === '1';
  el.toggleShowPriorityField.checked = showPriorityOn;
  setShowPriorityField(showPriorityOn, { persist: false });

  // Restore re-fetch art toggle.
  const showRefetchArtOn = state.preferencesHydrated
    ? state.showRefetchArt
    : localStorage.getItem(LS_SHOW_REFETCH_ART) === '1';
  el.toggleShowRefetchArt.checked = showRefetchArtOn;
  setShowRefetchArtButton(showRefetchArtOn, { persist: false });

  const showPlannedAtOn = state.preferencesHydrated
    ? state.showPlannedAtField
    : localStorage.getItem(LS_SHOW_PLANNED_AT_FIELD) === '1';
  el.toggleShowPlannedAtField.checked = showPlannedAtOn;
  setShowPlannedAtField(showPlannedAtOn, { persist: false });

  // Restore list-art enlarge toggle.
  const listArtEnlargeOn = state.preferencesHydrated
    ? state.listArtClickToEnlarge
    : localStorage.getItem(LS_LIST_ART_ENLARGE) !== '0';
  el.toggleListArtEnlarge.checked = listArtEnlargeOn;
  setListArtClickToEnlarge(listArtEnlargeOn, { persist: false });

  // Restore sidebar state for initial view (list, default showing).
  const sidebarStorageKey = initialCollectionView === 'grid' ? LS_SIDEBAR_COLLAPSED_GRID : LS_SIDEBAR_COLLAPSED_LIST;
  const defaultSidebarCollapsed = initialCollectionView === 'grid';
  const sidebarStored = localStorage.getItem(sidebarStorageKey);
  document.body.classList.toggle('sidebar-collapsed', sidebarStored === null ? defaultSidebarCollapsed : sidebarStored === '1');
  document.body.classList.toggle('collection-view-grid', initialCollectionView === 'grid');
  document.body.classList.toggle('view-grid', initialCollectionView === 'grid');

  // Restore reserved sidebar space toggle.
  const reserveSidebarSpaceOn = state.preferencesHydrated
    ? state.reserveSidebarSpace
    : localStorage.getItem(LS_RESERVE_SIDEBAR_SPACE) === '1';
  el.toggleReserveSidebarSpace.checked = reserveSidebarSpaceOn;
  setReserveSidebarSpace(reserveSidebarSpaceOn, { persist: false });

  // Restore seasonal auto-theme toggle.
  el.toggleGrinchMode.checked = state.grinchMode;
  setGrinchMode(state.grinchMode, { persist: false });

  if (el.toggleAccentPeriod) {
    el.toggleAccentPeriod.checked = state.accentPeriod;
  }
  setAccentPeriod(state.accentPeriod, { persist: false });
  syncWrappedNameSettingsInput();
  initEarlyWrappedSettingsUi();

  restoreContentWidthSettings();

  // Restore debug controls toggle.
  const debugOn = localStorage.getItem(LS_DEBUG_CONTROLS) === '1';
  el.toggleDebugControls.checked = debugOn;
  setDebugMode(debugOn);

  // Restore U-buttons state for initial view (list, default hidden).
  // Suppress CSS transitions for the initial state so there's no slide-in on load.
  state.uButtons = loadUButtons();
  const uButtonsStorageKey = initialCollectionView === 'grid' ? LS_U_BUTTONS_ENABLED_GRID : LS_U_BUTTONS_ENABLED_LIST;
  const uButtonsStored = localStorage.getItem(uButtonsStorageKey);
  const uButtonsOn = uButtonsStored === null ? false : uButtonsStored !== '0';
  setUButtons(uButtonsOn);
  renderUButtonBar();
  initUButtons();

  // Restore header scroll behavior.
  const headerScrollStored = state.preferencesHydrated
    ? state.headerScrollMode
    : localStorage.getItem(LS_HEADER_SCROLL) ?? 'smart';
  setHeaderScrollMode(headerScrollStored, { persist: false });

  el.selectHeaderScroll.addEventListener('change', () => {
    setHeaderScrollMode(el.selectHeaderScroll.value);
  });

  // Restore show-wipe-db toggle.
  const showWipeOn = localStorage.getItem(LS_SHOW_WIPE_DB) === '1';
  el.toggleShowWipeDb.checked = showWipeOn;
  setShowWipeDb(showWipeOn);

  el.toggleShowRepeatsField.addEventListener('change', () => {
    setShowRepeatsField(el.toggleShowRepeatsField.checked);
  });
  el.toggleShowPriorityField.addEventListener('change', () => {
    setShowPriorityField(el.toggleShowPriorityField.checked);
  });
  el.toggleShowRefetchArt.addEventListener('change', () => {
    setShowRefetchArtButton(el.toggleShowRefetchArt.checked);
  });
  el.toggleShowPlannedAtField.addEventListener('change', () => {
    setShowPlannedAtField(el.toggleShowPlannedAtField.checked);
  });
  el.toggleListArtEnlarge.addEventListener('change', () => {
    setListArtClickToEnlarge(el.toggleListArtEnlarge.checked);
  });
  el.toggleReserveSidebarSpace.addEventListener('change', () => {
    setReserveSidebarSpace(el.toggleReserveSidebarSpace.checked);
  });
  el.toggleGrinchMode.addEventListener('change', () => {
    setGrinchMode(el.toggleGrinchMode.checked);
  });
  if (el.toggleAccentPeriod) {
    el.toggleAccentPeriod.addEventListener('change', () => {
      setAccentPeriod(el.toggleAccentPeriod.checked);
    });
  }
  if (el.inputWrappedName) {
    const commitWrappedName = () => {
      void persistWrappedName(el.inputWrappedName.value);
    };
    el.inputWrappedName.addEventListener('input', () => {
      setWrappedName(el.inputWrappedName.value, { syncInput: false });
    });
    el.inputWrappedName.addEventListener('change', commitWrappedName);
    el.inputWrappedName.addEventListener('blur', commitWrappedName);
    el.inputWrappedName.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitWrappedName();
    });
  }
  const commitContentWidth = () => {
    if (!setContentWidthPx(el.inputContentWidth.value)) {
      el.inputContentWidth.focus();
    }
  };
  el.inputContentWidth.addEventListener('change', commitContentWidth);
  el.inputContentWidth.addEventListener('blur', commitContentWidth);
  el.inputContentWidth.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commitContentWidth();
  });
  const nudgeContentWidth = delta => {
    const current = Number.parseInt(el.inputContentWidth.value.trim(), 10);
    const base = Number.isInteger(current) ? current : state.contentWidthPx;
    const next = getSteppedContentWidthPx(base, delta);
    el.inputContentWidth.value = String(next);
    commitContentWidth();
    el.inputContentWidth.focus();
  };
  el.btnContentWidthUp.addEventListener('click', () => nudgeContentWidth(100));
  el.btnContentWidthDown.addEventListener('click', () => nudgeContentWidth(-100));
  el.toggleShowWipeDb.addEventListener('change', () => setShowWipeDb(el.toggleShowWipeDb.checked));
  el.btnReplayWelcomeTour?.addEventListener('click', () => {
    closeSettings();
    window.dispatchEvent(new CustomEvent('welcome-tour:replay'));
  });
  el.btnRemoveWelcomeSamples?.addEventListener('click', () => {
    void removeWelcomeSampleAlbums();
  });
  refreshWelcomeTourSettings().catch(() => {});
  el.btnClearLocalStorage.addEventListener('click', clearLocalStorage);
  el.btnWipeDb.addEventListener('click', wipeDatabase);
  window.addEventListener('resize', () => {
    document.body.classList.add('layout-resizing');
    syncAppShellLayout();
    if (layoutResizeTimeout) clearTimeout(layoutResizeTimeout);
    layoutResizeTimeout = setTimeout(() => {
      document.body.classList.remove('layout-resizing');
      layoutResizeTimeout = null;
    }, 120);
  });
  syncAppShellLayout();
}

async function init() {
  const launchAlbumId = getLaunchAlbumId();
  try {
    await fetchPreferences();
  } catch (error) {
    console.error('Failed to load global preferences:', error);
    state.preferencesHydrated = false;
    state.complexStatuses = DEFAULT_COMPLEX_STATUSES.map(cs => ({ ...cs, statuses: [...cs.statuses] }));
    state.grinchMode = false;
    state.accentPeriod = true;
    state.earlyWrapped = false;
    state.seasonalThemeHistory = {};
  }
  if (state.preferencesHydrated) {
    try {
      await migrateLocalStoragePreferencesToServer();
    } catch (error) {
      console.error('Failed to migrate local preferences:', error);
    }
  }
  const defaultStatusFilter = state.complexStatuses.find(cs => cs.id === 'cs_listened')?.id ?? 'completed';

  if (!state.savedFilterPreset && !localStorage.getItem(FILTER_PRESET_KEY)) {
    saveDefaultFilterPreset(defaultStatusFilter);
  }

  // Apply saved filter preset if one exists.
  const savedPreset = state.savedFilterPreset || localStorage.getItem(FILTER_PRESET_KEY);
  if (savedPreset) {
    try {
      const { filters, sort } = typeof savedPreset === 'string'
        ? JSON.parse(savedPreset)
        : savedPreset;
      state.filters = { ...state.filters, ...filters };
      state.sort    = normalizeSortState({ ...state.sort, ...sort });
      state.savedFilterPreset = {
        filters: { ...state.filters },
        sort: { ...state.sort },
      };
    } catch {
      const defaultPreset = getDefaultFilterPreset(defaultStatusFilter);
      state.filters = { ...state.filters, ...defaultPreset.filters };
      state.sort = { ...state.sort, ...defaultPreset.sort };
      saveDefaultFilterPreset(defaultStatusFilter);
    }
  }

  // Validate statusFilter — fall back to 'completed' if it no longer resolves.
  if (!state.complexStatuses.find(cs => cs.id === state.filters.statusFilter) &&
      !STATUS_FILTER_LABELS[state.filters.statusFilter]) {
    state.filters.statusFilter = 'completed';
  }
  if (!IMPORT_TYPE_FILTER_LABELS[state.filters.importTypeFilter]) {
    state.filters.importTypeFilter = 'all';
  }
  const startupNavigation = syncNavigationFromLocation({ historyMode: 'replace', activate: false });
  initEvents();
  initSettings();
  initComplexStatuses();
  initTooltips();
  syncFilterControlsFromState();
  renderStatusDropdown();
  renderImportTypeDropdown();
  updateSortOrderBtn();    // set initial arrow icon on the sort direction button
  updateSortFieldBtn();    // set initial label on the sort field button
  updateStatusFilterBtn(); // set initial label on the status filter button
  updateImportTypeFilterBtn();
  updateRatedFilterBtn();  // set initial icon on the rated filter button
  updateTypeFilterBtn();   // set initial label on the type filter button
  updateRestoreBtn();      // disable restore button if no preset saved yet
  initHeaderScrollTracking();
  initWelcomeTourEvents();

  window.addEventListener('popstate', () => {
    syncNavigationFromLocation({ historyMode: 'replace', activate: true });
  });

  if (startupNavigation.navigation.page === 'collection') {
    applyCollectionViewState(startupNavigation.navigation.collectionView, {
      load: false,
      suppressTransitions: true,
    });
    await runStartupFlow({
      page: startupNavigation.navigation.page,
      collectionView: startupNavigation.navigation.collectionView,
      sidebar: document.querySelector('.sidebar'),
      launchAlbumId,
      loadAlbums,
      revealSidebarForStartup,
      maybeClearLaunchAlbumParam,
      openLaunchAlbumModal,
      openEditModal,
    });
    await maybeStartWelcomeTour();
    return;
  }

  await setPage(startupNavigation.navigation.page, {
    historyMode: null,
    year: startupNavigation.navigation.wrappedYear,
    initial: true,
  });
  maybeClearLaunchAlbumParam();
  await maybeStartWelcomeTour();
}

init();
