// =============================================================================
// Client-side page navigation and path routing.
// =============================================================================

import { state, el } from './state.js';
import { setHeaderTitleBase } from './header-title.js';
import { syncAppShellLayout } from './app-shell.js';
import { syncHeaderForPageNavigation } from './header-scroll.js';
import { applyCollectionViewState } from './sidebar.js';
import { cleanupDashboardPage, renderDashboardPage } from './dashboard.js';

const VALID_PAGES = new Set(['collection', 'stats', 'wrapped']);
const VALID_COLLECTION_VIEWS = new Set(['list', 'grid']);

let navigationRenderToken = 0;

function getNormalizedPage(page) {
  return VALID_PAGES.has(page) ? page : 'collection';
}

function getNormalizedCollectionView(view) {
  return VALID_COLLECTION_VIEWS.has(view) ? view : 'list';
}

function getNormalizedNavigation(navigation = {}) {
  const page = getNormalizedPage(navigation.page);
  const collectionView = getNormalizedCollectionView(navigation.collectionView);
  const parsedYear = Number.parseInt(String(navigation.wrappedYear ?? ''), 10);
  return {
    page,
    collectionView,
    wrappedYear: page === 'wrapped' && Number.isFinite(parsedYear) ? parsedYear : null,
  };
}

function saveCurrentScrollPosition() {
  const page = state.navigation?.page || 'collection';
  if (!state.navigation?.scrollPositions) return;
  state.navigation.scrollPositions[page] = window.scrollY || 0;
}

function restoreScrollPosition(page, options = {}) {
  const {
    instant = false,
    syncHeader = false,
  } = options;
  const top = state.navigation?.scrollPositions?.[page] ?? 0;
  if (instant) {
    window.scrollTo(0, top);
    if (syncHeader) {
      syncHeaderForPageNavigation({ currentY: top });
    }
    return;
  }
  window.scrollTo({
    top,
    left: 0,
    behavior: 'auto',
  });
  if (syncHeader) {
    syncHeaderForPageNavigation({ currentY: top });
  }
}

function syncBodyClasses() {
  const page = state.navigation?.page || 'collection';
  const collectionView = state.navigation?.collectionView || 'list';

  document.body.classList.toggle('page-collection', page === 'collection');
  document.body.classList.toggle('page-stats', page === 'stats');
  document.body.classList.toggle('page-wrapped', page === 'wrapped');
  document.body.classList.toggle('collection-view-grid', page === 'collection' && collectionView === 'grid');
  document.body.classList.toggle('view-grid', page === 'collection' && collectionView === 'grid');
}

function syncTopBarState() {
  const page = state.navigation?.page || 'collection';
  const collectionView = state.navigation?.collectionView || 'list';
  const collectionControlsEnabled = page === 'collection';

  el.btnViewList?.classList.toggle('active', page === 'collection' && collectionView === 'list');
  el.btnViewGrid?.classList.toggle('active', page === 'collection' && collectionView === 'grid');
  el.btnStats?.classList.toggle('active', page === 'stats');
  el.btnWrapped?.classList.toggle('active', page === 'wrapped');

  if (el.btnToggleSidebar) {
    el.btnToggleSidebar.disabled = !collectionControlsEnabled;
  }
  if (el.btnToggleUButtons) {
    el.btnToggleUButtons.disabled = !collectionControlsEnabled;
  }
}

function syncHeaderTitle() {
  const page = state.navigation?.page || 'collection';
  if (page === 'stats') {
    setHeaderTitleBase('Trackspot Stats');
    return;
  }
  if (page === 'wrapped') {
    setHeaderTitleBase('Trackspot Wrapped');
    return;
  }
  setHeaderTitleBase('Trackspot');
}

function syncPageVisibility() {
  const page = state.navigation?.page || 'collection';
  el.pageCollection?.classList.toggle('hidden', page !== 'collection');
  el.pageStats?.classList.toggle('hidden', page !== 'stats');
  el.pageWrapped?.classList.toggle('hidden', page !== 'wrapped');
}

function syncNavigationChrome() {
  syncBodyClasses();
  syncTopBarState();
  syncHeaderTitle();
  syncPageVisibility();
  syncAppShellLayout();
}

function getNormalizedPathname(pathname) {
  const rawPathname = String(pathname || '/');
  return rawPathname.startsWith('/') ? rawPathname : `/${rawPathname}`;
}

export function buildNavigationPath(navigation = state.navigation) {
  const normalized = getNormalizedNavigation(navigation);
  if (normalized.page === 'collection') {
    return `/collection/${normalized.collectionView}`;
  }
  if (normalized.page === 'wrapped') {
    if (normalized.wrappedYear !== null) {
      return `/wrapped/${normalized.wrappedYear}`;
    }
    return '/wrapped';
  }
  return '/stats';
}

export function parseNavigationFromPath(pathname = window.location.pathname) {
  const currentPath = getNormalizedPathname(pathname);
  const segments = currentPath.split('/').filter(Boolean);
  let navigation;

  if (!segments.length) {
    navigation = { page: 'collection', collectionView: 'list', wrappedYear: null };
  } else if (segments[0] === 'collection') {
    navigation = {
      page: 'collection',
      collectionView: getNormalizedCollectionView(segments[1] || 'list'),
      wrappedYear: null,
    };
  } else if (segments[0] === 'stats' && segments.length === 1) {
    navigation = { page: 'stats', collectionView: 'list', wrappedYear: null };
  } else if (segments[0] === 'wrapped' && segments.length <= 2) {
    const rawYear = String(segments[1] ?? '');
    const parsedYear = /^\d+$/.test(rawYear) ? Number.parseInt(rawYear, 10) : null;
    navigation = {
      page: 'wrapped',
      collectionView: 'list',
      wrappedYear: Number.isFinite(parsedYear) ? parsedYear : null,
    };
  } else {
    navigation = { page: 'collection', collectionView: 'list', wrappedYear: null };
  }

  const normalized = getNormalizedNavigation(navigation);
  return {
    navigation: normalized,
    isBareEntry: segments.length === 0,
    needsNormalization: buildNavigationPath(normalized) !== currentPath,
  };
}

function buildLaunchAlbumSearch(search = window.location.search) {
  const albumId = new URLSearchParams(search).get('album');
  return albumId && /^\d+$/.test(albumId) ? `?album=${encodeURIComponent(albumId)}` : '';
}

export function writeNavigationToLocation(mode = 'push', navigation = state.navigation, options = {}) {
  const {
    historyObj = window.history,
    locationObj = window.location,
  } = options;
  const nextPath = buildNavigationPath(navigation);
  const nextSearch = buildLaunchAlbumSearch(locationObj.search);
  const nextUrl = `${nextPath}${nextSearch}${locationObj.hash || ''}`;
  const method = mode === 'replace' ? 'replaceState' : 'pushState';
  historyObj[method]({}, '', nextUrl);
  return `${nextPath}${nextSearch}`;
}

function suppressShellTransitionsForNavigation(enabled) {
  if (!enabled) return () => {};

  const elements = [
    document.querySelector('.sidebar'),
    document.querySelector('.content'),
  ].filter(element => element instanceof Element);

  elements.forEach(element => {
    element.style.transition = 'none';
  });

  return () => {
    elements.forEach(element => {
      void element.offsetWidth;
      requestAnimationFrame(() => {
        element.style.transition = '';
      });
    });
  };
}

async function performNavigation(nextNavigation, options = {}) {
  const {
    historyMode = 'push',
    initial = false,
    suppressTransitions = false,
    skipCollectionLoad = false,
  } = options;

  const normalized = getNormalizedNavigation(nextNavigation);
  const previousPage = state.navigation?.page || 'collection';
  const previousCollectionView = state.navigation?.collectionView || 'list';
  const switchingPages = previousPage !== normalized.page;
  const switchingCollectionViews = (
    previousPage === 'collection'
    && normalized.page === 'collection'
    && previousCollectionView !== normalized.collectionView
  );
  const renderToken = ++navigationRenderToken;

  if (!initial) {
    saveCurrentScrollPosition();
  }

  if (switchingPages) {
    syncHeaderForPageNavigation();
  }

  if (historyMode) {
    writeNavigationToLocation(historyMode, normalized);
  }

  state.navigation.page = normalized.page;
  state.navigation.collectionView = normalized.collectionView;
  state.navigation.wrappedYear = normalized.wrappedYear;
  state.view = normalized.collectionView;

  if (normalized.page === 'collection') {
    syncBodyClasses();
    syncTopBarState();
    syncHeaderTitle();
    el.pageCollection?.classList.add('hidden');
    el.pageStats?.classList.add('hidden');
    el.pageWrapped?.classList.add('hidden');
    syncAppShellLayout();
    cleanupDashboardPage(el.pageStats);
    cleanupDashboardPage(el.pageWrapped);
    applyCollectionViewState(normalized.collectionView, {
      suppressTransitions: suppressTransitions || initial || switchingPages || switchingCollectionViews,
      preservePage: previousPage !== 'collection',
      load: !skipCollectionLoad,
    });
    if (renderToken !== navigationRenderToken) return;
    syncPageVisibility();
    restoreScrollPosition('collection', {
      instant: initial,
      syncHeader: switchingPages,
    });
    return;
  }

  const restoreShellTransitions = suppressShellTransitionsForNavigation(initial || switchingPages);
  syncNavigationChrome();
  restoreShellTransitions();
  cleanupDashboardPage(previousPage === 'stats' ? el.pageStats : el.pageWrapped);

  const targetContainer = normalized.page === 'stats' ? el.pageStats : el.pageWrapped;
  const inactiveContainer = normalized.page === 'stats' ? el.pageWrapped : el.pageStats;
  cleanupDashboardPage(inactiveContainer);

  const result = await renderDashboardPage({
    page: normalized.page,
    container: targetContainer,
    year: normalized.wrappedYear,
    onYearChange: year => {
      void setPage('wrapped', { year, historyMode: 'push' });
    },
  });

  if (renderToken !== navigationRenderToken) return;

  if (normalized.page === 'wrapped' && result.resolvedYear !== normalized.wrappedYear) {
    state.navigation.wrappedYear = result.resolvedYear;
    writeNavigationToLocation(historyMode === 'replace' ? 'replace' : 'replace', state.navigation);
  }

  restoreScrollPosition(normalized.page, {
    instant: initial,
    syncHeader: switchingPages,
  });
}

export function syncNavigationFromLocation(options = {}) {
  const {
    historyMode = 'replace',
    activate = false,
    initial = false,
  } = options;
  const parsed = parseNavigationFromPath(window.location.pathname);

  if (parsed.needsNormalization && historyMode) {
    writeNavigationToLocation(historyMode, parsed.navigation);
  }

  if (activate) {
    void performNavigation(parsed.navigation, {
      historyMode: null,
      initial,
    });
    return parsed;
  }

  state.navigation.page = parsed.navigation.page;
  state.navigation.collectionView = parsed.navigation.collectionView;
  state.navigation.wrappedYear = parsed.navigation.wrappedYear;
  state.view = parsed.navigation.collectionView;

  syncNavigationChrome();

  return parsed;
}

export function setPage(page, options = {}) {
  const {
    year = state.navigation?.wrappedYear ?? null,
    historyMode = 'push',
    initial = false,
    suppressTransitions = false,
    skipCollectionLoad = false,
  } = options;
  return performNavigation({
    page,
    collectionView: state.navigation?.collectionView || 'list',
    wrappedYear: year,
  }, {
    historyMode,
    initial,
    suppressTransitions,
    skipCollectionLoad,
  });
}

export function setCollectionView(view, options = {}) {
  const {
    historyMode = 'push',
    initial = false,
  } = options;

  return performNavigation({
    page: 'collection',
    collectionView: view,
    wrappedYear: state.navigation?.wrappedYear ?? null,
  }, {
    historyMode,
    initial,
  });
}
