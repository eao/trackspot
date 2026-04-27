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
  },
};

const apiFetchMock = vi.fn(async url => {
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
});

const renderMock = vi.fn();
const setPageMock = vi.fn(async page => {
  stateMock.navigation.page = page;
  stateMock.view = stateMock.navigation.collectionView;
});
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
  loadAlbums: vi.fn(),
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
  invalidateDashboardCache: vi.fn(),
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

describe('welcome tour UI preparation', () => {
  beforeEach(() => {
    vi.resetModules();
    apiFetchMock.mockClear();
    renderMock.mockClear();
    setPageMock.mockClear();
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

    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/samples', expect.anything());
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/welcome-tour/complete', expect.anything());

    globalThis.document.querySelector('[data-action="finish"]')?.click();
    await flushTourStep();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/welcome-tour/samples', { method: 'POST' });
    expect(apiFetchMock).toHaveBeenCalledWith('/api/welcome-tour/complete', expect.objectContaining({
      method: 'POST',
    }));
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
