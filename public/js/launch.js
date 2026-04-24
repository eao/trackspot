import { state, el } from './state.js';
import { resetPagination } from './render.js';
import { artUrl } from './utils.js';
import { waitForImageReady } from './image-ready.js';

const LAUNCH_MODAL_FADE_CLASS = 'launch-fade-in';
const LAUNCH_MODAL_FADE_DURATION_MS = 350;
const LAUNCH_MODAL_FADE_DURATION_VAR = '--launch-modal-fade-duration';

export function getLaunchAlbumId(search = window.location.search) {
  const albumId = new URLSearchParams(search).get('album');
  if (!albumId) return null;
  const parsed = parseInt(albumId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function clearPreopenAlbumModal(doc = document) {
  doc.body.classList.remove('preopen-album-modal');
}

function clearLaunchModalFade(overlay = el.modalOverlay) {
  if (!overlay) return;
  overlay.classList.remove(LAUNCH_MODAL_FADE_CLASS);
  overlay.style.removeProperty(LAUNCH_MODAL_FADE_DURATION_VAR);
}

function applyLaunchModalFade(overlay = el.modalOverlay, durationMs = LAUNCH_MODAL_FADE_DURATION_MS) {
  if (!overlay) return () => {};

  clearLaunchModalFade(overlay);
  overlay.style.setProperty(LAUNCH_MODAL_FADE_DURATION_VAR, `${durationMs}ms`);
  overlay.classList.add(LAUNCH_MODAL_FADE_CLASS);

  const modal = overlay.querySelector('.modal');
  let settled = false;
  let timeoutId = null;

  const cleanup = () => {
    if (settled) return;
    settled = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    clearLaunchModalFade(overlay);
  };

  if (modal) {
    modal.addEventListener('animationend', cleanup, { once: true });
  }

  timeoutId = window.setTimeout(cleanup, durationMs + 50);
  return cleanup;
}

export function maybeClearLaunchAlbumParam(search = window.location.search, pathname = window.location.pathname, history = window.history) {
  const params = new URLSearchParams(search);
  if (!params.has('album')) return;
  params.delete('album');
  const nextSearch = params.toString();
  history.replaceState({}, '', nextSearch ? `${pathname}?${nextSearch}` : pathname);
}

export async function preloadLaunchModalArt(launchAlbumId, options = {}) {
  const {
    albums = state.albums,
    getArtPath = album => album?.image_path ?? null,
    getArtSource = imagePath => artUrl(imagePath),
    waitForArt = waitForImageReady,
  } = options;

  const album = albums.find(candidate => candidate.id === launchAlbumId);
  if (!album) return false;

  const src = getArtSource(getArtPath(album));
  if (!src) return false;

  await waitForArt(src);
  return true;
}

export async function openLaunchAlbumModal(launchAlbumId, options = {}) {
  const {
    openModal,
    onComplete = () => clearPreopenAlbumModal(),
    onMissing = () => clearPreopenAlbumModal(),
    scheduleFrame = cb => requestAnimationFrame(cb),
    focusRating = () => setTimeout(() => el.inputRating.focus(), 50),
    preloadArt = preloadLaunchModalArt,
    fadeDurationMs = LAUNCH_MODAL_FADE_DURATION_MS,
  } = options;

  if (launchAlbumId === null || launchAlbumId === undefined) {
    onComplete();
    return false;
  }

  await preloadArt(launchAlbumId);

  return new Promise(resolve => {
    scheduleFrame(async () => {
      resetPagination();
      const cleanupLaunchFade = applyLaunchModalFade(el.modalOverlay, fadeDurationMs);
      const opened = await openModal(launchAlbumId);
      if (opened) {
        onComplete();
        focusRating();
      } else {
        cleanupLaunchFade();
        onMissing();
      }
      resolve(opened);
    });
  });
}
