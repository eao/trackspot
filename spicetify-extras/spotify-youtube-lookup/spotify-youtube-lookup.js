(function youtubeMusicLookupExtension() {
  const EXTENSION_ID = 'youtube-music-lookup';
  const EXTENSION_NAME = 'YouTube Music Lookup';
  const STYLE_ID = `${EXTENSION_ID}-style`;
  const ROW_SELECTOR = '[data-testid="tracklist-row"], [role="row"][aria-rowindex]';
  const TRACK_LINK_SELECTOR = 'a[href*="/track/"]';
  const ARTIST_LINK_SELECTOR = 'a[href*="/artist/"]';
  const ROW_TITLE_SELECTOR = '.main-trackList-rowMainContentTitle, [class*="rowMainContentTitle"]';
  const ROW_SUBTITLE_SELECTOR = '.main-trackList-rowMainContentSubTitle, [class*="rowMainContentSubTitle"]';
  const BUTTON_HOST_CLASS = `${EXTENSION_ID}-host`;
  const BUTTON_CLASS = `${EXTENSION_ID}-button`;
  const BUTTON_QUERY_ATTRIBUTE = `data-${EXTENSION_ID}-query`;
  const SEARCH_BASE_URL = 'https://music.youtube.com/search?q=';
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const INIT_DELAY_MS = 300;
  const MAX_INIT_ATTEMPTS = 200;
  const LOOKUP_DEDUPE_WINDOW_MS = 1000;
  const DEBUG_LOGS_ENABLED = false;
  const LOOKUP_ICON = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round">',
    '<circle cx="8" cy="8" r="6"/>',
    '<path d="M6.5 5.5 10.5 8l-4 2.5z" fill="currentColor" stroke="none"/>',
    '</svg>',
  ].join('');

  let initAttempts = 0;
  let initTimeoutId = null;
  let observer = null;
  let stopHistoryListener = null;
  let syncScheduled = false;
  let disposed = false;

  const sharedLookupState = globalThis.__youtubeMusicLookupSharedState
    ||= {
      lastLookupUrl: '',
      lastLookupAt: 0,
      nextButtonId: 1,
      nextInstanceId: 1,
    };
  const instanceId = sharedLookupState.nextInstanceId++;

  const trackInfoCache = new Map();
  const pendingTrackRequests = new Map();

  if (globalThis.__youtubeMusicLookupExtension?.dispose) {
    globalThis.__youtubeMusicLookupExtension.dispose();
  }

  debugLog('script-evaluated');

  globalThis.__youtubeMusicLookupExtension = {
    dispose,
  };

  function dispose() {
    debugLog('dispose-start');
    disposed = true;
    if (initTimeoutId) {
      clearTimeout(initTimeoutId);
      initTimeoutId = null;
    }
    observer?.disconnect();
    observer = null;

    if (typeof stopHistoryListener === 'function') {
      stopHistoryListener();
      stopHistoryListener = null;
    }

    document.getElementById(STYLE_ID)?.remove();
    document.querySelectorAll(`.${BUTTON_HOST_CLASS}`).forEach((node) => node.remove());
    debugLog('dispose-complete');
  }

  function init() {
    if (disposed) {
      debugLog('init-skipped-disposed');
      return;
    }

    const SpicetifyApi = globalThis.Spicetify;
    if (!SpicetifyApi?.Platform || !SpicetifyApi?.CosmosAsync?.get || !SpicetifyApi?.URI) {
      if (initAttempts < MAX_INIT_ATTEMPTS) {
        initAttempts += 1;
        debugLog('init-retry-scheduled', { initAttempts, delayMs: INIT_DELAY_MS });
        initTimeoutId = setTimeout(init, INIT_DELAY_MS);
      } else {
        console.error(`[${EXTENSION_NAME}] Timed out waiting for Spicetify.`);
      }
      return;
    }

    initTimeoutId = null;
    debugLog('init-ready', { initAttempts });
    ensureStyles();
    startObserver();
    registerHistoryListener();
    scheduleSync();

    console.log(`[${EXTENSION_NAME}] Loaded.`);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BUTTON_HOST_CLASS} {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
        pointer-events: auto;
        z-index: 1;
      }

      .${BUTTON_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        min-width: 32px;
        min-height: 32px;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: var(--text-subdued);
        cursor: pointer;
        pointer-events: auto;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
        line-height: 1;
        transition: color 0.18s ease, opacity 0.18s ease, filter 0.18s ease;
        opacity: 0.8;
        filter: brightness(1);
      }

      .${BUTTON_CLASS}:hover {
        color: var(--text-base);
        opacity: 1;
        filter: brightness(1.18);
      }

      .${BUTTON_CLASS}:focus-visible {
        outline: 2px solid var(--spice-button, #1db954);
        outline-offset: 2px;
      }

      .${BUTTON_CLASS} svg {
        width: 19.5px;
        height: 19.5px;
        flex: 0 0 auto;
      }
    `;

    document.head.appendChild(style);
  }

  function registerHistoryListener() {
    if (!Spicetify?.Platform?.History?.listen) return;

    stopHistoryListener?.();
    stopHistoryListener = Spicetify.Platform.History.listen(() => {
      scheduleSync();
    });
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      scheduleSync();
    });

    const root = document.querySelector('#main') || document.body;
    observer.observe(root, {
      childList: true,
      subtree: true,
    });
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;

    const run = () => {
      syncScheduled = false;
      syncTrackRows();
    };

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
      return;
    }

    setTimeout(run, 16);
  }

  function syncTrackRows() {
    const rows = getTrackRows();
    const urisToFetch = [];

    rows.forEach((row) => {
      if (!(row instanceof HTMLElement)) return;

      const rowTrackInfo = getRowTrackInfo(row);
      renderRowButton(row, rowTrackInfo);

      if (shouldFetchTrackInfo(rowTrackInfo.uri)) {
        urisToFetch.push(rowTrackInfo.uri);
      }
    });

    if (urisToFetch.length > 0) {
      queueTrackInfoFetch(urisToFetch);
    }
  }

  function renderRowButton(row, rowTrackInfo) {
    const existingHost = row.querySelector(`.${BUTTON_HOST_CLASS}`);
    const domTrack = rowTrackInfo?.domTrack ?? getDomTrackInfo(row);
    const searchQuery = buildSearchQuery(null, domTrack);
    const shouldShowButton = isTrackUnavailable(rowTrackInfo, row) && Boolean(searchQuery);

    if (!shouldShowButton) {
      existingHost?.remove();
      return;
    }

    const actionSlot = findActionSlot(row);
    if (!actionSlot?.container) return;

    let host = existingHost;
    if (!host || !actionSlot.container.contains(host)) {
      existingHost?.remove();
      host = document.createElement('span');
      host.className = BUTTON_HOST_CLASS;
      if (actionSlot.beforeNode && actionSlot.beforeNode.parentElement === actionSlot.container) {
        actionSlot.container.insertBefore(host, actionSlot.beforeNode);
      } else {
        actionSlot.container.appendChild(host);
      }
    }
    applyActionSlotLayout(host, actionSlot);

    let button = host.querySelector(`.${BUTTON_CLASS}`);
    if (!button) {
      button = createLookupButton();
      host.appendChild(button);
    }

    button.setAttribute(BUTTON_QUERY_ATTRIBUTE, searchQuery);
    button.title = searchQuery
      ? `Search YouTube Music for ${searchQuery}`
      : 'Search YouTube Music';
    button.dataset.query = searchQuery;
  }

  function createLookupButton() {
    const button = document.createElement('button');
    const buttonId = sharedLookupState.nextButtonId++;
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.setAttribute('aria-label', 'Search on YouTube Music');
    button.dataset.debugButtonId = String(buttonId);
    button.innerHTML = LOOKUP_ICON;
    debugLog('button-created', { buttonId });

    const stopRowInteraction = (event) => {
      logButtonEvent('stop-row-interaction', event);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    button.addEventListener('pointerdown', stopRowInteraction);
    button.addEventListener('pointerup', stopRowInteraction);
    button.addEventListener('mousedown', stopRowInteraction);
    button.addEventListener('mouseup', stopRowInteraction);
    button.addEventListener('click', (event) => {
      logButtonEvent('click-handler-start', event);
      stopRowInteraction(event);

      const target = event.currentTarget;
      const searchQuery = target?.getAttribute?.(BUTTON_QUERY_ATTRIBUTE) ?? '';
      debugLog('click-query-resolved', { buttonId, searchQuery });

      if (!searchQuery) {
        debugLog('click-missing-query', { buttonId });
        Spicetify.showNotification('Could not determine the track name for YouTube Music lookup.', true);
        return;
      }

      const searchUrl = buildSearchUrl(searchQuery);
      if (shouldSkipDuplicateLookup(searchUrl)) {
        debugLog('click-deduped', { buttonId, searchUrl });
        return;
      }
      const opened = openExternal(searchUrl);
      debugLog('click-open-result', { buttonId, searchUrl, opened });
      if (!opened) {
        Spicetify.showNotification('Spotify blocked the browser open request.', true);
      }
    });

    return button;
  }

  function openExternal(url) {
    if (!url) {
      debugLog('open-external-missing-url');
      return false;
    }

    debugLog('open-external-start', { url });

    try {
      if (typeof Spicetify?.Platform?.openExternal === 'function') {
        debugLog('open-external-platform-attempt', { url });
        Spicetify.Platform.openExternal(url);
        debugLog('open-external-platform-success', { url });
        return true;
      }
    } catch (error) {
      console.warn(`[${EXTENSION_NAME}] Platform.openExternal failed.`, error);
    }

    try {
      debugLog('open-external-window-attempt', { url });
      window.open(url, '_blank', 'noopener,noreferrer');
      debugLog('open-external-window-success', { url });
      return true;
    } catch (error) {
      console.warn(`[${EXTENSION_NAME}] window.open failed.`, error);
    }

    try {
      debugLog('open-external-anchor-attempt', { url });
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      debugLog('open-external-anchor-success', { url });
      return true;
    } catch (error) {
      console.warn(`[${EXTENSION_NAME}] Anchor fallback failed.`, error);
      return false;
    }
  }

  function shouldSkipDuplicateLookup(url) {
    const now = Date.now();
    const elapsedMs = now - sharedLookupState.lastLookupAt;
    debugLog('dedupe-check', {
      url,
      previousUrl: sharedLookupState.lastLookupUrl,
      elapsedMs,
      thresholdMs: LOOKUP_DEDUPE_WINDOW_MS,
    });
    if (
      elapsedMs < LOOKUP_DEDUPE_WINDOW_MS
      && (!url || sharedLookupState.lastLookupUrl === url)
    ) {
      debugLog('dedupe-hit', { url, elapsedMs });
      return true;
    }

    sharedLookupState.lastLookupUrl = url;
    sharedLookupState.lastLookupAt = now;
    debugLog('dedupe-store', { url, storedAt: now });
    return false;
  }

  function logButtonEvent(label, event) {
    const currentTarget = event?.currentTarget;
    debugLog(label, {
      eventType: event?.type,
      buttonId: currentTarget?.dataset?.debugButtonId || null,
      query: currentTarget?.getAttribute?.(BUTTON_QUERY_ATTRIBUTE) ?? '',
      detail: event?.detail,
      isTrusted: event?.isTrusted,
      timeStamp: event?.timeStamp,
    });
  }

  function debugLog(label, details) {
    if (!DEBUG_LOGS_ENABLED) return;

    const prefix = `[${EXTENSION_NAME}][instance ${instanceId}] ${label}`;
    if (typeof details === 'undefined') {
      console.log(prefix);
      return;
    }

    console.log(prefix, details);
  }

  function buildSearchUrl(searchQuery) {
    return `${SEARCH_BASE_URL}${encodeURIComponent(searchQuery || '')}`;
  }

  function buildSearchQuery(trackInfo, domTrack) {
    const title = firstNonEmpty(trackInfo?.title, domTrack?.title);
    const artists = uniqueStrings(
      Array.isArray(trackInfo?.artists) && trackInfo.artists.length > 0
        ? trackInfo.artists
        : domTrack?.artists,
    );

    return [title, artists.join(' ')].filter(Boolean).join(' ').trim();
  }

  function getDomTrackInfo(row) {
    const title = firstNonEmpty(
      row.querySelector(ROW_TITLE_SELECTOR)?.textContent,
      row.querySelector(TRACK_LINK_SELECTOR)?.textContent,
      getTrackTitleFromAria(row),
    );

    const linkedArtists = uniqueStrings(
      Array.from(row.querySelectorAll(ARTIST_LINK_SELECTOR))
        .map((node) => node.textContent?.trim() || '')
        .filter(Boolean),
    );
    const subtitleArtists = parseArtistsFromSubtitle(row.querySelector(ROW_SUBTITLE_SELECTOR)?.textContent || '');
    const ariaArtists = parseArtistsFromAria(getMoreOptionsAriaLabel(row) || '');
    const artists = uniqueStrings([
      ...linkedArtists,
      ...subtitleArtists,
      ...ariaArtists,
    ]);

    return {
      title,
      artists,
    };
  }

  function extractTrackUriFromRow(row) {
    const trackLink = row.querySelector(TRACK_LINK_SELECTOR);
    return extractTrackUriFromLink(trackLink);
  }

  function isTrackUnavailable(trackInfo, row) {
    if (trackInfo?.unavailable) return true;
    return looksUnplayableFromDom(row);
  }

  function extractTrackUriFromLink(link) {
    const href = link?.getAttribute?.('href') ?? '';
    const parsedUri = Spicetify?.URI?.from?.(href);
    if (!parsedUri || parsedUri.type !== Spicetify.URI.Type.TRACK) {
      return null;
    }

    return typeof parsedUri.getPath === 'function'
      ? parsedUri.getPath()
      : parsedUri.toURI();
  }

  function getTrackRows() {
    return Array.from(document.querySelectorAll(ROW_SELECTOR))
      .filter((row) => row instanceof HTMLElement)
      .filter((row) => {
        const hasTitle = Boolean(row.querySelector(ROW_TITLE_SELECTOR));
        const hasTrackUi = Boolean(
          row.querySelector('[aria-label^="More options for "]')
          || row.querySelector('.main-trackList-rowMainContent')
          || row.querySelector('[class*="trackListRow"]'),
        );
        return hasTitle || hasTrackUi;
      });
  }

  function getRowTrackInfo(row) {
    const uri = extractTrackUriFromRow(row);
    const domTrack = getDomTrackInfo(row);
    const cachedTrack = uri ? getCachedTrackInfo(uri) : null;

    return {
      uri,
      domTrack,
      unavailable: Boolean(cachedTrack?.unavailable),
    };
  }

  function looksUnplayableFromDom(row) {
    if (row.getAttribute('aria-disabled') === 'true') {
      return true;
    }

    if (row.querySelector('button[disabled][aria-label*="Play"]')) {
      return true;
    }

    if (row.querySelector('button[aria-disabled="true"][aria-label*="Play"]')) {
      return true;
    }

    if (row.querySelector('[aria-label*="unavailable" i], [title*="unavailable" i]')) {
      return true;
    }

    return false;
  }

  function getMoreOptionsAriaLabel(row) {
    return row.querySelector('[aria-label^="More options for "]')?.getAttribute('aria-label') || '';
  }

  function getTrackTitleFromAria(row) {
    const ariaLabel = getMoreOptionsAriaLabel(row);
    const match = ariaLabel.match(/^More options for (.+?) by .+$/i);
    return match?.[1]?.trim() || '';
  }

  function parseArtistsFromAria(ariaLabel) {
    const match = typeof ariaLabel === 'string'
      ? ariaLabel.match(/^More options for .+? by (.+)$/i)
      : null;
    if (!match?.[1]) return [];
    return splitArtistList(match[1]);
  }

  function parseArtistsFromSubtitle(subtitle) {
    if (typeof subtitle !== 'string' || !subtitle.trim()) return [];
    return splitArtistList(subtitle);
  }

  function splitArtistList(text) {
    return uniqueStrings(
      text
        .split(/,|&| feat\. | ft\. | x /i)
        .map((part) => part.trim())
        .filter(Boolean),
    );
  }

  function findActionSlot(row) {
    const rowContent = getTrackRowContentRoot(row);
    if (!rowContent) {
      return {
        container: row,
        beforeNode: null,
      };
    }

    const endCell = (
      findDirectChild(rowContent, '.main-trackList-rowSectionEnd')
      || findDirectChild(rowContent, '[class*="rowSectionEnd"]')
      || rowContent.querySelector('.main-trackList-rowSectionEnd')
      || rowContent.querySelector('[class*="rowSectionEnd"]')
      || rowContent
    );

    const durationNode = endCell.querySelector('.main-trackList-duration')
      || endCell.querySelector('[class*="duration"]');
    const moreButton = endCell.querySelector('[aria-label^="More options for "]')
      || endCell.querySelector('[aria-label*="More options"]');

    return {
      container: endCell,
      beforeNode: durationNode || moreButton,
      durationNode,
      moreButton,
    };
  }

  function getTrackRowContentRoot(row) {
    if (!(row instanceof HTMLElement)) return null;

    return (
      row.querySelector(':scope > .main-trackList-trackListRow')
      || row.querySelector(':scope > [class*="trackListRowGrid"]')
      || row.querySelector(':scope > [class*="trackListRow"]')
      || row.firstElementChild
      || row
    );
  }

  function applyActionSlotLayout(host, actionSlot) {
    if (!(host instanceof HTMLElement) || !actionSlot?.container) return;

    const { container, durationNode, moreButton } = actionSlot;
    if (!(container instanceof HTMLElement)) return;

    container.style.position = 'relative';

    const durationWidth = durationNode instanceof HTMLElement
      ? durationNode.offsetWidth
      : 0;
    const moreButtonWidth = moreButton instanceof HTMLElement
      ? moreButton.offsetWidth
      : 0;
    const gapAfterButtonPx = 10;
    const actionSlotWidthPx = 10;
    const rightOffsetPx = durationWidth + moreButtonWidth + gapAfterButtonPx + actionSlotWidthPx;

    host.style.position = 'absolute';
    host.style.right = `${rightOffsetPx}px`;
    host.style.top = '50%';
    host.style.transform = 'translateY(-50%)';
    host.style.marginInlineStart = '0';
  }

  function findDirectChild(root, selector) {
    const target = root.querySelector(selector);
    if (!target) return null;

    let node = target;
    while (node && node.parentElement !== root) {
      node = node.parentElement;
    }

    return node?.parentElement === root ? node : null;
  }

  function shouldFetchTrackInfo(trackUri) {
    if (!isSingleTrackUri(trackUri)) return false;
    if (pendingTrackRequests.has(trackUri)) return false;

    const cachedTrack = trackInfoCache.get(trackUri);
    if (!cachedTrack) return true;

    return Date.now() - cachedTrack.fetchedAt > CACHE_TTL_MS;
  }

  function getCachedTrackInfo(trackUri) {
    if (!isSingleTrackUri(trackUri)) return null;

    const cachedTrack = trackInfoCache.get(trackUri);
    if (!cachedTrack) return null;

    if (Date.now() - cachedTrack.fetchedAt > CACHE_TTL_MS) {
      return null;
    }

    return cachedTrack;
  }

  function queueTrackInfoFetch(trackUris) {
    const uris = uniqueStrings(trackUris).filter(shouldFetchTrackInfo);
    if (uris.length === 0) return;

    for (let index = 0; index < uris.length; index += 50) {
      const batch = uris.slice(index, index + 50);
      const request = fetchTrackBatch(batch);
      batch.forEach((trackUri) => {
        pendingTrackRequests.set(trackUri, request);
      });

      void request.finally(() => {
        batch.forEach((trackUri) => {
          if (pendingTrackRequests.get(trackUri) === request) {
            pendingTrackRequests.delete(trackUri);
          }
        });

        scheduleSync();
      });
    }
  }

  async function fetchTrackBatch(trackUris) {
    const ids = trackUris
      .map((trackUri) => trackUri.split(':')[2])
      .filter(Boolean);

    if (ids.length === 0) return;

    let response = null;

    try {
      response = await Spicetify.CosmosAsync.get(
        `https://api.spotify.com/v1/tracks?ids=${ids.join(',')}&market=from_token`,
      );
    } catch (error) {
      console.warn(`[${EXTENSION_NAME}] Market-aware track lookup failed, retrying without market.`, error);
      response = await Spicetify.CosmosAsync.get(
        `https://api.spotify.com/v1/tracks?ids=${ids.join(',')}`,
      );
    }

    const tracks = Array.isArray(response?.tracks) ? response.tracks : [];
    const fetchedAt = Date.now();

    trackUris.forEach((trackUri, index) => {
      trackInfoCache.set(trackUri, normalizeTrackInfo(tracks[index], trackUri, fetchedAt));
    });
  }

  function normalizeTrackInfo(track, trackUri, fetchedAt) {
    return {
      uri: trackUri,
      title: track?.name ?? '',
      artists: uniqueStrings(
        Array.isArray(track?.artists)
          ? track.artists.map((artist) => artist?.name ?? '')
          : [],
      ),
      unavailable: Boolean(
        track &&
        (
          track.is_playable === false ||
          typeof track?.restrictions?.reason === 'string'
        )
      ),
      reason: typeof track?.restrictions?.reason === 'string'
        ? track.restrictions.reason
        : (track?.is_playable === false ? 'unplayable' : null),
      fetchedAt,
    };
  }

  function firstNonEmpty(...values) {
    return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
  }

  function uniqueStrings(values) {
    return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
  }

  function isSingleTrackUri(uri) {
    if (typeof uri !== 'string' || !Spicetify?.URI?.from) {
      return false;
    }

    const parsedUri = Spicetify.URI.from(uri);
    if (!parsedUri || parsedUri.type !== Spicetify.URI.Type.TRACK) {
      return false;
    }

    return typeof parsedUri.getPath === 'function'
      ? parsedUri.getPath() === uri
      : parsedUri.toURI() === uri;
  }

  init();
})();
