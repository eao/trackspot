import { apiFetch, state, DEFAULT_COMPLEX_STATUSES } from './state.js';
import { render, loadAlbums } from './render.js';
import { setPage } from './navigation.js';
import { applyCollectionViewState, syncFilterControlsFromState, updateImportTypeFilterBtn, updateRatedFilterBtn, updateRestoreBtn, updateSortFieldBtn, updateSortOrderBtn, updateStatusFilterBtn, updateTypeFilterBtn } from './sidebar.js';
import { openLogModal, closeModal } from './modal.js';
import {
  applyThemeByName,
  closePersonalization,
  closeSettings,
  openPersonalization,
  openSettings,
  refreshWelcomeTourSettings,
  restorePersonalizationFromStorage,
  setUButtons,
} from './settings.js';
import { applyPreferencesToState } from './preferences.js';
import { invalidateDashboardCache } from './dashboard.js';

const MOBILE_WARNING_WIDTH = 780;
const LOCK_HEARTBEAT_MS = 10000;

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
    release_date: '1876-01-01',
    release_year: 1876,
    label: 'Example Label',
    genres: ['Placeholder'],
    track_count: 4,
    duration_ms: 2550000,
    copyright: [],
    is_pre_release: 0,
    image_path: 'assets/welcome/placeholder-spotify-album.jpg',
    status: 'completed',
    rating: 92,
    notes: 'This sample behaves like a Spotify import: imported metadata is read-only, while your listening details stay editable.',
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
    notes: 'Manual logs are for albums you want to enter yourself. You can edit their title, artist, dates, links, and art.',
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
    body: 'We will take a quick lap through the app with two temporary placeholder albums. You can skip ahead whenever you want.',
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
    body: 'List view is the denser collection view, with album details, notes, year, and dates arranged for scanning.',
    anchor: '#btn-view-list',
    effect: prepareCollectionList,
  },
  {
    id: 'grid',
    title: 'Grid View',
    body: 'Grid view puts the art first when you want to browse your collection visually.',
    anchor: '#btn-view-grid',
    effect: prepareCollectionGrid,
  },
  {
    id: 'sidebar',
    title: 'Sidebar',
    body: 'The sidebar holds search, filters, and sorting. It can be shown or tucked away whenever you need more space.',
    anchor: '.sidebar',
    effect: prepareSidebarStep,
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    body: 'The quick actions toolbar can be toggled independently from the sidebar for the controls you use most.',
    anchor: '#u-buttons',
    effect: prepareQuickActionsStep,
  },
  {
    id: 'manual-modal',
    title: 'Manual Adds',
    body: 'Manual additions are entered here. Spotify imports come from the Spicetify extension, while this modal is for albums you want to log yourself.',
    anchor: '#modal-overlay .modal',
    effect: prepareManualModalStep,
  },
  {
    id: 'settings',
    title: 'Settings',
    body: 'Settings covers preferences, paging, quick actions, import/export, backups, and reset tools.',
    anchor: '#settings-overlay .modal',
    effect: prepareSettingsStep,
  },
  {
    id: 'personalization',
    title: 'Personalization',
    body: 'Personalization combines color schemes, background images, opacity presets, and Themes you can switch between all at once.',
    anchor: '#personalization-overlay .modal',
    effect: preparePersonalizationStep,
  },
  {
    id: 'stats',
    title: 'Stats',
    body: 'Stats turns your logged albums into a dashboard once your real collection starts to grow.',
    anchor: '#btn-stats',
    effect: prepareStatsStep,
  },
  {
    id: 'wrapped',
    title: 'Wrapped',
    body: 'Wrapped is intentionally under wraps until the year is ready, but this is where your annual retrospective will live.',
    anchor: '#btn-wrapped',
    effect: prepareWrappedStep,
  },
  {
    id: 'final',
    title: 'Ready to Start',
    body: 'You can add the placeholder albums to play around, or start with an empty collection. Spotify imports will use the Spicetify extension once that install flow is ready.',
    placement: 'center',
    final: true,
    effect: prepareCollectionList,
  },
];

let overlay = null;
let card = null;
let currentStepIndex = 0;
let snapshot = null;
let skippedToFinal = false;
let heartbeatTimer = null;
let statusCache = null;
let inertSnapshots = [];

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

function setDemoAlbums() {
  state.albums = DEMO_ALBUMS.map(album => ({ ...cloneJson(album) }));
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

async function prepareCollectionList() {
  closeSettings();
  closePersonalization();
  closeModal();
  await setPage('collection', { historyMode: null, skipCollectionLoad: true, suppressTransitions: true });
  applyCollectionViewState('list', { load: false, suppressTransitions: true, preservePage: true });
  document.body.classList.remove('sidebar-collapsed');
  setUButtons(false);
  setDemoAlbums();
}

async function prepareCollectionGrid() {
  closeSettings();
  closePersonalization();
  closeModal();
  await setPage('collection', { historyMode: null, skipCollectionLoad: true, suppressTransitions: true });
  applyCollectionViewState('grid', { load: false, suppressTransitions: true, preservePage: true });
  setDemoAlbums();
}

async function prepareThemeStep(step) {
  closeSettings();
  closePersonalization();
  closeModal();
  await setPage('collection', { historyMode: null, skipCollectionLoad: true, suppressTransitions: true });
  applyCollectionViewState('list', { load: false, suppressTransitions: true, preservePage: true });
  document.body.classList.remove('sidebar-collapsed');
  setUButtons(false);
  setDemoAlbums();
  await applyThemeByName(step.themeName);
}

async function prepareSidebarStep() {
  await prepareCollectionList();
  document.body.classList.remove('sidebar-collapsed');
}

async function prepareQuickActionsStep() {
  await prepareCollectionList();
  document.body.classList.add('u-buttons-enabled');
}

async function prepareManualModalStep() {
  await prepareCollectionList();
  openLogModal();
}

async function prepareSettingsStep() {
  await prepareCollectionList();
  openSettings();
}

async function preparePersonalizationStep() {
  await prepareCollectionList();
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
  card = document.createElement('div');
  card.className = 'welcome-tour-card';
  overlay.appendChild(card);
  document.body.appendChild(overlay);
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
  if (!card) return [];
  return Array.from(card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(element => !element.disabled && element.offsetParent !== null);
}

function focusTourControl() {
  const focusable = getTourFocusableElements();
  const preferred = card?.querySelector('[data-action="next"], [data-action="continue"], [data-action="samples"], [data-action="empty"]');
  if (preferred instanceof HTMLElement && !preferred.disabled) {
    preferred.focus();
    return;
  }
  focusable[0]?.focus();
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
  if (!state.welcomeTour.active || !card) return;
  if (card.contains(event.target)) {
    if (event.key === 'Tab') trapTourTab(event);
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  focusTourControl();
}

function removeOverlay() {
  overlay?.remove();
  overlay = null;
  card = null;
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
  let left = rect.right + gap;
  let top = rect.top + Math.max(0, (rect.height - cardRect.height) / 2);

  if (left + cardRect.width > window.innerWidth - gap) {
    left = rect.left - cardRect.width - gap;
  }
  if (left < gap) {
    left = window.innerWidth - cardRect.width - gap;
  }
  top = Math.max(gap, Math.min(window.innerHeight - cardRect.height - gap, top));
  card.style.setProperty('--welcome-tour-left', `${Math.max(gap, left)}px`);
  card.style.setProperty('--welcome-tour-top', `${top}px`);
}

function renderWarning() {
  card.className = 'welcome-tour-card welcome-tour-card-centered';
  card.style.setProperty('--welcome-tour-card-bg-opacity', '96%');
  card.innerHTML = `
    <div class="welcome-tour-kicker">Desktop recommended</div>
    <h2>Trackspot is built for a desktop-sized window.</h2>
    <p>This tour can run here, but some steps may not display correctly on smaller screens.</p>
    <div class="welcome-tour-actions">
      <button class="btn btn-ghost" data-action="later">Show me the tour next visit</button>
      <button class="btn btn-secondary" data-action="skip">Skip tour</button>
      <button class="btn btn-primary" data-action="continue">Continue tour</button>
    </div>
  `;
  card.querySelector('[data-action="continue"]').addEventListener('click', () => showStep(0));
  card.querySelector('[data-action="skip"]').addEventListener('click', () => skipTour());
  card.querySelector('[data-action="later"]').addEventListener('click', () => finishTour({ restoreOnly: true }));
  focusTourControl();
}

function renderStep(step) {
  const progress = `${currentStepIndex + 1} / ${TOUR_STEPS.length}`;
  const alreadyAdded = !!state.welcomeTour.samplesAddedAt || (statusCache?.sampleCount ?? 0) > 0;
  const sampleWarning = alreadyAdded
    ? '<p class="welcome-tour-note">Adding sample albums again will delete any existing welcome samples and add fresh copies.</p>'
    : '';
  const finalActions = `${sampleWarning}<button class="btn btn-secondary" data-action="empty">Start with empty collection</button><button class="btn btn-primary" data-action="samples">Add sample albums</button>`;

  card.className = 'welcome-tour-card';
  card.innerHTML = `
    <div class="welcome-tour-kicker">${step.final ? 'Spicetify setup' : `Step ${progress}`}</div>
    <h2>${step.title}</h2>
    <p>${step.body}</p>
    ${step.final ? `<div class="welcome-tour-cta">
      <p>The Spicetify extension install link will live here once it is ready.</p>
      <div class="welcome-tour-actions">${finalActions}</div>
    </div>` : `<div class="welcome-tour-actions">
      <button class="btn btn-ghost" data-action="back"${currentStepIndex === 0 ? ' disabled' : ''}>Back</button>
      <button class="btn btn-secondary" data-action="skip">Skip</button>
      <button class="btn btn-primary" data-action="next">Next</button>
    </div>`}
  `;

  card.querySelector('[data-action="back"]')?.addEventListener('click', () => showStep(currentStepIndex - 1));
  card.querySelector('[data-action="next"]')?.addEventListener('click', () => showStep(currentStepIndex + 1));
  card.querySelector('[data-action="skip"]')?.addEventListener('click', () => skipTour());
  card.querySelector('[data-action="empty"]')?.addEventListener('click', () => finishTour({ markComplete: true }));
  card.querySelector('[data-action="samples"]')?.addEventListener('click', () => finishTour({ markComplete: true, addSamples: true }));
  requestAnimationFrame(() => positionCard(step));
  focusTourControl();
}

async function showStep(index) {
  currentStepIndex = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
  const step = TOUR_STEPS[currentStepIndex];
  try {
    await step.effect(step);
  } catch (error) {
    console.error('Welcome tour step failed:', error);
  }
  renderStep(step);
}

async function heartbeatLock() {
  if (!state.welcomeTour.active) return;
  try {
    const result = await apiFetch('/api/welcome-tour/lock', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.welcomeTour.lockSessionId }),
    });
    state.welcomeTour.lockSessionId = result.sessionId;
  } catch (error) {
    console.warn('Welcome tour lock heartbeat failed:', error);
  }
}

function startHeartbeat() {
  void heartbeatLock();
  heartbeatTimer = setInterval(() => {
    void heartbeatLock();
  }, LOCK_HEARTBEAT_MS);
}

async function releaseLock() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
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

function captureSnapshot() {
  return {
    albums: cloneJson(state.albums),
    albumsLoaded: state.albumsLoaded,
    albumsLoading: state.albumsLoading,
    albumListMeta: cloneJson(state.albumListMeta),
    albumDetailsCache: cloneJson(state.albumDetailsCache),
    filters: cloneJson(state.filters),
    sort: cloneJson(state.sort),
    navigation: cloneJson(state.navigation),
    view: state.view,
    bodyClasses: {
      sidebarCollapsed: document.body.classList.contains('sidebar-collapsed'),
      uButtonsEnabled: document.body.classList.contains('u-buttons-enabled'),
      collectionViewGrid: document.body.classList.contains('collection-view-grid'),
      viewGrid: document.body.classList.contains('view-grid'),
    },
    storage: getStorageSnapshot(),
    scrollY: window.scrollY || 0,
  };
}

async function restoreSnapshot() {
  if (!snapshot) return;
  closeSettings();
  closePersonalization();
  closeModal();
  restoreStorageSnapshot(snapshot.storage);
  await restorePersonalizationFromStorage();
  state.albums = snapshot.albums;
  state.albumsLoaded = snapshot.albumsLoaded;
  state.albumsLoading = snapshot.albumsLoading;
  state.albumListMeta = snapshot.albumListMeta;
  state.albumDetailsCache = snapshot.albumDetailsCache;
  state.filters = snapshot.filters;
  state.sort = snapshot.sort;
  state.navigation = snapshot.navigation;
  state.view = snapshot.view;
  document.body.classList.toggle('sidebar-collapsed', snapshot.bodyClasses.sidebarCollapsed);
  document.body.classList.toggle('u-buttons-enabled', snapshot.bodyClasses.uButtonsEnabled);
  document.body.classList.toggle('collection-view-grid', snapshot.bodyClasses.collectionViewGrid);
  document.body.classList.toggle('view-grid', snapshot.bodyClasses.viewGrid);
  syncFilterControlsFromState();
  updateStatusFilterBtn();
  updateImportTypeFilterBtn();
  updateRatedFilterBtn();
  updateTypeFilterBtn();
  updateSortFieldBtn();
  updateSortOrderBtn();
  invalidateDashboardCache();
  render();
  window.scrollTo(0, snapshot.scrollY);
}

async function markComplete() {
  const result = await apiFetch('/api/welcome-tour/complete', {
    method: 'POST',
    body: JSON.stringify({ skipped: skippedToFinal }),
  });
  if (result.preferences) {
    applyPreferencesToState(result.preferences);
  }
  statusCache = result.status ?? statusCache;
}

async function addSamples() {
  const result = await apiFetch('/api/welcome-tour/samples', { method: 'POST' });
  if (result.status?.preferences) {
    applyPreferencesToState(result.status.preferences);
  }
  statusCache = result.status ?? statusCache;
  state.welcomeTour.sampleCount = statusCache?.sampleCount ?? 0;
}

async function finishTour(options = {}) {
  const {
    markComplete: shouldMarkComplete = false,
    addSamples: shouldAddSamples = false,
    restoreOnly = false,
  } = options;

  if (!state.welcomeTour.active) return;
  state.welcomeTour.active = false;
  document.body.classList.remove('welcome-tour-active');
  setAppInert(false);
  removeOverlay();
  await releaseLock();

  try {
    if (shouldMarkComplete) {
      await markComplete();
    }
    if (shouldAddSamples) {
      await addSamples();
    }
  } finally {
    await restoreSnapshot();
    snapshot = null;
    skippedToFinal = false;
    if (!restoreOnly && shouldAddSamples) {
      await loadAlbums();
    }
    refreshWelcomeTourSettings().catch(() => {});
  }
}

function skipTour() {
  skippedToFinal = true;
  showStep(TOUR_STEPS.length - 1);
}

export async function startWelcomeTour(options = {}) {
  const { replay = false } = options;
  if (state.welcomeTour.active) return;

  statusCache = await apiFetch('/api/welcome-tour/status');
  if (statusCache.preferences) {
    applyPreferencesToState(statusCache.preferences);
  }
  state.welcomeTour.sampleCount = statusCache.sampleCount ?? 0;
  state.welcomeTour.active = true;
  state.welcomeTour.replay = replay;
  state.welcomeTour.lockSessionId = null;
  snapshot = captureSnapshot();
  skippedToFinal = false;
  neutralizeFilters();
  createOverlay();
  setAppInert(true);
  document.body.classList.add('welcome-tour-active');
  startHeartbeat();

  if (window.innerWidth < MOBILE_WARNING_WIDTH) {
    renderWarning();
    return;
  }

  await showStep(0);
}

export async function maybeStartWelcomeTour() {
  const status = await apiFetch('/api/welcome-tour/status');
  statusCache = status;
  if (status.preferences) {
    applyPreferencesToState(status.preferences);
  }
  state.welcomeTour.sampleCount = status.sampleCount ?? 0;
  if (status.shouldAutoStart) {
    await startWelcomeTour({ replay: false });
  }
}

export function initWelcomeTourEvents() {
  window.addEventListener('welcome-tour:replay', () => {
    void startWelcomeTour({ replay: true });
  });
  window.addEventListener('resize', () => {
    const step = TOUR_STEPS[currentStepIndex];
    if (state.welcomeTour.active && step) {
      requestAnimationFrame(() => positionCard(step));
    }
  });
}
