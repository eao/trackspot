export const DEFAULT_CONTENT_WIDTH_PX = 1000;
export const CONTENT_WIDTH_MIN_PX = 600;
export const CONTENT_WIDTH_SPINNER_STEP = 100;
export const SIDEBAR_OVERLAY_MAX_WIDTH_PX = 760;

export function shouldUseOverlaySidebar({
  viewportWidth,
  hasCoarsePointer = false,
} = {}) {
  return hasCoarsePointer && viewportWidth > 0 && viewportWidth <= SIDEBAR_OVERLAY_MAX_WIDTH_PX;
}

export function parseStoredContentWidthPx(
  value,
  fallback = DEFAULT_CONTENT_WIDTH_PX,
) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed === 0) return 0;
  if (parsed < CONTENT_WIDTH_MIN_PX) return fallback;
  return parsed;
}

export function validateContentWidthPx(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed)) return null;
  if (parsed === 0) return 0;
  if (parsed < CONTENT_WIDTH_MIN_PX) return null;
  return parsed;
}

export function getContentWidthMaxWidth(widthPx = DEFAULT_CONTENT_WIDTH_PX) {
  return widthPx === 0 ? 'none' : `${widthPx}px`;
}

export function getSteppedContentWidthPx(
  currentWidthPx,
  delta,
  {
    minWidthPx = CONTENT_WIDTH_MIN_PX,
    step = CONTENT_WIDTH_SPINNER_STEP,
  } = {},
) {
  if (delta === 0) return currentWidthPx;
  if (currentWidthPx === 0) {
    return delta > 0 ? minWidthPx : 0;
  }

  const next = currentWidthPx + (Math.sign(delta) * step);
  if (next <= 0 || next < minWidthPx) {
    return delta < 0 ? 0 : minWidthPx;
  }
  return next;
}

export function computeContentInset({
  viewportWidth,
  contentWidthPx = DEFAULT_CONTENT_WIDTH_PX,
  sidebarCollapsed,
  reserveSidebarSpace,
  overlaySidebar = false,
  sidebarWidth = 220,
  contentPaddingLeft = 24,
  contentPaddingRight = 24,
  sidebarGap = contentPaddingLeft,
}) {
  if (overlaySidebar) return 0;

  const reservedSidebarWidth =
    !sidebarCollapsed || reserveSidebarSpace ? sidebarWidth : 0;
  if (reservedSidebarWidth === 0) return 0;

  const targetShellLeft = reservedSidebarWidth + sidebarGap;

  const availableWidthAtZeroInset = Math.max(
    0,
    viewportWidth - contentPaddingLeft - contentPaddingRight,
  );
  const shellWidthAtZeroInset = contentWidthPx === 0
    ? availableWidthAtZeroInset
    : Math.min(contentWidthPx, availableWidthAtZeroInset);
  const shellLeftAtZeroInset = contentPaddingLeft + Math.max(
    0,
    (availableWidthAtZeroInset - shellWidthAtZeroInset) / 2,
  );
  const overlapAtZeroInset = targetShellLeft - shellLeftAtZeroInset;

  if (overlapAtZeroInset <= 0) return 0;

  if (contentWidthPx === 0 || availableWidthAtZeroInset <= contentWidthPx) {
    return overlapAtZeroInset;
  }

  const centeredShellShrinkRoom = availableWidthAtZeroInset - contentWidthPx;
  const centeredInsetNeeded = overlapAtZeroInset * 2;

  if (centeredInsetNeeded <= centeredShellShrinkRoom) {
    return centeredInsetNeeded;
  }

  return Math.max(0, targetShellLeft - contentPaddingLeft);
}
