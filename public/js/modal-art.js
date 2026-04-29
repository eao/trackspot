// =============================================================================
// Art action buttons for the edit modal.
// =============================================================================

import { state, el, apiFetch } from './state.js';
import { artUrl, normalizeAlbumClientShape } from './utils.js';
import { loadAlbums } from './render.js';
import { showError } from './modal.js';

// ---------------------------------------------------------------------------
// Art actions (edit modal)
// ---------------------------------------------------------------------------

export function showArtButtons() {
  // Re-fetch art: show for any album that has a spotify_album_id or image URLs.
  const album = state.albums.find(a => a.id === state.modal.albumId)
    ?? state.albumDetailsCache[state.modal.albumId];
  const canRefetch = album && (album.image_url_large || album.image_url_medium || album.image_url_small);
  const showRefetch = state.showRefetchArt === true;
  el.btnRefetchArt.classList.toggle('hidden', !canRefetch || !showRefetch);
  // Debug-only buttons.
  el.btnDeleteArt.classList.toggle('hidden', !state.debugMode);
  el.btnRandomArt.classList.toggle('hidden', !state.debugMode);
}

export async function handleRefetchArt() {
  const album = state.albums.find(a => a.id === state.modal.albumId)
    ?? state.albumDetailsCache[state.modal.albumId];
  if (!album) return;

  el.btnRefetchArt.textContent = 'Fetching…';
  el.btnRefetchArt.disabled = true;
  el.artRefetchPreview.classList.add('hidden');

  try {
    const result = await apiFetch(`/api/albums/${album.id}/refetch-art`, { method: 'POST' });

    if (!album.image_path) {
      // No existing art — just applied directly, reload.
      const idx = state.albums.findIndex(a => a.id === album.id);
      if (idx !== -1) state.albums[idx] = { ...state.albums[idx], ...result };
      state.albumDetailsCache[album.id] = { ...album, ...result };
      await loadAlbums({ preservePage: true, invalidateCache: true });
      el.metaArt.src = artUrl(result.image_path) || '';
    } else {
      // Show comparison popup.
      el.artRefetchImg.src = artUrl(result.new_image_path) + '?t=' + Date.now();
      const same = result.identical;
      el.artRefetchCompare.innerHTML = same
        ? '<span style="color:var(--success)">✅ Files are identical.</span>'
        : '<span style="color:var(--danger-hover)">❌ Files are different.</span>';
      // Default focus: Cancel if identical, Replace if different.
      el.btnArtRefetchCancel.classList.toggle('btn-primary', same);
      el.btnArtRefetchCancel.classList.toggle('btn-ghost', !same);
      el.btnArtRefetchReplace.classList.toggle('btn-primary', !same);
      el.btnArtRefetchReplace.classList.toggle('btn-ghost', same);
      // Store the new path for replace action.
      el.btnArtRefetchReplace.dataset.newPath = result.new_image_path;
      el.artRefetchPreview.classList.remove('hidden');
    }
  } catch (e) {
    showError(e.message);
  } finally {
    el.btnRefetchArt.textContent = 'Re-fetch art';
    el.btnRefetchArt.disabled = false;
  }
}

export async function handleArtRefetchReplace() {
  const newPath = el.btnArtRefetchReplace.dataset.newPath;
  if (!newPath || !state.modal.albumId) return;
  try {
    const updated = normalizeAlbumClientShape(await apiFetch(`/api/albums/${state.modal.albumId}/replace-refetched-art`, {
      method: 'POST',
      body: JSON.stringify({ image_path: newPath }),
    }));
    const idx = state.albums.findIndex(a => a.id === state.modal.albumId);
    if (idx !== -1) state.albums[idx] = updated;
    state.albumDetailsCache[state.modal.albumId] = updated;
    el.metaArt.src = artUrl(updated.image_path) || '';
    await loadAlbums({ preservePage: true, invalidateCache: true });
  } catch (e) {
    showError(e.message);
  } finally {
    el.artRefetchPreview.classList.add('hidden');
  }
}

export async function handleDeleteArt() {
  if (!state.modal.albumId) return;
  try {
    const updated = normalizeAlbumClientShape(await apiFetch(`/api/albums/${state.modal.albumId}/delete-art`, { method: 'POST' }));
    const idx = state.albums.findIndex(a => a.id === state.modal.albumId);
    if (idx !== -1) state.albums[idx] = updated;
    state.albumDetailsCache[state.modal.albumId] = updated;
    el.metaArt.src = '';
    el.metaArt.classList.add('hidden');
    await loadAlbums({ preservePage: true, invalidateCache: true });
  } catch (e) {
    showError(e.message);
  }
}

export async function handleRandomArt() {
  if (!state.modal.albumId) return;
  try {
    const updated = normalizeAlbumClientShape(await apiFetch(`/api/albums/${state.modal.albumId}/random-art`, { method: 'POST' }));
    const idx = state.albums.findIndex(a => a.id === state.modal.albumId);
    if (idx !== -1) state.albums[idx] = updated;
    state.albumDetailsCache[state.modal.albumId] = updated;
    el.metaArt.src = artUrl(updated.image_path) || '';
    el.metaArt.classList.toggle('hidden', !updated.image_path);
    await loadAlbums({ preservePage: true, invalidateCache: true });
  } catch (e) {
    showError(e.message);
  }
}
