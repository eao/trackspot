import { describe, expect, it } from 'vitest';
import {
  ART_LIGHTBOX_CLOSE_DESYNC_THRESHOLD_PX,
  ART_LIGHTBOX_FALLBACK_ART_SIZE_PX,
  ART_LIGHTBOX_FALLBACK_TARGET_Y_RATIO,
  getArtLightboxFallbackTargetRect,
  getArtLightboxCloseRemainingDurationMs,
  maybeDesyncArtLightboxClose,
} from '../public/js/art-lightbox-close.js';

describe('art lightbox close desync helpers', () => {
  it('keeps the close animation synced when the target shift stays within the threshold', () => {
    const targetEl = {};
    const session = {
      targetEl,
      initialTop: 120,
      startedAtMs: 1000,
      totalDurationMs: 300,
      desynced: false,
    };

    const result = maybeDesyncArtLightboxClose(session, {
      targetState: {
        element: targetEl,
        rect: { top: 120 + ART_LIGHTBOX_CLOSE_DESYNC_THRESHOLD_PX },
      },
      nowMs: 1100,
    });

    expect(result).toEqual({
      shouldDesync: false,
      reason: null,
      remainingMs: 200,
    });
  });

  it('triggers desync fade when the target shifts beyond the threshold', () => {
    const targetEl = {};
    const session = {
      targetEl,
      initialTop: 120,
      startedAtMs: 1000,
      totalDurationMs: 300,
      desynced: false,
    };

    const result = maybeDesyncArtLightboxClose(session, {
      targetState: {
        element: targetEl,
        rect: { top: 120 + ART_LIGHTBOX_CLOSE_DESYNC_THRESHOLD_PX + 1 },
      },
      nowMs: 1175,
    });

    expect(result).toEqual({
      shouldDesync: true,
      reason: 'target-shifted',
      remainingMs: 125,
    });
  });

  it('treats an invalid target as desynced and clamps the remaining duration at zero', () => {
    const session = {
      targetEl: {},
      initialTop: 120,
      startedAtMs: 1000,
      totalDurationMs: 300,
      desynced: false,
    };

    const result = maybeDesyncArtLightboxClose(session, {
      targetState: null,
      nowMs: 1400,
    });

    expect(result).toEqual({
      shouldDesync: true,
      reason: 'invalid-target',
      remainingMs: 0,
    });
  });

  it('returns zero remaining duration for stale or overrun close timing', () => {
    expect(getArtLightboxCloseRemainingDurationMs({
      startedAtMs: 1000,
      totalDurationMs: 300,
      nowMs: 1400,
    })).toBe(0);
  });

  it('targets fallback contraction at the list-art x position and 30% viewport height', () => {
    const result = getArtLightboxFallbackTargetRect({
      sourceRect: {
        left: 500,
        top: 50,
        width: 220,
        height: 220,
      },
      preferredRect: {
        left: 32,
        top: -400,
        width: 40,
        height: 40,
      },
      viewportHeight: 1000,
    });

    expect(result).toEqual({
      left: 32,
      top: 280,
      width: 40,
      height: 40,
    });
  });

  it('falls back to the source center and default art size when no list-art rect is available', () => {
    const result = getArtLightboxFallbackTargetRect({
      sourceRect: {
        left: 500,
        top: 50,
        width: 220,
        height: 220,
      },
      viewportHeight: 1000,
    });

    expect(result).toEqual({
      left: 500 + (220 / 2) - (ART_LIGHTBOX_FALLBACK_ART_SIZE_PX / 2),
      top: (1000 * ART_LIGHTBOX_FALLBACK_TARGET_Y_RATIO) - (ART_LIGHTBOX_FALLBACK_ART_SIZE_PX / 2),
      width: ART_LIGHTBOX_FALLBACK_ART_SIZE_PX,
      height: ART_LIGHTBOX_FALLBACK_ART_SIZE_PX,
    });
  });
});
