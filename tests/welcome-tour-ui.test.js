import { beforeEach, describe, expect, it, vi } from 'vitest';

const sidebarMocks = vi.hoisted(() => ({
  animateGridSidebarToggle: vi.fn(() => {
    globalThis.document?.body?.classList.toggle('sidebar-collapsed');
  }),
}));

const stateMock = {
  albums: [],
  albumDetailsCache: {},
  albumListMeta: {},
  albumsLoaded: false,
  albumsLoading: false,
  complexStatuses: [{ id: 'cs_all', name: 'All', statuses: [] }],
  filters: {},
  sort: {},
  navigation: {
    page: 'collection',
    collectionView: 'list',
    wrappedYear: null,
  },
  view: 'list',
  earlyWrapped: true,
  reserveSidebarSpace: false,
  quickActionsToolbarVisibilityMode: 'visible',
  welcomeTour: {
    active: false,
    replay: false,
    lockSessionId: null,
    sampleCount: 0,
    useRealDashboardData: false,
  },
};

async function defaultApiFetch(url) {
  if (url === '/api/welcome-tour/status') {
    return {
      preferences: {},
      sampleCount: 0,
      shouldAutoStart: false,
    };
  }
  if (url === '/api/welcome-tour/lock') {
    return { sessionId: 'tour-session' };
  }
  return {};
}

const apiFetchMock = vi.fn(defaultApiFetch);

const renderMock = vi.fn();
const loadAlbumsMock = vi.fn(async () => true);
const invalidateDashboardCacheMock = vi.fn();
const refreshActiveDashboardPageMock = vi.fn(async () => ({ refreshed: true }));
async function defaultSetPage(page) {
  stateMock.navigation.page = page;
  stateMock.view = stateMock.navigation.collectionView;
}

const setPageMock = vi.fn(defaultSetPage);
const setUButtonsMock = vi.fn(enabled => {
  globalThis.document?.body?.classList.toggle('u-buttons-enabled', enabled);
});
const syncAppShellLayoutMock = vi.fn();
const applyCollectionViewStateMock = vi.fn(view => {
  stateMock.navigation.page = 'collection';
  stateMock.navigation.collectionView = view;
  stateMock.view = view;
  globalThis.document?.body?.classList.toggle('collection-view-grid', view === 'grid');
  globalThis.document?.body?.classList.toggle('view-grid', view === 'grid');
  if (view === 'grid') {
    setUButtonsMock(true);
  }
});

vi.mock('../public/js/state.js', () => ({
  apiFetch: apiFetchMock,
  state: stateMock,
  DEFAULT_COMPLEX_STATUSES: [{ id: 'cs_all', name: 'All', statuses: [] }],
}));

vi.mock('../public/js/render.js', () => ({
  render: renderMock,
  loadAlbums: loadAlbumsMock,
}));

vi.mock('../public/js/navigation.js', () => ({
  setPage: setPageMock,
}));

vi.mock('../public/js/sidebar.js', () => ({
  animateGridSidebarToggle: sidebarMocks.animateGridSidebarToggle,
  applyCollectionViewState: applyCollectionViewStateMock,
  syncFilterControlsFromState: vi.fn(),
  updateImportTypeFilterBtn: vi.fn(),
  updateRatedFilterBtn: vi.fn(),
  updateRestoreBtn: vi.fn(),
  updateSortFieldBtn: vi.fn(),
  updateSortOrderBtn: vi.fn(),
  updateStatusFilterBtn: vi.fn(),
  updateTypeFilterBtn: vi.fn(),
}));

vi.mock('../public/js/modal.js', () => ({
  openLogModal: vi.fn(),
  closeModal: vi.fn(),
}));

vi.mock('../public/js/settings.js', () => ({
  applyThemeByName: vi.fn(),
  closePersonalization: vi.fn(),
  closeSettings: vi.fn(),
  openPersonalization: vi.fn(),
  openSettings: vi.fn(),
  refreshWelcomeTourSettings: vi.fn(async () => ({})),
  restorePersonalizationFromStorage: vi.fn(async () => {}),
  setEarlyWrappedEnabled: vi.fn(),
  setQuickActionsToolbarVisibilityMode: vi.fn(),
  setUButtons: setUButtonsMock,
}));

vi.mock('../public/js/preferences.js', () => ({
  applyPreferencesToState: vi.fn(),
}));

vi.mock('../public/js/dashboard.js', () => ({
  invalidateDashboardCache: invalidateDashboardCacheMock,
  refreshActiveDashboardPage: refreshActiveDashboardPageMock,
}));

vi.mock('../public/js/app-shell.js', () => ({
  syncAppShellLayout: syncAppShellLayoutMock,
}));

async function flushTourStep() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => requestAnimationFrame(resolve));
  await Promise.resolve();
  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function advanceTourStep() {
  const next = globalThis.document.querySelector('[data-action="next"]');
  if (next?.disabled) {
    const currentTitle = globalThis.document.querySelector('.welcome-tour-card h2')?.textContent;
    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();
    const updatedTitle = globalThis.document.querySelector('.welcome-tour-card h2')?.textContent;
    if (updatedTitle === currentTitle) {
      globalThis.document.querySelector('[data-action="next"]')?.click();
    }
  } else {
    next?.click();
  }
  await flushTourStep();
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('welcome tour UI preparation', () => {
  beforeEach(() => {
    vi.resetModules();
    apiFetchMock.mockClear();
    apiFetchMock.mockImplementation(defaultApiFetch);
    renderMock.mockClear();
    loadAlbumsMock.mockClear();
    loadAlbumsMock.mockResolvedValue(true);
    invalidateDashboardCacheMock.mockClear();
    refreshActiveDashboardPageMock.mockClear();
    refreshActiveDashboardPageMock.mockResolvedValue({ refreshed: true });
    setPageMock.mockClear();
    setPageMock.mockImplementation(defaultSetPage);
    setUButtonsMock.mockClear();
    sidebarMocks.animateGridSidebarToggle.mockClear();
    syncAppShellLayoutMock.mockClear();
    applyCollectionViewStateMock.mockClear();
    localStorage.clear();
    globalThis.document.body.className = '';
    globalThis.scrollTo = vi.fn();
    globalThis.document.body.innerHTML = `
      <header class="header">
        <button id="btn-toggle-u-buttons"></button>
        <button id="btn-toggle-sidebar"></button>
        <button id="btn-log-new"></button>
        <button id="btn-settings"></button>
        <button id="btn-personalization"></button>
        <button id="btn-stats"></button>
        <button id="btn-wrapped"></button>
        <button id="btn-view-list"></button>
        <button id="btn-view-grid"></button>
      </header>
      <aside class="sidebar"></aside>
      <div id="u-buttons"></div>
    `;
    window.innerWidth = 1024;
    stateMock.albums = [];
    stateMock.albumDetailsCache = {};
    stateMock.albumListMeta = {};
    stateMock.albumsLoaded = false;
    stateMock.albumsLoading = false;
    stateMock.navigation = {
      page: 'collection',
      collectionView: 'list',
      wrappedYear: null,
    };
    stateMock.view = 'list';
    stateMock.reserveSidebarSpace = false;
    stateMock.welcomeTour = {
      active: false,
      replay: false,
      lockSessionId: null,
      sampleCount: 0,
      useRealDashboardData: false,
    };
  });

  it('keeps quick actions disabled while preparing the grid-view step', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 7; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Grid View');
    expect(applyCollectionViewStateMock).toHaveBeenLastCalledWith('grid', expect.objectContaining({
      load: false,
      suppressTransitions: true,
      preservePage: true,
    }));
    expect(setUButtonsMock).toHaveBeenLastCalledWith(false);
  });

  it('starts collection tour steps with the sidebar collapsed', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Welcome to Trackspot');
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(true);
  });

  it('waits for the initial lock before rendering interactive tour steps', async () => {
    const lock = createDeferred();
    apiFetchMock.mockImplementation((url, options = {}) => {
      if (url === '/api/welcome-tour/status') return defaultApiFetch(url, options);
      if (url === '/api/welcome-tour/lock' && options.method === 'POST') return lock.promise;
      return defaultApiFetch(url, options);
    });
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    const startPromise = startWelcomeTour({ replay: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Starting tour');
    expect(globalThis.document.querySelector('[data-action="next"]')).toBeNull();
    expect(globalThis.document.querySelector('.welcome-tour-highlight-interactive')).toBeNull();
    expect(stateMock.welcomeTour.lockSessionId).toBeNull();

    lock.resolve({ sessionId: 'tour-session' });
    await startPromise;
    await flushTourStep();

    expect(stateMock.welcomeTour.lockSessionId).toBe('tour-session');
    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Welcome to Trackspot');
  });

  it('unwinds startup state when the initial lock fails', async () => {
    apiFetchMock.mockImplementation((url, options = {}) => {
      if (url === '/api/welcome-tour/status') return defaultApiFetch(url, options);
      if (url === '/api/welcome-tour/lock' && options.method === 'POST') {
        return Promise.reject({ status: 423, message: 'Another welcome tour is already active.' });
      }
      return defaultApiFetch(url, options);
    });
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    expect(stateMock.welcomeTour.active).toBe(false);
    expect(globalThis.document.body.classList.contains('welcome-tour-active')).toBe(false);
    expect(globalThis.document.querySelector('header')?.inert).toBe(false);
    expect(globalThis.document.querySelector('header')?.getAttribute('aria-hidden')).toBeNull();
    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Tour could not start');
    expect(globalThis.document.querySelector('.welcome-tour-error')?.textContent).toBe('Another welcome tour is already active.');
  });

  it('shows a visible startup failure when the initial status request fails', async () => {
    apiFetchMock.mockImplementation((url, options = {}) => {
      if (url === '/api/welcome-tour/status') {
        return Promise.reject(new Error('Status request failed.'));
      }
      return defaultApiFetch(url, options);
    });
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    expect(stateMock.welcomeTour.active).toBe(false);
    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Tour could not start');
    expect(globalThis.document.querySelector('.welcome-tour-error')?.textContent).toBe('Status request failed.');
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/lock', expect.objectContaining({ method: 'POST' }));
  });

  it('ignores auto-start status failures without rejecting initialization', async () => {
    apiFetchMock.mockImplementation((url, options = {}) => {
      if (url === '/api/welcome-tour/status') {
        return Promise.reject(new Error('Status request failed.'));
      }
      return defaultApiFetch(url, options);
    });
    const { maybeStartWelcomeTour } = await import('../public/js/welcome-tour.js');

    await expect(maybeStartWelcomeTour()).resolves.toBeUndefined();

    expect(stateMock.welcomeTour.active).toBe(false);
    expect(globalThis.document.querySelector('#welcome-tour-overlay')).toBeNull();
  });

  it('wraps focus inside tour actions when tabbing forward and backward', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    const buttons = Array.from(globalThis.document.querySelectorAll('#welcome-tour-overlay button'))
      .filter(button => !button.disabled);
    const first = buttons[0];
    const last = buttons.at(-1);

    last.focus();
    const tabForward = new window.KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    last.dispatchEvent(tabForward);

    expect(tabForward.defaultPrevented).toBe(true);
    expect(globalThis.document.activeElement).toBe(first);

    const tabBackward = new window.KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    first.dispatchEvent(tabBackward);

    expect(tabBackward.defaultPrevented).toBe(true);
    expect(globalThis.document.activeElement).toBe(last);
  });

  it('suppresses Escape inside the tour without closing underlying panels', async () => {
    const settings = await import('../public/js/settings.js');
    const modal = await import('../public/js/modal.js');
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();
    settings.closeSettings.mockClear();
    modal.closeModal.mockClear();
    const propagated = vi.fn();
    globalThis.document.addEventListener('keydown', propagated);

    const next = globalThis.document.querySelector('[data-action="next"]');
    const escape = new window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    next.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(propagated).not.toHaveBeenCalled();
    expect(settings.closeSettings).not.toHaveBeenCalled();
    expect(modal.closeModal).not.toHaveBeenCalled();
    globalThis.document.removeEventListener('keydown', propagated);
  });

  it('captures keys from outside the overlay and refocuses a tour control', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();
    const propagated = vi.fn();
    globalThis.document.addEventListener('keydown', propagated);

    const outsideButton = globalThis.document.querySelector('#btn-settings');
    outsideButton.focus();
    const keydown = new window.KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      cancelable: true,
    });
    outsideButton.dispatchEvent(keydown);

    expect(keydown.defaultPrevented).toBe(true);
    expect(propagated).not.toHaveBeenCalled();
    expect(globalThis.document.activeElement?.closest('#welcome-tour-overlay')).not.toBeNull();
    globalThis.document.removeEventListener('keydown', propagated);
  });

  it('restores inert state after a normal finish', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    globalThis.document.querySelector('[data-action="skip"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="empty"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="finish"]')?.click();
    await flushTourStep();

    expect(stateMock.welcomeTour.active).toBe(false);
    expect(globalThis.document.body.classList.contains('welcome-tour-active')).toBe(false);
    expect(globalThis.document.querySelector('header')?.inert).toBe(false);
    expect(globalThis.document.querySelector('header')?.getAttribute('aria-hidden')).toBeNull();
    expect(globalThis.document.querySelector('#welcome-tour-overlay')).toBeNull();
  });

  it('restores focus to the element that launched the tour after a normal finish', async () => {
    const launcher = globalThis.document.querySelector('#btn-settings');
    launcher.focus();
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    globalThis.document.querySelector('[data-action="skip"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="empty"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="finish"]')?.click();
    await flushTourStep();

    expect(globalThis.document.activeElement).toBe(launcher);
  });

  it('defers the mobile warning tour to next visit without marking it complete or skipped', async () => {
    window.innerWidth = 500;
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: false });
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent)
      .toBe('Trackspot is built for a desktop-sized window.');
    apiFetchMock.mockClear();

    globalThis.document.querySelector('[data-action="later"]')?.click();
    await flushTourStep();

    expect(stateMock.welcomeTour.active).toBe(false);
    expect(globalThis.document.querySelector('#welcome-tour-overlay')).toBeNull();
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/finish', expect.anything());
    expect(apiFetchMock).toHaveBeenCalledWith('/api/welcome-tour/lock', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ sessionId: 'tour-session' }),
    }));
  });

  it('sends a best-effort lock release on page lifecycle events', async () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(globalThis.navigator, 'sendBeacon', {
      value: sendBeacon,
      configurable: true,
    });
    const { initWelcomeTourEvents, startWelcomeTour } = await import('../public/js/welcome-tour.js');
    initWelcomeTourEvents();

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeacon).toHaveBeenCalledWith('/api/welcome-tour/lock/release', expect.any(Blob));
    expect(stateMock.welcomeTour.lockSessionId).toBeNull();
  });

  it('applies tour theme previews without persisting them', async () => {
    const settings = await import('../public/js/settings.js');
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await advanceTourStep();

    expect(settings.applyThemeByName).toHaveBeenCalledWith('Basic Blue', { persist: false });
  });

  it('ignores rapid next clicks while a step effect is still running', async () => {
    const themeEffect = createDeferred();
    const settings = await import('../public/js/settings.js');
    settings.applyThemeByName.mockClear();
    settings.applyThemeByName.mockImplementationOnce(() => themeEffect.promise);
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    const next = globalThis.document.querySelector('[data-action="next"]');
    next?.click();
    next?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Welcome to Trackspot');
    expect(globalThis.document.querySelector('[data-action="next"]')?.disabled).toBe(true);

    themeEffect.resolve();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Themes');
    expect(settings.applyThemeByName).toHaveBeenCalledTimes(1);
  });

  it('orders welcome demo albums by logged date descending', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    expect(stateMock.sort).toEqual({
      field: 'date_listened_planned',
      order: 'desc',
    });
    expect(stateMock.albums.map(album => album.album_name)).toEqual([
      'Placeholder Manual Log',
      'Placeholder Spotify Import',
    ]);
  });

  it('does not reserve sidebar space while the tour sidebar is collapsed', async () => {
    stateMock.reserveSidebarSpace = true;
    globalThis.document.body.classList.add('reserve-sidebar-space');
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(true);
    expect(globalThis.document.body.classList.contains('reserve-sidebar-space')).toBe(false);
    expect(stateMock.reserveSidebarSpace).toBe(false);
    expect(syncAppShellLayoutMock).toHaveBeenCalled();
  });

  it('expands the sidebar during the sidebar step', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 8; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Sidebar');
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(false);
    expect(globalThis.document.body.classList.contains('collection-view-grid')).toBe(true);
  });

  it('reveals quick actions with the sidebar out', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 9; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Quick Actions Toolbar');
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(false);
    expect(setUButtonsMock).toHaveBeenLastCalledWith(true);
  });

  it('requires clicking the sidebar highlight before advancing', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 8; i += 1) {
      await advanceTourStep();
    }

    const next = globalThis.document.querySelector('[data-action="next"]');
    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Sidebar');
    expect(next?.disabled).toBe(true);

    sidebarMocks.animateGridSidebarToggle.mockClear();
    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Sidebar');
    expect(globalThis.document.querySelector('[data-action="next"]')?.disabled).toBe(false);
    expect(sidebarMocks.animateGridSidebarToggle).toHaveBeenCalledTimes(1);
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(true);
  });

  it('allows keyboard activation of required highlight actions', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 8; i += 1) {
      await advanceTourStep();
    }

    const highlight = globalThis.document.querySelector('.welcome-tour-highlight-interactive');
    highlight?.focus();
    highlight?.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }));
    await flushTourStep();

    expect(globalThis.document.querySelector('[data-action="next"]')?.disabled).toBe(false);
  });

  it('uses the grid sidebar animation when returning from sidebar to grid view', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 8; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Sidebar');
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(false);

    sidebarMocks.animateGridSidebarToggle.mockClear();
    globalThis.document.querySelector('[data-action="back"]')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Grid View');
    expect(sidebarMocks.animateGridSidebarToggle).toHaveBeenCalledTimes(1);
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(true);
  });

  it('slides the sidebar back out on the quick actions step if it was toggled away', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 8; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Sidebar');
    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(true);

    await advanceTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Quick Actions Toolbar');
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(false);
  });

  it('requires the log album button click and advances into the manual modal', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 10; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Log Album Button');
    expect(globalThis.document.querySelector('[data-action="next"]')?.disabled).toBe(true);

    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Manual Album Log');
  });

  it('advances only once when an auto-advance highlight is double clicked', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 10; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Log Album Button');
    const highlight = globalThis.document.querySelector('.welcome-tour-highlight-interactive');
    highlight?.click();
    highlight?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Manual Album Log');
  });

  it('remembers the sidebar toggle requirement when returning to the sidebar step', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 8; i += 1) {
      await advanceTourStep();
    }

    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();
    await advanceTourStep();
    globalThis.document.querySelector('[data-action="back"]')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Sidebar');
    expect(globalThis.document.querySelector('[data-action="next"]')?.disabled).toBe(false);
  });

  it('requires clicking the quick actions toolbar highlight before advancing', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 9; i += 1) {
      await advanceTourStep();
    }

    const next = globalThis.document.querySelector('[data-action="next"]');
    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Quick Actions Toolbar');
    expect(next?.disabled).toBe(true);

    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Quick Actions Toolbar');
    expect(globalThis.document.querySelector('[data-action="next"]')?.disabled).toBe(false);
    expect(globalThis.document.body.classList.contains('u-buttons-enabled')).toBe(false);
  });

  it('leaves quick actions hidden on the log album button step when the toolbar was toggled off', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 9; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Quick Actions Toolbar');
    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();
    expect(globalThis.document.body.classList.contains('u-buttons-enabled')).toBe(false);

    await advanceTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Log Album Button');
    expect(globalThis.document.body.classList.contains('u-buttons-enabled')).toBe(false);
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(true);
  });

  it('hides quick actions on the log album button step when the toolbar was left on', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 9; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Quick Actions Toolbar');
    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();
    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();
    expect(globalThis.document.body.classList.contains('u-buttons-enabled')).toBe(true);

    await advanceTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Log Album Button');
    expect(globalThis.document.body.classList.contains('u-buttons-enabled')).toBe(false);
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(true);
  });

  it('remembers the quick actions toggle requirement when returning to the toolbar step', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 9; i += 1) {
      await advanceTourStep();
    }

    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();
    await advanceTourStep();
    globalThis.document.querySelector('[data-action="back"]')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Quick Actions Toolbar');
    expect(globalThis.document.querySelector('[data-action="next"]')?.disabled).toBe(false);
  });

  it('requires the settings button click and advances into settings', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 12; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Settings & More Button');
    expect(globalThis.document.querySelector('[data-action="next"]')?.disabled).toBe(true);

    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Settings & More');
  });

  it('requires the personalization button click and advances into personalization', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 14; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Personalization Button');
    expect(globalThis.document.querySelector('[data-action="next"]')?.disabled).toBe(true);

    globalThis.document.querySelector('.welcome-tour-highlight-interactive')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Personalization');
  });

  it('positions top bar button tour cards below the button with right edges aligned', async () => {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.id === 'btn-view-list') {
        return {
          x: 860,
          y: 10,
          top: 10,
          right: 900,
          bottom: 50,
          left: 860,
          width: 40,
          height: 40,
        };
      }
      if (this.id === 'btn-view-grid') {
        return {
          x: 940,
          y: 10,
          top: 10,
          right: 980,
          bottom: 50,
          left: 940,
          width: 40,
          height: 40,
        };
      }
      if (this.matches?.('header button')) {
        return {
          x: 100,
          y: 10,
          top: 10,
          right: 140,
          bottom: 50,
          left: 100,
          width: 40,
          height: 40,
        };
      }
      if (this.classList?.contains('welcome-tour-card')) {
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 420,
          bottom: 160,
          left: 0,
          width: 420,
          height: 160,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

      await startWelcomeTour({ replay: true });
      for (let i = 0; i < 6; i += 1) {
        await advanceTourStep();
      }

      const card = globalThis.document.querySelector('.welcome-tour-card');
      expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('List View');
      expect(card?.style.getPropertyValue('--welcome-tour-left')).toBe('560px');
      expect(card?.style.getPropertyValue('--welcome-tour-top')).toBe('64px');
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it('highlights top bar buttons with an accent overlay', async () => {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.id === 'btn-view-list') {
        return {
          x: 860,
          y: 10,
          top: 10,
          right: 900,
          bottom: 50,
          left: 860,
          width: 40,
          height: 40,
        };
      }
      if (this.classList?.contains('welcome-tour-card')) {
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 420,
          bottom: 160,
          left: 0,
          width: 420,
          height: 160,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

      await startWelcomeTour({ replay: true });
      for (let i = 0; i < 6; i += 1) {
        await advanceTourStep();
      }

      const highlight = globalThis.document.querySelector('.welcome-tour-highlight');
      expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('List View');
      expect(highlight).not.toBeNull();
      expect(highlight?.style.left).toBe('854px');
      expect(highlight?.style.top).toBe('4px');
      expect(highlight?.style.width).toBe('52px');
      expect(highlight?.style.height).toBe('52px');
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it('places the skip tour button at the left of normal step actions', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    const firstAction = globalThis.document.querySelector('.welcome-tour-actions button');
    expect(firstAction?.textContent).toBe('Skip tour');
    expect(firstAction?.classList.contains('welcome-tour-skip')).toBe(true);
  });

  it('skips to the penultimate step before the final spicetify step', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    globalThis.document.querySelector('[data-action="skip"]')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Get Ready to Start');
    expect(globalThis.document.querySelector('[data-action="skip"]')).toBeNull();
    expect(globalThis.document.querySelector('[data-action="samples"]')).not.toBeNull();
    expect(globalThis.document.querySelector('[data-action="empty"]')).not.toBeNull();
    expect(globalThis.document.querySelector('[data-action="next"]')).toBeNull();
    expect(Array.from(globalThis.document.querySelectorAll('.welcome-tour-actions button')).map(button => button.textContent)).toEqual([
      'Back',
      'Add placeholders',
      'Start empty',
    ]);

    globalThis.document.querySelector('[data-action="samples"]')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Spicetify Setup');
    expect(globalThis.document.querySelector('[data-action="samples"]')).toBeNull();
    expect(globalThis.document.querySelector('[data-action="finish"]')).not.toBeNull();
  });

  it('waits until finish tour to apply the ending sample choice', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();
    apiFetchMock.mockClear();

    globalThis.document.querySelector('[data-action="skip"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="samples"]')?.click();
    await flushTourStep();

    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/finish', expect.anything());
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/samples', expect.anything());
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/complete', expect.anything());

    globalThis.document.querySelector('[data-action="finish"]')?.click();
    await flushTourStep();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/welcome-tour/finish', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'tour-session',
        skipped: true,
        addSamples: true,
      }),
    }));
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/samples', expect.anything());
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/complete', expect.anything());
  });

  it('awaits the collection reload after adding samples and preserves the current page', async () => {
    const albumReload = createDeferred();
    loadAlbumsMock.mockImplementationOnce(() => albumReload.promise);
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();
    apiFetchMock.mockClear();

    globalThis.document.querySelector('[data-action="skip"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="samples"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="finish"]')?.click();
    await flushTourStep();

    expect(loadAlbumsMock).toHaveBeenCalledWith({ preservePage: true });
    expect(globalThis.document.querySelector('#welcome-tour-overlay')).not.toBeNull();

    albumReload.resolve(true);
    await flushTourStep();

    expect(globalThis.document.querySelector('#welcome-tour-overlay')).toBeNull();
  });

  it('keeps the lock and overlay until stats-page restore completes', async () => {
    const statsRestore = createDeferred();
    setPageMock.mockImplementation(async (page, options = {}) => {
      if (page === 'stats' && options.initial) {
        await statsRestore.promise;
      }
      stateMock.navigation.page = page;
      stateMock.view = stateMock.navigation.collectionView;
    });
    stateMock.navigation = {
      page: 'stats',
      collectionView: 'list',
      wrappedYear: null,
    };
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();
    apiFetchMock.mockClear();

    globalThis.document.querySelector('[data-action="skip"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="empty"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="finish"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(globalThis.document.querySelector('#welcome-tour-overlay')).not.toBeNull();
    expect(globalThis.document.body.classList.contains('welcome-tour-active')).toBe(true);
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/finish', expect.anything());
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/lock', expect.objectContaining({ method: 'DELETE' }));

    statsRestore.resolve();
    await flushTourStep();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/welcome-tour/finish', expect.objectContaining({ method: 'POST' }));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/welcome-tour/lock', expect.objectContaining({ method: 'DELETE' }));
    expect(globalThis.document.querySelector('#welcome-tour-overlay')).toBeNull();
  });

  it('refreshes restored stats with real data after sample insertion', async () => {
    const realDashboardFlags = [];
    setPageMock.mockImplementation(async (page, options = {}) => {
      if (page === 'stats' && options.initial) {
        realDashboardFlags.push(stateMock.welcomeTour.useRealDashboardData);
      }
      await defaultSetPage(page, options);
    });
    stateMock.navigation = {
      page: 'stats',
      collectionView: 'list',
      wrappedYear: null,
    };
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();

    globalThis.document.querySelector('[data-action="skip"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="samples"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="finish"]')?.click();
    await flushTourStep();

    expect(setPageMock).toHaveBeenCalledWith('stats', expect.objectContaining({
      initial: true,
      suppressTransitions: true,
    }));
    expect(realDashboardFlags).toEqual([true]);
    expect(refreshActiveDashboardPageMock).toHaveBeenCalledOnce();
    expect(stateMock.welcomeTour.useRealDashboardData).toBe(false);
  });

  it('keeps the wrapped restore overlay in place until personalization restore completes', async () => {
    const personalizationRestore = createDeferred();
    const settings = await import('../public/js/settings.js');
    settings.restorePersonalizationFromStorage.mockImplementationOnce(() => personalizationRestore.promise);
    stateMock.navigation = {
      page: 'wrapped',
      collectionView: 'grid',
      wrappedYear: 2025,
    };
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();
    apiFetchMock.mockClear();

    globalThis.document.querySelector('[data-action="skip"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="empty"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="finish"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(globalThis.document.querySelector('#welcome-tour-overlay')).not.toBeNull();
    expect(globalThis.document.body.classList.contains('welcome-tour-active')).toBe(true);
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/finish', expect.anything());

    personalizationRestore.resolve();
    await flushTourStep();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/welcome-tour/finish', expect.objectContaining({ method: 'POST' }));
    expect(globalThis.document.querySelector('#welcome-tour-overlay')).toBeNull();
  });

  it('keeps the tour active and locked when snapshot restore fails', async () => {
    const settings = await import('../public/js/settings.js');
    settings.restorePersonalizationFromStorage.mockRejectedValueOnce(new Error('Could not restore theme.'));
    stateMock.navigation = {
      page: 'wrapped',
      collectionView: 'list',
      wrappedYear: 2025,
    };
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    await flushTourStep();
    apiFetchMock.mockClear();

    globalThis.document.querySelector('[data-action="skip"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="empty"]')?.click();
    await flushTourStep();
    globalThis.document.querySelector('[data-action="finish"]')?.click();
    await flushTourStep();

    expect(stateMock.welcomeTour.active).toBe(true);
    expect(globalThis.document.querySelector('#welcome-tour-overlay')).not.toBeNull();
    expect(globalThis.document.body.classList.contains('welcome-tour-active')).toBe(true);
    expect(globalThis.document.querySelector('.welcome-tour-error')?.textContent).toBe('Could not restore theme.');
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/finish', expect.anything());
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/lock', expect.objectContaining({ method: 'DELETE' }));
  });

  it('positions control and modal steps with the top bar cards', async () => {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.id === 'btn-view-grid') {
        return {
          x: 940,
          y: 10,
          top: 10,
          right: 980,
          bottom: 50,
          left: 940,
          width: 40,
          height: 40,
        };
      }
      if (this.matches?.('header button')) {
        return {
          x: 100,
          y: 10,
          top: 10,
          right: 140,
          bottom: 50,
          left: 100,
          width: 40,
          height: 40,
        };
      }
      if (this.classList?.contains('welcome-tour-card')) {
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 420,
          bottom: 160,
          left: 0,
          width: 420,
          height: 160,
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

      await startWelcomeTour({ replay: true });
      for (let i = 0; i < 8; i += 1) {
        await advanceTourStep();
      }

      const expectedTitles = [
        'Sidebar',
        'Quick Actions Toolbar',
        'Log Album Button',
        'Manual Album Log',
        'Settings & More Button',
        'Settings & More',
        'Personalization Button',
        'Personalization',
      ];

      for (const title of expectedTitles) {
        const card = globalThis.document.querySelector('.welcome-tour-card');
        expect(card?.querySelector('h2')?.textContent).toBe(title);
        expect(card?.style.getPropertyValue('--welcome-tour-left')).toBe('560px');
        expect(card?.style.getPropertyValue('--welcome-tour-top')).toBe('64px');
        if (title !== expectedTitles.at(-1)) {
          await advanceTourStep();
        }
      }
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it('contracts sidebar and quick actions on the log album button step', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 10; i += 1) {
      await advanceTourStep();
    }

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Log Album Button');
    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(true);
    expect(globalThis.document.body.classList.contains('u-buttons-enabled')).toBe(false);
    expect(setUButtonsMock).toHaveBeenLastCalledWith(false);
  });

  it('returns to list view on the spicetify setup step', async () => {
    const { startWelcomeTour } = await import('../public/js/welcome-tour.js');

    await startWelcomeTour({ replay: true });
    for (let i = 0; i < 18; i += 1) {
      await advanceTourStep();
    }
    globalThis.document.querySelector('[data-action="empty"]')?.click();
    await flushTourStep();

    expect(globalThis.document.querySelector('.welcome-tour-card h2')?.textContent).toBe('Spicetify Setup');
    expect(globalThis.document.body.classList.contains('collection-view-grid')).toBe(false);
    expect(stateMock.view).toBe('list');
  });
});
