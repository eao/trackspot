import { apiFetch, state, DEFAULT_COMPLEX_STATUSES } from './state.js';
import { render, loadAlbums, clearAlbumPageCache } from './render.js';
import { setPage } from './navigation.js';
import { animateGridSidebarToggle, applyCollectionViewState, syncFilterControlsFromState, updateImportTypeFilterBtn, updateRatedFilterBtn, updateRestoreBtn, updateSortFieldBtn, updateSortOrderBtn, updateStatusFilterBtn, updateTypeFilterBtn } from './sidebar.js';
import { openLogModal, closeModal } from './modal.js';
import {
  applyThemeByName,
  closePersonalization,
  closeSettings,
  openPersonalization,
  openSettings,
  refreshWelcomeTourSettings,
  restorePersonalizationFromStorage,
  setEarlyWrappedEnabled,
  setQuickActionsToolbarVisibilityMode,
  setUButtons,
} from './settings.js';
import { applyPreferencesToState } from './preferences.js';
import { invalidateDashboardCache, refreshActiveDashboardPage } from './dashboard.js';
import { syncAppShellLayout } from './app-shell.js';

const MOBILE_WARNING_WIDTH = 780;
const LOCK_HEARTBEAT_MS = 10000;
const TOP_BAR_TOUR_ANCHOR = '#btn-view-grid';
const WELCOME_TOUR_ALBUM_ACTIONS_IMAGE_SRC = '/assets/welcome/album-actions.png';

let welcomeTourAssetPreloadPromise = null;

function ensureWelcomeTourAssetPreloadLink(src) {
  if (document.querySelector(`link[rel="preload"][href="${src}"]`)) return;
  const link = document.createElement('link');
  link.setAttribute('rel', 'preload');
  link.setAttribute('as', 'image');
  link.setAttribute('href', src);
  link.dataset.welcomeTourAsset = 'true';
  document.head.appendChild(link);
}

function preloadWelcomeTourAssets() {
  ensureWelcomeTourAssetPreloadLink(WELCOME_TOUR_ALBUM_ACTIONS_IMAGE_SRC);
  if (welcomeTourAssetPreloadPromise || typeof Image !== 'function') {
    return welcomeTourAssetPreloadPromise || Promise.resolve();
  }

  welcomeTourAssetPreloadPromise = new Promise(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.src = WELCOME_TOUR_ALBUM_ACTIONS_IMAGE_SRC;
    if (typeof image.decode === 'function') {
      image.decode().then(resolve).catch(resolve);
      return;
    }
    resolve();
  });
  return welcomeTourAssetPreloadPromise;
}

function nextAnimationFrame() {
  return new Promise(resolve => {
    const raf = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
    raf(() => resolve());
  });
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function formatDemoDate(year, month, day) {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function getPastOrTodayDemoDate(now, month, day) {
  const year = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const isFutureInCurrentYear = month > currentMonth
    || (month === currentMonth && day > currentDay);
  return isFutureInCurrentYear
    ? formatDemoDate(year, currentMonth, currentDay)
    : formatDemoDate(year, month, day);
}

function getDemoAlbumDates(now = new Date()) {
  return {
    year: now.getFullYear(),
    spotifyListenedAt: getPastOrTodayDemoDate(now, 1, 15),
    manualListenedAt: getPastOrTodayDemoDate(now, 2, 1),
  };
}

const DEMO_DATES = getDemoAlbumDates();
const DEMO_YEAR = DEMO_DATES.year;

const DEMO_ALBUMS = [
  {
    id: -1001,
    spotify_url: 'spotify:album:4pj54JwPaS9XsSRTTgAWZg',
    spotify_album_id: null,
    share_url: null,
    album_name: 'Placeholder Spotify Import',
    album_type: 'ALBUM',
    artists: [{
      id: null,
      name: 'Example Spotify Artist',
      share_url: null,
      avatar_url: null,
      manual_link: 'spotify:artist:3MKCzCnpzw3TjUYs2v7vDA',
    }],
    artist_names: ['Example Spotify Artist'],
    release_date: '1962-01-01',
    release_year: 1962,
    label: 'Example Label',
    genres: ['Placeholder'],
    track_count: 3,
    duration_ms: 2101839,
    copyright: [],
    is_pre_release: 0,
    image_path: 'assets/welcome/placeholder-spotify-album.jpg',
    status: 'completed',
    rating: 92,
    notes: 'This placeholder album behaves like a import from Spotify via the Spicetify extension. Imported metadata is read-only, but your listening details stay editable.',
    planned_at: null,
    listened_at: DEMO_DATES.spotifyListenedAt,
    repeats: 0,
    priority: 0,
    source: 'spotify',
    album_link: 'spotify:album:4pj54JwPaS9XsSRTTgAWZg',
    artist_link: null,
    welcome_sample_key: 'spotify-placeholder',
  },
  {
    id: -1002,
    spotify_url: null,
    spotify_album_id: null,
    share_url: null,
    album_name: 'Placeholder Manual Log',
    album_type: 'ALBUM',
    artists: [{
      id: null,
      name: 'Example Manual Artist',
      share_url: null,
      avatar_url: null,
      manual_link: 'https://en.wikipedia.org/wiki/Musician',
    }],
    artist_names: ['Example Manual Artist'],
    release_date: '2024-04-01',
    release_year: 2024,
    label: null,
    genres: [],
    track_count: 10,
    duration_ms: 2420000,
    copyright: [],
    is_pre_release: 0,
    image_path: 'assets/welcome/placeholder-manual-album.jpg',
    status: 'dropped',
    rating: null,
    notes: 'Manual logs are albums you have entered yourself. You can edit their title, artist, dates, links, art, etc.',
    planned_at: null,
    listened_at: DEMO_DATES.manualListenedAt,
    repeats: 0,
    priority: 1,
    source: 'manual',
    album_link: 'https://en.wikipedia.org/wiki/Album',
    artist_link: 'https://en.wikipedia.org/wiki/Musician',
    welcome_sample_key: 'manual-placeholder',
  },
];

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Trackspot',
    body: 'This welcome tour will show you how to navigate around Trackspot. You can skip to the end of the tour whenever you want.',
    placement: 'center',
    effect: prepareCollectionList,
  },
  {
    id: 'theme-basic',
    title: 'Themes',
    body: 'Trackspot can be outfitted with various themes. It can be calm...',
    placement: 'theme',
    themeName: 'Basic Blue',
    opacity: 1,
    effect: prepareThemeStep,
  },
  {
    id: 'theme-dark',
    title: 'Themes',
    body: 'Elegant...',
    placement: 'theme',
    themeName: 'Dark Times',
    opacity: 1,
    effect: prepareThemeStep,
  },
  {
    id: 'theme-borealis',
    title: 'Themes',
    body: 'Striking...',
    placement: 'theme',
    themeName: 'Borealis Tunic',
    opacity: 0.35,
    effect: prepareThemeStep,
  },
  {
    id: 'theme-archives',
    title: 'Themes',
    body: 'Or, uh, nostalgic.',
    placement: 'theme',
    themeName: 'Found in the Archives',
    opacity: 1,
    effect: prepareThemeStep,
  },
  {
    id: 'theme-reset',
    title: 'Themes',
    body: 'But let\'s stick with calm for now. You can pick from these themes and more later.',
    placement: 'theme',
    themeName: 'Basic Blue',
    opacity: 1,
    effect: prepareThemeStep,
  },
  {
    id: 'list',
    title: 'List View',
    body: 'List view shows your data in rows. This allows for a lot of information to be displayed, including album duration, personal notes, and date logged.',
    anchor: '#btn-view-list',
    highlight: '#btn-view-list',
    effect: prepareCollectionList,
  },
  {
    id: 'grid',
    title: 'Grid View',
    body: 'Grid view is more compact, prioritizing the album art.',
    anchor: '#btn-view-grid',
    highlight: '#btn-view-grid',
    effect: prepareGridStep,
  },
  {
    id: 'sidebar',
    title: 'Sidebar',
    body: 'The sidebar has different options for searching, filtering, and sorting. It can be toggled at any time. Press the sidebar toggle button at least once to continue.',
    anchor: TOP_BAR_TOUR_ANCHOR,
    highlight: '#btn-toggle-sidebar',
    highlightAction: 'sidebar-toggle',
    requireHighlightAction: true,
    effect: prepareSidebarStep,
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions Toolbar',
    body: 'If you don\'t want to have the full sidebar out, you can use the quick actions toolbar for access to some key controls. Toggle it at least once before continuing.',
    anchor: TOP_BAR_TOUR_ANCHOR,
    highlight: '#btn-toggle-u-buttons',
    highlightAction: 'quick-actions-toggle',
    requireHighlightAction: true,
    effect: prepareQuickActionsStep,
  },
  {
    id: 'log-album-button',
    title: 'Log Album Button',
    body: 'This button opens the Log Album window, which lets you manually enter details for an album that isn\'t on Spotify. Press the button to continue.',
    anchor: '#btn-log-new',
    highlight: '#btn-log-new',
    highlightAction: 'log-album-open',
    requireHighlightAction: true,
    advanceOnHighlightAction: true,
    effect: prepareLogAlbumButtonStep,
  },
  {
    id: 'manual-modal',
    title: 'Manual Album Log',
    body: 'This is what the window for manually logging albums looks like. It looks like a lot to fill in, but almost all fields are optional. And for Spotify imports, the majority of this information gets auto-filled.',
    anchor: TOP_BAR_TOUR_ANCHOR,
    effect: prepareManualModalStep,
  },
  {
    id: 'settings-button',
    title: 'Settings & More Button',
    body: 'This button opens the Settings & More window, which contains settings... and more. Press the button to continue.',
    anchor: '#btn-settings',
    highlight: '#btn-settings',
    highlightAction: 'settings-open',
    requireHighlightAction: true,
    advanceOnHighlightAction: true,
    effect: prepareCollectionGrid,
  },
  {
    id: 'settings',
    title: 'Settings & More',
    body: 'The Settings & More window contains a ton of different settings as well as the controls for export/import functionality.',
    anchor: TOP_BAR_TOUR_ANCHOR,
    effect: prepareSettingsStep,
  },
  {
    id: 'personalization-button',
    title: 'Personalization Button',
    body: 'This button opens the Personalization window, which contains the controls for themes, color schemes, background images, opacity values, and custom CSS. Press the button to continue.',
    anchor: '#btn-personalization',
    highlight: '#btn-personalization',
    highlightAction: 'personalization-open',
    requireHighlightAction: true,
    advanceOnHighlightAction: true,
    effect: prepareCollectionGrid,
  },
  {
    id: 'personalization',
    title: 'Personalization',
    body: 'You can customize Trackspot to look nearly however you want. The easiest way to change the look of the app is by switching themes. A theme is a preset containing a color scheme, optional background image, and interface opacity values, letting you change everything in one fell swoop. You can use any of the included themes or make your own.',
    anchor: TOP_BAR_TOUR_ANCHOR,
    effect: preparePersonalizationStep,
  },
  {
    id: 'stats',
    title: 'Stats',
    body: 'Once you have some real albums, the Stats page will let you look at the shape of your library.',
    anchor: '#btn-stats',
    highlight: '#btn-stats',
    effect: prepareStatsStep,
  },
  {
    id: 'wrapped',
    title: 'Wrapped',
    body: 'Wrapped is a year-end wrapup that unlocks on January 1 of the following year. Log a bunch this year so you can share all your activity with your friends!',
    anchor: '#btn-wrapped',
    highlight: '#btn-wrapped',
    effect: prepareWrappedStep,
  },
  {
    id: 'penultimate',
    title: 'Get Ready to Start',
    body: 'We\'re almost at the end. To get you started, you can add these two placeholder albums to play around with, or just start with an empty collection.',
    placement: 'center',
    choice: true,
    effect: prepareCollectionList,
  },
  {
    id: 'spicetify',
    title: 'Spicetify Setup',
    body: `Trackspot is most useful when used with its Spicetify extension, which adds Trackspot functionality directly into Spotify.<img class="welcome-tour-inline-image" src="${WELCOME_TOUR_ALBUM_ACTIONS_IMAGE_SRC}" alt="Trackspot album actions in Spotify">Install Spicetify <a href="https://spicetify.app/#install" target="_blank" rel="noopener noreferrer">here</a>, then install the Trackspot extension from the Spicetify Marketplace.<br><br>For more detailed instructions, see the GitHub repo <a href="https://github.com/eao/trackspot#spicetify-extension" target="_blank" rel="noopener noreferrer">here</a>.`,
    placement: 'center',
    final: true,
    effect: prepareCollectionList,
  },
];

let overlay = null;
let card = null;
let highlightLayer = null;
let currentStepIndex = 0;
let snapshot = null;
let skippedToFinal = false;
let heartbeatTimer = null;
let statusCache = null;
let inertSnapshots = [];
let heartbeatGeneration = 0;
let isFinishingTour = false;
let isStepTransitioning = false;
let stepTransitionToken = 0;
let stepHighlightActionComplete = false;
let completedRequiredStepIds = new Set();
let endingSampleChoice = null;
let focusRestoreTarget = null;
let eventsInitialized = false;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getStorageSnapshot() {
  const values = {};
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('ts_')) {
      values[key] = localStorage.getItem(key);
    }
  });
  return values;
}

function restoreStorageSnapshot(values = {}) {
  Object.keys(localStorage)
    .filter(key => key.startsWith('ts_'))
    .forEach(key => localStorage.removeItem(key));
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      localStorage.setItem(key, value);
    }
  });
}

function getAlbumListMeta() {
  return {
    totalCount: DEMO_ALBUMS.length,
    filteredCount: DEMO_ALBUMS.length,
    currentPage: 1,
    totalPages: 1,
    startIndex: 0,
    endIndex: DEMO_ALBUMS.length,
    isPaged: false,
    perPage: null,
    pageCount: DEMO_ALBUMS.length,
    trackedListenedMs: DEMO_ALBUMS.reduce((sum, album) => sum + (album.duration_ms || 0), 0),
  };
}

function getAlbumLoggedSortValue(album) {
  return album.listened_at || album.planned_at || '';
}

function getSortedDemoAlbums() {
  return DEMO_ALBUMS
    .map(album => ({ ...cloneJson(album) }))
    .sort((a, b) => getAlbumLoggedSortValue(b).localeCompare(getAlbumLoggedSortValue(a)));
}

function setDemoAlbums() {
  state.albums = getSortedDemoAlbums();
  state.albumDetailsCache = Object.fromEntries(state.albums.map(album => [album.id, album]));
  state.albumListMeta = getAlbumListMeta();
  state.albumsLoaded = true;
  state.albumsLoading = false;
  invalidateDashboardCache();
  render();
}

function neutralizeFilters() {
  const allStatusFilter = state.complexStatuses.find(cs => cs.id === 'cs_all')?.id
    ?? DEFAULT_COMPLEX_STATUSES.find(cs => cs.id === 'cs_all')?.id
    ?? 'cs_all';
  state.filters = {
    search: '',
    artist: '',
    artistMatchExact: false,
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
  state.sort = {
    field: 'date_listened_planned',
    order: 'desc',
  };
  syncFilterControlsFromState();
  updateStatusFilterBtn();
  updateImportTypeFilterBtn();
  updateRatedFilterBtn();
  updateTypeFilterBtn();
  updateSortFieldBtn();
  updateSortOrderBtn();
  updateRestoreBtn();
}

function setTourSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  syncAppShellLayout();
}

function setTourReserveSidebarSpace(enabled) {
  state.reserveSidebarSpace = !!enabled;
  document.body.classList.toggle('reserve-sidebar-space', state.reserveSidebarSpace);
  syncAppShellLayout();
}

function setTourSidebarTransition(enabled) {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar instanceof HTMLElement) {
    sidebar.style.transition = enabled
      ? 'transform 0.25s ease, padding-top 0.25s ease, top 0.25s ease, opacity 0.15s ease'
      : 'none';
  }
}

function setTourSidebarNonTransformTransition() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar instanceof HTMLElement) {
    sidebar.style.transition = 'padding-top 0.25s ease, top 0.25s ease, opacity 0.15s ease';
  }
}

async function prepareCollectionView(view, options = {}) {
  const {
    sidebarCollapsed = true,
    uButtonsEnabled = false,
    animateSidebarChange = false,
    animateUButtonsChange = false,
  } = options;
  const wasSidebarCollapsed = document.body.classList.contains('sidebar-collapsed');
  const wasUButtonsEnabled = document.body.classList.contains('u-buttons-enabled');
  const shouldAnimateSidebarChange = animateSidebarChange && wasSidebarCollapsed !== sidebarCollapsed;
  const shouldAnimateUButtonsChange = animateUButtonsChange && wasUButtonsEnabled !== uButtonsEnabled;
  const shouldAnimateAnyChange = shouldAnimateSidebarChange || shouldAnimateUButtonsChange;

  closeSettings();
  closePersonalization();
  closeModal();
  await setPage('collection', { historyMode: null, skipCollectionLoad: true, suppressTransitions: true });
  applyCollectionViewState(view, { load: false, suppressTransitions: true, preservePage: true });
  if (shouldAnimateAnyChange) {
    setTourSidebarTransition(false);
    setTourSidebarCollapsed(wasSidebarCollapsed);
    setUButtons(wasUButtonsEnabled);
    setDemoAlbums();
    await nextAnimationFrame();
    const sidebar = document.querySelector('.sidebar');
    if (sidebar instanceof Element) {
      void sidebar.getBoundingClientRect();
    }
  }

  if (shouldAnimateSidebarChange && view === 'grid') {
    if (shouldAnimateUButtonsChange) {
      setTourSidebarNonTransformTransition();
      setUButtons(uButtonsEnabled);
    }
    animateGridSidebarToggle();
  } else if (shouldAnimateSidebarChange) {
    setTourSidebarTransition(true);
    setTourSidebarCollapsed(sidebarCollapsed);
  } else {
    setTourSidebarCollapsed(sidebarCollapsed);
  }

  if (!shouldAnimateUButtonsChange || shouldAnimateSidebarChange) {
    setUButtons(uButtonsEnabled);
  } else {
    setTourSidebarTransition(true);
    setUButtons(uButtonsEnabled);
  }

  if (shouldAnimateAnyChange) {
    window.setTimeout(() => {
      setTourSidebarTransition(true);
      window.requestAnimationFrame(() => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar instanceof HTMLElement) {
          sidebar.style.transition = '';
        }
      });
    }, 1050);
  } else {
    setDemoAlbums();
  }
}

async function prepareCollectionList(options = {}) {
  await prepareCollectionView('list', options);
}

async function prepareCollectionGrid(options = {}) {
  await prepareCollectionView('grid', options);
}

async function prepareGridStep(step, context = {}) {
  await prepareCollectionGrid({
    animateSidebarChange: context.direction < 0 && context.previousStep?.id === 'sidebar',
    sidebarCollapsed: true,
    uButtonsEnabled: false,
  });
}

async function prepareThemeStep(step) {
  closeSettings();
  closePersonalization();
  closeModal();
  await setPage('collection', { historyMode: null, skipCollectionLoad: true, suppressTransitions: true });
  applyCollectionViewState('list', { load: false, suppressTransitions: true, preservePage: true });
  setTourSidebarCollapsed(true);
  setUButtons(false);
  setDemoAlbums();
  await applyThemeByName(step.themeName, { persist: false });
}

async function prepareSidebarStep() {
  await prepareCollectionGrid({
    animateSidebarChange: true,
    animateUButtonsChange: true,
    sidebarCollapsed: false,
    uButtonsEnabled: false,
  });
}

async function prepareQuickActionsStep() {
  await prepareCollectionGrid({
    animateSidebarChange: true,
    animateUButtonsChange: true,
    sidebarCollapsed: false,
    uButtonsEnabled: true,
  });
}

async function prepareLogAlbumButtonStep() {
  const sidebarCollapsed = document.body.classList.contains('sidebar-collapsed');
  const quickActionsEnabled = document.body.classList.contains('u-buttons-enabled');
  await prepareCollectionGrid({
    animateSidebarChange: !sidebarCollapsed,
    animateUButtonsChange: quickActionsEnabled,
    sidebarCollapsed: true,
    uButtonsEnabled: false,
  });
}

async function prepareManualModalStep() {
  await prepareCollectionGrid();
  openLogModal();
}

async function prepareSettingsStep() {
  await prepareCollectionGrid();
  openSettings();
}

async function preparePersonalizationStep() {
  await prepareCollectionGrid();
  openPersonalization();
}

async function prepareStatsStep() {
  closeSettings();
  closePersonalization();
  closeModal();
  setUButtons(false);
  await setPage('stats', { historyMode: null });
}

async function prepareWrappedStep() {
  closeSettings();
  closePersonalization();
  closeModal();
  setUButtons(false);
  await setPage('wrapped', { historyMode: null, year: DEMO_YEAR });
}

function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'welcome-tour-overlay';
  overlay.className = 'welcome-tour-overlay';
  highlightLayer = document.createElement('div');
  highlightLayer.className = 'welcome-tour-highlight-layer';
  card = document.createElement('div');
  card.className = 'welcome-tour-card';
  overlay.appendChild(highlightLayer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function captureFocusRestoreTarget() {
  const activeElement = document.activeElement;
  focusRestoreTarget = activeElement instanceof HTMLElement ? activeElement : null;
}

function setAppInert(enabled) {
  if (!enabled) {
    inertSnapshots.forEach(({ element, inert, ariaHidden }) => {
      element.inert = inert;
      if (ariaHidden === null) {
        element.removeAttribute('aria-hidden');
      } else {
        element.setAttribute('aria-hidden', ariaHidden);
      }
    });
    inertSnapshots = [];
    document.removeEventListener('keydown', handleTourKeydown, true);
    return;
  }

  inertSnapshots = Array.from(document.body.children)
    .filter(element => element !== overlay)
    .map(element => ({
      element,
      inert: !!element.inert,
      ariaHidden: element.getAttribute('aria-hidden'),
    }));

  inertSnapshots.forEach(({ element }) => {
    element.inert = true;
    element.setAttribute('aria-hidden', 'true');
  });
  document.addEventListener('keydown', handleTourKeydown, true);
}

function getTourFocusableElements() {
  if (!overlay) return [];
  return Array.from(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(element => !element.disabled && element.getAttribute('aria-hidden') !== 'true');
}

function focusTourControl() {
  const focusable = getTourFocusableElements();
  const preferred = card?.querySelector('[data-action="next"], [data-action="continue"], [data-action="finish"], [data-action="samples"], [data-action="empty"]');
  if (preferred instanceof HTMLElement && !preferred.disabled) {
    preferred.focus();
    return;
  }
  focusable[0]?.focus();
}

function isRestorableFocusTarget(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element === document.body || element === document.documentElement) return false;
  if (element.hasAttribute('disabled') || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
  if (element.inert || element.closest('[inert], [hidden], .hidden, [aria-hidden="true"]')) return false;
  return true;
}

function getFallbackFocusTarget() {
  const page = state.navigation?.page || 'collection';
  const selectors = [
    page === 'stats' ? '#btn-stats' : null,
    page === 'wrapped' ? '#btn-wrapped' : null,
    page === 'collection' && (state.view || state.navigation?.collectionView) === 'grid' ? '#btn-view-grid' : null,
    page === 'collection' ? '#btn-view-list' : null,
    '#btn-settings',
    '.content',
    'main',
  ].filter(Boolean);

  for (const selector of selectors) {
    const target = document.querySelector(selector);
    if (isRestorableFocusTarget(target)) return target;
  }
  return null;
}

function restoreFocusAfterTour() {
  const target = isRestorableFocusTarget(focusRestoreTarget)
    ? focusRestoreTarget
    : getFallbackFocusTarget();
  focusRestoreTarget = null;
  target?.focus?.({ preventScroll: true });
}

function trapTourTab(event) {
  const focusable = getTourFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleTourKeydown(event) {
  if (!state.welcomeTour.active || !card || !overlay?.isConnected) return;
  const target = event.target instanceof Node ? event.target : null;
  const isTourSurface = target && (
    card.contains(target)
    || highlightLayer?.contains(target)
  );

  if (isTourSurface) {
    if (event.key === 'Tab') trapTourTab(event);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  focusTourControl();
}

function clearTourError() {
  card?.querySelector('.welcome-tour-error')?.remove();
}

function showTourError(message) {
  if (!card) return;
  clearTourError();
  const error = document.createElement('p');
  error.className = 'welcome-tour-note welcome-tour-error';
  error.setAttribute('role', 'alert');
  error.textContent = message || 'Something went wrong. Please try again.';
  const actions = card.querySelector('.welcome-tour-actions');
  if (actions) {
    actions.before(error);
  } else {
    card.appendChild(error);
  }
}

function chooseTourEnding(addSamplesChoice) {
  if (isStepTransitioning || isFinishingTour) return;
  endingSampleChoice = addSamplesChoice ? 'samples' : 'empty';
  void preloadWelcomeTourAssets();
  void showStep(currentStepIndex + 1);
}

function setTourControlsDisabled(disabled) {
  card?.querySelectorAll('button').forEach(button => {
    button.disabled = disabled;
  });
  highlightLayer?.querySelectorAll('.welcome-tour-highlight-interactive').forEach(highlight => {
    highlight.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    if (disabled) {
      highlight.dataset.previousTabIndex = highlight.getAttribute('tabindex') ?? '';
      highlight.tabIndex = -1;
    } else if (highlight.dataset.previousTabIndex !== undefined) {
      const previousTabIndex = highlight.dataset.previousTabIndex;
      if (previousTabIndex) {
        highlight.setAttribute('tabindex', previousTabIndex);
      } else {
        highlight.removeAttribute('tabindex');
      }
      delete highlight.dataset.previousTabIndex;
    }
  });
  card?.setAttribute('aria-busy', disabled ? 'true' : 'false');
}

function removeOverlay(options = {}) {
  const { restoreFocus = false } = options;
  overlay?.remove();
  overlay = null;
  card = null;
  highlightLayer = null;
  if (restoreFocus) {
    restoreFocusAfterTour();
  }
}

function getStepHighlightSelectors(step) {
  if (!step?.highlight) return [];
  return Array.isArray(step.highlight) ? step.highlight : [step.highlight];
}

function positionHighlights(step) {
  if (!highlightLayer) return;
  highlightLayer.innerHTML = '';
  getStepHighlightSelectors(step).forEach(selector => {
    const target = document.querySelector(selector);
    if (!(target instanceof Element)) return;
    const rect = target.getBoundingClientRect();

    const highlight = document.createElement('div');
    highlight.className = 'welcome-tour-highlight';
    if (step.highlightAction) {
      highlight.classList.add('welcome-tour-highlight-interactive');
      highlight.setAttribute('role', 'button');
      highlight.setAttribute('aria-label', target.getAttribute('title') || step.title || 'Tour action');
      highlight.tabIndex = 0;
      const runAction = event => {
        event.preventDefault();
        event.stopPropagation();
        handleHighlightAction(step);
      };
      highlight.addEventListener('click', runAction);
      highlight.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          runAction(event);
        }
      });
    }
    const pad = 6;
    highlight.style.left = `${rect.left - pad}px`;
    highlight.style.top = `${rect.top - pad}px`;
    highlight.style.width = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;
    highlightLayer.appendChild(highlight);
  });
}

function handleHighlightAction(step) {
  if (!state.welcomeTour.active || isStepTransitioning || isFinishingTour || !step?.highlightAction) return;

  if (step.highlightAction === 'sidebar-toggle') {
    if (document.body.classList.contains('collection-view-grid')) {
      animateGridSidebarToggle();
    } else {
      setTourSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
    }
  } else if (step.highlightAction === 'quick-actions-toggle') {
    setUButtons(!document.body.classList.contains('u-buttons-enabled'));
  } else if (step.highlightAction === 'log-album-open') {
    // The next step owns opening the modal; this highlight is the tour click zone.
  }

  if (step.requireHighlightAction) {
    stepHighlightActionComplete = true;
    completedRequiredStepIds.add(step.id);
    if (step.advanceOnHighlightAction) {
      void showStep(currentStepIndex + 1);
      return;
    }
    const next = card?.querySelector('[data-action="next"]');
    if (next instanceof HTMLButtonElement) {
      next.disabled = false;
    }
  } else {
    requestAnimationFrame(() => positionHighlights(step));
  }
}

function positionCard(step) {
  if (!card) return;
  card.style.removeProperty('--welcome-tour-left');
  card.style.removeProperty('--welcome-tour-top');
  card.classList.toggle('welcome-tour-card-centered', step.placement === 'center');
  card.classList.toggle('welcome-tour-card-theme', step.placement === 'theme');
  card.style.setProperty('--welcome-tour-card-bg-opacity', `${Math.round((step.opacity ?? 0.96) * 100)}%`);

  if (step.placement === 'center' || step.placement === 'theme' || !step.anchor) return;

  const anchor = document.querySelector(step.anchor);
  if (!(anchor instanceof Element)) return;
  const rect = anchor.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const gap = 14;
  let left;
  let top;

  if (anchor.closest('.header')) {
    const headerButtons = Array.from(anchor.closest('.header').querySelectorAll('button'));
    const rightmostHeaderEdge = headerButtons.reduce((right, button) => {
      const buttonRect = button.getBoundingClientRect();
      return Math.max(right, buttonRect.right);
    }, rect.right);
    left = rightmostHeaderEdge - cardRect.width;
    top = rect.bottom + gap;
  } else {
    left = rect.right + gap;
    top = rect.top + Math.max(0, (rect.height - cardRect.height) / 2);

    if (left + cardRect.width > window.innerWidth - gap) {
      left = rect.left - cardRect.width - gap;
    }
  }
  left = Math.min(left, window.innerWidth - cardRect.width - gap);
  left = Math.max(gap, left);
  top = Math.max(gap, Math.min(window.innerHeight - cardRect.height - gap, top));
  card.style.setProperty('--welcome-tour-left', `${left}px`);
  card.style.setProperty('--welcome-tour-top', `${top}px`);
}

function renderWarning() {
  positionHighlights(null);
  card.className = 'welcome-tour-card welcome-tour-card-centered';
  card.style.setProperty('--welcome-tour-card-bg-opacity', '96%');
  card.innerHTML = `
    <div class="welcome-tour-kicker">Desktop recommended</div>
    <h2>Trackspot is built for a desktop-sized window.</h2>
    <p>This tour can run here, but some steps may not display correctly on smaller screens.</p>
    <div class="welcome-tour-actions">
      <button class="btn btn-ghost" data-action="later">Show me the tour next visit</button>
      <button class="btn btn-ghost welcome-tour-skip" data-action="skip">Skip tour</button>
      <button class="btn btn-primary" data-action="continue">Continue tour</button>
    </div>
  `;
  card.querySelector('[data-action="continue"]').addEventListener('click', () => showStep(0));
  card.querySelector('[data-action="skip"]').addEventListener('click', () => skipTour());
  card.querySelector('[data-action="later"]').addEventListener('click', () => finishTour({ restoreOnly: true }));
  focusTourControl();
}

function renderStartupLoading() {
  positionHighlights(null);
  card.className = 'welcome-tour-card welcome-tour-card-centered';
  card.style.setProperty('--welcome-tour-card-bg-opacity', '96%');
  card.setAttribute('aria-busy', 'true');
  card.innerHTML = `
    <div class="welcome-tour-kicker">Welcome tour</div>
    <h2>Starting tour</h2>
    <p>Preparing a safe tour session...</p>
    <div class="welcome-tour-actions">
      <button class="btn btn-primary" disabled>Starting...</button>
    </div>
  `;
}

function renderStartupFailure(message) {
  positionHighlights(null);
  card.className = 'welcome-tour-card welcome-tour-card-centered';
  card.style.setProperty('--welcome-tour-card-bg-opacity', '96%');
  card.setAttribute('aria-busy', 'false');
  card.innerHTML = `
    <div class="welcome-tour-kicker">Welcome tour</div>
    <h2>Tour could not start</h2>
    <p class="welcome-tour-note welcome-tour-error" role="alert"></p>
    <div class="welcome-tour-actions">
      <button class="btn btn-primary" data-action="close">Close</button>
    </div>
  `;
  const error = card.querySelector('.welcome-tour-error');
  if (error) error.textContent = message || 'Something went wrong. Please try again.';
  card.querySelector('[data-action="close"]')?.addEventListener('click', () => removeOverlay({ restoreFocus: true }));
  focusTourControl();
}

function getMissingRequiredHighlightSelectors(step) {
  if (!step?.requireHighlightAction) return [];
  return getStepHighlightSelectors(step)
    .filter(selector => !(document.querySelector(selector) instanceof Element));
}

function renderStepFailure(step, message) {
  positionHighlights(null);
  card.className = 'welcome-tour-card welcome-tour-card-centered';
  card.style.setProperty('--welcome-tour-card-bg-opacity', '96%');
  card.setAttribute('aria-busy', 'false');
  card.innerHTML = `
    <div class="welcome-tour-kicker">Welcome tour</div>
    <h2>Step could not load</h2>
    <p class="welcome-tour-note welcome-tour-error" role="alert"></p>
    <div class="welcome-tour-actions">
      <button class="btn btn-ghost welcome-tour-skip" data-action="skip">Skip tour</button>
      <button class="btn btn-ghost" data-action="back"${currentStepIndex === 0 ? ' disabled' : ''}>Back</button>
      <button class="btn btn-primary" data-action="retry">Retry</button>
    </div>
  `;
  const error = card.querySelector('.welcome-tour-error');
  if (error) {
    error.textContent = message || `Could not prepare "${step?.title || 'this step'}".`;
  }
  card.querySelector('[data-action="skip"]')?.addEventListener('click', () => skipTour());
  card.querySelector('[data-action="back"]')?.addEventListener('click', () => showStep(currentStepIndex - 1));
  card.querySelector('[data-action="retry"]')?.addEventListener('click', () => showStep(currentStepIndex));
  focusTourControl();
}

function renderStep(step) {
  const progress = `${currentStepIndex + 1}/${TOUR_STEPS.length}`;
  const sampleCount = statusCache?.sampleCount ?? state.welcomeTour.sampleCount ?? 0;
  const alreadyAdded = sampleCount > 0;
  const sampleWarning = alreadyAdded
    ? '<p class="welcome-tour-note">Adding sample albums again will delete any existing welcome samples and add fresh copies.</p>'
    : '';
  const choiceActions = `${sampleWarning}<div class="welcome-tour-actions">
        <button class="btn btn-ghost" data-action="back">Back</button>
        <button class="btn btn-primary" data-action="samples">Add placeholders</button>
        <button class="btn btn-primary" data-action="empty">Start empty</button>
      </div>`;
  const normalActions = `<div class="welcome-tour-actions">
      <button class="btn btn-ghost welcome-tour-skip" data-action="skip">Skip tour</button>
      <button class="btn btn-ghost" data-action="back"${currentStepIndex === 0 ? ' disabled' : ''}>Back</button>
      <button class="btn btn-primary" data-action="next"${step.requireHighlightAction && !stepHighlightActionComplete ? ' disabled' : ''}>Next</button>
    </div>`;
  const choiceStepActions = `<div class="welcome-tour-cta">
      ${choiceActions}
    </div>`;
  const finalStepActions = `<div class="welcome-tour-cta">
      <div class="welcome-tour-actions">
        <button class="btn btn-ghost" data-action="back">Back</button>
        <button class="btn btn-primary" data-action="finish"${endingSampleChoice ? '' : ' disabled'}>Finish tour</button>
      </div>
    </div>`;

  positionHighlights(null);
  card.className = 'welcome-tour-card';
  card.innerHTML = `
    <div class="welcome-tour-kicker">Step ${progress}</div>
    <h2>${step.title}</h2>
    <p>${step.body}</p>
    ${step.final ? finalStepActions : (step.choice ? choiceStepActions : normalActions)}
  `;

  card.querySelector('[data-action="back"]')?.addEventListener('click', () => showStep(currentStepIndex - 1));
  card.querySelector('[data-action="next"]')?.addEventListener('click', () => showStep(currentStepIndex + 1));
  card.querySelector('[data-action="skip"]')?.addEventListener('click', () => skipTour());
  card.querySelector('[data-action="empty"]')?.addEventListener('click', () => chooseTourEnding(false));
  card.querySelector('[data-action="samples"]')?.addEventListener('click', () => chooseTourEnding(true));
  card.querySelector('[data-action="finish"]')?.addEventListener('click', () => finishTour({
    markComplete: true,
    addSamples: endingSampleChoice === 'samples',
  }));
  positionHighlights(step);
  const renderToken = stepTransitionToken;
  requestAnimationFrame(() => {
    if (!state.welcomeTour.active || isStepTransitioning || renderToken !== stepTransitionToken) return;
    positionCard(step);
    positionHighlights(step);
  });
  focusTourControl();
}

async function showStep(index) {
  if (!state.welcomeTour.active || isFinishingTour || isStepTransitioning) return;
  const token = ++stepTransitionToken;
  const previousStepIndex = currentStepIndex;
  const previousStep = TOUR_STEPS[previousStepIndex] ?? null;
  currentStepIndex = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
  const step = TOUR_STEPS[currentStepIndex];
  const direction = Math.sign(currentStepIndex - previousStepIndex);
  stepHighlightActionComplete = completedRequiredStepIds.has(step.id);
  isStepTransitioning = true;
  setTourControlsDisabled(true);
  positionHighlights(null);
  let preparationError = null;
  try {
    await step.effect(step, {
      direction,
      previousStep,
      previousStepIndex,
    });
  } catch (error) {
    console.error('Welcome tour step failed:', error);
    preparationError = error;
  } finally {
    if (token === stepTransitionToken) {
      isStepTransitioning = false;
    }
  }
  if (!state.welcomeTour.active || isFinishingTour || token !== stepTransitionToken) {
    return;
  }
  if (preparationError) {
    renderStepFailure(step, preparationError.message || 'This tour step could not be prepared.');
    return;
  }
  const missingRequiredTargets = getMissingRequiredHighlightSelectors(step);
  if (missingRequiredTargets.length) {
    renderStepFailure(step, 'This tour step could not find the control it needs. You can retry, go back, or skip to the end.');
    return;
  }
  renderStep(step);
}

async function heartbeatLock(generation = heartbeatGeneration) {
  if (!state.welcomeTour.active || generation !== heartbeatGeneration) return;
  try {
    const result = await apiFetch('/api/welcome-tour/lock', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.welcomeTour.lockSessionId }),
    });
    if (!state.welcomeTour.active || generation !== heartbeatGeneration) {
      if (result.sessionId) {
        apiFetch('/api/welcome-tour/lock', {
          method: 'DELETE',
          body: JSON.stringify({ sessionId: result.sessionId }),
        }).catch(error => {
          console.warn('Welcome tour late lock cleanup failed:', error);
        });
      }
      return;
    }
    state.welcomeTour.lockSessionId = result.sessionId;
  } catch (error) {
    console.warn('Welcome tour lock heartbeat failed:', error);
  }
}

async function acquireInitialLock() {
  const generation = ++heartbeatGeneration;
  const result = await apiFetch('/api/welcome-tour/lock', {
    method: 'POST',
    body: JSON.stringify({ sessionId: state.welcomeTour.lockSessionId }),
  });
  if (!state.welcomeTour.active || generation !== heartbeatGeneration) {
    if (result.sessionId) {
      apiFetch('/api/welcome-tour/lock', {
        method: 'DELETE',
        body: JSON.stringify({ sessionId: result.sessionId }),
      }).catch(error => {
        console.warn('Welcome tour late initial lock cleanup failed:', error);
      });
    }
    throw new Error('Welcome tour startup was cancelled.');
  }
  state.welcomeTour.lockSessionId = result.sessionId;
  return generation;
}

function startHeartbeat(generation = heartbeatGeneration) {
  heartbeatTimer = setInterval(() => {
    void heartbeatLock(generation);
  }, LOCK_HEARTBEAT_MS);
}

function stopLockHeartbeat() {
  heartbeatGeneration += 1;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function releaseLock() {
  stopLockHeartbeat();
  if (!state.welcomeTour.lockSessionId) return;
  const sessionId = state.welcomeTour.lockSessionId;
  state.welcomeTour.lockSessionId = null;
  try {
    await apiFetch('/api/welcome-tour/lock', {
      method: 'DELETE',
      body: JSON.stringify({ sessionId }),
    });
  } catch (error) {
    console.warn('Welcome tour lock release failed:', error);
  }
}

function releaseLockOnPageLifecycle(event) {
  if (event?.persisted) return;
  if (!state.welcomeTour.lockSessionId) return;
  const sessionId = state.welcomeTour.lockSessionId;
  const body = JSON.stringify({ sessionId });
  stopLockHeartbeat();
  state.welcomeTour.lockSessionId = null;

  if (typeof navigator !== 'undefined'
    && typeof navigator.sendBeacon === 'function'
    && typeof Blob !== 'undefined') {
    const beaconBody = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon('/api/welcome-tour/lock/release', beaconBody)) {
      return;
    }
  }

  if (typeof fetch !== 'function') return;
  fetch('/api/welcome-tour/lock', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(error => {
    console.warn('Welcome tour lifecycle lock release failed:', error);
  });
}

function renewLockAfterBfcacheRestore(event) {
  if (!event?.persisted || !state.welcomeTour.active || !state.welcomeTour.lockSessionId) return;
  void heartbeatLock(heartbeatGeneration);
}

function captureSnapshot() {
  return {
    albums: cloneJson(state.albums),
    albumsLoaded: state.albumsLoaded,
    albumsLoading: state.albumsLoading,
    albumsError: state.albumsError,
    albumListMeta: cloneJson(state.albumListMeta),
    albumDetailsCache: cloneJson(state.albumDetailsCache),
    filters: cloneJson(state.filters),
    sort: cloneJson(state.sort),
    navigation: cloneJson(state.navigation),
    view: state.view,
    earlyWrapped: state.earlyWrapped,
    reserveSidebarSpace: state.reserveSidebarSpace,
    quickActionsToolbarVisibilityMode: state.quickActionsToolbarVisibilityMode,
    bodyClasses: {
      sidebarCollapsed: document.body.classList.contains('sidebar-collapsed'),
      reserveSidebarSpace: document.body.classList.contains('reserve-sidebar-space'),
      uButtonsEnabled: document.body.classList.contains('u-buttons-enabled'),
      uButtonsHoverOnly: document.body.classList.contains('u-buttons-hover-only'),
      collectionViewGrid: document.body.classList.contains('collection-view-grid'),
      viewGrid: document.body.classList.contains('view-grid'),
    },
    storage: getStorageSnapshot(),
    scrollY: window.scrollY || 0,
  };
}

async function restoreSnapshot() {
  if (!snapshot) return;
  const targetNavigation = cloneJson(snapshot.navigation || {});
  const targetPage = targetNavigation.page || 'collection';
  closeSettings();
  closePersonalization();
  closeModal();
  restoreStorageSnapshot(snapshot.storage);
  await restorePersonalizationFromStorage();
  setEarlyWrappedEnabled(snapshot.earlyWrapped, { persist: false });
  setQuickActionsToolbarVisibilityMode(
    snapshot.quickActionsToolbarVisibilityMode === 'hover' || snapshot.bodyClasses.uButtonsHoverOnly
      ? 'hover'
      : 'visible',
    { persist: false },
  );
  state.albums = snapshot.albums;
  state.albumsLoaded = snapshot.albumsLoaded;
  state.albumsLoading = snapshot.albumsLoading;
  state.albumsError = snapshot.albumsError ?? null;
  state.albumListMeta = snapshot.albumListMeta;
  state.albumDetailsCache = snapshot.albumDetailsCache;
  state.filters = snapshot.filters;
  state.sort = snapshot.sort;
  state.navigation = targetNavigation;
  state.view = snapshot.view;
  state.reserveSidebarSpace = !!snapshot.reserveSidebarSpace;
  document.body.classList.toggle('sidebar-collapsed', snapshot.bodyClasses.sidebarCollapsed);
  document.body.classList.toggle('reserve-sidebar-space', snapshot.bodyClasses.reserveSidebarSpace);
  document.body.classList.toggle('u-buttons-enabled', snapshot.bodyClasses.uButtonsEnabled);
  document.body.classList.toggle('collection-view-grid', snapshot.bodyClasses.collectionViewGrid);
  document.body.classList.toggle('view-grid', snapshot.bodyClasses.viewGrid);
  syncAppShellLayout();
  syncFilterControlsFromState();
  updateStatusFilterBtn();
  updateImportTypeFilterBtn();
  updateRatedFilterBtn();
  updateTypeFilterBtn();
  updateSortFieldBtn();
  updateSortOrderBtn();
  invalidateDashboardCache();
  if (targetPage === 'collection') {
    render();
  } else {
    await withRealDashboardData(() => setPage(targetPage, {
      historyMode: null,
      year: targetNavigation.wrappedYear,
      initial: true,
      suppressTransitions: true,
    }));
  }
  window.scrollTo(0, snapshot.scrollY);
  return targetPage;
}

async function withRealDashboardData(callback) {
  state.welcomeTour.useRealDashboardData = true;
  try {
    return await callback();
  } finally {
    state.welcomeTour.useRealDashboardData = false;
  }
}

async function loadWelcomeTourStatus(providedStatus = null) {
  const status = providedStatus ?? await apiFetch('/api/welcome-tour/status');
  statusCache = status;
  if (status.preferences) {
    applyPreferencesToState(status.preferences);
  }
  state.welcomeTour.sampleCount = status.sampleCount ?? 0;
  return status;
}

async function refreshRestoredPageAfterFinish(restoredPage, { restoreOnly, shouldAddSamples }) {
  if (restoreOnly || !shouldAddSamples) return;

  invalidateDashboardCache();
  clearAlbumPageCache();
  if (restoredPage === 'collection') {
    await loadAlbums({ preservePage: true, invalidateCache: true });
    return;
  }

  if (restoredPage === 'stats' || restoredPage === 'wrapped') {
    await withRealDashboardData(() => refreshActiveDashboardPage());
  }
}

async function finishTourOnServer({ shouldMarkComplete, shouldAddSamples }) {
  if (!shouldMarkComplete) return null;
  const result = await apiFetch('/api/welcome-tour/finish', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: state.welcomeTour.lockSessionId,
      skipped: skippedToFinal,
      addSamples: shouldAddSamples,
    }),
  });
  stopLockHeartbeat();
  state.welcomeTour.lockSessionId = null;

  try {
    if (result.preferences) {
      applyPreferencesToState(result.preferences);
    }
    statusCache = result.status ?? statusCache;
    state.welcomeTour.sampleCount = statusCache?.sampleCount ?? 0;
  } catch (error) {
    console.warn('Welcome tour finish response processing failed:', error);
  }
  return result;
}

async function finishTour(options = {}) {
  const {
    markComplete: shouldMarkComplete = false,
    addSamples: shouldAddSamples = false,
    restoreOnly = false,
  } = options;

  if (!state.welcomeTour.active || isFinishingTour) return;
  isFinishingTour = true;
  clearTourError();
  setTourControlsDisabled(true);

  let restoredPage;
  try {
    restoredPage = await restoreSnapshot();
    await finishTourOnServer({
      shouldMarkComplete,
      shouldAddSamples,
    });
  } catch (error) {
    console.error('Welcome tour finish failed:', error);
    showTourError(error.message || 'Something went wrong. Please try again.');
    setTourControlsDisabled(false);
    focusTourControl();
    isFinishingTour = false;
    return;
  }

  try {
    await refreshRestoredPageAfterFinish(restoredPage, {
      restoreOnly,
      shouldAddSamples,
    });
  } catch (error) {
    console.warn('Welcome tour post-finish refresh failed:', error);
  }

  state.welcomeTour.active = false;
  document.body.classList.remove('welcome-tour-active');
  setAppInert(false);
  removeOverlay({ restoreFocus: true });
  await releaseLock();

  try {
    snapshot = null;
    skippedToFinal = false;
    endingSampleChoice = null;
    isStepTransitioning = false;
    state.welcomeTour.useRealDashboardData = false;
    stepTransitionToken += 1;
    completedRequiredStepIds.clear();
  } finally {
    isFinishingTour = false;
    refreshWelcomeTourSettings().catch(() => {});
  }
}

function skipTour() {
  if (isStepTransitioning || isFinishingTour) return;
  skippedToFinal = true;
  const penultimateIndex = TOUR_STEPS.findIndex(step => step.id === 'penultimate');
  showStep(penultimateIndex >= 0 ? penultimateIndex : Math.max(TOUR_STEPS.length - 2, 0));
}

export async function startWelcomeTour(options = {}) {
  const { replay = false, initialStatus = null } = options;
  if (state.welcomeTour.active) return;

  void preloadWelcomeTourAssets();
  captureFocusRestoreTarget();
  state.welcomeTour.active = true;
  state.welcomeTour.replay = replay;
  state.welcomeTour.lockSessionId = null;
  state.welcomeTour.useRealDashboardData = false;
  skippedToFinal = false;
  endingSampleChoice = null;
  isStepTransitioning = false;
  isFinishingTour = false;
  stepTransitionToken += 1;
  completedRequiredStepIds = new Set();
  removeOverlay();
  createOverlay();
  setAppInert(true);
  document.body.classList.add('welcome-tour-active');
  renderStartupLoading();

  try {
    await loadWelcomeTourStatus(initialStatus);
    const lockGeneration = await acquireInitialLock();
    startHeartbeat(lockGeneration);
    snapshot = captureSnapshot();
    setEarlyWrappedEnabled(false, { persist: false });
    setQuickActionsToolbarVisibilityMode('visible', { persist: false });
    setTourReserveSidebarSpace(false);
    neutralizeFilters();

    if (window.innerWidth < MOBILE_WARNING_WIDTH) {
      renderWarning();
      return;
    }

    await showStep(0);
  } catch (error) {
    console.error('Welcome tour startup failed:', error);
    await releaseLock();
    state.welcomeTour.active = false;
    state.welcomeTour.lockSessionId = null;
    state.welcomeTour.useRealDashboardData = false;
    document.body.classList.remove('welcome-tour-active');
    setAppInert(false);
    snapshot = null;
    skippedToFinal = false;
    endingSampleChoice = null;
    isStepTransitioning = false;
    completedRequiredStepIds.clear();
    renderStartupFailure(error.message || 'Could not start the welcome tour.');
  }
}

export async function maybeStartWelcomeTour() {
  let status;
  try {
    status = await loadWelcomeTourStatus();
  } catch (error) {
    console.warn('Welcome tour status check failed:', error);
    return;
  }
  if (status.shouldAutoStart) {
    await startWelcomeTour({ replay: false, initialStatus: status });
  }
}

export function initWelcomeTourEvents() {
  if (eventsInitialized) return;
  eventsInitialized = true;
  window.addEventListener('welcome-tour:replay', () => {
    void startWelcomeTour({ replay: true });
  });
  window.addEventListener('pagehide', releaseLockOnPageLifecycle);
  window.addEventListener('pageshow', renewLockAfterBfcacheRestore);
  window.addEventListener('resize', () => {
    const step = TOUR_STEPS[currentStepIndex];
    if (state.welcomeTour.active && step) {
      requestAnimationFrame(() => {
        positionCard(step);
        positionHighlights(step);
      });
    }
  });
}
