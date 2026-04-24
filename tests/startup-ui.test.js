import { beforeEach, describe, expect, it } from 'vitest';
import { revealSidebarForStartup } from '../public/js/startup-ui.js';

describe('startup sidebar reveal', () => {
  beforeEach(() => {
    global.document.body.className = '';
  });

  it('keeps the sidebar hidden until the reveal handoff frame', async () => {
    const sidebar = global.document.createElement('aside');
    sidebar.style.visibility = 'hidden';
    const frames = [];

    const revealPromise = revealSidebarForStartup(sidebar, {
      body: global.document.body,
      scheduleFrame: cb => frames.push(cb),
    });

    expect(sidebar.style.visibility).toBe('hidden');
    expect(sidebar.classList.contains('startup-hidden')).toBe(true);
    expect(sidebar.classList.contains('slide-in')).toBe(false);

    frames[0]();
    await revealPromise;

    expect(sidebar.style.visibility).toBe('');
    expect(sidebar.classList.contains('startup-hidden')).toBe(false);
    expect(sidebar.classList.contains('slide-in')).toBe(true);
  });

  it('reveals collapsed sidebars without playing the opening animation', async () => {
    const sidebar = global.document.createElement('aside');
    sidebar.style.visibility = 'hidden';
    global.document.body.classList.add('sidebar-collapsed');

    const animated = await revealSidebarForStartup(sidebar, {
      body: global.document.body,
      scheduleFrame: cb => cb(),
    });

    expect(animated).toBe(false);
    expect(sidebar.style.visibility).toBe('');
    expect(sidebar.classList.contains('startup-hidden')).toBe(false);
    expect(sidebar.classList.contains('slide-in')).toBe(false);
  });
});
