import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const modulePath = '../trackspot-spicetify.js';
const originalFetch = globalThis.fetch;

let helpers;

function loadHelpers() {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath).__private;
}

function installAlbumEndExceptionSpicetify({ exceptionType = 'all', minutes = '8', request } = {}) {
  const graphqlRequest = request ?? vi.fn().mockResolvedValue({
    data: {
      albumUnion: {
        type: 'SINGLE',
        tracksV2: {
          totalCount: 1,
          items: [{ track: { duration: { totalMilliseconds: 120000 } } }],
        },
      },
    },
  });

  globalThis.Spicetify = {
    Platform: {
      LocalStorageAPI: {
        getItem: vi.fn((key) => {
          if (key === 'trackspot_albumEndPlaybackExceptionType') return exceptionType;
          if (key === 'trackspot_albumEndPlaybackExceptionMinutes') return minutes;
          return null;
        }),
        setItem: vi.fn(),
      },
    },
    GraphQL: {
      Request: graphqlRequest,
      Definitions: { getAlbum: { name: 'getAlbum' } },
    },
  };

  return graphqlRequest;
}

function installAlbumPlaybackMonitorSpicetify({
  autoStop = true,
  autoLog = false,
  exceptionType = 'all',
  minutes = '0',
  request,
  playerState,
  progress = 0,
} = {}) {
  const graphqlRequest = request ?? vi.fn().mockResolvedValue({
    data: {
      albumUnion: {
        type: 'ALBUM',
        tracksV2: {
          totalCount: 1,
          items: [{ track: { uri: playerState?.track?.uri, duration: { totalMilliseconds: playerState?.duration ?? 1 } } }],
        },
      },
    },
  });
  const pause = vi.fn();
  const platformPause = vi.fn();
  let progressMs = progress;

  globalThis.Spicetify = {
    Platform: {
      LocalStorageAPI: {
        getItem: vi.fn((key) => {
          if (key === 'trackspot_autoStopAlbumPlaybackAtEnd') return autoStop ? 'true' : 'false';
          if (key === 'trackspot_autoLogAlbumAtEnd') return autoLog ? 'true' : 'false';
          if (key === 'trackspot_albumEndPlaybackExceptionType') return exceptionType;
          if (key === 'trackspot_albumEndPlaybackExceptionMinutes') return minutes;
          return null;
        }),
        setItem: vi.fn(),
      },
      PlayerAPI: { pause: platformPause },
    },
    Player: {
      data: playerState,
      getProgress: vi.fn(() => progressMs),
      pause,
      addEventListener: vi.fn(),
    },
    GraphQL: {
      Request: graphqlRequest,
      Definitions: { getAlbum: { name: 'getAlbum' } },
    },
    showNotification: vi.fn(),
  };

  return {
    pause,
    platformPause,
    request: graphqlRequest,
    setPlayerState(nextPlayerState) {
      globalThis.Spicetify.Player.data = nextPlayerState;
    },
    setProgress(nextProgressMs) {
      progressMs = nextProgressMs;
    },
  };
}

function createFinalAlbumPlaybackState(albumId = 'album123') {
  return {
    context_uri: `spotify:album:${albumId}`,
    session_id: `session-${albumId}`,
    duration: 180000,
    is_paused: false,
    track: {
      uri: `spotify:track:last-${albumId}`,
      metadata: {
        album_uri: `spotify:album:${albumId}`,
        album_disc_number: '1',
        album_disc_count: '1',
        album_track_number: '1',
        album_track_count: '1',
      },
    },
    next_tracks: [],
  };
}

beforeAll(() => {
  globalThis.__TRACKSPOT_DISABLE_AUTO_INIT = true;
  helpers = loadHelpers();
});

afterEach(() => {
  helpers?.removeLogModal?.();
  helpers?.clearLogModalDraftForAlbum?.();
  helpers?.hideTrackspotTooltips?.({ destroyDetached: true });
  delete globalThis.Spicetify;
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => {
  delete globalThis.__TRACKSPOT_DISABLE_AUTO_INIT;
  delete globalThis.Spicetify;
  delete require.cache[require.resolve(modulePath)];
});

describe('trackspot spicetify helpers', () => {
  it('prefers the first reachable server and preserves cached state on 304-like refreshes', async () => {
    const serverUrls = ['http://primary:3000', 'http://backup:3000'];
    const cachedPrimary = {
      revision: '1:2026-04-14T10:00:00',
      albumsBySpotifyId: {
        PRIMARYALBUM1234567890: { id: 15, status: 'planned' },
      },
      fetchedAt: 111,
    };
    const cachedBackup = {
      revision: '9:2026-04-14T12:00:00',
      albumsBySpotifyId: {
        BACKUPALBUM12345678901: { id: 99, status: 'completed' },
      },
      fetchedAt: 222,
    };

    const result = await helpers.resolveAlbumIndexFromServers(serverUrls, {
      loadCache(serverUrl) {
        return serverUrl === serverUrls[0] ? cachedPrimary : cachedBackup;
      },
      async fetchIndex(serverUrl, cachedState) {
        if (serverUrl === serverUrls[0]) {
          return { notModified: true, state: cachedState };
        }
        throw new Error('should not fall through to backup when primary is reachable');
      },
    });

    expect(result).toEqual({
      serverUrl: 'http://primary:3000',
      state: cachedPrimary,
      notModified: true,
      error: null,
    });
  });

  it('returns the last connection error when no configured server can be reached', async () => {
    const networkError = new Error('fetch failed');
    networkError.isNetworkError = true;

    const result = await helpers.resolveAlbumIndexFromServers(['http://primary:3000'], {
      loadCache() {
        return helpers.createEmptyAlbumIndexState();
      },
      async fetchIndex() {
        throw networkError;
      },
    });

    expect(result).toEqual({
      serverUrl: null,
      state: null,
      notModified: false,
      error: networkError,
    });
  });

  it('uses an in-memory CSV worker id and per-client notification dedupe state', () => {
    const storageApi = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    };
    globalThis.Spicetify = {
      Platform: { LocalStorageAPI: storageApi },
      showNotification: vi.fn(),
    };

    const firstClientHelpers = loadHelpers();
    const firstWorkerId = firstClientHelpers.getCsvWorkerId();

    expect(firstWorkerId).toBe(firstClientHelpers.getCsvWorkerId());
    expect(storageApi.getItem).not.toHaveBeenCalled();
    expect(storageApi.setItem).not.toHaveBeenCalled();

    firstClientHelpers.notifyCsvJobStarted({ id: 42 });
    firstClientHelpers.notifyCsvJobStarted({ id: 42 });
    firstClientHelpers.notifyCsvJobTerminal({
      id: 42,
      status: 'completed',
      failed_rows: 0,
      warning_rows: 0,
    });
    firstClientHelpers.notifyCsvJobTerminal({
      id: 42,
      status: 'completed',
      failed_rows: 0,
      warning_rows: 0,
    });

    expect(globalThis.Spicetify.showNotification).toHaveBeenCalledTimes(2);

    globalThis.Spicetify = {
      Platform: { LocalStorageAPI: storageApi },
      showNotification: vi.fn(),
    };

    const secondClientHelpers = loadHelpers();
    expect(secondClientHelpers.getCsvWorkerId()).not.toBe(firstWorkerId);

    secondClientHelpers.notifyCsvJobStarted({ id: 42 });
    secondClientHelpers.notifyCsvJobTerminal({
      id: 42,
      status: 'completed',
      failed_rows: 0,
      warning_rows: 0,
    });

    expect(globalThis.Spicetify.showNotification).toHaveBeenCalledTimes(2);
    expect(storageApi.getItem).not.toHaveBeenCalled();
    expect(storageApi.setItem).not.toHaveBeenCalled();
  });

  it('paginates album GraphQL requests so long albums keep full track data', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        data: {
          albumUnion: {
            name: 'Long Album',
            tracksV2: {
              totalCount: 75,
              items: Array.from({ length: 50 }, (_value, index) => ({
                track: { duration: { totalMilliseconds: 1000 + index } },
              })),
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          albumUnion: {
            tracksV2: {
              totalCount: 75,
              items: Array.from({ length: 25 }, (_value, index) => ({
                track: { duration: { totalMilliseconds: 2000 + index } },
              })),
            },
          },
        },
      });

    globalThis.Spicetify = {
      GraphQL: {
        Request: request,
        Definitions: { getAlbum: { name: 'getAlbum' } },
      },
    };

    const result = await helpers.fetchAlbumData('spotify:album:LONGALBUM123');

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1]).toMatchObject({ limit: 50, offset: 0 });
    expect(request.mock.calls[1][1]).toMatchObject({ limit: 50, offset: 50 });
    expect(result.data.albumUnion.tracksV2.totalCount).toBe(75);
    expect(result.data.albumUnion.tracksV2.items).toHaveLength(75);
    expect(result.data.albumUnion.tracksV2.items[0].track.duration.totalMilliseconds).toBe(1000);
    expect(result.data.albumUnion.tracksV2.items[74].track.duration.totalMilliseconds).toBe(2024);
  });

  it('fails album GraphQL fetches when a later page cannot be loaded', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        data: {
          albumUnion: {
            tracksV2: {
              totalCount: 60,
              items: Array.from({ length: 50 }, () => ({
                track: { duration: { totalMilliseconds: 1000 } },
              })),
            },
          },
        },
      })
      .mockResolvedValueOnce({
        errors: [{ message: 'Page 2 failed.' }],
      });

    globalThis.Spicetify = {
      GraphQL: {
        Request: request,
        Definitions: { getAlbum: { name: 'getAlbum' } },
      },
    };

    await expect(helpers.fetchAlbumData('spotify:album:LONGALBUM123'))
      .rejects
      .toThrow('Page 2 failed.');
  });

  it('extracts track URIs from Spotify track URLs and URIs', () => {
    expect(helpers.extractTrackUri('spotify:track:3n3Ppam7vgaVa1iaRUc9Lp'))
      .toBe('spotify:track:3n3Ppam7vgaVa1iaRUc9Lp');
    expect(helpers.extractTrackUri('https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp?si=123'))
      .toBe('spotify:track:3n3Ppam7vgaVa1iaRUc9Lp');
  });

  it('defaults markdown-style track copying to enabled and sanitizes markdown labels', () => {
    const storageApi = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };
    globalThis.Spicetify = {
      Platform: { LocalStorageAPI: storageApi },
    };

    expect(helpers.getCopyMarkdownStyleTrackLinkEnabled()).toBe(true);
    expect(helpers.sanitizeMarkdownLinkText('Dead [Wood]\nLive')).toBe('Dead (Wood) Live');
  });

  it('resolves a track URI from nearby React internals on a track title', () => {
    document.body.innerHTML = `
      <div class="main-trackList-trackListRow">
        <div class="main-trackList-rowMainContentTitle">Track Title</div>
      </div>
    `;

    const titleElement = document.querySelector('.main-trackList-rowMainContentTitle');
    titleElement.__reactProps$test = {
      children: {
        props: {
          uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
        },
      },
    };

    expect(helpers.resolveTrackUriFromElement(titleElement))
      .toBe('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
  });

  it('resolves a track URI from a nested track link inside a generic row', () => {
    document.body.innerHTML = `
      <div role="row">
        <div class="likedSongsTrackCell">
          <a href="https://open.spotify.com/track/0ofHAoxe9vBkTCp2UQIavz?si=test">
            <span>Hey Ya!</span>
          </a>
        </div>
      </div>
    `;

    const titleText = document.querySelector('.likedSongsTrackCell span');
    expect(helpers.resolveTrackUriFromElement(titleText))
      .toBe('spotify:track:0ofHAoxe9vBkTCp2UQIavz');
  });

  it('resolves a track URI from an outer liked-songs row wrapper', () => {
    document.body.innerHTML = `
      <div role="row" aria-rowindex="16">
        <div class="main-trackList-trackListRow main-trackList-trackListRowGrid" role="presentation">
          <div class="main-trackList-rowSectionStart" role="gridcell" aria-colindex="2">
            <div class="main-trackList-rowMainContent">
              <div class="main-trackList-rowMainContentTitle">Dead Wood</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const outerRow = document.querySelector('[role="row"]');
    outerRow.__reactProps$test = {
      children: {
        props: {
          uri: 'spotify:track:5oGiNO6DayPI7bZ3Ro8OQ0',
        },
      },
    };

    const titleElement = document.querySelector('.main-trackList-rowMainContentTitle');
    expect(helpers.resolveTrackUriFromElement(titleElement))
      .toBe('spotify:track:5oGiNO6DayPI7bZ3Ro8OQ0');
  });

  it('syncs the title hover class from the copy-link setting', () => {
    const storageApi = {
      getItem: vi.fn(() => 'true'),
      setItem: vi.fn(),
    };
    globalThis.Spicetify = {
      Platform: { LocalStorageAPI: storageApi },
    };

    helpers.ensureTrackLinkCopyHoverStyle(document);
    helpers.syncTrackLinkCopyTitleUi(document);

    expect(document.documentElement.classList.contains('trackspot-copy-share-link-enabled')).toBe(true);
    expect(document.head.querySelectorAll('#trackspot-copy-share-link-hover-style')).toHaveLength(1);
  });

  it('shows a transient copy popup to the right of the clicked title', () => {
    vi.useFakeTimers();

    document.body.innerHTML = `
      <div>
        <div class="main-trackList-rowMainContentTitle">Track Title</div>
      </div>
    `;

    const titleElement = document.querySelector('.main-trackList-rowMainContentTitle');
    titleElement.getBoundingClientRect = () => ({
      top: 40,
      right: 180,
      height: 20,
    });

    const popup = helpers.showTrackLinkCopyPopup(titleElement, { document, window });
    expect(popup).not.toBeNull();
    expect(popup.className).toBe('trackspot-copy-share-link-popup');
    expect(popup.style.left).toBe('190px');
    expect(popup.style.top).toBe('50px');

    vi.advanceTimersByTime(80);
    expect(popup.classList.contains('is-fading')).toBe(true);

    vi.advanceTimersByTime(920);
    expect(document.body.querySelector('.trackspot-copy-share-link-popup')).toBeNull();
  });

  it('copies a markdown track link by default when the title-copy setting is enabled', async () => {
    const storageApi = {
      getItem: vi.fn((key) => (key === 'trackspot_copyShareLinkOnTrackTitleClick' ? 'true' : null)),
      setItem: vi.fn(),
    };
    const copy = vi.fn().mockResolvedValue(undefined);
    globalThis.Spicetify = {
      Platform: {
        LocalStorageAPI: storageApi,
        ClipboardAPI: { copy },
      },
    };

    document.body.innerHTML = `
      <div class="main-trackList-trackListRow">
        <div class="main-trackList-rowMainContentTitle">Track Title</div>
      </div>
    `;

    const titleElement = document.querySelector('.main-trackList-rowMainContentTitle');
    titleElement.__reactProps$test = {
      children: {
        props: {
          uri: 'spotify:track:5zmCTwbLnQK7sOVu6V7ChA',
        },
      },
    };

    const copied = await helpers.maybeCopyTrackShareLinkFromClick({
      target: titleElement,
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });

    expect(copied).toBe(true);
    expect(copy).toHaveBeenCalledWith('[Track Title](spotify:track:5zmCTwbLnQK7sOVu6V7ChA)');
    expect(document.body.querySelector('.trackspot-copy-share-link-popup')).not.toBeNull();
  });

  it('copies a markdown track link from a liked-songs-style track row', async () => {
    const storageApi = {
      getItem: vi.fn((key) => (key === 'trackspot_copyShareLinkOnTrackTitleClick' ? 'true' : null)),
      setItem: vi.fn(),
    };
    const copy = vi.fn().mockResolvedValue(undefined);
    globalThis.Spicetify = {
      Platform: {
        LocalStorageAPI: storageApi,
        ClipboardAPI: { copy },
      },
    };

    document.body.innerHTML = `
      <div role="row">
        <div class="likedSongsTrackCell">
          <a href="https://open.spotify.com/track/6habFhsOp2NvshLv26DqMb">
            <span>Dreams</span>
          </a>
        </div>
      </div>
    `;

    const titleText = document.querySelector('.likedSongsTrackCell span');

    const copied = await helpers.maybeCopyTrackShareLinkFromClick({
      target: titleText,
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });

    expect(copied).toBe(true);
    expect(copy).toHaveBeenCalledWith('[Dreams](spotify:track:6habFhsOp2NvshLv26DqMb)');
    expect(document.body.querySelector('.trackspot-copy-share-link-popup')).not.toBeNull();
  });

  it('copies a markdown track link when the track URI lives on an outer liked-songs row wrapper', async () => {
    const storageApi = {
      getItem: vi.fn((key) => (key === 'trackspot_copyShareLinkOnTrackTitleClick' ? 'true' : null)),
      setItem: vi.fn(),
    };
    const copy = vi.fn().mockResolvedValue(undefined);
    globalThis.Spicetify = {
      Platform: {
        LocalStorageAPI: storageApi,
        ClipboardAPI: { copy },
      },
    };

    document.body.innerHTML = `
      <div role="row" aria-rowindex="16">
        <div class="main-trackList-trackListRow main-trackList-trackListRowGrid" role="presentation">
          <div class="main-trackList-rowSectionStart" role="gridcell" aria-colindex="2">
            <div class="main-trackList-rowMainContent">
              <div class="main-trackList-rowMainContentTitle">Dead Wood</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const outerRow = document.querySelector('[role="row"]');
    outerRow.__reactProps$test = {
      children: {
        props: {
          uri: 'spotify:track:5oGiNO6DayPI7bZ3Ro8OQ0',
        },
      },
    };

    const titleElement = document.querySelector('.main-trackList-rowMainContentTitle');

    const copied = await helpers.maybeCopyTrackShareLinkFromClick({
      target: titleElement,
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });

    expect(copied).toBe(true);
    expect(copy).toHaveBeenCalledWith('[Dead Wood](spotify:track:5oGiNO6DayPI7bZ3Ro8OQ0)');
    expect(document.body.querySelector('.trackspot-copy-share-link-popup')).not.toBeNull();
  });

  it('can still copy the native share link when markdown copying is turned off', async () => {
    const storageApi = {
      getItem: vi.fn((key) => {
        if (key === 'trackspot_copyShareLinkOnTrackTitleClick') return 'true';
        if (key === 'trackspot_copyMarkdownStyleTrackLink') return 'false';
        return null;
      }),
      setItem: vi.fn(),
    };
    const copy = vi.fn().mockResolvedValue(undefined);
    globalThis.Spicetify = {
      Platform: {
        LocalStorageAPI: storageApi,
        ClipboardAPI: { copy },
      },
    };

    document.body.innerHTML = `
      <div class="main-trackList-trackListRow">
        <div class="main-trackList-rowMainContentTitle">Track Title</div>
      </div>
    `;

    const titleElement = document.querySelector('.main-trackList-rowMainContentTitle');
    titleElement.__reactProps$test = {
      children: {
        props: {
          uri: 'spotify:track:5zmCTwbLnQK7sOVu6V7ChA',
        },
      },
    };

    const copied = await helpers.maybeCopyTrackShareLinkFromClick({
      target: titleElement,
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });

    expect(copied).toBe(true);
    expect(copy).toHaveBeenCalledWith('https://open.spotify.com/track/5zmCTwbLnQK7sOVu6V7ChA');
    expect(document.body.querySelector('.trackspot-copy-share-link-popup')).not.toBeNull();
  });

  it('derives album UI states and action routing from cached status', () => {
    expect(helpers.deriveAlbumUiState({
      hasCurrentAlbum: false,
      activeServerUrl: 'http://localhost:1060',
      isResolving: false,
      record: null,
    })).toBe('unavailable');

    expect(helpers.deriveAlbumUiState({
      hasCurrentAlbum: true,
      activeServerUrl: null,
      isResolving: true,
      record: null,
    })).toBe('checking');

    expect(helpers.deriveAlbumUiState({
      hasCurrentAlbum: true,
      activeServerUrl: 'http://localhost:1060',
      isResolving: false,
      record: { id: 1, status: 'planned' },
    })).toBe('planned');

    expect(helpers.deriveAlbumUiState({
      hasCurrentAlbum: true,
      activeServerUrl: 'http://localhost:1060',
      isResolving: false,
      record: { id: 1, status: 'completed' },
    })).toBe('completed');

    expect(helpers.deriveAlbumUiState({
      hasCurrentAlbum: true,
      activeServerUrl: 'http://localhost:1060',
      isResolving: false,
      record: { id: 1, status: 'planned' },
      serverConnectionState: 'offline',
    })).toBe('offline');

    expect(helpers.getActionBehavior('upload', 'missing')).toBe('import-completed-open');
    expect(helpers.getActionBehavior('upload', 'checking')).toBe('import-completed-open');
    expect(helpers.getActionBehavior('upload', 'completed')).toBe('open-existing');
    expect(helpers.getActionBehavior('upload', 'planned')).toBe('open-existing');
    expect(helpers.getActionBehavior('upload', 'offline')).toBe('disabled');
    expect(helpers.getActionBehavior('plan', 'planned')).toBe('noop-already-planned');
    expect(helpers.getActionBehavior('plan', 'dropped')).toBe('noop-already-logged');
    expect(helpers.getActionBehavior('plan', 'offline')).toBe('disabled');
    expect(helpers.getActionBehavior('log', 'missing')).toBe('open-log-create');
    expect(helpers.getActionBehavior('log', 'planned')).toBe('open-log-edit');
    expect(helpers.getActionBehavior('log', 'offline')).toBe('disabled');
    expect(helpers.getActionBehavior('open', 'offline')).toBe('disabled');
  });

  it('derives indexed album UI state without relying on the currently open album page', () => {
    expect(helpers.deriveIndexedAlbumUiState({
      spotifyAlbumId: 'AAA111',
      activeServerUrl: 'http://localhost:1060',
      isResolving: false,
      albumsBySpotifyId: {
        AAA111: { id: 10, status: 'planned' },
      },
    })).toBe('planned');

    expect(helpers.deriveIndexedAlbumUiState({
      spotifyAlbumId: 'BBB222',
      activeServerUrl: 'http://localhost:1060',
      isResolving: false,
      albumsBySpotifyId: {
        AAA111: { id: 10, status: 'planned' },
      },
    })).toBe('missing');

    expect(helpers.deriveIndexedAlbumUiState({
      spotifyAlbumId: 'CCC333',
      activeServerUrl: null,
      isResolving: true,
      albumsBySpotifyId: {},
    })).toBe('checking');

    expect(helpers.deriveIndexedAlbumUiState({
      spotifyAlbumId: 'AAA111',
      activeServerUrl: 'http://localhost:1060',
      isResolving: false,
      albumsBySpotifyId: {
        AAA111: { id: 10, status: 'planned' },
      },
      serverConnectionState: 'offline',
    })).toBe('offline');
  });

  it('renders offline action buttons as disabled without stale success styling', () => {
    const offlinePlanned = helpers.getButtonVisualState('plan', 'offline', true, false);
    expect(offlinePlanned.disabled).toBe(true);
    expect(offlinePlanned.isGreen).toBe(false);
    expect(offlinePlanned.color).toMatch(/^rgba\(243,246,255,/);
    expect(offlinePlanned.borderColor).toMatch(/^rgba\(255,255,255,/);
    expect(offlinePlanned.opacity).toBe('0.60');

    expect(helpers.getButtonVisualState('log', 'completed', true, true)).toEqual({
      disabled: false,
      isGreen: true,
      color: '#1ED760',
      borderColor: '#1ED760',
      opacity: '1',
    });

    const offlineMissing = helpers.getButtonVisualState('upload', 'missing', true, false);
    expect(offlineMissing.disabled).toBe(true);
    expect(offlineMissing.isGreen).toBe(false);
    expect(offlineMissing.color).toMatch(/^rgba\(243,246,255,/);
    expect(offlineMissing.borderColor).toMatch(/^rgba\(255,255,255,/);
    expect(offlineMissing.opacity).toBe('0.60');

    const onlineMissing = helpers.getButtonVisualState('upload', 'missing', true, true);
    expect(onlineMissing.disabled).toBe(false);
    expect(onlineMissing.isGreen).toBe(false);
    expect(onlineMissing.color).toBe('#f3f6ff');
    expect(onlineMissing.borderColor).toBe('rgba(255,255,255,0.14)');
    expect(onlineMissing.opacity).toBe('1');
  });

  it('uses disabled-state tooltips for offline connections and log/edit wording for the upload action', () => {
    expect(helpers.getActionTooltip('plan', 'missing', true, false)).toBe('No connection to Trackspot server.');
    expect(helpers.getActionTooltip('plan', 'offline', true, false)).toBe('No connection to Trackspot server.');
    expect(helpers.getActionTooltip('log', 'offline', true, false)).toBe('No connection to Trackspot server.');
    expect(helpers.getActionTooltip('upload', 'missing', true, true)).toBe('Log/Edit Album in Trackspot');
    expect(helpers.getActionTooltip('upload', 'planned', true, true)).toBe('Log/Edit Album in Trackspot');
  });

  it('hides connected tooltips and destroys detached tooltip hosts during cleanup', () => {
    const connectedInstance = {
      show: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
    };
    const detachedInstance = {
      show: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
    };
    const tippy = vi.fn()
      .mockReturnValueOnce(connectedInstance)
      .mockReturnValueOnce(detachedInstance);

    globalThis.Spicetify = { Tippy: tippy };

    const connectedButton = document.createElement('button');
    connectedButton.textContent = 'Connected';
    const connectedHost = helpers.attachTooltip(connectedButton, 'Connected tooltip');
    document.body.appendChild(connectedHost);

    const detachedButton = document.createElement('button');
    detachedButton.textContent = 'Detached';
    const detachedHost = helpers.attachTooltip(detachedButton, 'Detached tooltip');
    document.body.appendChild(detachedHost);
    detachedHost.remove();

    helpers.hideTrackspotTooltips({ destroyDetached: true });

    expect(connectedInstance.hide).toHaveBeenCalledTimes(1);
    expect(connectedInstance.destroy).not.toHaveBeenCalled();
    expect(detachedInstance.hide).toHaveBeenCalledTimes(1);
    expect(detachedInstance.destroy).toHaveBeenCalledTimes(1);
  });

  it('tags connection failures so auto-sync notifications can distinguish them', () => {
    const error = helpers.buildServerConnectError(['http://localhost:1060']);

    expect(helpers.isConnectionFailureError(error)).toBe(true);
    expect(helpers.getAutoSyncConnectionErrorMessage('auto-plan this saved album', error))
      .toBe("Couldn't auto-plan this saved album because Trackspot couldn't connect to the server. Could not connect to Trackspot. Is the server running at http://localhost:1060?");
  });

  it('derives a server base URL from API request URLs', () => {
    expect(helpers.getServerUrlFromRequestUrl('http://localhost:1060/api/albums/42'))
      .toBe('http://localhost:1060');
  });

  it('builds create and edit defaults for the log modal', () => {
    expect(helpers.getLogModalDefaults(null, { todayIso: '2026-04-15' })).toEqual({
      status: 'completed',
      repeats: 0,
      planned_at: '',
      listened_at: '2026-04-15',
      rating: null,
      notes: null,
    });

    expect(helpers.getLogModalDefaults({
      status: 'dropped',
      repeats: 3,
      planned_at: '2026-04-11',
      listened_at: null,
      rating: 74,
      notes: 'Existing note',
    }, { todayIso: '2026-04-15' })).toEqual({
      status: 'dropped',
      repeats: 3,
      planned_at: '2026-04-11',
      listened_at: '',
      rating: 74,
      notes: 'Existing note',
    });

    expect(helpers.getLogModalDefaults({
      status: 'planned',
      repeats: null,
      planned_at: null,
      listened_at: null,
      rating: null,
      notes: null,
    }, { todayIso: '2026-04-15' })).toEqual({
      status: 'completed',
      repeats: 0,
      planned_at: '',
      listened_at: '2026-04-15',
      rating: null,
      notes: null,
    });

    expect(helpers.getLogModalDefaults(null, {
      todayIso: '2026-04-15',
      initialStatus: 'planned',
    })).toEqual({
      status: 'planned',
      repeats: 0,
      planned_at: '2026-04-15',
      listened_at: '',
      rating: null,
      notes: null,
    });
  });

  it('merges draft values over log modal defaults', () => {
    expect(helpers.mergeLogModalDraftValues(
      {
        status: 'completed',
        repeats: 0,
        planned_at: '',
        listened_at: '2026-04-15',
        rating: null,
        notes: null,
      },
      {
        status: 'planned',
        repeats: '2',
        notes: 'Draft note',
      }
    )).toEqual({
      status: 'planned',
      repeats: '2',
      planned_at: '',
      listened_at: '2026-04-15',
      rating: null,
      notes: 'Draft note',
    });
  });

  it('keeps an unsaved log draft for the same album and clears it on navigation away', () => {
    const refs = {
      statusInput: { value: 'completed' },
      repeatsInput: { value: '3' },
      plannedDateInput: { value: '2026-04-10' },
      dateInput: { value: '2026-04-15' },
      ratingInput: { value: '88' },
      notesInput: { value: 'Draft note' },
    };

    helpers.updateLogModalDraftForAlbum('spotify:album:AAA', refs);

    expect(helpers.getLogModalDraftForAlbum('spotify:album:AAA')).toEqual({
      status: 'completed',
      repeats: '3',
      planned_at: '2026-04-10',
      listened_at: '2026-04-15',
      rating: '88',
      notes: 'Draft note',
    });

    helpers.handleLogModalNavigation('spotify:album:AAA', 'spotify:album:AAA');
    expect(helpers.getLogModalDraftForAlbum('spotify:album:AAA')).not.toBeNull();

    helpers.handleLogModalNavigation('spotify:album:BBB', 'spotify:album:AAA');
    expect(helpers.getLogModalDraftForAlbum('spotify:album:AAA')).toBeNull();
  });

  it('uses a right-shifted horizontal transform for the log modal', () => {
    expect(helpers.getLogModalHorizontalOffsetCss()).toBe('translateX(min(10vw, 160px))');
  });

  it('reopens the log modal with the same draft for the same album', async () => {
    const graphqlData = {
      data: {
        albumUnion: {
          name: 'Draft Album',
          artists: {
            items: [{ profile: { name: 'Draft Artist' } }],
          },
        },
      },
    };

    helpers.openLogModal({
      mode: 'create',
      serverUrl: 'http://localhost:1060',
      graphqlData,
      albumUri: 'spotify:album:AAA',
    });

    const notesInput = document.querySelector('textarea');
    notesInput.value = 'Keep this draft';
    notesInput.dispatchEvent(new Event('input', { bubbles: true }));

    const cancelButton = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === 'Cancel');
    cancelButton.click();

    helpers.openLogModal({
      mode: 'create',
      serverUrl: 'http://localhost:1060',
      graphqlData,
      albumUri: 'spotify:album:AAA',
    });

    expect(document.querySelector('textarea').value).toBe('Keep this draft');
  });

  it('scrolls the page behind the log modal except when wheeling the focused rating field', () => {
    const scrollBy = vi.fn();
    globalThis.window.scrollBy = scrollBy;

    const graphqlData = {
      data: {
        albumUnion: {
          name: 'Draft Album',
          artists: {
            items: [{ profile: { name: 'Draft Artist' } }],
          },
        },
      },
    };

    helpers.openLogModal({
      mode: 'create',
      serverUrl: 'http://localhost:1060',
      graphqlData,
      albumUri: 'spotify:album:AAA',
    });

    const modal = document.querySelector('#trackspot-log-modal > div');
    const notesInput = document.querySelector('textarea');
    const notesWheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });
    notesInput.dispatchEvent(notesWheelEvent);

    expect(scrollBy).toHaveBeenCalledWith({
      top: 120,
      left: 0,
      behavior: 'auto',
    });

    scrollBy.mockClear();

    const ratingInput = document.querySelector('input[aria-label="Rating"]');
    ratingInput.focus();
    const ratingWheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -120,
    });
    ratingInput.dispatchEvent(ratingWheelEvent);

    expect(scrollBy).not.toHaveBeenCalled();
    expect(ratingInput.value).toBe('55');
    expect(modal.style.transform).toBe('translateX(min(10vw, 160px))');
  });

  it('increments and decrements repeat listens with the mouse wheel while focused', () => {
    const graphqlData = {
      data: {
        albumUnion: {
          name: 'Draft Album',
          artists: {
            items: [{ profile: { name: 'Draft Artist' } }],
          },
        },
      },
    };

    helpers.openLogModal({
      mode: 'create',
      serverUrl: 'http://localhost:1060',
      graphqlData,
      albumUri: 'spotify:album:AAA',
    });

    const repeatsInput = document.querySelector('input[aria-label="Repeat listens"]');

    expect(repeatsInput).not.toBeNull();
    expect(repeatsInput.type).toBe('text');

    repeatsInput.focus();
    repeatsInput.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -120,
    }));
    expect(repeatsInput.value).toBe('1');

    repeatsInput.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    }));
    expect(repeatsInput.value).toBe('0');
  });

  it('locks horizontal page scrolling while the log modal is open and restores it on close', () => {
    document.documentElement.style.overflowX = 'clip';
    document.body.style.overflowX = 'visible';

    const graphqlData = {
      data: {
        albumUnion: {
          name: 'Draft Album',
          artists: {
            items: [{ profile: { name: 'Draft Artist' } }],
          },
        },
      },
    };

    helpers.openLogModal({
      mode: 'create',
      serverUrl: 'http://localhost:1060',
      graphqlData,
      albumUri: 'spotify:album:AAA',
    });

    expect(document.documentElement.style.overflowX).toBe('hidden');
    expect(document.body.style.overflowX).toBe('hidden');

    helpers.removeLogModal();

    expect(document.documentElement.style.overflowX).toBe('clip');
    expect(document.body.style.overflowX).toBe('visible');
  });

  it('only auto-plans library albums when sync is enabled and the album is not already logged', () => {
    expect(helpers.shouldAutoPlanLibraryAlbum({
      enabled: true,
      albumUiState: 'missing',
      inLibrary: true,
    })).toBe(true);

    expect(helpers.shouldAutoPlanLibraryAlbum({
      enabled: true,
      albumUiState: 'planned',
      inLibrary: true,
    })).toBe(false);

    expect(helpers.shouldAutoPlanLibraryAlbum({
      enabled: false,
      albumUiState: 'missing',
      inLibrary: true,
    })).toBe(false);

    expect(helpers.shouldAutoPlanLibraryAlbum({
      enabled: true,
      albumUiState: 'missing',
      inLibrary: false,
    })).toBe(false);
  });

  it('only triggers navigation bulk sync when a saved album mismatch is worth checking', () => {
    expect(helpers.shouldTriggerNavigationBulkSync({
      enabled: true,
      hasCurrentAlbum: true,
      hasLiveConnection: true,
      suppressUntilReconnect: false,
      isBulkSyncInFlight: false,
      record: null,
    })).toBe(true);

    expect(helpers.shouldTriggerNavigationBulkSync({
      enabled: true,
      hasCurrentAlbum: true,
      hasLiveConnection: false,
      suppressUntilReconnect: false,
      isBulkSyncInFlight: false,
      record: null,
    })).toBe(false);

    expect(helpers.shouldTriggerNavigationBulkSync({
      enabled: true,
      hasCurrentAlbum: true,
      hasLiveConnection: true,
      suppressUntilReconnect: true,
      isBulkSyncInFlight: false,
      record: null,
    })).toBe(false);

    expect(helpers.shouldTriggerNavigationBulkSync({
      enabled: true,
      hasCurrentAlbum: true,
      hasLiveConnection: true,
      suppressUntilReconnect: false,
      isBulkSyncInFlight: false,
      record: { id: 3, status: 'planned' },
    })).toBe(false);
  });

  it('reads the album-level saved flag from GraphQL data', () => {
    expect(helpers.isAlbumSavedInLibraryFromGraphql({
      data: {
        albumUnion: {
          saved: true,
          tracks: {
            items: [
              { track: { saved: false } },
            ],
          },
        },
      },
    })).toBe(true);

    expect(helpers.isAlbumSavedInLibraryFromGraphql({
      data: {
        albumUnion: {
          saved: false,
          tracks: {
            items: [
              { track: { saved: true } },
            ],
          },
        },
      },
    })).toBe(false);

    expect(helpers.isAlbumSavedInLibraryFromGraphql({
      data: {
        albumUnion: {},
      },
    })).toBe(null);
  });

  it('includes failed bulk-sync albums in the settings status copy', () => {
    expect(helpers.getLibraryBackfillStatusText({
      phase: 'completed',
      processedCount: 3,
      totalCount: 3,
      plannedCount: 1,
      skippedCount: 1,
      failedItems: [
        {
          albumName: 'Broken Album',
          albumUri: 'spotify:album:BROKEN',
          errorMessage: 'Spotify GraphQL lookup failed.',
        },
      ],
      lastRunAt: null,
    })).toContain('Failed 1 album:\n  • Broken Album — Spotify GraphQL lookup failed.');
  });

  it('fails CSV rows early when no Spotify album URI can be derived', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        job: {
          id: 9,
          status: 'failed',
          failed_rows: 1,
          warning_rows: 0,
        },
      }),
    });
    globalThis.Spicetify = {
      showNotification: vi.fn(),
      Platform: {},
    };

    const processed = await helpers.processCsvImportRow('http://localhost:1060', {
      job: { id: 9 },
      row: { id: 14, spotify_uri: '', spotify_album_id: '' },
    });

    expect(processed).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:1060/api/imports/rows/14/fail',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const [, request] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(request.body)).toMatchObject({
      error: 'CSV row is missing a Spotify album URI.',
    });
  });

  it('converts Spotify timestamps to local ISO dates', () => {
    expect(helpers.localDateISOFromTimestamp('2026-03-23T03:07:26.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(helpers.localDateISOFromTimestamp('', '2026-04-15')).toBe('2026-04-15');
  });

  it('only auto-deletes removed albums when the Trackspot entry is planned', () => {
    expect(helpers.shouldAutoDeleteRemovedAlbum({
      enabled: true,
      record: { id: 7, status: 'planned' },
    })).toBe(true);

    expect(helpers.shouldAutoDeleteRemovedAlbum({
      enabled: true,
      record: { id: 7, status: 'completed' },
    })).toBe(false);

    expect(helpers.shouldAutoDeleteRemovedAlbum({
      enabled: true,
      record: { id: 7, status: 'dropped' },
    })).toBe(false);

    expect(helpers.shouldAutoDeleteRemovedAlbum({
      enabled: false,
      record: { id: 7, status: 'planned' },
    })).toBe(false);
  });

  it('only auto-stops playback for the final track of an album context', () => {
    expect(helpers.shouldStopAlbumPlaybackAtEnd({
      context_uri: 'spotify:album:album123',
      session_id: 'session-1',
      duration: 180000,
      is_paused: false,
      track: {
        uri: 'spotify:track:last-track',
        metadata: {
          album_uri: 'spotify:album:album123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    })).toBe(true);

    expect(helpers.shouldStopAlbumPlaybackAtEnd({
      context_uri: 'spotify:album:album123',
      session_id: 'session-1',
      duration: 180000,
      is_paused: false,
      track: {
        uri: 'spotify:track:not-last',
        metadata: {
          album_uri: 'spotify:album:album123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '9',
          album_track_count: '10',
        },
      },
      next_tracks: [{ uri: 'spotify:track:last-track', metadata: {} }],
    })).toBe(false);
  });

  it('does not auto-stop when the same track is playing from a playlist context', () => {
    const request = installAlbumEndExceptionSpicetify();
    const playerState = {
      context_uri: 'spotify:playlist:playlist123',
      session_id: 'session-1',
      duration: 180000,
      is_paused: false,
      track: {
        uri: 'spotify:track:last-track',
        metadata: {
          album_uri: 'spotify:album:album123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };

    expect(helpers.requestAlbumEndPlaybackExceptionInfo(playerState)).toBe(null);
    expect(request).not.toHaveBeenCalled();

    expect(helpers.getAlbumEndPlaybackExceptionAlbumUri(playerState)).toBe(null);
    expect(helpers.shouldStopAlbumPlaybackAtEnd(playerState)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('waits for album exception metadata before allowing album-end actions', async () => {
    const request = installAlbumEndExceptionSpicetify({
      exceptionType: 'all',
      minutes: '8',
    });
    const playerState = createFinalAlbumPlaybackState('PENDINGEXCEPTION123');

    expect(helpers.shouldStopAlbumPlaybackAtEnd(playerState)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toMatchObject({
      uri: 'spotify:album:PENDINGEXCEPTION123',
      limit: 50,
      offset: 0,
    });

    await vi.waitFor(() => {
      expect(helpers.shouldSuppressAlbumEndPlaybackActions(playerState)).toBe(true);
    });
    expect(helpers.shouldStopAlbumPlaybackAtEnd(playerState)).toBe(false);
  });

  it('allows album-end actions after an exception metadata lookup fails', async () => {
    const request = installAlbumEndExceptionSpicetify({
      exceptionType: 'all',
      minutes: '8',
      request: vi.fn().mockRejectedValue(new Error('GraphQL unavailable')),
    });
    const playerState = createFinalAlbumPlaybackState('FAILEDLOOKUP123');

    expect(helpers.shouldStopAlbumPlaybackAtEnd(playerState)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(helpers.shouldStopAlbumPlaybackAtEnd(playerState)).toBe(true);
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('uses GraphQL final-track metadata when Spotify has already queued autoplay tracks', async () => {
    const request = installAlbumEndExceptionSpicetify({
      exceptionType: 'all',
      minutes: '8',
      request: vi.fn().mockResolvedValue({
        data: {
          albumUnion: {
            type: 'ALBUM',
            tracksV2: {
              totalCount: 2,
              items: [
                { track: { uri: 'spotify:track:firstGRAPHQLFINAL', duration: { totalMilliseconds: 360000 } } },
                { track: { uri: 'spotify:track:lastGRAPHQLFINAL', duration: { totalMilliseconds: 360000 } } },
              ],
            },
          },
        },
      }),
    });
    const playerState = {
      context_uri: 'spotify:album:GRAPHQLFINAL123',
      session_id: 'session-graphql-final',
      duration: 360000,
      is_paused: false,
      track: {
        uri: 'spotify:track:lastGRAPHQLFINAL',
        metadata: {
          album_uri: 'spotify:album:GRAPHQLFINAL123',
          album_disc_number: '1',
          album_disc_count: '1',
        },
      },
      next_tracks: [{ uri: 'spotify:track:autoplayTRACK', metadata: {} }],
    };

    expect(helpers.getAlbumPlaybackAtEndCandidateState(playerState)).toBe('pending');
    expect(request).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(helpers.getAlbumPlaybackAtEndCandidateState(playerState)).toBe('candidate');
    });
    expect(helpers.shouldStopAlbumPlaybackAtEnd(playerState)).toBe(true);
  });

  it('does not treat stale near-end timestamp progress as final-track completion at playback start', () => {
    helpers = loadHelpers();
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const playerState = {
      context_uri: 'spotify:album:STALEFINAL123',
      session_id: 'session-stale-final',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 179500,
      timestamp: 99000,
      track: {
        uri: 'spotify:track:lastSTALEFINAL',
        metadata: {
          album_uri: 'spotify:album:STALEFINAL123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState,
      progress: 400,
    });

    expect(helpers.getPlayerProgressMs(playerState, 100000)).toBe(400);
    helpers.syncAlbumPlaybackStopMonitor();
    vi.advanceTimersByTime(500);

    expect(monitor.pause).not.toHaveBeenCalled();
    expect(monitor.platformPause).not.toHaveBeenCalled();
  });

  it('prefers live progress when stale timestamp progress is mid-track', () => {
    helpers = loadHelpers();
    const playerState = {
      context_uri: 'spotify:album:STALEMID123',
      session_id: 'session-stale-mid',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 90000,
      timestamp: 100000,
      track: {
        uri: 'spotify:track:lastSTALEMID',
        metadata: {
          album_uri: 'spotify:album:STALEMID123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };
    installAlbumPlaybackMonitorSpicetify({
      playerState,
      progress: 400,
    });

    expect(helpers.getPlayerProgressMs(playerState, 100000)).toBe(400);
  });

  it('runs fallback album-end actions when Spotify stays on the completed final track', () => {
    helpers = loadHelpers();
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const playerState = {
      context_uri: 'spotify:album:SAMEFINAL123',
      session_id: 'session-same-final',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 179800,
      timestamp: 100000,
      track: {
        uri: 'spotify:track:lastSAMEFINAL',
        metadata: {
          album_uri: 'spotify:album:SAMEFINAL123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState,
      progress: 179800,
    });

    helpers.syncAlbumPlaybackStopMonitor();
    monitor.setProgress(180000);
    vi.advanceTimersByTime(550);

    expect(monitor.pause).toHaveBeenCalledTimes(1);
    expect(monitor.platformPause).toHaveBeenCalledTimes(1);
  });

  it('reschedules fallback album-end actions when live progress pushes expected end later', () => {
    helpers = loadHelpers();
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const playerState = {
      context_uri: 'spotify:album:SLOWFINAL123',
      session_id: 'session-slow-final',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 100000,
      timestamp: 100000,
      track: {
        uri: 'spotify:track:lastSLOWFINAL',
        metadata: {
          album_uri: 'spotify:album:SLOWFINAL123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState,
      progress: 100000,
    });

    helpers.syncAlbumPlaybackStopMonitor();

    vi.setSystemTime(160000);
    monitor.setProgress(110000);
    monitor.setPlayerState({
      ...playerState,
      position_as_of_timestamp: 160000,
      timestamp: 100000,
    });
    helpers.syncAlbumPlaybackStopMonitor();

    vi.setSystemTime(180350);
    monitor.setProgress(130000);
    monitor.setPlayerState({
      ...playerState,
      position_as_of_timestamp: 180000,
      timestamp: 100000,
    });
    helpers.syncAlbumPlaybackStopMonitor();

    expect(monitor.pause).not.toHaveBeenCalled();
    expect(monitor.platformPause).not.toHaveBeenCalled();

    vi.setSystemTime(230800);
    monitor.setProgress(180000);
    monitor.setPlayerState({
      ...playerState,
      position_as_of_timestamp: 180000,
      timestamp: 230800,
    });
    helpers.syncAlbumPlaybackStopMonitor();

    expect(monitor.pause).toHaveBeenCalledTimes(1);
    expect(monitor.platformPause).toHaveBeenCalledTimes(1);
  });

  it('does not complete the album when a stale final-track arm is followed by an earlier track selection', () => {
    helpers = loadHelpers();
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const finalTrackState = {
      context_uri: 'spotify:album:EARLIERTRACK123',
      session_id: 'session-earlier-track',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 179500,
      timestamp: 99000,
      track: {
        uri: 'spotify:track:lastEARLIERTRACK',
        metadata: {
          album_uri: 'spotify:album:EARLIERTRACK123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState: finalTrackState,
      progress: 400,
    });

    helpers.syncAlbumPlaybackStopMonitor();
    vi.setSystemTime(101000);
    monitor.setPlayerState({
      context_uri: 'spotify:album:EARLIERTRACK123',
      session_id: 'session-earlier-track',
      duration: 160000,
      is_paused: false,
      track: {
        uri: 'spotify:track:earlierEARLIERTRACK',
        metadata: {
          album_uri: 'spotify:album:EARLIERTRACK123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '4',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    });
    monitor.setProgress(0);
    helpers.syncAlbumPlaybackStopMonitor();
    vi.advanceTimersByTime(500);

    expect(monitor.pause).not.toHaveBeenCalled();
    expect(monitor.platformPause).not.toHaveBeenCalled();
  });

  it('drops a pending album-end arm when playback pauses before completion', () => {
    helpers = loadHelpers();
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const finalTrackState = {
      context_uri: 'spotify:album:PAUSEBEFOREEND123',
      session_id: 'session-pause-before-end',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 179000,
      timestamp: 100000,
      track: {
        uri: 'spotify:track:lastPAUSEBEFOREEND',
        metadata: {
          album_uri: 'spotify:album:PAUSEBEFOREEND123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState: finalTrackState,
      progress: 179000,
    });

    helpers.syncAlbumPlaybackStopMonitor();

    vi.setSystemTime(100100);
    monitor.setProgress(179100);
    monitor.setPlayerState({
      ...finalTrackState,
      is_paused: true,
      position_as_of_timestamp: 179100,
      timestamp: 100100,
    });
    helpers.syncAlbumPlaybackStopMonitor();

    vi.setSystemTime(101500);
    monitor.setProgress(0);
    monitor.setPlayerState({
      context_uri: 'spotify:playlist:user-choice',
      session_id: 'session-user-choice',
      duration: 200000,
      is_paused: false,
      position_as_of_timestamp: 0,
      timestamp: 101500,
      track: {
        uri: 'spotify:track:userChoicePAUSEBEFOREEND',
        metadata: { album_uri: 'spotify:album:userChoicePAUSEBEFOREEND' },
      },
      next_tracks: [],
    });
    helpers.syncAlbumPlaybackStopMonitor();

    expect(monitor.pause).not.toHaveBeenCalled();
    expect(monitor.platformPause).not.toHaveBeenCalled();
  });

  it('does not run album-end actions after a near-end manual jump to another playback session', () => {
    helpers = loadHelpers();
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const finalTrackState = {
      context_uri: 'spotify:album:MANUALJUMP123',
      session_id: 'session-manual-jump',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 178500,
      timestamp: 100000,
      track: {
        uri: 'spotify:track:lastMANUALJUMP',
        metadata: {
          album_uri: 'spotify:album:MANUALJUMP123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState: finalTrackState,
      progress: 178500,
    });

    helpers.syncAlbumPlaybackStopMonitor();

    vi.setSystemTime(101000);
    monitor.setProgress(0);
    monitor.setPlayerState({
      context_uri: 'spotify:playlist:user-choice',
      session_id: 'session-user-choice',
      duration: 210000,
      is_paused: false,
      position_as_of_timestamp: 0,
      timestamp: 101000,
      track: {
        uri: 'spotify:track:userChoiceMANUALJUMP',
        metadata: { album_uri: 'spotify:album:userChoiceMANUALJUMP' },
      },
      next_tracks: [],
    });
    helpers.syncAlbumPlaybackStopMonitor();
    vi.advanceTimersByTime(1000);

    expect(monitor.pause).not.toHaveBeenCalled();
    expect(monitor.platformPause).not.toHaveBeenCalled();
  });

  it('does not run album-end actions after a near-end manual jump in the same playback session before completion', () => {
    helpers = loadHelpers();
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const finalTrackState = {
      context_uri: 'spotify:album:SAMESESSIONJUMP123',
      session_id: 'session-same-manual-jump',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 178500,
      timestamp: 100000,
      track: {
        uri: 'spotify:track:lastSAMESESSIONJUMP',
        metadata: {
          album_uri: 'spotify:album:SAMESESSIONJUMP123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState: finalTrackState,
      progress: 178500,
    });

    helpers.syncAlbumPlaybackStopMonitor();

    vi.setSystemTime(101000);
    monitor.setProgress(0);
    monitor.setPlayerState({
      context_uri: 'spotify:playlist:user-choice',
      session_id: 'session-same-manual-jump',
      duration: 210000,
      is_paused: false,
      position_as_of_timestamp: 0,
      timestamp: 101000,
      track: {
        uri: 'spotify:track:userChoiceSAMESESSIONJUMP',
        metadata: { album_uri: 'spotify:album:userChoiceSAMESESSIONJUMP' },
      },
      next_tracks: [],
    });
    helpers.syncAlbumPlaybackStopMonitor();
    vi.advanceTimersByTime(1000);

    expect(monitor.pause).not.toHaveBeenCalled();
    expect(monitor.platformPause).not.toHaveBeenCalled();
  });

  it('keeps pending final-track lookups armed across Spotify autoplay transitions', async () => {
    helpers = loadHelpers();
    let nowMs = 100000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    let resolveAlbumRequest;
    const request = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveAlbumRequest = resolve;
    }));
    const finalTrackState = {
      context_uri: 'spotify:album:PENDINGFINAL123',
      session_id: 'session-pending-final',
      duration: 180000,
      is_paused: false,
      track: {
        uri: 'spotify:track:lastPENDINGFINAL',
        metadata: {
          album_uri: 'spotify:album:PENDINGFINAL123',
          album_disc_number: '1',
          album_disc_count: '1',
        },
      },
      next_tracks: [{ uri: 'spotify:track:autoplayPENDINGFINAL', metadata: {} }],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState: finalTrackState,
      progress: 178500,
      request,
    });

    helpers.syncAlbumPlaybackStopMonitor();
    expect(request).toHaveBeenCalledTimes(1);
    expect(monitor.pause).not.toHaveBeenCalled();

    nowMs = 101500;
    monitor.setPlayerState({
      context_uri: 'spotify:playlist:autoplay',
      session_id: 'session-pending-final',
      duration: 200000,
      is_paused: false,
      track: {
        uri: 'spotify:track:autoplayPENDINGFINAL',
        metadata: { album_uri: 'spotify:album:autoplayPENDINGFINAL' },
      },
      next_tracks: [],
    });
    monitor.setProgress(0);
    helpers.syncAlbumPlaybackStopMonitor();
    expect(monitor.pause).not.toHaveBeenCalled();

    resolveAlbumRequest({
      data: {
        albumUnion: {
          type: 'ALBUM',
          tracksV2: {
            totalCount: 2,
            items: [
              { track: { uri: 'spotify:track:firstPENDINGFINAL', duration: { totalMilliseconds: 90000 } } },
              { track: { uri: 'spotify:track:lastPENDINGFINAL', duration: { totalMilliseconds: 90000 } } },
            ],
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(monitor.pause).toHaveBeenCalledTimes(1);
    });
  });

  it('drops delayed album-end actions if playback leaves the observed transition target', async () => {
    helpers = loadHelpers();
    let nowMs = 100000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    let resolveAlbumRequest;
    const request = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveAlbumRequest = resolve;
    }));
    const finalTrackState = {
      context_uri: 'spotify:album:STALEPENDING123',
      session_id: 'session-stale-pending',
      duration: 180000,
      is_paused: false,
      track: {
        uri: 'spotify:track:lastSTALEPENDING',
        metadata: {
          album_uri: 'spotify:album:STALEPENDING123',
          album_disc_number: '1',
          album_disc_count: '1',
        },
      },
      next_tracks: [{ uri: 'spotify:track:autoplaySTALEPENDING', metadata: {} }],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState: finalTrackState,
      progress: 178500,
      request,
    });

    helpers.syncAlbumPlaybackStopMonitor();
    expect(request).toHaveBeenCalledTimes(1);

    nowMs = 101500;
    monitor.setPlayerState({
      context_uri: 'spotify:playlist:autoplay',
      session_id: 'session-stale-pending',
      duration: 200000,
      is_paused: false,
      track: {
        uri: 'spotify:track:autoplaySTALEPENDING',
        metadata: { album_uri: 'spotify:album:autoplaySTALEPENDING' },
      },
      next_tracks: [],
    });
    monitor.setProgress(0);
    helpers.syncAlbumPlaybackStopMonitor();

    nowMs = 102000;
    monitor.setPlayerState({
      context_uri: 'spotify:playlist:user-choice',
      session_id: 'session-user-choice',
      duration: 210000,
      is_paused: false,
      track: {
        uri: 'spotify:track:userChoiceSTALEPENDING',
        metadata: { album_uri: 'spotify:album:userChoiceSTALEPENDING' },
      },
      next_tracks: [],
    });

    resolveAlbumRequest({
      data: {
        albumUnion: {
          type: 'ALBUM',
          tracksV2: {
            totalCount: 2,
            items: [
              { track: { uri: 'spotify:track:firstSTALEPENDING', duration: { totalMilliseconds: 90000 } } },
              { track: { uri: 'spotify:track:lastSTALEPENDING', duration: { totalMilliseconds: 90000 } } },
            ],
          },
        },
      },
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(monitor.pause).not.toHaveBeenCalled();
    expect(monitor.platformPause).not.toHaveBeenCalled();
  });

  it('recognizes album completion after Spotify advances away from the armed final track', () => {
    const armedState = {
      signature: 'session-1|spotify:album:album123|spotify:track:last-track',
      albumUri: 'spotify:album:album123',
      finalTrackUri: 'spotify:track:last-track',
      durationMs: 180000,
      lastProgressMs: 178500,
      expectedEndAtMs: 100000,
      lastSeenAtMs: 98500,
    };

    expect(helpers.isAlbumPlaybackCompletionTransition(armedState, {
      context_uri: 'spotify:playlist:autoplay',
      session_id: 'session-1',
      is_paused: false,
      track: {
        uri: 'spotify:track:autoplay-track',
        metadata: { album_uri: 'spotify:album:autoplay-album' },
      },
    }, 101000)).toBe(true);

    expect(helpers.isAlbumPlaybackCompletionTransition(armedState, {
      context_uri: 'spotify:album:album123',
      session_id: 'session-1',
      is_paused: true,
      track: {
        uri: 'spotify:track:first-track',
        metadata: { album_uri: 'spotify:album:album123' },
      },
    }, 101000)).toBe(true);

    expect(helpers.isAlbumPlaybackCompletionTransition(armedState, {
      context_uri: 'spotify:album:album123',
      session_id: 'session-1',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 400,
      timestamp: 101000,
      track: {
        uri: 'spotify:track:last-track',
        metadata: { album_uri: 'spotify:album:album123' },
      },
    }, 101000)).toBe(true);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      expectedEndAtMs: 101500,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:album:album123',
      session_id: 'session-1',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 400,
      timestamp: 100700,
      track: {
        uri: 'spotify:track:last-track',
        metadata: { album_uri: 'spotify:album:album123' },
      },
    }, 100700)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition(armedState, {
      context_uri: 'spotify:album:album123',
      session_id: 'session-user-restart',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 400,
      timestamp: 101000,
      track: {
        uri: 'spotify:track:last-track',
        metadata: { album_uri: 'spotify:album:album123' },
      },
    }, 101000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition(armedState, {
      context_uri: 'spotify:album:album123',
      session_id: 'session-1',
      duration: 180000,
      is_paused: true,
      position_as_of_timestamp: 180000,
      timestamp: 101000,
      track: {
        uri: 'spotify:track:last-track',
        metadata: { album_uri: 'spotify:album:album123' },
      },
    }, 101000)).toBe(true);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      lastProgressMs: 179700,
      expectedEndAtMs: 100500,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:album:album123',
      session_id: 'session-1',
      duration: 180000,
      is_paused: true,
      position_as_of_timestamp: 180000,
      timestamp: 100000,
      track: {
        uri: 'spotify:track:last-track',
        metadata: { album_uri: 'spotify:album:album123' },
      },
    }, 100000)).toBe(true);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      lastProgressMs: 175500,
      expectedEndAtMs: 104000,
      lastSeenAtMs: 99500,
    }, {
      context_uri: 'spotify:album:album123',
      session_id: 'session-1',
      is_paused: false,
      track: {
        uri: 'spotify:track:manually-skipped-track',
        metadata: { album_uri: 'spotify:album:album123' },
      },
    }, 100000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition(armedState, {
      context_uri: 'spotify:playlist:user-choice',
      session_id: 'session-user-choice',
      is_paused: false,
      track: {
        uri: 'spotify:track:user-choice',
        metadata: { album_uri: 'spotify:album:user-choice' },
      },
    }, 99100)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      lastProgressMs: 30000,
      expectedEndAtMs: 100500,
      lastSeenAtMs: 99500,
    }, {
      context_uri: 'spotify:playlist:same-session-later',
      session_id: 'session-1',
      is_paused: false,
      track: {
        uri: 'spotify:track:same-session-later',
        metadata: { album_uri: 'spotify:album:same-session-later' },
      },
    }, 100000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      lastProgressMs: 178500,
      expectedEndAtMs: 100500,
      lastSeenAtMs: 90000,
    }, {
      context_uri: 'spotify:playlist:same-session-stale',
      session_id: 'session-1',
      is_paused: false,
      track: {
        uri: 'spotify:track:same-session-stale',
        metadata: { album_uri: 'spotify:album:same-session-stale' },
      },
    }, 100000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      lastProgressMs: 30000,
      expectedEndAtMs: 250000,
      lastSeenAtMs: 50000,
    }, {
      context_uri: 'spotify:album:album123',
      session_id: 'session-1',
      is_paused: false,
      track: {
        uri: 'spotify:track:middle-track',
        metadata: { album_uri: 'spotify:album:album123' },
      },
    }, 52000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      durationMs: 351786,
      lastProgressMs: 338749,
      expectedEndAtMs: 113037,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:station:album:album123',
      session_id: 'session-1',
      is_paused: false,
      track: {
        uri: 'spotify:track:album-radio-track',
        metadata: { album_uri: 'spotify:album:radio-album' },
      },
    }, 101000)).toBe(true);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      signature: '|spotify:album:album123|spotify:track:last-track',
      sessionId: null,
      durationMs: 359053,
      lastProgressMs: 344916,
      expectedEndAtMs: 114137,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:station:album:album123',
      is_paused: false,
      track: {
        uri: 'spotify:track:album-radio-no-session',
        metadata: { album_uri: 'spotify:album:radio-album' },
      },
    }, 101000)).toBe(true);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      durationMs: 359053,
      lastProgressMs: 344916,
      expectedEndAtMs: 114137,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:station:album:album123',
      session_id: 'session-user-choice',
      is_paused: false,
      track: {
        uri: 'spotify:track:album-radio-wrong-session',
        metadata: { album_uri: 'spotify:album:radio-album' },
      },
    }, 101000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      durationMs: 351786,
      lastProgressMs: 338749,
      expectedEndAtMs: 113037,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:playlist:user-choice',
      session_id: 'session-1',
      is_paused: false,
      track: {
        uri: 'spotify:track:user-choice-near-end',
        metadata: { album_uri: 'spotify:album:user-choice' },
      },
    }, 101000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      signature: '|spotify:album:album123|spotify:track:last-track',
      sessionId: null,
      durationMs: 359053,
      lastProgressMs: 344916,
      expectedEndAtMs: 114137,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:playlist:user-choice',
      is_paused: false,
      track: {
        uri: 'spotify:track:user-choice-no-session',
        metadata: { album_uri: 'spotify:album:user-choice' },
      },
    }, 101000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      durationMs: 351786,
      lastProgressMs: 320000,
      expectedEndAtMs: 131786,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:station:album:album123',
      session_id: 'session-1',
      is_paused: false,
      track: {
        uri: 'spotify:track:album-radio-too-early',
        metadata: { album_uri: 'spotify:album:radio-album' },
      },
    }, 101000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      signature: '|spotify:album:album123|spotify:track:last-track',
      sessionId: null,
      durationMs: 234828,
      lastProgressMs: 85390,
      expectedEndAtMs: 249438,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:playlist:autoplay',
      is_paused: false,
      track: {
        uri: 'spotify:track:autoplay-after-unfocused-end',
        metadata: { album_uri: 'spotify:album:autoplay-album' },
      },
    }, 249438)).toBe(true);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      signature: '|spotify:album:album123|spotify:track:last-track',
      sessionId: null,
      durationMs: 234828,
      lastProgressMs: 85390,
      expectedEndAtMs: 249438,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:playlist:user-choice',
      is_paused: false,
      track: {
        uri: 'spotify:track:user-choice-before-expected-end',
        metadata: { album_uri: 'spotify:album:user-choice' },
      },
    }, 200000)).toBe(false);

    expect(helpers.isAlbumPlaybackCompletionTransition({
      ...armedState,
      durationMs: 234828,
      lastProgressMs: 85390,
      expectedEndAtMs: 249438,
      lastSeenAtMs: 100000,
    }, {
      context_uri: 'spotify:playlist:other-session',
      session_id: 'session-user-choice',
      is_paused: false,
      track: {
        uri: 'spotify:track:other-session-after-expected-end',
        metadata: { album_uri: 'spotify:album:user-choice' },
      },
    }, 249438)).toBe(false);
  });

  it('suppresses only the immediate repeated auto-pause for the same finished album track', () => {
    expect(helpers.shouldSuppressRepeatedAlbumPlaybackStop({
      signature: 'session-1|spotify:album:album123|spotify:track:last-track',
      suppressedSignature: 'session-1|spotify:album:album123|spotify:track:last-track',
      remainingMs: 0,
    })).toBe(true);

    expect(helpers.shouldSuppressRepeatedAlbumPlaybackStop({
      signature: 'session-1|spotify:album:album123|spotify:track:last-track',
      suppressedSignature: 'session-1|spotify:album:album123|spotify:track:last-track',
      remainingMs: 1500,
    })).toBe(true);

    expect(helpers.shouldSuppressRepeatedAlbumPlaybackStop({
      signature: 'session-1|spotify:album:album123|spotify:track:last-track',
      suppressedSignature: 'session-1|spotify:album:album123|spotify:track:last-track',
      remainingMs: 5000,
    })).toBe(false);

    expect(helpers.shouldSuppressRepeatedAlbumPlaybackStop({
      signature: 'session-1|spotify:album:album123|spotify:track:autoplay-track',
      suppressedSignature: 'session-1|spotify:album:album123|spotify:track:last-track',
      remainingMs: 0,
    })).toBe(false);
  });

  it('clears album-end action suppression after autoplay leaves the completed album', () => {
    helpers = loadHelpers();
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const finalTrackState = {
      context_uri: 'spotify:album:REPLAYSTOP123',
      session_id: 'session-replay-stop',
      duration: 180000,
      is_paused: false,
      position_as_of_timestamp: 179800,
      timestamp: 100000,
      track: {
        uri: 'spotify:track:lastREPLAYSTOP',
        metadata: {
          album_uri: 'spotify:album:REPLAYSTOP123',
          album_disc_number: '1',
          album_disc_count: '1',
          album_track_number: '10',
          album_track_count: '10',
        },
      },
      next_tracks: [],
    };
    const monitor = installAlbumPlaybackMonitorSpicetify({
      playerState: finalTrackState,
      progress: 179800,
    });

    helpers.syncAlbumPlaybackStopMonitor();
    monitor.setProgress(180000);
    vi.advanceTimersByTime(550);

    expect(monitor.pause).toHaveBeenCalledTimes(1);
    expect(monitor.platformPause).toHaveBeenCalledTimes(1);

    vi.setSystemTime(101000);
    monitor.setProgress(5000);
    monitor.setPlayerState({
      context_uri: 'spotify:playlist:autoplay',
      session_id: 'session-replay-stop',
      duration: 210000,
      is_paused: false,
      position_as_of_timestamp: 5000,
      timestamp: 101000,
      track: {
        uri: 'spotify:track:autoplayREPLAYSTOP',
        metadata: { album_uri: 'spotify:album:autoplayREPLAYSTOP' },
      },
      next_tracks: [],
    });
    helpers.syncAlbumPlaybackStopMonitor();

    vi.setSystemTime(102000);
    monitor.setProgress(179800);
    monitor.setPlayerState({
      ...finalTrackState,
      position_as_of_timestamp: 179800,
      timestamp: 102000,
    });
    helpers.syncAlbumPlaybackStopMonitor();
    monitor.setProgress(180000);
    vi.advanceTimersByTime(550);

    expect(monitor.pause).toHaveBeenCalledTimes(2);
    expect(monitor.platformPause).toHaveBeenCalledTimes(2);
  });

  it('allows init to proceed without Player.pause as long as the core APIs are ready', () => {
    expect(helpers.isSpicetifyReadyForInit({
      Platform: {
        PlayerAPI: {
          pause: vi.fn(),
        },
      },
      Player: {
        addEventListener: vi.fn(),
      },
      Menu: {
        Item: function Item() {},
      },
      SVGIcons: {},
      GraphQL: {
        Request: vi.fn(),
        Definitions: { getAlbum: {} },
      },
    })).toBe(true);

    expect(helpers.isSpicetifyReadyForInit({
      Platform: {},
      Player: {},
      Menu: {
        Item: function Item() {},
      },
      SVGIcons: {},
      GraphQL: {
        Request: vi.fn(),
        Definitions: { getAlbum: {} },
      },
    })).toBe(false);
  });
});
