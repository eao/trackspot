import { state } from './state.js';

export const HEADER_SMART_SCROLL_HYSTERESIS_PX = 8;

let lastScrollY = 0;
let scrollRafId = null;
let downwardTravel = 0;
let upwardTravel = 0;

export function getNextHeaderScrollState({
  mode,
  currentY,
  lastY = 0,
  hidden = false,
  downwardTravel = 0,
  upwardTravel = 0,
  hysteresisPx = HEADER_SMART_SCROLL_HYSTERESIS_PX,
} = {}) {
  if (mode === 'fixed') {
    return {
      hidden: false,
      lastY: currentY,
      downwardTravel: 0,
      upwardTravel: 0,
    };
  }

  if (mode === 'scroll') {
    return {
      hidden: currentY > 0,
      lastY: currentY,
      downwardTravel: 0,
      upwardTravel: 0,
    };
  }

  if (currentY <= 0) {
    return {
      hidden: false,
      lastY: currentY,
      downwardTravel: 0,
      upwardTravel: 0,
    };
  }

  const delta = currentY - lastY;
  let nextDownwardTravel = downwardTravel;
  let nextUpwardTravel = upwardTravel;
  let nextHidden = hidden;

  if (delta > 0) {
    nextDownwardTravel += delta;
    nextUpwardTravel = 0;
    if (!hidden && nextDownwardTravel >= hysteresisPx) {
      nextHidden = true;
      nextDownwardTravel = 0;
    }
  } else if (delta < 0) {
    nextUpwardTravel += Math.abs(delta);
    nextDownwardTravel = 0;
    if (hidden && nextUpwardTravel >= hysteresisPx) {
      nextHidden = false;
      nextUpwardTravel = 0;
    }
  }

  return {
    hidden: nextHidden,
    lastY: currentY,
    downwardTravel: nextDownwardTravel,
    upwardTravel: nextUpwardTravel,
  };
}

function getHeaderTransitionTargets() {
  return [
    document.querySelector('.header'),
    document.querySelector('.u-buttons'),
  ].filter(element => element instanceof Element);
}

function suppressHeaderTransitionsOnce() {
  const targets = getHeaderTransitionTargets();
  targets.forEach(element => {
    element.style.transition = 'none';
  });

  return () => {
    targets.forEach(element => {
      void element.offsetWidth;
      requestAnimationFrame(() => {
        element.style.transition = '';
      });
    });
  };
}

function setHeaderHidden(hidden, options = {}) {
  const { instant = false } = options;
  const restoreTransitions = instant ? suppressHeaderTransitionsOnce() : null;
  document.body.classList.toggle('header-hidden', hidden);
  restoreTransitions?.();
}

export function syncHeaderScrollBaseline(options = {}) {
  const {
    currentY = window.scrollY || 0,
    forceVisible = false,
    instant = false,
  } = options;

  const mode = state.headerScrollMode;
  const nextHidden = forceVisible
    ? false
    : mode === 'fixed'
      ? false
      : mode === 'scroll'
        ? currentY > 0
        : currentY <= 0
          ? false
          : document.body.classList.contains('header-hidden');

  lastScrollY = currentY;
  downwardTravel = 0;
  upwardTravel = 0;
  setHeaderHidden(nextHidden, { instant });
}

function onScroll() {
  if (scrollRafId) return;
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null;
    const currentY = window.scrollY;
    const nextHeaderState = getNextHeaderScrollState({
      mode: state.headerScrollMode,
      currentY,
      lastY: lastScrollY,
      hidden: document.body.classList.contains('header-hidden'),
      downwardTravel,
      upwardTravel,
    });

    setHeaderHidden(nextHeaderState.hidden);
    lastScrollY = nextHeaderState.lastY;
    downwardTravel = nextHeaderState.downwardTravel;
    upwardTravel = nextHeaderState.upwardTravel;
  });
}

export function initHeaderScrollTracking() {
  window.addEventListener('scroll', onScroll, { passive: true });
  syncHeaderScrollBaseline({ instant: true });
}

export function syncHeaderForPageNavigation(options = {}) {
  const {
    currentY = window.scrollY || 0,
    forceVisible = true,
    instant = true,
  } = options;

  syncHeaderScrollBaseline({
    currentY,
    forceVisible,
    instant,
  });
}
