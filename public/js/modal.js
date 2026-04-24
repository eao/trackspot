// =============================================================================
// Log/edit/delete modals and art actions.
// =============================================================================

import { state, el, apiFetch, LS_SHOW_REPEATS_FIELD, LS_SHOW_PRIORITY_FIELD, LS_SHOW_PLANNED_AT_FIELD } from './state.js';
import {
  formatArtists, formatDuration, parseDurationInput, artUrl,
  todayISO, parseArtistInput, escHtml, normalizeAlbumTypeForStorage, formatAlbumTypeForDisplay, deriveArtistNames,
  normalizeAlbumClientShape,
} from './utils.js';
import { loadAlbums, resetPagination } from './render.js';
import { invalidateDashboardCache } from './dashboard.js';
import { showArtButtons } from './modal-art.js';

// ---------------------------------------------------------------------------
// Error display helpers
// ---------------------------------------------------------------------------

export function showError(msg) {
  el.fetchError.textContent = msg;
  el.fetchError.classList.remove('hidden');
}

export function hideError() {
  el.fetchError.textContent = '';
  el.fetchError.classList.add('hidden');
}

function getAlbumById(id) {
  return state.albums.find(album => album.id === id)
    ?? state.albumDetailsCache[id]
    ?? null;
}

function storeAlbumDetails(album) {
  if (!album?.id) return album;
  state.albumDetailsCache[album.id] = album;
  const idx = state.albums.findIndex(existing => existing.id === album.id);
  if (idx !== -1) {
    state.albums[idx] = album;
  }
  return album;
}

function removeAlbumDetails(id) {
  delete state.albumDetailsCache[id];
  const idx = state.albums.findIndex(album => album.id === id);
  if (idx !== -1) {
    state.albums.splice(idx, 1);
  }
}

// ---------------------------------------------------------------------------
// Rating display update
// ---------------------------------------------------------------------------
// Keeps the large rating badge next to the input in sync as the user types.

export function updateRatingDisplay(value) {
  const n = value === null || value === undefined || value === '' ? null : Number(value);
  el.ratingDisplay.textContent = n === null || isNaN(n) ? '—' : String(n);
  el.ratingDisplay.style.color = n === null || isNaN(n)
    ? 'var(--text-muted)'
    : 'var(--accent)';
}

// ---------------------------------------------------------------------------
// Clear all details fields
// ---------------------------------------------------------------------------

export function clearDetailsFields() {
  el.metaArt.src           = '';
  el.metaAlbumName.value   = '';
  el.metaArtistNames.value = '';
  el.metaReleaseDate.value = '';
  el.metaTrackCount.value  = '';
  el.metaDuration.value    = '';
  el.metaArtistId.value    = '';
  el.metaAlbumType.value   = '';
  el.metaAlbumLink.value   = '';
  el.metaArtistLink.value  = '';
  el.inputPlannedAt.value  = '';
  el.inputListenedAt.value = '';
  el.inputRating.value     = '';
  el.inputNotes.value      = '';
  el.inputStatus.value     = 'completed';
  el.inputRepeats.value    = '0';
  el.inputPriority.value   = '0';
  updateRatingDisplay(null);
}

export function getModalDateDefaultsForStatus(status, today = todayISO()) {
  if (status === 'planned') {
    return {
      planned_at: today,
      listened_at: '',
    };
  }

  return {
    planned_at: '',
    listened_at: today,
  };
}

function applyModalOpenDateDefaults(status) {
  const defaults = getModalDateDefaultsForStatus(status);
  el.inputPlannedAt.value = defaults.planned_at;
  el.inputListenedAt.value = defaults.listened_at;
}

function getArtistNameSuggestions() {
  const namesByNormalized = new Map();
  const knownAlbums = [
    ...state.albums,
    ...Object.values(state.albumDetailsCache || {}),
  ];

  knownAlbums.forEach(album => {
    const artistNames = Array.isArray(album?.artist_names) && album.artist_names.length
      ? album.artist_names
      : deriveArtistNames(album?.artists);

    artistNames.forEach(name => {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      const normalized = trimmed.toLocaleLowerCase();
      if (!trimmed || namesByNormalized.has(normalized)) return;
      namesByNormalized.set(normalized, trimmed);
    });
  });

  return [...namesByNormalized.values()]
    .sort((left, right) => left.localeCompare(right, undefined, {
      sensitivity: 'base',
      numeric: true,
    }));
}

function syncArtistNameSuggestions() {
  if (!el.metaArtistNamesList) return;
  el.metaArtistNamesList.innerHTML = '';

  getArtistNameSuggestions().forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    el.metaArtistNamesList.appendChild(option);
  });
}

// ---------------------------------------------------------------------------
// Populate the details step fields
// ---------------------------------------------------------------------------
// Used both when a Spotify fetch completes (log mode) and when opening
// the edit modal. isManual controls whether metadata fields are editable.

export function populateDetailsFields(album, isManual) {
  syncArtistNameSuggestions();

  if (album) {
    // Album art.
    const url = artUrl(album.image_path);
    if (url) {
      el.metaArt.src = url;
      el.metaArt.classList.remove('hidden');
    } else {
      el.metaArt.src = '';
      el.metaArt.classList.add('hidden');
    }

    el.metaAlbumName.value   = album.album_name ?? '';
    el.metaArtistNames.value = formatArtists(album.artists);
    el.metaReleaseDate.value = album.release_date ?? '';
    el.metaTrackCount.value  = album.track_count ?? '';
    el.metaDuration.value    = album.duration_ms ? formatDuration(album.duration_ms) : '';
    el.metaAlbumLink.value   = album.album_link ?? '';
    el.metaArtistLink.value  = album.artist_link ?? '';

    // Pre-populate listened_at only when logging new (not editing).
    if (state.modal.mode === 'log') {
      applyModalOpenDateDefaults(el.inputStatus.value || 'completed');
      el.inputRating.value     = '';
      el.inputNotes.value      = '';
      updateRatingDisplay(null);
    }
  } else {
    // Manual entry — blank slate.
    el.metaArt.src = '';
    el.metaArt.classList.add('hidden');
    el.metaAlbumName.value   = '';
    el.metaArtistNames.value = '';
    el.metaReleaseDate.value = '';
    el.metaTrackCount.value  = '';
    el.metaAlbumLink.value   = '';
    el.metaArtistLink.value  = '';
    applyModalOpenDateDefaults(el.inputStatus.value || 'completed');
    el.inputRating.value     = '';
    el.inputNotes.value      = '';
    updateRatingDisplay(null);
  }

  // Metadata fields: read-only for Spotify entries, editable for manual.
  el.metaAlbumName.readOnly   = !isManual;
  el.metaArtistNames.readOnly = !isManual;
  el.metaReleaseDate.readOnly = !isManual;
  el.metaTrackCount.readOnly  = !isManual;
  el.metaDuration.readOnly    = !isManual;

  // Style read-only fields so they visually distinguish from editable ones.
  [el.metaAlbumName, el.metaArtistNames, el.metaReleaseDate, el.metaTrackCount, el.metaDuration].forEach(input => {
    input.style.opacity = isManual ? '1' : '0.6';
    input.style.cursor  = isManual ? '' : 'default';
  });

  // Show Spotify Artist ID field only for manual entries.
  el.fieldManualMetaRow.classList.toggle('hidden', !isManual);
  el.fieldArtistId.classList.toggle('hidden', !isManual);
  if (isManual && album) {
    // Populate artist ID from first artist that has one.
    const firstId = Array.isArray(album.artists) ? album.artists.find(a => a.id)?.id : null;
    el.metaArtistId.value = firstId ?? '';
  } else {
    el.metaArtistId.value = '';
  }

  // Show Album Type field only for manual entries.
  el.fieldAlbumType.classList.toggle('hidden', !isManual);
  el.metaAlbumType.value = (isManual && album) ? formatAlbumTypeForDisplay(album.album_type) : '';

  // Show manual link fields only for manual entries.
  el.fieldManualLinksRow.classList.toggle('hidden', !isManual);
  el.fieldAlbumLink.classList.toggle('hidden', !isManual);
  el.fieldArtistLink.classList.toggle('hidden', !isManual);

  // In edit mode, hide Year and Duration for Spotify-imported albums.
  const hideSpotifyMetadataExtras = state.modal.mode === 'edit' && !isManual;
  el.fieldReleaseDate.classList.toggle('hidden', hideSpotifyMetadataExtras);
  el.fieldTrackCount.classList.toggle('hidden', !isManual);
  el.fieldDuration.classList.toggle('hidden', hideSpotifyMetadataExtras);

  // Show image upload button only for manual entries.
  el.metaArtUploadLabel.classList.toggle('hidden', !isManual);

}

export function syncAlbumModalFieldVisibility() {
  const showRepeatsInEdit = localStorage.getItem(LS_SHOW_REPEATS_FIELD) !== '0';
  const showPriorityInEdit = localStorage.getItem(LS_SHOW_PRIORITY_FIELD) === '1';
  const showPlannedAtField = localStorage.getItem(LS_SHOW_PLANNED_AT_FIELD) === '1';
  const hideRepeats = state.modal.mode === 'edit' && !showRepeatsInEdit;
  const hidePriority = state.modal.mode === 'edit' && !showPriorityInEdit;
  const hidePlannedAt = !showPlannedAtField;
  el.fieldRepeatsRow.classList.toggle('hidden', hideRepeats);
  el.fieldPriorityRow.classList.toggle('hidden', hidePriority);
  el.fieldPlannedAtRow.classList.toggle('hidden', hidePlannedAt);
}

export function syncAlbumModalDebugControls() {
  const showDebug = state.debugMode && state.modal.open && state.modal.mode === 'edit';
  el.btnShowAlbumInfo.classList.toggle('hidden', !showDebug);
  el.btnDeleteArt.classList.toggle('hidden', !showDebug);
  el.btnRandomArt.classList.toggle('hidden', !showDebug);
}

// ---------------------------------------------------------------------------
// Open the log modal (new album)
// ---------------------------------------------------------------------------

export function openLogModal() {
  state.modal = {
    open:        true,
    mode:        'log',
    step:        'details',
    albumId:     null,
    isManual:    true,
    isFetching:  false,
    isSaving:    false,
    pendingMeta: null,
  };

  el.modalTitle.textContent = 'Log Album';

  el.stepDetails.classList.remove('hidden');
  el.btnSave.classList.remove('hidden');
  el.btnSave.textContent = 'Save';
  el.btnModalDelete.classList.add('hidden');

  // Clear all fields.
  clearDetailsFields();
  populateDetailsFields(null, true);
  hideError();
  syncAlbumModalFieldVisibility();
  syncAlbumModalDebugControls();

  el.modalOverlay.classList.remove('hidden');

  // Focus the album name input after the modal is visible.
  setTimeout(() => el.metaAlbumName.focus(), 50);
}

// ---------------------------------------------------------------------------
// Handle image upload (manual entry)
// ---------------------------------------------------------------------------

export async function handleImageUpload(file) {
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    const result = await fetch('/api/albums/upload-image', {
      method: 'POST',
      body: formData,
      // Do NOT set Content-Type here — the browser sets it automatically
      // with the correct multipart boundary when using FormData.
    });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error);

    // Store the returned path in pendingMeta so it gets saved with the album.
    if (!state.modal.pendingMeta) state.modal.pendingMeta = {};
    state.modal.pendingMeta.image_path = data.image_path;

    // Show a preview.
    el.metaArt.src = '/' + data.image_path;
    el.metaArt.classList.remove('hidden');

  } catch (e) {
    showError('Image upload failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Handle save (new album)
// ---------------------------------------------------------------------------

export async function handleSaveNew() {
  if (state.modal.isSaving) return;

  const albumName   = el.metaAlbumName.value.trim();
  const artistInput = el.metaArtistNames.value.trim();

  if (!albumName) { showError('Album name is required.'); return; }
  if (!artistInput) { showError('Artist name is required.'); return; }

  const listenedAt = el.inputListenedAt.value;
  const plannedAt = el.inputPlannedAt.value;

  const ratingRaw = el.inputRating.value.trim();
  const rating    = ratingRaw === '' ? null : parseInt(ratingRaw, 10);
  if (rating !== null && (isNaN(rating) || rating < 0 || rating > 100)) {
    showError('Rating must be a number between 0 and 100.');
    return;
  }

  const artistIdRaw = el.metaArtistId.value.trim();
  const artists = parseArtistInput(artistInput).map(name => ({
    id: artistIdRaw || null, name, share_url: artistIdRaw ? `https://open.spotify.com/artist/${artistIdRaw}` : null, avatar_url: null,
  }));
  const pendingMeta = { ...(state.modal.pendingMeta || {}) };
  delete pendingMeta.release_year;

  const payload = {
    // Imported metadata (usually empty for manual entries).
    ...pendingMeta,
    // Always use whatever is currently in the editable fields.
    album_name:   albumName,
    artists,
    release_date: el.metaReleaseDate.value || null,
    track_count:  el.metaTrackCount.value ? parseInt(el.metaTrackCount.value, 10) : null,
    duration_ms:  parseDurationInput(el.metaDuration.value),
    // User fields.
    status:      el.inputStatus.value || 'completed',
    rating,
    notes:       el.inputNotes.value.trim() || null,
    planned_at:  plannedAt || null,
    listened_at: listenedAt || null,
    repeats:     parseInt(el.inputRepeats.value, 10) || 0,
    priority:    parseInt(el.inputPriority.value, 10) || 0,
  };

  // For manual entries, include user-specified album type (overrides any pendingMeta value).
  if (state.modal.isManual) {
    payload.album_type = normalizeAlbumTypeForStorage(el.metaAlbumType.value);
    payload.album_link = el.metaAlbumLink.value.trim() || null;
    payload.artist_link = el.metaArtistLink.value.trim() || null;
  }

  state.modal.isSaving = true;
  el.btnSave.textContent = 'Saving…';
  el.btnSave.disabled = true;
  hideError();

  try {
    storeAlbumDetails(normalizeAlbumClientShape(await apiFetch('/api/albums', {
      method: 'POST',
      body: JSON.stringify(payload),
    })));
    invalidateDashboardCache();
    resetPagination();
    await loadAlbums();
    closeModal();

  } catch (e) {
    showError(e.message);
  } finally {
    state.modal.isSaving = false;
    el.btnSave.textContent = 'Save';
    el.btnSave.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Open the edit modal
// ---------------------------------------------------------------------------

export async function openEditModal(id) {
  let album = getAlbumById(id);
  if (!album) {
    try {
      album = storeAlbumDetails(normalizeAlbumClientShape(await apiFetch(`/api/albums/${id}`)));
    } catch {
      return false;
    }
  }

  state.modal = {
    open:        true,
    mode:        'edit',
    step:        'details',
    albumId:     id,
    isManual:    !album.spotify_url,
    isFetching:  false,
    isSaving:    false,
    pendingMeta: null,
  };

  el.modalTitle.textContent = 'Edit Album';

  el.stepDetails.classList.remove('hidden');
  el.btnSave.classList.remove('hidden');
  el.btnModalDelete.classList.remove('hidden');

  hideError();
  populateDetailsFields(album, !album.spotify_url);

  // Populate user fields from existing data.
  el.inputPlannedAt.value  = album.planned_at ?? '';
  el.inputListenedAt.value = album.listened_at ?? '';
  el.inputRating.value     = album.rating ?? '';
  el.inputNotes.value      = album.notes ?? '';
  el.inputStatus.value     = album.status ?? 'completed';
  el.inputRepeats.value    = album.repeats ?? 0;
  el.inputPriority.value   = album.priority ?? 0;
  updateRatingDisplay(album.rating);

  el.artRefetchPreview.classList.add('hidden');
  syncAlbumModalFieldVisibility();
  showArtButtons();
  syncAlbumModalDebugControls();

  el.modalOverlay.classList.remove('hidden');
  return true;
}

export async function showAlbumInfoDebugWindow() {
  if (!state.modal.albumId) return;

  try {
    const album = await apiFetch(`/api/albums/${state.modal.albumId}`);
    const win = window.open('', '_blank', 'width=860,height=760,resizable=yes,scrollbars=yes');
    if (!win) {
      showError('Popup blocked. Allow popups to view album debug info.');
      return;
    }

    const prettyJson = escHtml(JSON.stringify(album, null, 2));
    const title = escHtml(`${album.album_name ?? 'Album'} debug info`);
    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1117;
      --surface: #1a1f2e;
      --border: #2d3748;
      --text: #e2e8f0;
      --muted: #94a3b8;
    }
    body {
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 18px;
      font-family: system-ui, sans-serif;
    }
    p {
      margin: 0 0 16px;
      color: var(--muted);
      font-family: system-ui, sans-serif;
    }
    pre {
      margin: 0;
      padding: 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Album ID: ${album.id}</p>
  <pre>${prettyJson}</pre>
</body>
</html>`);
    win.document.close();
  } catch (e) {
    showError(`Could not load album info: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Handle save (edit existing album)
// ---------------------------------------------------------------------------

export async function handleSaveEdit() {
  if (state.modal.isSaving) return;

  const listenedAt = el.inputListenedAt.value;
  const plannedAt = el.inputPlannedAt.value;

  const ratingRaw = el.inputRating.value.trim();
  const rating    = ratingRaw === '' ? null : parseInt(ratingRaw, 10);
  if (rating !== null && (isNaN(rating) || rating < 0 || rating > 100)) {
    showError('Rating must be a number between 0 and 100.');
    return;
  }

  // For manual entries (no Spotify URL), we also allow editing metadata fields.
  // For Spotify entries, metadata is read-only here — use refetch for that.
  const payload = {
    status:      el.inputStatus.value || 'completed',
    rating,
    notes:       el.inputNotes.value.trim() || null,
    planned_at:  plannedAt || null,
    listened_at: listenedAt || null,
    repeats:     parseInt(el.inputRepeats.value, 10) || 0,
    priority:    parseInt(el.inputPriority.value, 10) || 0,
  };

  if (state.modal.isManual) {
    const albumName   = el.metaAlbumName.value.trim();
    const artistInput = el.metaArtistNames.value.trim();
    if (!albumName)   { showError('Album name is required.'); return; }
    if (!artistInput) { showError('Artist name is required.'); return; }

    const artistIdRaw = el.metaArtistId.value.trim();
    payload.album_name   = albumName;
    payload.artists = parseArtistInput(artistInput).map(name => ({
      id: artistIdRaw || null, name, share_url: artistIdRaw ? `https://open.spotify.com/artist/${artistIdRaw}` : null, avatar_url: null,
    }));
    payload.release_date = el.metaReleaseDate.value || null;
    payload.track_count = el.metaTrackCount.value
      ? parseInt(el.metaTrackCount.value, 10) : null;
    payload.duration_ms = parseDurationInput(el.metaDuration.value);
    payload.album_type  = normalizeAlbumTypeForStorage(el.metaAlbumType.value);
    payload.album_link  = el.metaAlbumLink.value.trim() || null;
    payload.artist_link = el.metaArtistLink.value.trim() || null;

    // If a new image was uploaded during editing, include its path.
    if (state.modal.pendingMeta?.image_path) {
      payload.image_path = state.modal.pendingMeta.image_path;
    }
  }

  state.modal.isSaving = true;
  el.btnSave.textContent = 'Saving…';
  el.btnSave.disabled = true;
  hideError();

  try {
    storeAlbumDetails(normalizeAlbumClientShape(await apiFetch(`/api/albums/${state.modal.albumId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })));
    invalidateDashboardCache();
    await loadAlbums({ preservePage: true });
    closeModal();

  } catch (e) {
    showError(e.message);
  } finally {
    state.modal.isSaving = false;
    el.btnSave.textContent = 'Save';
    el.btnSave.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Modal close
// ---------------------------------------------------------------------------

export function closeModal() {
  state.modal.open = false;
  el.modalOverlay.classList.add('hidden');
  el.btnModalDelete.classList.add('hidden');
  el.artRefetchPreview.classList.add('hidden');
  syncAlbumModalDebugControls();
  hideError();
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

export function openDeleteConfirm(id) {
  const album = getAlbumById(id);
  if (!album) return;

  state.deleteTarget = { id, name: album.album_name };

  el.deleteMessage.textContent =
    `Are you sure you want to delete "${album.album_name}" by ` +
    `${formatArtists(album.artists)}? This cannot be undone.`;

  el.deleteOverlay.classList.remove('hidden');
}

export function closeDeleteConfirm() {
  state.deleteTarget = null;
  el.deleteOverlay.classList.add('hidden');
}

export async function handleDeleteConfirm() {
  if (!state.deleteTarget) return;
  const { id } = state.deleteTarget;

  try {
    await apiFetch(`/api/albums/${id}`, { method: 'DELETE' });
    removeAlbumDetails(id);
    invalidateDashboardCache();
    await loadAlbums({ preservePage: true });
    closeDeleteConfirm();
    closeModal();

  } catch (e) {
    // Close the confirm modal and show the error in a more visible way
    // since there's no error display in the delete modal itself.
    closeDeleteConfirm();
    alert(`Failed to delete album: ${e.message}`);
  }
}
