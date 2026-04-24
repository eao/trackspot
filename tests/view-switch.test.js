import { describe, expect, it } from 'vitest';
import { shouldHideSidebarImmediatelyOnViewSwitch } from '../public/js/view-switch.js';

describe('view switch sidebar hiding', () => {
  it('immediately snaps the sidebar only for the open<->collapsed cross-view cases', () => {
    expect(shouldHideSidebarImmediatelyOnViewSwitch({
      previousView: 'list',
      nextView: 'grid',
      wasSidebarCollapsed: false,
      nextSidebarCollapsed: true,
    })).toBe(true);

    expect(shouldHideSidebarImmediatelyOnViewSwitch({
      previousView: 'list',
      nextView: 'grid',
      wasSidebarCollapsed: true,
      nextSidebarCollapsed: true,
    })).toBe(false);

    expect(shouldHideSidebarImmediatelyOnViewSwitch({
      previousView: 'grid',
      nextView: 'list',
      wasSidebarCollapsed: true,
      nextSidebarCollapsed: false,
    })).toBe(true);

    expect(shouldHideSidebarImmediatelyOnViewSwitch({
      previousView: 'list',
      nextView: 'grid',
      wasSidebarCollapsed: true,
      nextSidebarCollapsed: true,
    })).toBe(false);

    expect(shouldHideSidebarImmediatelyOnViewSwitch({
      previousView: 'grid',
      nextView: 'list',
      wasSidebarCollapsed: false,
      nextSidebarCollapsed: false,
    })).toBe(false);

    expect(shouldHideSidebarImmediatelyOnViewSwitch({
      previousView: 'grid',
      nextView: 'list',
      wasSidebarCollapsed: true,
      nextSidebarCollapsed: true,
    })).toBe(false);

    expect(shouldHideSidebarImmediatelyOnViewSwitch({
      previousView: 'list',
      nextView: 'grid',
      wasSidebarCollapsed: false,
      nextSidebarCollapsed: false,
    })).toBe(false);
  });
});
