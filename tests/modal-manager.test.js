import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeManagedModal,
  openManagedModal,
  requestCloseTopManagedModal,
} from '../public/js/modal-manager.js';

function nextTick() {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

function makeManagedOverlay(id, label = id) {
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1">
      <button class="first">${label} first</button>
      <button class="last">${label} last</button>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

describe('modal manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"><button id="opener">Open</button></main>';
  });

  it('closes only the topmost managed modal per close request', () => {
    const firstOverlay = makeManagedOverlay('first-overlay');
    const secondOverlay = makeManagedOverlay('second-overlay');
    const firstClose = vi.fn(() => {
      firstOverlay.classList.add('hidden');
      closeManagedModal(firstOverlay);
      return true;
    });
    const secondClose = vi.fn(() => {
      secondOverlay.classList.add('hidden');
      closeManagedModal(secondOverlay);
      return true;
    });

    openManagedModal({
      overlay: firstOverlay,
      dialog: firstOverlay.querySelector('.modal'),
      onRequestClose: firstClose,
    });
    openManagedModal({
      overlay: secondOverlay,
      dialog: secondOverlay.querySelector('.modal'),
      onRequestClose: secondClose,
    });

    expect(requestCloseTopManagedModal()).toBe(true);
    expect(secondClose).toHaveBeenCalledOnce();
    expect(firstClose).not.toHaveBeenCalled();
    expect(secondOverlay.classList.contains('hidden')).toBe(true);

    expect(requestCloseTopManagedModal()).toBe(true);
    expect(firstClose).toHaveBeenCalledOnce();
    expect(firstOverlay.classList.contains('hidden')).toBe(true);
  });

  it('traps Tab inside the top dialog and restores focus to the opener', async () => {
    const opener = document.getElementById('opener');
    const overlay = makeManagedOverlay('focus-overlay');
    const first = overlay.querySelector('.first');
    const last = overlay.querySelector('.last');

    opener.focus();
    openManagedModal({
      overlay,
      dialog: overlay.querySelector('.modal'),
      initialFocus: first,
    });
    await nextTick();
    expect(document.activeElement).toBe(first);

    last.focus();
    const tabForward = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    last.dispatchEvent(tabForward);
    expect(tabForward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    closeManagedModal(overlay);
    expect(document.activeElement).toBe(opener);
  });

  it('inerts non-top body children while keeping the top overlay active', () => {
    const app = document.getElementById('app');
    const firstOverlay = makeManagedOverlay('first-overlay');
    const secondOverlay = makeManagedOverlay('second-overlay');

    openManagedModal({
      overlay: firstOverlay,
      dialog: firstOverlay.querySelector('.modal'),
    });
    expect(app.inert).toBe(true);
    expect(app.getAttribute('aria-hidden')).toBe('true');
    expect(firstOverlay.inert).toBe(false);

    openManagedModal({
      overlay: secondOverlay,
      dialog: secondOverlay.querySelector('.modal'),
    });
    expect(firstOverlay.inert).toBe(true);
    expect(secondOverlay.inert).toBe(false);

    closeManagedModal(secondOverlay);
    expect(firstOverlay.inert).toBe(false);

    closeManagedModal(firstOverlay);
    expect(app.inert).toBe(false);
    expect(app.getAttribute('aria-hidden')).toBeNull();
  });
});
