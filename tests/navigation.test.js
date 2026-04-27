import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  navigation: {
    page: 'collection',
    collectionView: 'list',
    wrappedYear: null,
    scrollPositions: {
      collection: 0,
      stats: 0,
      wrapped: 0,
    },
  },
  view: 'list',
};

const elMock = {
  btnViewList: null,
  btnViewGrid: null,
  btnStats: null,
  btnWrapped: null,
  btnToggleSidebar: null,
  btnToggleUButtons: null,
  pageCollection: null,
  pageStats: null,
  pageWrapped: null,
};

const setHeaderTitleBaseMock = vi.fn();
const syncAppShellLayoutMock = vi.fn();
const applyCollectionViewStateMock = vi.fn();
const cleanupDashboardPageMock = vi.fn();
const renderDashboardPageMock = vi.fn(async () => ({ resolvedYear: null, yearsAvailable: [] }));

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
}));

vi.mock('../public/js/header-title.js', () => ({
  setHeaderTitleBase: setHeaderTitleBaseMock,
}));

vi.mock('../public/js/app-shell.js', () => ({
  syncAppShellLayout: syncAppShellLayoutMock,
}));

vi.mock('../public/js/sidebar.js', () => ({
  applyCollectionViewState: applyCollectionViewStateMock,
}));

vi.mock('../public/js/dashboard.js', () => ({
  cleanupDashboardPage: cleanupDashboardPageMock,
  renderDashboardPage: renderDashboardPageMock,
}));

describe('navigation routing', () => {
  beforeEach(() => {
    vi.resetModules();
    setHeaderTitleBaseMock.mockReset();
    syncAppShellLayoutMock.mockReset();
    applyCollectionViewStateMock.mockReset();
    cleanupDashboardPageMock.mockReset();
    renderDashboardPageMock.mockReset();
    renderDashboardPageMock.mockResolvedValue({ resolvedYear: null, yearsAvailable: [] });

    globalThis.document.body.className = '';
    globalThis.document.body.innerHTML = `
      <aside class="sidebar"></aside>
      <div class="content"></div>
      <button id="btn-view-list"></button>
      <button id="btn-view-grid"></button>
      <button id="btn-stats"></button>
      <button id="btn-wrapped"></button>
      <button id="btn-toggle-sidebar"></button>
      <button id="btn-toggle-u-buttons"></button>
      <section id="page-collection"></section>
      <section id="page-stats" class="hidden"></section>
      <section id="page-wrapped" class="hidden"></section>
    `;

    elMock.btnViewList = globalThis.document.getElementById('btn-view-list');
    elMock.btnViewGrid = globalThis.document.getElementById('btn-view-grid');
    elMock.btnStats = globalThis.document.getElementById('btn-stats');
    elMock.btnWrapped = globalThis.document.getElementById('btn-wrapped');
    elMock.btnToggleSidebar = globalThis.document.getElementById('btn-toggle-sidebar');
    elMock.btnToggleUButtons = globalThis.document.getElementById('btn-toggle-u-buttons');
    elMock.pageCollection = globalThis.document.getElementById('page-collection');
    elMock.pageStats = globalThis.document.getElementById('page-stats');
    elMock.pageWrapped = globalThis.document.getElementById('page-wrapped');

    stateMock.navigation.page = 'collection';
    stateMock.navigation.collectionView = 'list';
    stateMock.navigation.wrappedYear = null;
    stateMock.navigation.scrollPositions.collection = 0;
    stateMock.navigation.scrollPositions.stats = 0;
    stateMock.navigation.scrollPositions.wrapped = 0;
    stateMock.view = 'list';

    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });
    window.scrollTo = vi.fn();

    window.history.replaceState({}, '', '/');
  });

  it('parses a bare path as collection/list and flags it for normalization', async () => {
    const { parseNavigationFromPath } = await import('../public/js/navigation.js');

    const parsed = parseNavigationFromPath('/');

    expect(parsed.navigation).toEqual({
      page: 'collection',
      collectionView: 'list',
      wrappedYear: null,
    });
    expect(parsed.isBareEntry).toBe(true);
    expect(parsed.needsNormalization).toBe(true);
  });

  it('parses clean collection, stats, and wrapped paths', async () => {
    const { parseNavigationFromPath } = await import('../public/js/navigation.js');

    expect(parseNavigationFromPath('/collection/grid').navigation).toEqual({
      page: 'collection',
      collectionView: 'grid',
      wrappedYear: null,
    });
    expect(parseNavigationFromPath('/stats').navigation).toEqual({
      page: 'stats',
      collectionView: 'list',
      wrappedYear: null,
    });
    expect(parseNavigationFromPath('/wrapped/2025').navigation).toEqual({
      page: 'wrapped',
      collectionView: 'list',
      wrappedYear: 2025,
    });
  });

  it('normalizes partial and invalid paths to canonical paths', async () => {
    const { parseNavigationFromPath } = await import('../public/js/navigation.js');

    expect(parseNavigationFromPath('/collection').needsNormalization).toBe(true);
    expect(parseNavigationFromPath('/collection/nope').navigation).toEqual({
      page: 'collection',
      collectionView: 'list',
      wrappedYear: null,
    });
    expect(parseNavigationFromPath('/wrapped/not-a-year').navigation).toEqual({
      page: 'wrapped',
      collectionView: 'list',
      wrappedYear: null,
    });
    expect(parseNavigationFromPath('/nope').navigation).toEqual({
      page: 'collection',
      collectionView: 'list',
      wrappedYear: null,
    });
  });

  it('builds wrapped paths without leaking collection view state', async () => {
    const { buildNavigationPath } = await import('../public/js/navigation.js');

    const path = buildNavigationPath({
      page: 'wrapped',
      collectionView: 'grid',
      wrappedYear: 2025,
    });

    expect(path).toBe('/wrapped/2025');
  });

  it('writes clean paths while preserving only a numeric launch album param', async () => {
    window.history.replaceState({}, '', '/collection/list?album=42&foo=bar');
    const { writeNavigationToLocation } = await import('../public/js/navigation.js');

    const url = writeNavigationToLocation('replace', {
      page: 'wrapped',
      collectionView: 'grid',
      wrappedYear: 2025,
    });

    expect(url).toBe('/wrapped/2025?album=42');
    expect(window.location.pathname).toBe('/wrapped/2025');
    expect(window.location.search).toBe('?album=42');
  });

  it('syncs top-bar state and disabled collection controls for stats pages', async () => {
    window.history.replaceState({}, '', '/stats');
    const { syncNavigationFromLocation } = await import('../public/js/navigation.js');

    const parsed = syncNavigationFromLocation({ activate: false, historyMode: 'replace' });

    expect(parsed.navigation.page).toBe('stats');
    expect(stateMock.navigation.page).toBe('stats');
    expect(elMock.btnStats.classList.contains('active')).toBe(true);
    expect(elMock.btnViewList.classList.contains('active')).toBe(false);
    expect(elMock.btnViewGrid.classList.contains('active')).toBe(false);
    expect(elMock.btnToggleSidebar.disabled).toBe(true);
    expect(elMock.btnToggleUButtons.disabled).toBe(true);
    expect(elMock.pageCollection.classList.contains('hidden')).toBe(true);
    expect(elMock.pageStats.classList.contains('hidden')).toBe(false);
    expect(setHeaderTitleBaseMock).toHaveBeenCalledWith('Trackspot Stats');
  });

  it('preserves the current collection page when returning from stats', async () => {
    stateMock.navigation.page = 'stats';
    window.history.replaceState({}, '', '/collection/list');
    const { syncNavigationFromLocation } = await import('../public/js/navigation.js');

    syncNavigationFromLocation({ activate: true, historyMode: null });

    expect(applyCollectionViewStateMock).toHaveBeenCalledWith('list', expect.objectContaining({
      preservePage: true,
      load: true,
    }));
  });

  it('suppresses sidebar transitions when switching between collection views', async () => {
    const { setCollectionView } = await import('../public/js/navigation.js');

    await setCollectionView('grid');

    expect(applyCollectionViewStateMock).toHaveBeenCalledWith('grid', expect.objectContaining({
      suppressTransitions: true,
      preservePage: true,
      load: true,
    }));
  });

  it('suppresses shell transitions when switching from collection to stats', async () => {
    const content = globalThis.document.querySelector('.content');
    const sidebar = globalThis.document.querySelector('.sidebar');
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1);

    const { setPage } = await import('../public/js/navigation.js');
    await setPage('stats');

    expect(content?.style.transition).toBe('none');
    expect(sidebar?.style.transition).toBe('none');

    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it('saves the scroll position of the page being left during popstate navigation', async () => {
    stateMock.navigation.page = 'wrapped';
    window.scrollY = 420;
    window.history.replaceState({}, '', '/collection/list');
    const { syncNavigationFromLocation } = await import('../public/js/navigation.js');

    syncNavigationFromLocation({ activate: true, historyMode: null });

    expect(stateMock.navigation.scrollPositions.wrapped).toBe(420);
  });
});
