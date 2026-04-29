import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const indexHtml = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeAlbumListResponse() {
  return {
    albums: [],
    meta: {
      totalCount: 0,
      filteredCount: 0,
      currentPage: 1,
      totalPages: 1,
      startIndex: 0,
      endIndex: 0,
      isPaged: true,
      perPage: 18,
      pageCount: 0,
      trackedListenedMs: 0,
    },
  };
}

async function flushAsync() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
}

function installBrowserStubs() {
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(() => callback(Date.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', id => clearTimeout(id));
  vi.stubGlobal('scrollTo', vi.fn());
  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
  }
  window.matchMedia = query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
}

function installFetchMock() {
  const fetchMock = vi.fn(async input => {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    const url = new URL(rawUrl, 'http://localhost:1060');

    if (url.pathname === '/api/preferences') {
      return jsonResponse({});
    }
    if (url.pathname === '/api/imports/active') {
      return jsonResponse({ job: null });
    }
    if (url.pathname === '/api/welcome-tour/status') {
      return jsonResponse({
        sampleCount: 0,
        samples: [],
        shouldAutoStart: false,
        lockActive: false,
      });
    }
    if (url.pathname === '/api/albums') {
      return jsonResponse(makeAlbumListResponse());
    }
    if (url.pathname === '/api/backgrounds') {
      return jsonResponse({
        userImages: [],
        presetImages: [],
        secondaryUserImages: [],
        secondaryPresetImages: [],
      });
    }
    if (url.pathname === '/api/themes') {
      return jsonResponse({ themes: [] });
    }
    if (url.pathname === '/api/opacity-presets') {
      return jsonResponse({ presets: [] });
    }

    return jsonResponse({ error: `Unexpected request: ${url.pathname}` }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('app startup smoke', () => {
  beforeEach(() => {
    vi.resetModules();
    document.open();
    document.write(indexHtml);
    document.close();
    localStorage.clear();
    window.history.replaceState({}, '', '/collection/list');
    installBrowserStubs();
    globalThis.__TRACKSPOT_DISABLE_AUTO_INIT = true;
  });

  afterEach(() => {
    delete globalThis.__TRACKSPOT_DISABLE_AUTO_INIT;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('initializes the collection page and binds top-level navigation controls', async () => {
    const fetchMock = installFetchMock();
    const { init } = await import('../public/js/app.js');

    await init();
    await flushAsync();
    const { state } = await import('../public/js/state.js');

    expect(state.albumsLoaded).toBe(true);
    expect(document.body.classList.contains('page-collection')).toBe(true);
    expect(document.getElementById('page-collection').classList.contains('hidden')).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/albums\?/), expect.any(Object));

    document.getElementById('btn-stats').click();
    await flushAsync();

    expect(state.navigation.page).toBe('stats');
    expect(document.body.classList.contains('page-stats')).toBe(true);
    expect(document.getElementById('btn-stats').classList.contains('active')).toBe(true);
    expect(document.getElementById('page-stats').classList.contains('hidden')).toBe(false);
  });
});
