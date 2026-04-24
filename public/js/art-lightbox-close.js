export const ART_LIGHTBOX_CLOSE_DESYNC_THRESHOLD_PX = 0;
export const ART_LIGHTBOX_FALLBACK_TARGET_Y_RATIO = 0.3;
export const ART_LIGHTBOX_FALLBACK_ART_SIZE_PX = 120;

export function getArtLightboxFallbackTargetRect({
  sourceRect,
  preferredRect = null,
  viewportHeight,
  targetYRatio = ART_LIGHTBOX_FALLBACK_TARGET_Y_RATIO,
  fallbackArtSizePx = ART_LIGHTBOX_FALLBACK_ART_SIZE_PX,
}) {
  const width = preferredRect?.width || fallbackArtSizePx;
  const height = preferredRect?.height || fallbackArtSizePx;
  const centerX = preferredRect
    ? preferredRect.left + (preferredRect.width / 2)
    : sourceRect.left + (sourceRect.width / 2);
  const centerY = viewportHeight * targetYRatio;

  return {
    left: centerX - (width / 2),
    top: centerY - (height / 2),
    width,
    height,
  };
}

export function getArtLightboxCloseRemainingDurationMs({
  startedAtMs,
  totalDurationMs,
  nowMs,
}) {
  return Math.max(0, totalDurationMs - Math.max(0, nowMs - startedAtMs));
}

export function maybeDesyncArtLightboxClose(session, options = {}) {
  if (!session || session.desynced) {
    return {
      shouldDesync: false,
      reason: null,
      remainingMs: 0,
    };
  }

  const {
    targetState = null,
    thresholdPx = ART_LIGHTBOX_CLOSE_DESYNC_THRESHOLD_PX,
    nowMs = 0,
  } = options;

  const remainingMs = getArtLightboxCloseRemainingDurationMs({
    startedAtMs: session.startedAtMs,
    totalDurationMs: session.totalDurationMs,
    nowMs,
  });

  if (!targetState || targetState.element !== session.targetEl) {
    return {
      shouldDesync: true,
      reason: 'invalid-target',
      remainingMs,
    };
  }

  const deltaY = Math.abs(targetState.rect.top - session.initialTop);
  if (deltaY > thresholdPx) {
    return {
      shouldDesync: true,
      reason: 'target-shifted',
      remainingMs,
    };
  }

  return {
    shouldDesync: false,
    reason: null,
    remainingMs,
  };
}
