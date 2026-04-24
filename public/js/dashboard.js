// =============================================================================
// Stats / Wrapped page rendering and shared album-data cache.
// =============================================================================

import { apiFetch, state } from './state.js';
import { computeStats, normalizeAlbumsForStats } from './stats-compute.js';
import { renderStatsView, cleanupStatsView } from './stats-view.js';
import { renderWrappedView } from './wrapped-view.js';
import { syncHeaderTooltip } from './header-tooltip.js';

const dashboardState = {
  albums: null,
  loadingPromise: null,
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

export async function loadAlbumsForDashboard() {
  if (dashboardState.albums) return dashboardState.albums;
  if (dashboardState.loadingPromise) return dashboardState.loadingPromise;

  dashboardState.loadingPromise = (async () => {
    const response = await apiFetch('/api/albums');
    const albums = Array.isArray(response) ? response : (response.albums || []);
    const trackedListenedMs = Array.isArray(response) ? 0 : (response.meta?.trackedListenedMs ?? 0);
    state.albumListMeta = {
      ...(state.albumListMeta || {}),
      trackedListenedMs,
    };
    syncHeaderTooltip();
    dashboardState.albums = normalizeAlbumsForStats(albums);
    return dashboardState.albums;
  })();

  try {
    return await dashboardState.loadingPromise;
  } finally {
    dashboardState.loadingPromise = null;
  }
}

export async function renderDashboardPage({
  page,
  container,
  year = null,
  onYearChange = () => {},
}) {
  if (!container || (page !== 'stats' && page !== 'wrapped')) {
    return { resolvedYear: null, yearsAvailable: [] };
  }

  cleanupDashboardView(container);
  showLoading(container);

  try {
    const albums = await loadAlbumsForDashboard();
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
  dashboardState.albums = null;
  dashboardState.loadingPromise = null;
}
