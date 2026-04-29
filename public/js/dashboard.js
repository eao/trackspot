// =============================================================================
// Stats / Wrapped page rendering and shared album-data cache.
// =============================================================================

import { apiFetch, el, state } from './state.js';
import { computeStats, normalizeAlbumsForStats } from './stats-compute.js';
import { renderStatsView, cleanupStatsView } from './stats-view.js';
import { renderWrappedView } from './wrapped-view.js';
import { syncHeaderTooltip } from './header-tooltip.js';

const dashboardState = {
  albums: null,
  albumRevision: null,
  loadingPromise: null,
  cacheGeneration: 0,
  renderGeneration: 0,
};

function showLoading(container) {
  container.innerHTML = '<div class="dashboard-loading">Loading…</div>';
}

function showError(container, message) {
  container.innerHTML = `<div class="dashboard-error">${message}</div>`;
}

function cleanupWrappedView(container) {
  if (container && container._wrappedCleanup) {
    container._wrappedCleanup();
    container._wrappedCleanup = null;
  }
}

function cleanupDashboardView(container) {
  cleanupStatsView(container);
  cleanupWrappedView(container);
}

export function getWrappedYearsAvailable(albums) {
  const years = new Set();
  albums.forEach(album => {
    if (album.status === 'completed' && album.listened_at) {
      years.add(Number.parseInt(album.listened_at.slice(0, 4), 10));
    }
  });
  return Array.from(years).filter(Number.isFinite).sort((a, b) => a - b);
}

export function getDefaultWrappedYear(yearsAvailable, now = new Date()) {
  if (!yearsAvailable.length) return null;

  if (state.earlyWrapped) {
    return yearsAvailable[yearsAvailable.length - 1];
  }

  const currentYear = now.getFullYear();
  const viewableYears = yearsAvailable.filter(year => year < currentYear);
  return viewableYears.length
    ? viewableYears[viewableYears.length - 1]
    : yearsAvailable[yearsAvailable.length - 1];
}

export function resolveWrappedYear(albums, requestedYear, now = new Date()) {
  const yearsAvailable = getWrappedYearsAvailable(albums);
  if (!yearsAvailable.length) {
    return { yearsAvailable, resolvedYear: null };
  }

  const parsedRequestedYear = Number.parseInt(String(requestedYear ?? ''), 10);
  const resolvedYear = yearsAvailable.includes(parsedRequestedYear)
    ? parsedRequestedYear
    : getDefaultWrappedYear(yearsAvailable, now);

  return { yearsAvailable, resolvedYear };
}

function mergeDashboardAlbumListMeta(albums, meta = null) {
  state.albumListMeta = {
    ...(state.albumListMeta || {}),
    totalCount: meta?.totalCount ?? albums.length,
    filteredCount: meta?.filteredCount ?? albums.length,
    trackedListenedMs: meta?.trackedListenedMs
      ?? albums.reduce((sum, album) => sum + (album.duration_ms || 0), 0),
  };
}

function clearDashboardAlbumCache() {
  dashboardState.albums = null;
  dashboardState.albumRevision = null;
  dashboardState.loadingPromise = null;
  dashboardState.cacheGeneration += 1;
}

async function isDashboardAlbumCacheFresh() {
  if (!dashboardState.albums || !dashboardState.albumRevision) return false;
  const response = await apiFetch('/api/albums/revision');
  return response?.revision === dashboardState.albumRevision;
}

export async function loadAlbumsForDashboard() {
  if (state.welcomeTour?.active && !state.welcomeTour?.useRealDashboardData) {
    const albums = normalizeAlbumsForStats(state.albums || []);
    mergeDashboardAlbumListMeta(albums);
    syncHeaderTooltip();
    return albums;
  }
  if (dashboardState.albums) {
    const cachedAlbums = dashboardState.albums;
    const cacheGeneration = dashboardState.cacheGeneration;
    try {
      if (
        await isDashboardAlbumCacheFresh()
        && cacheGeneration === dashboardState.cacheGeneration
        && dashboardState.albums === cachedAlbums
      ) {
        return cachedAlbums;
      }
    } catch (error) {
      console.warn('Dashboard album cache revision check failed:', error);
    }
    if (cacheGeneration === dashboardState.cacheGeneration) {
      clearDashboardAlbumCache();
    }
  }
  if (dashboardState.loadingPromise) return dashboardState.loadingPromise;

  const cacheGeneration = dashboardState.cacheGeneration;
  const loadingPromise = (async () => {
    const response = await apiFetch('/api/albums');
    const albums = Array.isArray(response) ? response : (response.albums || []);
    const meta = Array.isArray(response) ? null : response.meta;
    const normalizedAlbums = normalizeAlbumsForStats(albums);

    if (cacheGeneration === dashboardState.cacheGeneration) {
      mergeDashboardAlbumListMeta(albums, meta);
      syncHeaderTooltip();
      dashboardState.albums = normalizedAlbums;
      dashboardState.albumRevision = meta?.revision ?? null;
    }

    return normalizedAlbums;
  })();
  dashboardState.loadingPromise = loadingPromise;

  try {
    return await loadingPromise;
  } finally {
    if (dashboardState.loadingPromise === loadingPromise) {
      dashboardState.loadingPromise = null;
    }
  }
}

export async function renderDashboardPage({
  page,
  container,
  year = null,
  onYearChange = () => {},
  isFresh = () => true,
}) {
  if (!container || (page !== 'stats' && page !== 'wrapped')) {
    return { resolvedYear: null, yearsAvailable: [] };
  }
  const renderGeneration = ++dashboardState.renderGeneration;
  const isCurrentRender = () => dashboardState.renderGeneration === renderGeneration && isFresh();

  if (!isCurrentRender()) {
    return { resolvedYear: null, yearsAvailable: [], stale: true };
  }

  cleanupDashboardView(container);
  if (!isCurrentRender()) {
    return { resolvedYear: null, yearsAvailable: [], stale: true };
  }
  showLoading(container);

  try {
    const albums = await loadAlbumsForDashboard();
    if (!isCurrentRender()) {
      return { resolvedYear: null, yearsAvailable: [], stale: true };
    }
    if (page === 'stats') {
      renderStatsView(container, computeStats(albums));
      return { resolvedYear: null, yearsAvailable: [] };
    }

    const { yearsAvailable, resolvedYear } = resolveWrappedYear(albums, year);
    if (!yearsAvailable.length || !resolvedYear) {
      showError(container, 'No completed albums with listen dates yet.');
      return { resolvedYear: null, yearsAvailable };
    }

    renderWrappedView(container, {
      albums,
      year: resolvedYear,
      yearsAvailable,
      onYearChange,
    });
    return { resolvedYear, yearsAvailable };
  } catch (error) {
    if (!isCurrentRender()) {
      return { resolvedYear: null, yearsAvailable: [], stale: true };
    }
    console.error('Dashboard page render failed:', error);
    showError(container, 'Failed to load album data.');
    return { resolvedYear: null, yearsAvailable: [] };
  }
}

export function cleanupDashboardPage(container) {
  if (!container) return;
  cleanupDashboardView(container);
  container.innerHTML = '';
}

export function invalidateDashboardCache() {
  clearDashboardAlbumCache();
  dashboardState.renderGeneration += 1;
}

export async function refreshActiveDashboardPage() {
  const page = state.navigation?.page;
  if (page !== 'stats' && page !== 'wrapped') {
    return { refreshed: false };
  }

  const container = page === 'stats' ? el.pageStats : el.pageWrapped;
  const requestedYear = state.navigation?.wrappedYear ?? null;
  const navigation = await import('./navigation.js');
  const navigationRevision = navigation.getNavigationRevision();
  const isFresh = () => (
    navigation.getNavigationRevision() === navigationRevision
    && state.navigation?.page === page
    && (
      page !== 'wrapped'
      || (state.navigation?.wrappedYear ?? null) === requestedYear
    )
  );

  const result = await renderDashboardPage({
    page,
    container,
    year: requestedYear,
    onYearChange: year => {
      void navigation.setPage('wrapped', { year, historyMode: 'push' });
    },
    isFresh,
  });

  if (!isFresh() || result?.stale) {
    return { refreshed: false, stale: true };
  }

  if (page === 'wrapped' && result.resolvedYear !== requestedYear) {
    state.navigation.wrappedYear = result.resolvedYear;
    navigation.writeNavigationToLocation('replace', state.navigation);
  }

  return { refreshed: true, ...result };
}
