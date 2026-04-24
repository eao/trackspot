import { state } from './state.js';
import {
  DEFAULT_CONTENT_WIDTH_PX,
  computeContentInset,
  getContentWidthMaxWidth,
  shouldUseOverlaySidebar,
} from './layout-width.js';

function parseSidebarWidthPx(root = document.documentElement) {
  const raw = getComputedStyle(root).getPropertyValue('--sidebar-width').trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 220;
}

function parseContentPaddingPx(content = document.querySelector('.content')) {
  if (!(content instanceof Element)) {
    return {
      left: 24,
      right: 24,
    };
  }

  const styles = getComputedStyle(content);
  const left = Number.parseFloat(styles.paddingLeft);
  const right = Number.parseFloat(styles.paddingRight);

  return {
    left: Number.isFinite(left) ? left : 24,
    right: Number.isFinite(right) ? right : 24,
  };
}

function detectCoarsePointer(windowObj = window) {
  if (typeof windowObj?.matchMedia !== 'function') return false;
  return windowObj.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function syncAppShellLayout({
  body = document.body,
  root = document.documentElement,
  windowObj = window,
} = {}) {
  const page = state.navigation?.page || 'collection';
  const collectionPage = page === 'collection';
  const sidebarCollapsed = body.classList.contains('sidebar-collapsed');
  const sidebarWidth = parseSidebarWidthPx(root);
  const viewportWidth = root.clientWidth || windowObj.innerWidth || 0;
  const contentPadding = parseContentPaddingPx();
  const overlaySidebar = collectionPage
    ? shouldUseOverlaySidebar({
      viewportWidth,
      hasCoarsePointer: detectCoarsePointer(windowObj),
    })
    : false;
  const maxWidth = collectionPage
    ? getContentWidthMaxWidth(
      state.contentWidthPx ?? DEFAULT_CONTENT_WIDTH_PX,
    )
    : 'none';
  const contentInset = collectionPage
    ? computeContentInset({
      viewportWidth,
      contentWidthPx: state.contentWidthPx ?? DEFAULT_CONTENT_WIDTH_PX,
      sidebarCollapsed,
      reserveSidebarSpace: state.reserveSidebarSpace,
      overlaySidebar,
      sidebarWidth,
      contentPaddingLeft: contentPadding.left,
      contentPaddingRight: contentPadding.right,
    })
    : 0;

  body.classList.toggle('sidebar-overlay-mode', overlaySidebar);
  body.style.setProperty('--app-content-max-width', maxWidth);
  body.style.setProperty('--app-content-inset-left', `${contentInset}px`);
}
