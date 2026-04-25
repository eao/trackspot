import { beforeEach, describe, expect, it, vi } from 'vitest';

const elMock = {
  inputRating: { focus: vi.fn() },
  modalOverlay: null,
};

const stateMock = {
  albums: [
    { id: 42, image_path: 'images/42.jpg' },
    { id: 77, image_path: null },
  ],
};

const waitForImageReadyMock = vi.fn(() => Promise.resolve(true));

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
}));

vi.mock('../public/js/render.js', () => ({
  resetPagination: vi.fn(),
}));

vi.mock('../public/js/utils.js', () => ({
  artUrl: path => (path ? `/${path}` : null),
}));

vi.mock('../public/js/image-ready.js', () => ({
  waitForImageReady: waitForImageReadyMock,
}));

describe('launch album startup helpers', () => {
  beforeEach(() => {
    global.document.body.className = '';
    global.document.body.innerHTML = '';

    const modalOverlay = global.document.createElement('div');
    modalOverlay.className = 'modal-overlay hidden';
    const modal = global.document.createElement('div');
    modal.className = 'modal';
    modalOverlay.appendChild(modal);
    global.document.body.appendChild(modalOverlay);

    elMock.modalOverlay = modalOverlay;
    elMock.inputRating.focus.mockReset();
    waitForImageReadyMock.mockClear();
  });

  it('parses a valid ?album query param', async () => {
    const { getLaunchAlbumId } = await import('../public/js/launch.js');

    expect(getLaunchAlbumId('?album=42')).toBe(42);
    expect(getLaunchAlbumId('?album=abc')).toBeNull();
    expect(getLaunchAlbumId('?foo=1')).toBeNull();
  });

  it('clears a launch album query param back to the clean collection route', async () => {
    const { maybeClearLaunchAlbumParam } = await import('../public/js/launch.js');
    const history = { replaceState: vi.fn() };

    maybeClearLaunchAlbumParam('?album=42', '/collection/list', history);

    expect(history.replaceState).toHaveBeenCalledWith({}, '', '/collection/list');
  });

  it('removes the pre-dim class after a successful launch modal open', async () => {
    global.document.body.classList.add('preopen-album-modal');
    const { openLaunchAlbumModal } = await import('../public/js/launch.js');
    const openModal = vi.fn(() => true);
    const onComplete = vi.fn(() => global.document.body.classList.remove('preopen-album-modal'));
    const onMissing = vi.fn();
    const scheduleFrame = cb => cb();
    const focusRating = vi.fn();

    const opened = await openLaunchAlbumModal(42, {
      openModal,
      onComplete,
      onMissing,
      scheduleFrame,
      focusRating,
    });

    expect(opened).toBe(true);
    expect(openModal).toHaveBeenCalledWith(42);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onMissing).not.toHaveBeenCalled();
    expect(focusRating).toHaveBeenCalledOnce();
    expect(global.document.body.classList.contains('preopen-album-modal')).toBe(false);
  });

  it('waits for launch album art before opening the modal', async () => {
    const { openLaunchAlbumModal } = await import('../public/js/launch.js');
    const openModal = vi.fn(() => {
      expect(elMock.modalOverlay.classList.contains('launch-fade-in')).toBe(true);
      return true;
    });
    const onComplete = vi.fn();
    const onMissing = vi.fn();
    const focusRating = vi.fn();
    let resolveArt;
    waitForImageReadyMock.mockImplementationOnce(() => new Promise(resolve => {
      resolveArt = resolve;
    }));

    const pending = openLaunchAlbumModal(42, {
      openModal,
      onComplete,
      onMissing,
      focusRating,
      scheduleFrame: cb => cb(),
    });

    await Promise.resolve();
    expect(waitForImageReadyMock).toHaveBeenCalledWith('/images/42.jpg');
    expect(openModal).not.toHaveBeenCalled();

    resolveArt(true);
    const opened = await pending;

    expect(opened).toBe(true);
    expect(openModal).toHaveBeenCalledWith(42);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('uses a launch-only fade class that clears after the modal animation ends', async () => {
    const { openLaunchAlbumModal } = await import('../public/js/launch.js');
    const openModal = vi.fn(() => true);
    const fadeDurationMs = 987;

    const opened = await openLaunchAlbumModal(42, {
      openModal,
      scheduleFrame: cb => cb(),
      focusRating: vi.fn(),
      fadeDurationMs,
    });

    expect(opened).toBe(true);
    expect(elMock.modalOverlay.classList.contains('launch-fade-in')).toBe(true);
    expect(elMock.modalOverlay.style.getPropertyValue('--launch-modal-fade-duration')).toBe(`${fadeDurationMs}ms`);

    elMock.modalOverlay.querySelector('.modal').dispatchEvent(new Event('animationend'));

    expect(elMock.modalOverlay.classList.contains('launch-fade-in')).toBe(false);
    expect(elMock.modalOverlay.style.getPropertyValue('--launch-modal-fade-duration')).toBe('');
  });

  it('clears the pre-dim class when the launch album cannot be opened', async () => {
    global.document.body.classList.add('preopen-album-modal');
    const { openLaunchAlbumModal } = await import('../public/js/launch.js');
    const openModal = vi.fn(() => false);
    const onComplete = vi.fn();
    const onMissing = vi.fn(() => global.document.body.classList.remove('preopen-album-modal'));
    const scheduleFrame = cb => cb();
    const focusRating = vi.fn();

    const opened = await openLaunchAlbumModal(999, {
      openModal,
      onComplete,
      onMissing,
      scheduleFrame,
      focusRating,
    });

    expect(opened).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onMissing).toHaveBeenCalledOnce();
    expect(focusRating).not.toHaveBeenCalled();
    expect(global.document.body.classList.contains('preopen-album-modal')).toBe(false);
    expect(elMock.modalOverlay.classList.contains('launch-fade-in')).toBe(false);
  });

  it('still opens the launch modal when art is missing or fails to preload', async () => {
    const { openLaunchAlbumModal } = await import('../public/js/launch.js');
    const openModal = vi.fn(() => true);
    waitForImageReadyMock.mockResolvedValueOnce(false);

    const openedWithFailedArt = await openLaunchAlbumModal(42, {
      openModal,
      scheduleFrame: cb => cb(),
      focusRating: vi.fn(),
    });
    const openedWithNoArt = await openLaunchAlbumModal(77, {
      openModal,
      scheduleFrame: cb => cb(),
      focusRating: vi.fn(),
    });

    expect(openedWithFailedArt).toBe(true);
    expect(openedWithNoArt).toBe(true);
    expect(openModal).toHaveBeenNthCalledWith(1, 42);
    expect(openModal).toHaveBeenNthCalledWith(2, 77);
  });
});
