import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  earlyWrapped: false,
  albumListMeta: {
    trackedListenedMs: 0,
  },
};

vi.mock('../public/js/state.js', () => ({
  apiFetch: vi.fn(),
  state: stateMock,
}));

vi.mock('../public/js/stats-compute.js', () => ({
  computeStats: vi.fn(),
  normalizeAlbumsForStats: vi.fn(albums => albums),
}));

vi.mock('../public/js/stats-view.js', () => ({
  renderStatsView: vi.fn(),
  cleanupStatsView: vi.fn(),
}));

vi.mock('../public/js/wrapped-view.js', () => ({
  renderWrappedView: vi.fn(),
}));

const syncHeaderTooltipMock = vi.fn();

vi.mock('../public/js/header-tooltip.js', () => ({
  syncHeaderTooltip: syncHeaderTooltipMock,
}));

describe('dashboard wrapped year resolution', () => {
  beforeEach(() => {
    stateMock.earlyWrapped = false;
    stateMock.albumListMeta = {
      trackedListenedMs: 0,
    };
    syncHeaderTooltipMock.mockReset();
  });

  function makeAlbum(year, id) {
    return {
      id,
      status: 'completed',
      listened_at: `${year}-01-15`,
    };
  }

  it('defaults to the latest prior year when the current year is still locked', async () => {
    const { resolveWrappedYear } = await import('../public/js/dashboard.js');

    const result = resolveWrappedYear([
      makeAlbum(2024, 1),
      makeAlbum(2025, 2),
      makeAlbum(2026, 3),
    ], null, new Date(2026, 3, 19));

    expect(result).toEqual({
      yearsAvailable: [2024, 2025, 2026],
      resolvedYear: 2025,
    });
  });

  it('falls back to the current year when that is the only wrapped year available', async () => {
    const { resolveWrappedYear } = await import('../public/js/dashboard.js');

    const result = resolveWrappedYear([
      makeAlbum(2026, 1),
    ], null, new Date(2026, 3, 19));

    expect(result).toEqual({
      yearsAvailable: [2026],
      resolvedYear: 2026,
    });
  });

  it('defaults to the newest available year when Early Wrapped is enabled', async () => {
    stateMock.earlyWrapped = true;
    const { resolveWrappedYear } = await import('../public/js/dashboard.js');

    const result = resolveWrappedYear([
      makeAlbum(2024, 1),
      makeAlbum(2025, 2),
      makeAlbum(2026, 3),
    ], null, new Date(2026, 3, 19));

    expect(result).toEqual({
      yearsAvailable: [2024, 2025, 2026],
      resolvedYear: 2026,
    });
  });

  it('preserves an explicitly requested wrapped year even when the default would differ', async () => {
    const { resolveWrappedYear } = await import('../public/js/dashboard.js');

    const result = resolveWrappedYear([
      makeAlbum(2024, 1),
      makeAlbum(2025, 2),
      makeAlbum(2026, 3),
    ], 2026, new Date(2026, 3, 19));

    expect(result).toEqual({
      yearsAvailable: [2024, 2025, 2026],
      resolvedYear: 2026,
    });
  });

  it('updates the header tooltip source when dashboard albums load on non-collection pages', async () => {
    const { apiFetch } = await import('../public/js/state.js');
    apiFetch.mockResolvedValue({
      albums: [makeAlbum(2025, 1)],
      meta: {
        trackedListenedMs: 17_999_999,
      },
    });

    const { loadAlbumsForDashboard } = await import('../public/js/dashboard.js');

    const albums = await loadAlbumsForDashboard();

    expect(apiFetch).toHaveBeenCalledWith('/api/albums');
    expect(albums).toHaveLength(1);
    expect(stateMock.albumListMeta.trackedListenedMs).toBe(17_999_999);
    expect(syncHeaderTooltipMock).toHaveBeenCalled();
  });
});
