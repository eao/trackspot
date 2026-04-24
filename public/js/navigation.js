// =============================================================================
// Client-side page navigation and query-string routing.
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

export function parseNavigationFromSearch(search = window.location.search) {
  const params = new URLSearchParams(search);
  const hasNavigationParams = params.has('page') || params.has('view') || params.has('year');
  const page = getNormalizedPage(params.get('page') || 'collection');
  const collectionView = getNormalizedCollectionView(params.get('view') || 'list');
  const rawYear = params.get('year');
  const parsedYear = Number.parseInt(String(rawYear ?? ''), 10);
  const wrappedYear = page === 'wrapped' && Number.isFinite(parsedYear) ? parsedYear : null;
  const normalized = getNormalizedNavigation({ page, collectionView, wrappedYear });
  const normalizedSearch = buildNavigationSearch(normalized, search);

  return {
    navigation: normalized,
    isBareEntry: !hasNavigationParams,
    needsNormalization: normalizedSearch !== ((search && search.startsWith('?')) ? search : (search ? `?${search}` : '')),
  };
}

export function buildNavigationSearch(navigation = state.navigation, search = window.location.search) {
  const normalized = getNormalizedNavigation(navigation);
  const params = new URLSearchParams(search);
  params.set('page', normalized.page);

  if (normalized.page === 'collection') {
    params.set('view', normalized.collectionView);
    params.delete('year');
  } else if (normalized.page === 'wrapped') {
    params.delete('view');
    if (normalized.wrappedYear !== null) {
      params.set('year', String(normalized.wrappedYear));
    } else {
      params.delete('year');
    }
  } else {
    params.delete('view');
    params.delete('year');
  }

  const next = params.toString();
  return next ? `?${next}` : '';
}

export function writeNavigationToLocation(mode = 'push', navigation = state.navigation, options = {}) {
  const {
    historyObj = window.history,
    locationObj = window.location,
  } = options;
  const nextSearch = buildNavigationSearch(navigation, locationObj.search);
  const nextUrl = `${locationObj.pathname}${nextSearch}${locationObj.hash || ''}`;
  const method = mode === 'replace' ? 'replaceState' : 'pushState';
  historyObj[method]({}, '', nextUrl);
  return nextSearch;
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
  const parsed = parseNavigationFromSearch(window.location.search);

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
