// =============================================================================
// View rendering (list + grid) and data loading.
// =============================================================================

import {
  state, el, apiFetch,
  PAGE_ICON_FIRST, PAGE_ICON_PREV, PAGE_ICON_NEXT, PAGE_ICON_LAST,
} from './state.js';
import {
  formatDate, formatRating, formatDuration, formatAlbumMetaTooltip, artUrl, renderNotesHtml,
  getSafeExternalHref, normalizeAlbumCollectionClientShape,
} from './utils.js';
import { renderArtistSpans } from './artists.js';
import { openEditModal } from './modal.js';
import { updateSortOrderBtn, updateSortFieldBtn } from './sidebar.js';
import { preloadStartupAlbumArt } from './startup-render.js';
import { syncHeaderTooltip } from './header-tooltip.js';
import {
  getArtLightboxFallbackTargetRect,
  maybeDesyncArtLightboxClose,
} from './art-lightbox-close.js';
import { closeManagedModal, openManagedModal } from './modal-manager.js';

const LIST_LAYOUT_COMPACT_MAIN_TRIGGER_WIDTH_PX = 820;
const LIST_HIDE_LISTENED_TRIGGER_WIDTH_PX = 700;
const LIST_LAYOUT_DESKTOP_MOBILE_TRIGGER_WIDTH_PX = 620;
const LIST_LAYOUT_PHONE_TRIGGER_WIDTH_PX = 520;
const LIST_LAYOUT_STAGE_HYSTERESIS_PX = 8;
const ART_LIGHTBOX_OPEN_FADE_DURATION_MS = 350;
const ART_LIGHTBOX_OPEN_MOTION_DURATION_MS = 450;
const ART_LIGHTBOX_CLOSE_FADE_DURATION_MS = 200;
const ART_LIGHTBOX_CLOSE_MOTION_DURATION_MS = 300;
const ART_LIGHTBOX_CLOSE_FALLBACK_MOTION_DURATION_MS = 300;
let listResponsiveResizeObserver = null;
let latestAlbumLoadRequestId = 0;

function getCurrentCollectionView() {
  return state.navigation?.collectionView || state.view || 'list';
}

function isCollectionPageActive() {
  return (state.navigation?.page || 'collection') === 'collection';
}

function applyExternalLinkAttrs(link, href) {
  if (typeof href === 'string' && href.startsWith('spotify:')) {
    return;
  }
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
}

function getListResponsiveMeasurementWidth() {
  if (!el.viewList) return 0;
  return el.viewList.parentElement?.clientWidth || el.viewList.clientWidth || 0;
}

function getNextListResponsiveStage(width, currentStage = 'full') {
  switch (currentStage) {
    case 'phone':
      if (width >= (LIST_LAYOUT_PHONE_TRIGGER_WIDTH_PX + LIST_LAYOUT_STAGE_HYSTERESIS_PX)) return 'desktop-mobile';
      return 'phone';
    case 'desktop-mobile':
      if (width < LIST_LAYOUT_PHONE_TRIGGER_WIDTH_PX) return 'phone';
      if (width >= (LIST_LAYOUT_DESKTOP_MOBILE_TRIGGER_WIDTH_PX + LIST_LAYOUT_STAGE_HYSTERESIS_PX)) return 'hide-listened';
      return 'desktop-mobile';
    case 'hide-listened':
      if (width < LIST_LAYOUT_DESKTOP_MOBILE_TRIGGER_WIDTH_PX) return 'desktop-mobile';
      if (width >= (LIST_HIDE_LISTENED_TRIGGER_WIDTH_PX + LIST_LAYOUT_STAGE_HYSTERESIS_PX)) return 'compact-main';
      return 'hide-listened';
    case 'compact-main':
      if (width < LIST_HIDE_LISTENED_TRIGGER_WIDTH_PX) return 'hide-listened';
      if (width >= (LIST_LAYOUT_COMPACT_MAIN_TRIGGER_WIDTH_PX + LIST_LAYOUT_STAGE_HYSTERESIS_PX)) return 'full';
      return 'compact-main';
    default:
      if (width < LIST_LAYOUT_PHONE_TRIGGER_WIDTH_PX) return 'phone';
      if (width < LIST_LAYOUT_DESKTOP_MOBILE_TRIGGER_WIDTH_PX) return 'desktop-mobile';
      if (width < LIST_HIDE_LISTENED_TRIGGER_WIDTH_PX) return 'hide-listened';
      if (width < LIST_LAYOUT_COMPACT_MAIN_TRIGGER_WIDTH_PX) return 'compact-main';
      return 'full';
  }
}

function getListResponsiveStage(width, previousStage = 'full') {
  if (width <= 0) return previousStage;

  let stage = previousStage;
  for (let i = 0; i < 4; i += 1) {
    const nextStage = getNextListResponsiveStage(width, stage);
    if (nextStage === stage) break;
    stage = nextStage;
  }

  return stage;
}

function syncListResponsiveLayout() {
  if (!el.viewList) return;

  const width = getListResponsiveMeasurementWidth();
  const previousStage = el.viewList.dataset.layoutStage || 'full';
  const stage = getListResponsiveStage(width, previousStage);
  const useCompactHeader = stage !== 'full';

  el.viewList.dataset.layoutStage = stage;

  el.viewList.classList.toggle('list-layout-compact-main', stage !== 'full');
  el.viewList.classList.toggle('hide-list-listened-column', stage === 'hide-listened' || stage === 'desktop-mobile' || stage === 'phone');
  el.viewList.classList.toggle('list-layout-desktop-mobile', stage === 'desktop-mobile');
  el.viewList.classList.toggle('hide-list-year-column', stage === 'desktop-mobile' || stage === 'phone');
  el.viewList.classList.toggle('list-layout-phone', stage === 'phone');
  el.viewList.classList.toggle('hide-list-notes-column', stage === 'phone');
  el.viewList.classList.toggle('list-compact-main-header', useCompactHeader);
  document.body.classList.toggle('list-layout-final-stage', stage === 'phone');
  document.body.classList.toggle('list-layout-last-two-stages', stage === 'desktop-mobile' || stage === 'phone');

  el.viewList.querySelectorAll('.album-row-header-sortable[data-full-label]').forEach(element => {
    const labelEl = element.querySelector('.album-row-header-label');
    if (!labelEl) return;
    labelEl.textContent = useCompactHeader
      ? element.dataset.compactLabel || element.dataset.fullLabel || ''
      : element.dataset.fullLabel || '';
  });
}

function ensureListResponsiveResizeObserver() {
  if (listResponsiveResizeObserver || typeof ResizeObserver === 'undefined' || !el.viewList) return;

  const target = el.viewList.parentElement || el.viewList;
  listResponsiveResizeObserver = new ResizeObserver(() => {
    syncListResponsiveLayout();
  });
  listResponsiveResizeObserver.observe(target);
}

// ---------------------------------------------------------------------------
// List view rendering
// ---------------------------------------------------------------------------

function parseAnimationList(value) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseAnimationTimeMs(value) {
  const trimmed = value.trim();
  if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed);
  if (trimmed.endsWith('s')) return Number.parseFloat(trimmed) * 1000;
  return 0;
}

function setupStartupCleanup(element, onCleanup = () => {}) {
  const computed = window.getComputedStyle(element);
  const animationNames = parseAnimationList(computed.animationName).filter(name => name !== 'none');

  if (animationNames.length === 0) {
    element.classList.remove('slide-in');
    element.style.animationDelay = '';
    onCleanup();
    return;
  }

  const animationDurations = parseAnimationList(computed.animationDuration);
  const animationDelays = parseAnimationList(computed.animationDelay);
  const pendingAnimations = new Set(animationNames);
  let settled = false;
  let timeoutId = null;

  const getAnimationValue = (values, index) => values[index] ?? values[values.length - 1] ?? '0s';

  const cleanup = () => {
    if (settled) return;
    settled = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    element.removeEventListener('animationend', handleAnimationFinish);
    element.removeEventListener('animationcancel', handleAnimationFinish);
    element.classList.remove('slide-in');
    element.style.animationDelay = '';
    onCleanup();
  };

  const handleAnimationFinish = event => {
    if (event.target !== element) return;
    pendingAnimations.delete(event.animationName);
    if (pendingAnimations.size === 0) cleanup();
  };

  element.addEventListener('animationend', handleAnimationFinish);
  element.addEventListener('animationcancel', handleAnimationFinish);

  const longestAnimationMs = animationNames.reduce((longest, _name, index) => {
    const durationMs = parseAnimationTimeMs(getAnimationValue(animationDurations, index));
    const delayMs = parseAnimationTimeMs(getAnimationValue(animationDelays, index));
    return Math.max(longest, durationMs + delayMs);
  }, 0);

  timeoutId = window.setTimeout(cleanup, longestAnimationMs + 50);
}

const LIST_ROW_STARTUP_ANIMATION_MAX = 18;

function getInitialAnimatedRowCount(
  rows,
  viewportHeight = window.innerHeight,
  maxRows = LIST_ROW_STARTUP_ANIMATION_MAX,
) {
  let visibleRows = 0;

  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (rect.top >= viewportHeight) break;
    if (rect.bottom > 0) visibleRows += 1;
  }

  if (visibleRows <= 0 && rows.length > 0) {
    return Math.min(rows.length, 1, maxRows);
  }

  return Math.min(rows.length, maxRows);
}

function getVisualRowStaggerIndexes(elements, tolerancePx = 4) {
  const rowTops = [];
  return elements.map(element => {
    const top = element.getBoundingClientRect().top;
    const existingIndex = rowTops.findIndex(rowTop => Math.abs(rowTop - top) <= tolerancePx);
    if (existingIndex !== -1) {
      return existingIndex;
    }
    rowTops.push(top);
    return rowTops.length - 1;
  });
}

function renderListHeader(animateIn) {
  const header = document.createElement('div');
  header.className = 'album-row album-row-header';
  if (animateIn) {
    header.classList.add('fade-in');
    header.addEventListener('animationend', () => header.classList.remove('fade-in'), { once: true });
  }

  const createHeaderCell = (...classNames) => {
    const cell = document.createElement('div');
    cell.classList.add('album-row-header-cell', ...classNames);
    return cell;
  };

  const createSortableHeader = (label, sortKey, options = {}) => {
    const element = document.createElement('span');
    element.classList.add('col-sortable', 'album-row-header-sortable');
    element.dataset.fullLabel = label;
    element.dataset.compactLabel = options.compactLabel || label;

    const labelEl = document.createElement('span');
    labelEl.className = 'album-row-header-label';
    labelEl.textContent = label;
    element.appendChild(labelEl);

    if (state.sort.field === sortKey) element.appendChild(makeSortIndicator(animateIn));
    element.addEventListener('click', () => handleHeaderSort(sortKey));
    return element;
  };

  const createSeparator = () => {
    const separator = document.createElement('span');
    separator.className = 'album-row-header-separator';
    separator.textContent = '/';
    return separator;
  };

  // Art — centered, not sortable
  const artCell = createHeaderCell('album-row-header-cell-center');
  const artSpan = document.createElement('span');
  artSpan.textContent = 'Art';
  artCell.appendChild(artSpan);
  header.appendChild(artCell);

  // Rating — centered, sortable, tight clickbox
  const ratingCell = createHeaderCell('album-row-header-cell-center');
  ratingCell.classList.add('row-rating-header');
  ratingCell.appendChild(createSortableHeader('Rating', 'rating', { compactLabel: 'R' }));
  header.appendChild(ratingCell);

  // Album / Artist — left-aligned, two separately clickable words
  const albumArtistCell = createHeaderCell('album-row-header-cell-main', 'row-main-header');
  albumArtistCell.appendChild(createSortableHeader('Album', 'album', { compactLabel: 'A' }));
  albumArtistCell.appendChild(createSeparator());
  albumArtistCell.appendChild(createSortableHeader('Artist', 'artist', { compactLabel: 'A' }));
  albumArtistCell.appendChild(createSeparator());
  albumArtistCell.appendChild(createSortableHeader('Duration', 'duration', { compactLabel: 'D' }));
  header.appendChild(albumArtistCell);

  // Notes — left-aligned, sortable
  const notesCell = createHeaderCell('row-notes-header');
  notesCell.appendChild(createSortableHeader('Notes', 'notes_length'));
  header.appendChild(notesCell);

  // Year — centered, sortable, tight clickbox
  const yearCell = createHeaderCell('album-row-header-cell-center', 'row-year-header');
  yearCell.appendChild(createSortableHeader('Year', 'release_date'));
  header.appendChild(yearCell);

  // Listened — centered, sortable, tight clickbox
  const listenedCell = createHeaderCell('album-row-header-cell-center', 'row-listened-header');
  listenedCell.appendChild(createSortableHeader('Logged', 'date_listened_planned'));
  header.appendChild(listenedCell);

  return header;
}

function makeSortIndicator(animateIn) {
  const ind = document.createElement('span');
  ind.className = 'sort-indicator';
  ind.textContent = state.sort.order === 'asc' ? '▲' : '▼';
  if (animateIn) {
    ind.classList.add('fade-in');
    ind.addEventListener('animationend', () => ind.classList.remove('fade-in'), { once: true });
  }
  return ind;
}

function handleHeaderSort(key) {
  if (state.sort.field === key) {
    state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
    updateSortOrderBtn();
  } else {
    state.sort.field = key;
    updateSortFieldBtn();
  }
  resetPagination();
  loadAlbums();
}

function attachReleaseDateTooltip(element, album) {
  const releaseDateTooltip = album?.release_date ? formatDate(album.release_date) : '';
  if (!releaseDateTooltip) return;

  element.dataset.tooltip = releaseDateTooltip;
  element.dataset.tooltipDelay = '0';
  element.dataset.tooltipGap = '4';
}

function createReleaseDateTooltipTarget(text, album, className = '') {
  const element = document.createElement('span');
  element.className = ['release-date-tooltip-target', className].filter(Boolean).join(' ');
  element.textContent = text;
  attachReleaseDateTooltip(element, album);
  return element;
}

let _initialRender = true;
let _artLightboxAnimationTimeoutId = null;
let _artLightboxAnimationToken = 0;
let _artLightboxFlyingFrameEl = null;
let _artLightboxAlbumId = null;
let _artLightboxCloseSession = null;
let _artLightboxManagedOpen = false;

function clearArtLightboxCloseSession() {
  if (!_artLightboxCloseSession) return;

  if (_artLightboxCloseSession.rafId !== null) {
    window.cancelAnimationFrame(_artLightboxCloseSession.rafId);
  }
  if (_artLightboxCloseSession.onScroll) {
    window.removeEventListener('scroll', _artLightboxCloseSession.onScroll);
  }

  _artLightboxCloseSession = null;
}

function triggerArtLightboxCloseDesync(session, remainingMs) {
  if (!session || session.desynced) return;

  session.desynced = true;
  session.frameEl.classList.add('art-lightbox-flying-frame-close-desynced');
  session.frameEl.style.setProperty('--art-lightbox-desync-fade-duration', `${remainingMs}ms`);
}

function scheduleArtLightboxCloseDesyncCheck(session) {
  if (!session || session.desynced || session.rafId !== null) return;

  session.rafId = window.requestAnimationFrame(() => {
    if (!_artLightboxCloseSession || _artLightboxCloseSession !== session) return;
    session.rafId = null;
    if (session.animationToken !== _artLightboxAnimationToken) return;

    const targetState = getCurrentListArtTarget(session.albumId);
    const desyncResult = maybeDesyncArtLightboxClose(session, {
      targetState,
      nowMs: performance.now(),
    });

    if (!desyncResult.shouldDesync) return;
    triggerArtLightboxCloseDesync(session, desyncResult.remainingMs);
  });
}

function startArtLightboxCloseSession({
  animationToken,
  albumId,
  targetEl,
  initialTop,
  totalDurationMs,
  frameEl,
}) {
  clearArtLightboxCloseSession();

  const session = {
    animationToken,
    albumId,
    targetEl,
    initialTop,
    startedAtMs: performance.now(),
    totalDurationMs,
    frameEl,
    desynced: false,
    rafId: null,
    onScroll: null,
  };

  session.onScroll = () => {
    scheduleArtLightboxCloseDesyncCheck(session);
  };

  window.addEventListener('scroll', session.onScroll, { passive: true });
  _artLightboxCloseSession = session;
  return session;
}

function clearArtLightboxAnimation() {
  _artLightboxAnimationToken += 1;
  clearArtLightboxCloseSession();

  if (_artLightboxAnimationTimeoutId !== null) {
    window.clearTimeout(_artLightboxAnimationTimeoutId);
    _artLightboxAnimationTimeoutId = null;
  }

  el.artLightboxOverlay.classList.remove('art-lightbox-visible');
  el.artLightboxOverlay.style.removeProperty('--art-lightbox-fade-duration');
  el.artLightboxImage.classList.remove('art-lightbox-image-hidden');

  if (_artLightboxFlyingFrameEl) {
    _artLightboxFlyingFrameEl.remove();
    _artLightboxFlyingFrameEl = null;
  }
}

function waitForImageLoad(img) {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();

  return new Promise(resolve => {
    const settle = () => {
      img.removeEventListener('load', settle);
      img.removeEventListener('error', settle);
      resolve();
    };

    img.addEventListener('load', settle, { once: true });
    img.addEventListener('error', settle, { once: true });
  });
}

function getElementBorderRadiusPx(element) {
  if (!(element instanceof Element)) return 0;
  const borderRadius = window.getComputedStyle(element).borderTopLeftRadius;
  const parsed = Number.parseFloat(borderRadius);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getElementBoxPx(element) {
  if (!(element instanceof Element)) {
    return {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    };
  }

  const computed = window.getComputedStyle(element);
  return {
    left: Number.parseFloat(computed.left) || 0,
    top: Number.parseFloat(computed.top) || 0,
    width: Number.parseFloat(computed.width) || 0,
    height: Number.parseFloat(computed.height) || 0,
  };
}

function getFillInnerGeometry(rect) {
  return {
    left: 0,
    top: 0,
    width: rect.width,
    height: rect.height,
  };
}

function getCoverInnerGeometry(rect, naturalWidth, naturalHeight) {
  const scale = Math.max(rect.width / naturalWidth, rect.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    left: (rect.width - width) / 2,
    top: (rect.height - height) / 2,
    width,
    height,
  };
}

function applyFrameGeometry(frame, rect, borderRadiusPx = null) {
  frame.style.left = `${rect.left}px`;
  frame.style.top = `${rect.top}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
  if (borderRadiusPx !== null) {
    frame.style.borderRadius = `${borderRadiusPx}px`;
  }
}

function applyInnerGeometry(inner, geometry) {
  inner.style.left = `${geometry.left}px`;
  inner.style.top = `${geometry.top}px`;
  inner.style.width = `${geometry.width}px`;
  inner.style.height = `${geometry.height}px`;
}

function getFlyingFrameState(frame) {
  const inner = frame.querySelector('.art-lightbox-flying-frame-inner');
  return {
    frameRect: frame.getBoundingClientRect(),
    borderRadiusPx: getElementBorderRadiusPx(frame),
    innerGeometry: getElementBoxPx(inner),
  };
}

function createArtLightboxFlyingFrame(sourceEl, frameRect, imageUrl, borderRadiusPx, innerGeometry, motionDurationMs) {
  const frame = document.createElement('div');
  frame.className = 'art-lightbox-flying-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.setProperty('--art-lightbox-expand-duration', `${motionDurationMs}ms`);
  applyFrameGeometry(frame, frameRect, borderRadiusPx);

  const inner = sourceEl.cloneNode(false);
  inner.className = 'art-lightbox-flying-frame-inner';
  inner.src = imageUrl;
  inner.alt = '';
  inner.setAttribute('aria-hidden', 'true');
  applyInnerGeometry(inner, innerGeometry);
  frame.appendChild(inner);

  return frame;
}

function isRectOnScreen(rect, viewportWidth = window.innerWidth, viewportHeight = window.innerHeight) {
  return rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < viewportHeight
    && rect.left < viewportWidth;
}

function getCurrentListArtTarget(albumId) {
  if (albumId === null || albumId === undefined) return null;
  if (!isCollectionPageActive() || getCurrentCollectionView() !== 'list' || el.viewList.classList.contains('hidden')) return null;

  const rowArt = el.viewList.querySelector(`.album-row[data-id="${albumId}"] .row-art`);
  if (!(rowArt instanceof Element)) return null;

  const rect = rowArt.getBoundingClientRect();
  if (!isRectOnScreen(rect)) return null;
  return { element: rowArt, rect };
}

function getListArtColumnRect(albumId) {
  if (albumId === null || albumId === undefined) return null;
  if (!isCollectionPageActive() || getCurrentCollectionView() !== 'list' || el.viewList.classList.contains('hidden')) return null;

  const rowArt = el.viewList.querySelector(`.album-row[data-id="${albumId}"] .row-art`);
  if (!(rowArt instanceof Element)) return null;

  return rowArt.getBoundingClientRect();
}

function getAnyVisibleListArtRect() {
  if (!isCollectionPageActive() || getCurrentCollectionView() !== 'list' || el.viewList.classList.contains('hidden')) return null;

  const rowArts = el.viewList.querySelectorAll('.row-art');
  for (const rowArt of rowArts) {
    if (!(rowArt instanceof Element)) continue;
    const rect = rowArt.getBoundingClientRect();
    if (isRectOnScreen(rect)) return rect;
  }

  return null;
}

function getFallbackShrinkRect(sourceRect, albumId = null) {
  const listArtRect = getListArtColumnRect(albumId) ?? getAnyVisibleListArtRect();
  return getArtLightboxFallbackTargetRect({
    sourceRect,
    preferredRect: listArtRect,
    viewportHeight: window.innerHeight,
  });
}

function animateFlyingFrame(frame, targetRect, targetBorderRadiusPx, targetInnerGeometry) {
  const inner = frame.querySelector('.art-lightbox-flying-frame-inner');
  void frame.getBoundingClientRect();

  requestAnimationFrame(() => {
    applyFrameGeometry(frame, targetRect, targetBorderRadiusPx);
    applyInnerGeometry(inner, targetInnerGeometry);
  });
}

export async function openArtLightbox(imageUrl, albumName, options = {}) {
  const {
    originEl = null,
    animationOriginEl = originEl,
    albumId = null,
  } = options;
  if (!imageUrl) return;

  clearArtLightboxAnimation();
  const animationToken = _artLightboxAnimationToken;
  _artLightboxAlbumId = albumId;

  el.artLightboxOverlay.style.setProperty('--art-lightbox-fade-duration', `${ART_LIGHTBOX_OPEN_FADE_DURATION_MS}ms`);
  el.artLightboxImage.src = imageUrl;
  el.artLightboxImage.alt = albumName ? `${albumName} album art` : 'Album art';
  el.artLightboxOverlay.classList.remove('hidden');
  el.artLightboxOverlay.setAttribute('aria-hidden', 'false');
  openArtLightboxDialog(originEl);

  const shouldAnimateFromOrigin = animationOriginEl instanceof Element;
  if (!shouldAnimateFromOrigin) {
    requestAnimationFrame(() => {
      if (animationToken !== _artLightboxAnimationToken) return;
      el.artLightboxOverlay.classList.add('art-lightbox-visible');
    });
    return;
  }

  await waitForImageLoad(el.artLightboxImage);
  if (animationToken !== _artLightboxAnimationToken) return;

  const originRect = animationOriginEl.getBoundingClientRect();
  el.artLightboxImage.classList.add('art-lightbox-image-hidden');
  const finalRect = el.artLightboxImage.getBoundingClientRect();
  if (!originRect.width || !originRect.height || !finalRect.width || !finalRect.height) {
    el.artLightboxImage.classList.remove('art-lightbox-image-hidden');
    requestAnimationFrame(() => {
      if (animationToken !== _artLightboxAnimationToken) return;
      el.artLightboxOverlay.classList.add('art-lightbox-visible');
    });
    return;
  }

  const naturalWidth = el.artLightboxImage.naturalWidth;
  const naturalHeight = el.artLightboxImage.naturalHeight;
  const originBorderRadius = getElementBorderRadiusPx(animationOriginEl);
  const finalBorderRadius = getElementBorderRadiusPx(el.artLightboxImage);
  const startInnerGeometry = getCoverInnerGeometry(originRect, naturalWidth, naturalHeight);
  const endInnerGeometry = getFillInnerGeometry(finalRect);
  const flyingFrame = createArtLightboxFlyingFrame(
    animationOriginEl,
    originRect,
    imageUrl,
    originBorderRadius,
    startInnerGeometry,
    ART_LIGHTBOX_OPEN_MOTION_DURATION_MS,
  );
  document.body.appendChild(flyingFrame);
  _artLightboxFlyingFrameEl = flyingFrame;

  void flyingFrame.getBoundingClientRect();

  requestAnimationFrame(() => {
    if (animationToken !== _artLightboxAnimationToken) return;
    el.artLightboxOverlay.classList.add('art-lightbox-visible');
    animateFlyingFrame(flyingFrame, finalRect, finalBorderRadius, endInnerGeometry);
  });

  _artLightboxAnimationTimeoutId = window.setTimeout(() => {
    if (animationToken !== _artLightboxAnimationToken) return;
    flyingFrame.remove();
    if (_artLightboxFlyingFrameEl === flyingFrame) {
      _artLightboxFlyingFrameEl = null;
    }
    el.artLightboxImage.classList.remove('art-lightbox-image-hidden');
    _artLightboxAnimationTimeoutId = null;
  }, Math.max(ART_LIGHTBOX_OPEN_FADE_DURATION_MS, ART_LIGHTBOX_OPEN_MOTION_DURATION_MS) + 50);
}

export function closeArtLightbox() {
  if (el.artLightboxOverlay.classList.contains('hidden')) return;

  if (_artLightboxAlbumId === null || _artLightboxAlbumId === undefined) {
    clearArtLightboxAnimation();
    el.artLightboxOverlay.classList.remove('art-lightbox-visible');
    finalizeArtLightboxClosed();
    return;
  }

  const animationToken = _artLightboxAnimationToken + 1;
  const sourceFrameState = _artLightboxFlyingFrameEl ? getFlyingFrameState(_artLightboxFlyingFrameEl) : null;
  const displaySourceEl = _artLightboxFlyingFrameEl?.querySelector('.art-lightbox-flying-frame-inner') ?? el.artLightboxImage;
  const startRect = sourceFrameState?.frameRect ?? displaySourceEl.getBoundingClientRect();
  const imageUrl = el.artLightboxImage.currentSrc || el.artLightboxImage.src;
  const listArtTarget = getCurrentListArtTarget(_artLightboxAlbumId);
  const isOffscreenFallback = !listArtTarget;
  const targetRect = listArtTarget?.rect ?? getFallbackShrinkRect(startRect, _artLightboxAlbumId);
  const shouldAnimate = imageUrl && startRect.width && startRect.height;

  clearArtLightboxAnimation();

  if (!shouldAnimate) {
    finalizeArtLightboxClosed();
    return;
  }

  _artLightboxAnimationToken = animationToken;
  el.artLightboxOverlay.style.setProperty('--art-lightbox-fade-duration', `${ART_LIGHTBOX_CLOSE_FADE_DURATION_MS}ms`);

  const naturalWidth = el.artLightboxImage.naturalWidth;
  const naturalHeight = el.artLightboxImage.naturalHeight;
  const startBorderRadius = sourceFrameState?.borderRadiusPx ?? getElementBorderRadiusPx(el.artLightboxImage);
  const targetBorderRadius = isOffscreenFallback
    ? startBorderRadius
    : getElementBorderRadiusPx(listArtTarget.element);
  const startInnerGeometry = sourceFrameState?.innerGeometry ?? getFillInnerGeometry(startRect);
  const targetInnerGeometry = isOffscreenFallback
    ? getFillInnerGeometry(targetRect)
    : getCoverInnerGeometry(targetRect, naturalWidth, naturalHeight);
  const closeMotionDurationMs = isOffscreenFallback
    ? ART_LIGHTBOX_CLOSE_FALLBACK_MOTION_DURATION_MS
    : ART_LIGHTBOX_CLOSE_MOTION_DURATION_MS;

  const flyingFrame = createArtLightboxFlyingFrame(
    displaySourceEl,
    startRect,
    imageUrl,
    startBorderRadius,
    startInnerGeometry,
    closeMotionDurationMs,
  );
  if (isOffscreenFallback) {
    flyingFrame.classList.add('art-lightbox-flying-frame-close-fallback');
  }
  document.body.appendChild(flyingFrame);
  _artLightboxFlyingFrameEl = flyingFrame;
  if (!isOffscreenFallback) {
    startArtLightboxCloseSession({
      animationToken,
      albumId: _artLightboxAlbumId,
      targetEl: listArtTarget.element,
      initialTop: listArtTarget.rect.top,
      totalDurationMs: closeMotionDurationMs,
      frameEl: flyingFrame,
    });
  }

  el.artLightboxOverlay.classList.remove('art-lightbox-visible');
  el.artLightboxImage.classList.add('art-lightbox-image-hidden');

  animateFlyingFrame(flyingFrame, targetRect, targetBorderRadius, targetInnerGeometry);

  _artLightboxAnimationTimeoutId = window.setTimeout(() => {
    if (_artLightboxAnimationToken !== animationToken) return;
    clearArtLightboxCloseSession();
    flyingFrame.remove();
    if (_artLightboxFlyingFrameEl === flyingFrame) {
      _artLightboxFlyingFrameEl = null;
    }
    finalizeArtLightboxClosed();
    _artLightboxAnimationTimeoutId = null;
  }, Math.max(ART_LIGHTBOX_CLOSE_FADE_DURATION_MS, closeMotionDurationMs) + 50);
}

export function resetPagination() {
  state.pagination.currentPage = 1;
}

function getActivePerPage() {
  return state.pagination.perPage.list;
}

function getDefaultAlbumListMeta() {
  return {
    totalCount: 0,
    filteredCount: 0,
    currentPage: 1,
    totalPages: 1,
    startIndex: 0,
    endIndex: 0,
    isPaged: false,
    perPage: null,
    pageCount: 0,
    trackedListenedMs: 0,
  };
}

export function clearAlbumResults(options = {}) {
  const { loading = false } = options;

  state.albums = [];
  state.albumsLoaded = false;
  state.albumsLoading = loading;
  state.albumsError = null;
  state.albumListMeta = getDefaultAlbumListMeta();
}

export function getCurrentPageAlbums(collection = state.albums) {
  return collection;
}

export async function preloadInitialVisibleAlbumArt(collection = state.albums, options = {}) {
  return preloadStartupAlbumArt(collection, options);
}

function getAlbumActionLabel(album) {
  const artistNames = Array.isArray(album.artists)
    ? album.artists.map(artist => typeof artist === 'string' ? artist : artist?.name).filter(Boolean)
    : [];
  const artistLabel = artistNames.length ? ` by ${artistNames.join(', ')}` : '';
  return `Edit ${album.album_name || 'album'}${artistLabel}`;
}

function shouldIgnoreAlbumActionEvent(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target === event.currentTarget) return false;
  return !!target.closest('a, button, input, select, textarea, label, .artist-chip');
}

function makeAlbumActionTarget(element, album) {
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', getAlbumActionLabel(album));
  element.addEventListener('click', event => {
    if (shouldIgnoreAlbumActionEvent(event)) return;
    event.stopPropagation();
    openEditModal(album.id);
  });
  element.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (shouldIgnoreAlbumActionEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    openEditModal(album.id);
  });
}

function updatePageControls(meta) {
  el.pageControlFirst.innerHTML = PAGE_ICON_FIRST;
  el.pageControlPrev.innerHTML = PAGE_ICON_PREV;
  el.pageControlNext.innerHTML = PAGE_ICON_NEXT;
  el.pageControlLast.innerHTML = PAGE_ICON_LAST;

  const showPager = isCollectionPageActive() && meta.isPaged;
  const showFirstLast = showPager && state.pagination.showFirstLastButtons;
  const showPageCount = showPager && state.pagination.showPageCount;
  el.pageControls.classList.toggle('hidden', !showPager);
  el.pageControls.classList.toggle('page-controls-static', showPager && state.pagination.visibilityMode === 'static');
  el.pageCount.classList.toggle('hidden', !showPageCount);
  el.pageCount.classList.toggle('page-count-static', showPageCount && state.pagination.visibilityMode === 'static');
  el.pageCount.textContent = `${meta.currentPage} / ${meta.totalPages}`;
  el.pageControlFirst.classList.toggle('hidden', !showFirstLast);
  el.pageControlLast.classList.toggle('hidden', !showFirstLast);

  el.pageControlFirst.disabled = meta.currentPage <= 1;
  el.pageControlPrev.disabled = meta.currentPage <= 1;
  el.pageControlNext.disabled = meta.currentPage >= meta.totalPages;
  el.pageControlLast.disabled = meta.currentPage >= meta.totalPages;
}

function renderList(albums, startIndex = 0, options = {}) {
  const { animateIn = false } = options;
  el.viewList.innerHTML = '';
  ensureListResponsiveResizeObserver();
  if (albums.length === 0) return false;

  el.viewList.appendChild(renderListHeader(animateIn));
  const rows = [];

  albums.forEach((album, index) => {
    const row = document.createElement('div');
    row.className = 'album-row';
    row.dataset.id = album.id;

    const url = artUrl(album.image_path);

    // Art wrap (with hover index overlay)
    const artWrap = document.createElement('div');
    artWrap.className = 'row-art-wrap';

    if (url) {
      const img = document.createElement('img');
      img.className = 'row-art';
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      artWrap.appendChild(img);
      const openRowArt = e => {
        if (!state.listArtClickToEnlarge) return;
        e.stopPropagation();
        openArtLightbox(url, album.album_name, {
          originEl: artWrap,
          animationOriginEl: img,
          albumId: album.id,
        });
      };
      artWrap.addEventListener('click', openRowArt);
      artWrap.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openRowArt(e);
      });
      artWrap.classList.toggle('row-art-wrap-clickable', state.listArtClickToEnlarge);
      if (state.listArtClickToEnlarge) {
        artWrap.tabIndex = 0;
        artWrap.setAttribute('role', 'button');
        artWrap.setAttribute('aria-label', `Open ${album.album_name || 'album'} art preview`);
      }
    } else {
      const ph = document.createElement('div');
      ph.className = 'row-art-placeholder';
      artWrap.appendChild(ph);
    }

    const overlay = document.createElement('div');
    overlay.className = 'row-index-overlay';
    overlay.textContent = `#${startIndex + index + 1}`;
    artWrap.appendChild(overlay);

    // Rating
    const ratingEl = document.createElement('span');
    ratingEl.className = album.rating === null ? 'row-rating unrated' : 'row-rating';
    ratingEl.textContent = formatRating(album.rating);

    // Album + Artist (combined cell)
    const mainEl = document.createElement('div');
    mainEl.className = 'row-main';

    const albumNameEl = document.createElement('div');
    albumNameEl.className = 'row-album';
    const safeAlbumLink = getSafeExternalHref(album.album_link);
    if (safeAlbumLink) {
      const link = document.createElement('a');
      link.textContent = album.album_name;
      link.href = safeAlbumLink;
      applyExternalLinkAttrs(link, safeAlbumLink);
      link.title = 'Open album link';
      link.addEventListener('click', e => e.stopPropagation());
      albumNameEl.appendChild(link);
    } else if (album.spotify_album_id) {
      const link = document.createElement('a');
      link.textContent = album.album_name;
      link.href = `spotify:album:${album.spotify_album_id}`;
      link.title = 'Open in Spotify';
      link.addEventListener('click', e => e.stopPropagation());
      albumNameEl.appendChild(link);
    } else {
      albumNameEl.textContent = album.album_name;
    }

    const artistEl = document.createElement('div');
    artistEl.className = 'row-artist';
    artistEl.appendChild(renderArtistSpans(album.artists, album.artist_link ?? null));
    const durationEl = document.createElement('div');
    durationEl.className = 'row-duration';
    durationEl.textContent = formatDuration(album.duration_ms);
    const durationTooltip = formatAlbumMetaTooltip(album);
    if (durationTooltip) {
      durationEl.dataset.tooltip = durationTooltip;
      durationEl.dataset.tooltipSide = 'right';
      durationEl.dataset.tooltipDelay = '0';
      durationEl.dataset.tooltipGap = '4';
    }
    mainEl.appendChild(albumNameEl);
    mainEl.appendChild(artistEl);
    mainEl.appendChild(durationEl);

    // Notes (separate cell)
    const notesEl = document.createElement('div');
    notesEl.className = 'row-notes row-notes-cell';
    notesEl.innerHTML = renderNotesHtml(album.notes ?? '');
    notesEl.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', event => event.stopPropagation());
    });

    // Year
    const yearEl = document.createElement('span');
    yearEl.className = 'row-year row-year-cell';
    yearEl.appendChild(createReleaseDateTooltipTarget(String(album.release_year ?? '—'), album));

    // Date listened / planned
    const dateEl = document.createElement('span');
    dateEl.className = 'row-date row-listened-cell';
    dateEl.textContent = formatDate(album.listened_at || album.planned_at);

    row.appendChild(artWrap);
    row.appendChild(ratingEl);
    row.appendChild(mainEl);
    row.appendChild(notesEl);
    row.appendChild(yearEl);
    row.appendChild(dateEl);

    makeAlbumActionTarget(row, album);
    el.viewList.appendChild(row);
    rows.push(row);

  });

  if (!animateIn) {
    syncListResponsiveLayout();
    return false;
  }

  const animatedRowCount = getInitialAnimatedRowCount(rows);
  rows.slice(0, animatedRowCount).forEach((row, index) => {
    row.classList.add('slide-in');
    row.style.animationDelay = `${Math.min(index, LIST_ROW_STARTUP_ANIMATION_MAX) * 150}ms`;
    setupStartupCleanup(row);
  });

  syncListResponsiveLayout();
  return true;
}

// ---------------------------------------------------------------------------
// Grid view rendering
// ---------------------------------------------------------------------------

function renderGrid(albums, options = {}) {
  const { animateIn = false } = options;
  if (albums.length === 0) {
    el.viewGrid.innerHTML = '';
    return false;
  }

  const cards = albums.map(album => {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.dataset.id = album.id;

    const url = artUrl(album.image_path);
    const ratingClass = album.rating === null ? 'card-rating unrated' : 'card-rating';
    const ratingText  = formatRating(album.rating);

    // Build art element.
    const artEl = document.createElement(url ? 'img' : 'div');
    if (url) {
      artEl.className = 'card-art';
      artEl.src = url;
      artEl.alt = '';
      artEl.loading = 'lazy';
    } else {
      artEl.className = 'card-art-placeholder';
      artEl.textContent = '♪';
    }

    // Build info section.
    const infoEl = document.createElement('div');
    infoEl.className = 'card-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    const safeAlbumLink = getSafeExternalHref(album.album_link);
    if (safeAlbumLink) {
      const link = document.createElement('a');
      link.textContent = album.album_name;
      link.href = safeAlbumLink;
      applyExternalLinkAttrs(link, safeAlbumLink);
      link.title = 'Open album link';
      link.addEventListener('click', e => e.stopPropagation());
      titleEl.appendChild(link);
    } else if (album.spotify_album_id) {
      const link = document.createElement('a');
      link.textContent = album.album_name;
      link.href = `spotify:album:${album.spotify_album_id}`;
      link.title = 'Open in Spotify';
      link.addEventListener('click', e => e.stopPropagation());
      titleEl.appendChild(link);
    } else {
      titleEl.textContent = album.album_name;
    }

    const artistContainerEl = document.createElement('div');
    artistContainerEl.className = 'card-artist';
    artistContainerEl.appendChild(renderArtistSpans(album.artists, album.artist_link ?? null));

    const footerEl = document.createElement('div');
    footerEl.className = 'card-footer';
    const yearEl = document.createElement('span');
    yearEl.className = 'card-year';
    yearEl.appendChild(createReleaseDateTooltipTarget(String(album.release_year ?? '—'), album));

    const ratingEl = document.createElement('span');
    ratingEl.className = ratingClass;
    ratingEl.textContent = ratingText;

    footerEl.appendChild(yearEl);
    footerEl.appendChild(ratingEl);

    infoEl.appendChild(titleEl);
    infoEl.appendChild(artistContainerEl);
    infoEl.appendChild(footerEl);
    card.appendChild(artEl);
    card.appendChild(infoEl);
    makeAlbumActionTarget(card, album);

    return card;
  });

  el.viewGrid.innerHTML = '';
  cards.forEach(c => el.viewGrid.appendChild(c));

  if (!animateIn) return false;

  const animatedCardCount = getInitialAnimatedRowCount(cards);
  const animatedCards = cards.slice(0, animatedCardCount);
  const staggerIndexes = getVisualRowStaggerIndexes(animatedCards);

  animatedCards.forEach((card, index) => {
    card.classList.add('slide-in');
    card.style.animationDelay = `${Math.min(staggerIndexes[index], LIST_ROW_STARTUP_ANIMATION_MAX) * 150}ms`;
    setupStartupCleanup(card);
  });

  return true;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------
// Called whenever state changes. Filters the album list, updates both views,
// shows/hides the empty state, and updates the status count.

function syncEmptyStateActions({ hasError, isLoading, totalCount }) {
  const retryButton = el.emptyState?.querySelector('[data-empty-action="retry"]');
  const clearFiltersButton = el.emptyState?.querySelector('[data-empty-action="clear-filters"]');
  const logAlbumButton = el.emptyState?.querySelector('[data-empty-action="log-album"]');
  if (!retryButton && !clearFiltersButton && !logAlbumButton) return;

  retryButton?.classList.toggle('hidden', !hasError);
  clearFiltersButton?.classList.toggle('hidden', hasError || isLoading || totalCount === 0);
  logAlbumButton?.classList.toggle('hidden', hasError || isLoading || totalCount !== 0);

  if (retryButton) {
    retryButton.onclick = () => {
      void loadAlbums({ preservePage: true });
    };
  }
  if (clearFiltersButton) {
    clearFiltersButton.onclick = () => {
      el.btnClearFilters?.click();
    };
  }
  if (logAlbumButton) {
    logAlbumButton.onclick = () => {
      el.btnLogNew?.click();
    };
  }
}

export function render() {
  const isCollectionPage = isCollectionPageActive();
  const meta = state.albumListMeta ?? getDefaultAlbumListMeta();
  const pageAlbums = state.albums;
  const collectionView = getCurrentCollectionView();
  const isLoading = isCollectionPage && state.albumsLoading;
  const hasError = isCollectionPage && !!state.albumsError;
  el.pageCollection?.setAttribute('aria-busy', isLoading ? 'true' : 'false');

  if (isCollectionPage && !hasError) {
    const startupAnimatedView = _initialRender ? collectionView : null;
    const consumedListStartup = renderList(pageAlbums, meta.startIndex, {
      animateIn: startupAnimatedView === 'list',
    });
    const consumedGridStartup = renderGrid(pageAlbums, {
      animateIn: startupAnimatedView === 'grid',
    });
    if (consumedListStartup || consumedGridStartup) {
      _initialRender = false;
    }
  }

  const isEmpty = isCollectionPage && state.albumsLoaded && meta.filteredCount === 0;
  const showEmptyState = hasError || isEmpty || isLoading;
  const emptyStateMessage = el.emptyState.querySelector('p');
  if (emptyStateMessage) {
    emptyStateMessage.textContent = hasError
      ? `Failed to load albums. ${state.albumsError}`
      : isLoading
        ? 'Loading albums...'
        : meta.totalCount === 0
          ? 'No albums logged yet.'
          : 'No albums match your filters.';
  }
  syncEmptyStateActions({ hasError, isLoading, totalCount: meta.totalCount });
  el.emptyState.classList.toggle('hidden', !showEmptyState);
  el.viewList.classList.toggle('hidden', !isCollectionPage || showEmptyState || collectionView !== 'list');
  el.viewGrid.classList.toggle('hidden', !isCollectionPage || showEmptyState || collectionView !== 'grid');
  if (isCollectionPage) {
    syncListResponsiveLayout();
  }
  updatePageControls(meta);

  if (hasError) {
    el.albumCount.textContent = 'Failed to load albums.';
  } else if (isLoading) {
    el.albumCount.textContent = 'Loading albums...';
  } else {
    const total = meta.totalCount;
    const shown = meta.filteredCount;
    const pageShown = pageAlbums.length;
    const baseCount = `Showing ${shown}/${total} album${total !== 1 ? 's' : ''}`;
    const pageLine = meta.isPaged ? `page ${meta.currentPage} of ${meta.totalPages}, showing ${pageShown}` : '';
    el.albumCount.textContent = pageLine ? `${baseCount}\n${pageLine}` : baseCount;
  }

  syncHeaderTooltip();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
// Fetches the current album page from the server using the active filter,
// sort, and pagination state.

export async function loadAlbums(options = {}) {
  const {
    gateStartupArt = false,
    preloadVisibleAlbumArt = preloadInitialVisibleAlbumArt,
    renderAlbums = render,
    preservePage = false,
    scrollToTop = false,
    showLoading = renderAlbums === render,
  } = options;

  if (!preservePage) {
    resetPagination();
  }

  if (scrollToTop) {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
  }

  const statusFilter = state.filters.statusFilter;
  const complexStatus = state.complexStatuses.find(item => item.id === statusFilter);
  const statuses = complexStatus
    ? complexStatus.statuses
    : (statusFilter ? [statusFilter] : []);
  const allowedTypes = [
    state.filters.typeAlbum ? 'ALBUM' : null,
    state.filters.typeEP ? 'EP' : null,
    state.filters.typeSingle ? 'SINGLE' : null,
    state.filters.typeCompilation ? 'COMPILATION' : null,
  ].filter(Boolean);
  const perPage = getActivePerPage();
  const params = new URLSearchParams({
    sort:  state.sort.field,
    order: state.sort.order,
    page: String(state.pagination.currentPage),
  });

  if (perPage) {
    params.set('per_page', String(perPage));
  }
  if (state.filters.search) {
    params.set('search', state.filters.search);
  }
  if (state.filters.artist) {
    params.set('artist', state.filters.artist);
    if (state.filters.artistMatchExact) {
      params.set('artist_exact', '1');
    }
  }
  if (state.filters.year) {
    params.set('year', state.filters.year);
  }
  if (state.filters.ratingMin !== '') {
    params.set('rating_min', state.filters.ratingMin);
  }
  if (state.filters.ratingMax !== '') {
    params.set('rating_max', state.filters.ratingMax);
  }
  if (statuses.length) {
    params.set('statuses', statuses.join(','));
  }
  if (state.filters.importTypeFilter !== 'all') {
    params.set('import_type', state.filters.importTypeFilter);
  }
  if (state.filters.ratedFilter !== 'both') {
    params.set('rated', state.filters.ratedFilter);
  }
  if (allowedTypes.length) {
    params.set('types', allowedTypes.join(','));
  }
  params.set('include_other', state.filters.typeOther ? '1' : '0');
  const requestId = ++latestAlbumLoadRequestId;
  state.albumsError = null;
  state.albumsLoading = true;
  if (showLoading) {
    renderAlbums();
  }

  try {
    const response = await apiFetch(`/api/albums?${params}`);
    if (requestId !== latestAlbumLoadRequestId) return false;

    const albums = Array.isArray(response) ? response : response.albums;
    const meta = Array.isArray(response) ? getDefaultAlbumListMeta() : (response.meta ?? getDefaultAlbumListMeta());
    const normalizedAlbums = normalizeAlbumCollectionClientShape(albums);
    const nextAlbumListMeta = { ...getDefaultAlbumListMeta(), ...meta };

    if (gateStartupArt) {
      await preloadVisibleAlbumArt(normalizedAlbums);
      if (requestId !== latestAlbumLoadRequestId) return false;
    }

    state.albums = normalizedAlbums;
    state.albums.forEach(album => {
      state.albumDetailsCache[album.id] = album;
    });
    state.albumListMeta = nextAlbumListMeta;
    state.pagination.currentPage = state.albumListMeta.currentPage;
    state.albumsLoaded = true;
    state.albumsLoading = false;
    state.albumsError = null;
    renderAlbums();
    return true;
  } catch (e) {
    if (requestId !== latestAlbumLoadRequestId) return false;
    state.albumsLoading = false;
    state.albumsError = e?.message || String(e);
    console.error('Failed to load albums:', e);
    renderAlbums();
    return true;
  }
}

function openArtLightboxDialog(originEl = null) {
  if (_artLightboxManagedOpen) return;
  openManagedModal({
    overlay: el.artLightboxOverlay,
    dialog: el.artLightboxOverlay,
    initialFocus: el.artLightboxClose || el.artLightboxOverlay,
    opener: originEl,
    onRequestClose: () => {
      closeArtLightbox();
      return true;
    },
  });
  el.artLightboxOverlay.inert = false;
  el.artLightboxOverlay.setAttribute('aria-hidden', 'false');
  _artLightboxManagedOpen = true;
}

function closeArtLightboxDialog(options = {}) {
  if (!_artLightboxManagedOpen) return;
  closeManagedModal(el.artLightboxOverlay, options);
  _artLightboxManagedOpen = false;
}

function finalizeArtLightboxClosed() {
  closeArtLightboxDialog();
  el.artLightboxOverlay.classList.add('hidden');
  el.artLightboxOverlay.setAttribute('aria-hidden', 'true');
  el.artLightboxImage.classList.remove('art-lightbox-image-hidden');
  el.artLightboxImage.removeAttribute('src');
  el.artLightboxImage.alt = '';
  _artLightboxAlbumId = null;
}
