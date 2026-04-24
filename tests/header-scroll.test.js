import { describe, expect, it } from 'vitest';
import {
  getNextHeaderScrollState,
  HEADER_SMART_SCROLL_HYSTERESIS_PX,
} from '../public/js/header-scroll.js';

describe('header scroll state', () => {
  it('keeps the header visible until smart mode scrolls down past the hysteresis threshold', () => {
    let state = getNextHeaderScrollState({
      mode: 'smart',
      currentY: 4,
      lastY: 0,
      hidden: false,
    });

    expect(state.hidden).toBe(false);
    expect(state.downwardTravel).toBe(4);

    state = getNextHeaderScrollState({
      mode: 'smart',
      currentY: HEADER_SMART_SCROLL_HYSTERESIS_PX,
      lastY: state.lastY,
      hidden: state.hidden,
      downwardTravel: state.downwardTravel,
      upwardTravel: state.upwardTravel,
    });

    expect(state.hidden).toBe(true);
    expect(state.downwardTravel).toBe(0);
  });

  it('keeps the header hidden until smart mode scrolls back up past the hysteresis threshold', () => {
    let state = getNextHeaderScrollState({
      mode: 'smart',
      currentY: 20,
      lastY: 0,
      hidden: true,
    });

    expect(state.hidden).toBe(true);

    state = getNextHeaderScrollState({
      mode: 'smart',
      currentY: 15,
      lastY: state.lastY,
      hidden: state.hidden,
      downwardTravel: state.downwardTravel,
      upwardTravel: state.upwardTravel,
    });

    expect(state.hidden).toBe(true);
    expect(state.upwardTravel).toBe(5);

    state = getNextHeaderScrollState({
      mode: 'smart',
      currentY: 12,
      lastY: state.lastY,
      hidden: state.hidden,
      downwardTravel: state.downwardTravel,
      upwardTravel: state.upwardTravel,
    });

    expect(state.hidden).toBe(false);
    expect(state.upwardTravel).toBe(0);
  });

  it('shows the header immediately at the top of the page', () => {
    const state = getNextHeaderScrollState({
      mode: 'smart',
      currentY: 0,
      lastY: 10,
      hidden: true,
      downwardTravel: 3,
      upwardTravel: 3,
    });

    expect(state.hidden).toBe(false);
    expect(state.downwardTravel).toBe(0);
    expect(state.upwardTravel).toBe(0);
  });

  it('preserves the non-smart behaviors for fixed and scroll modes', () => {
    expect(getNextHeaderScrollState({
      mode: 'fixed',
      currentY: 200,
      lastY: 100,
      hidden: true,
      downwardTravel: 4,
      upwardTravel: 4,
    })).toMatchObject({
      hidden: false,
      lastY: 200,
      downwardTravel: 0,
      upwardTravel: 0,
    });

    expect(getNextHeaderScrollState({
      mode: 'scroll',
      currentY: 1,
      lastY: 0,
      hidden: false,
    })).toMatchObject({
      hidden: true,
      lastY: 1,
      downwardTravel: 0,
      upwardTravel: 0,
    });
  });
});
