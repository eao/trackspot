import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  shouldAnimateGridSidebarToggle,
  shouldReserveSidebarSpace,
} from '../public/js/sidebar-layout.js';
import {
  CONTENT_WIDTH_MIN_PX,
  DEFAULT_CONTENT_WIDTH_PX,
  computeContentInset,
  getContentWidthMaxWidth,
  getSteppedContentWidthPx,
  parseStoredContentWidthPx,
  shouldUseOverlaySidebar,
  validateContentWidthPx,
} from '../public/js/layout-width.js';

const indexHtml = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
const startupScript = indexHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1] ?? '';

describe('sidebar layout helpers', () => {
  it('keeps sidebar space reserved for collapsed list and grid layouts when enabled', () => {
    expect(shouldReserveSidebarSpace({
      sidebarCollapsed: true,
      reserveSidebarSpace: true,
    })).toBe(true);

    expect(shouldReserveSidebarSpace({
      sidebarCollapsed: true,
      reserveSidebarSpace: false,
    })).toBe(false);

    expect(shouldReserveSidebarSpace({
      sidebarCollapsed: false,
      reserveSidebarSpace: false,
    })).toBe(true);
  });

  it('only runs the grid FLIP animation when cards will actually reflow', () => {
    expect(shouldAnimateGridSidebarToggle({
      reserveSidebarSpace: false,
      cardCount: 6,
    })).toBe(true);

    expect(shouldAnimateGridSidebarToggle({
      reserveSidebarSpace: true,
      cardCount: 6,
    })).toBe(false);

    expect(shouldAnimateGridSidebarToggle({
      reserveSidebarSpace: false,
      cardCount: 0,
    })).toBe(false);
  });
});

describe('content width helpers', () => {
  it('uses overlay sidebar mode only for coarse-pointer narrow viewports', () => {
    expect(shouldUseOverlaySidebar({
      viewportWidth: 760,
      hasCoarsePointer: true,
    })).toBe(true);

    expect(shouldUseOverlaySidebar({
      viewportWidth: 761,
      hasCoarsePointer: true,
    })).toBe(false);

    expect(shouldUseOverlaySidebar({
      viewportWidth: 390,
      hasCoarsePointer: false,
    })).toBe(false);
  });

  it('maps the saved width value to the expected max-width CSS', () => {
    expect(getContentWidthMaxWidth(DEFAULT_CONTENT_WIDTH_PX)).toBe('1000px');
    expect(getContentWidthMaxWidth(2400)).toBe('2400px');
    expect(getContentWidthMaxWidth(0)).toBe('none');
  });

  it('validates and restores width values with 0 as unlimited and no upper cap', () => {
    expect(parseStoredContentWidthPx('3400')).toBe(3400);
    expect(parseStoredContentWidthPx('0')).toBe(0);
    expect(parseStoredContentWidthPx('500')).toBe(DEFAULT_CONTENT_WIDTH_PX);
    expect(validateContentWidthPx(String(CONTENT_WIDTH_MIN_PX))).toBe(CONTENT_WIDTH_MIN_PX);
    expect(validateContentWidthPx('0')).toBe(0);
    expect(validateContentWidthPx('12345')).toBe(12345);
    expect(validateContentWidthPx('599')).toBeNull();
    expect(validateContentWidthPx('nope')).toBeNull();
  });

  it('steps spinner values by 100 while handling the 0/unlimited boundary', () => {
    expect(getSteppedContentWidthPx(1600, 100)).toBe(1700);
    expect(getSteppedContentWidthPx(1600, -100)).toBe(1500);
    expect(getSteppedContentWidthPx(600, -100)).toBe(0);
    expect(getSteppedContentWidthPx(0, 100)).toBe(600);
    expect(getSteppedContentWidthPx(0, -100)).toBe(0);
  });

  it('computes zero inset when the sidebar is not reserving space', () => {
    expect(computeContentInset({
      viewportWidth: 2200,
      contentWidthPx: 1600,
      sidebarCollapsed: false,
      reserveSidebarSpace: false,
      sidebarWidth: 0,
    })).toBe(0);
  });

  it('computes zero inset when the sidebar should overlay on touch-sized screens', () => {
    expect(computeContentInset({
      viewportWidth: 390,
      contentWidthPx: 1000,
      sidebarCollapsed: false,
      reserveSidebarSpace: false,
      overlaySidebar: true,
      sidebarWidth: 220,
    })).toBe(0);
  });

  it('keeps content stationary when the centered shell already leaves enough gutter', () => {
    expect(computeContentInset({
      viewportWidth: 2200,
      contentWidthPx: 1600,
      sidebarCollapsed: false,
      reserveSidebarSpace: false,
      sidebarWidth: 220,
    })).toBe(0);

    expect(computeContentInset({
      viewportWidth: 2200,
      contentWidthPx: 1600,
      sidebarCollapsed: true,
      reserveSidebarSpace: true,
      sidebarWidth: 220,
    })).toBe(0);
  });

  it('doubles the inset while the shell is still centered at its max width', () => {
    expect(computeContentInset({
      viewportWidth: 1900,
      contentWidthPx: 1600,
      sidebarCollapsed: false,
      reserveSidebarSpace: false,
      sidebarWidth: 220,
    })).toBe(188);
  });

  it('switches to a 1:1 inset once the shell can no longer stay centered at max width', () => {
    expect(computeContentInset({
      viewportWidth: 1800,
      contentWidthPx: 1600,
      sidebarCollapsed: false,
      reserveSidebarSpace: false,
      sidebarWidth: 220,
    })).toBe(220);

    expect(computeContentInset({
      viewportWidth: 1800,
      contentWidthPx: 1600,
      sidebarCollapsed: true,
      reserveSidebarSpace: true,
      sidebarWidth: 220,
    })).toBe(220);
  });

  it('uses the full sidebar width as inset when content width is unlimited', () => {
    expect(computeContentInset({
      viewportWidth: 2200,
      contentWidthPx: 0,
      sidebarCollapsed: false,
      reserveSidebarSpace: false,
      sidebarWidth: 220,
    })).toBe(220);
  });
});

describe('startup body classes', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.document.body.className = '';
    globalThis.document.body.removeAttribute('style');
    Object.defineProperty(globalThis.window, 'innerWidth', {
      configurable: true,
      value: 2200,
      writable: true,
    });
    globalThis.window.matchMedia = query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    });
  });

  it('applies the reserved sidebar space class on load when the option is enabled', () => {
    localStorage.setItem('ts_sidebarCollapsedList', '1');
    localStorage.setItem('ts_reserveSidebarSpace', '1');

    globalThis.window.eval(startupScript);

    expect(globalThis.document.body.classList.contains('sidebar-collapsed')).toBe(true);
    expect(globalThis.document.body.classList.contains('reserve-sidebar-space')).toBe(true);
  });

  it('applies content width and computed inset styles before app init', () => {
    localStorage.setItem('ts_sidebarCollapsedList', '1');
    localStorage.setItem('ts_reserveSidebarSpace', '1');
    localStorage.setItem('ts_contentWidth', '1000');

    globalThis.window.eval(startupScript);

    expect(globalThis.document.body.style.getPropertyValue('--app-content-max-width')).toBe('1000px');
    expect(globalThis.document.body.style.getPropertyValue('--app-content-inset-left')).toBe('0px');
  });

  it('treats 0 as unlimited on startup and applies the full inset when space is reserved', () => {
    localStorage.setItem('ts_contentWidth', '0');
    localStorage.setItem('ts_reserveSidebarSpace', '1');

    globalThis.window.eval(startupScript);

    expect(globalThis.document.body.style.getPropertyValue('--app-content-max-width')).toBe('none');
    expect(globalThis.document.body.style.getPropertyValue('--app-content-inset-left')).toBe('220px');
  });

  it('uses sidebar overlay mode on startup for coarse-pointer phone-sized screens', () => {
    Object.defineProperty(globalThis.window, 'innerWidth', {
      configurable: true,
      value: 390,
      writable: true,
    });
    globalThis.window.matchMedia = query => ({
      matches: query === '(hover: none) and (pointer: coarse)',
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    });

    globalThis.window.eval(startupScript);

    expect(globalThis.document.body.classList.contains('sidebar-overlay-mode')).toBe(true);
    expect(globalThis.document.body.style.getPropertyValue('--app-content-inset-left')).toBe('0px');
  });
});
