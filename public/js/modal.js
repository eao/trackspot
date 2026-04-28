// =============================================================================
// Log/edit/delete modals and art actions.
// =============================================================================

import { state, el, apiFetch } from './state.js';
import {
  formatArtists, formatDuration, parseDurationInput, artUrl,
  todayISO, parseArtistInput, escHtml, normalizeAlbumTypeForStorage, formatAlbumTypeForDisplay, deriveArtistNames,
  normalizeAlbumClientShape,
} from './utils.js';
import { loadAlbums, resetPagination } from './render.js';
import { invalidateDashboardCache } from './dashboard.js';
import { showArtButtons } from './modal-art.js';
import { closeManagedModal, openManagedModal } from './modal-manager.js';

// ---------------------------------------------------------------------------
// Error display helpers
// ---------------------------------------------------------------------------

export function showError(msg) {
  el.fetchError.textContent = msg;
  el.fetchError.classList.remove('hidden');
  el.fetchError.setAttribute('role', 'alert');
  el.fetchError.setAttribute('tabindex', '-1');
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

function getMessage(error) {
  return error?.message || String(error || 'Unknown error');
}

function getAlbumDialog() {
  return el.modalOverlay?.querySelector('.modal') ?? el.modalOverlay;
}

function setArtUploadStatus(message = '', isError = false) {
  if (!el.metaArtUploadStatus) return;
  el.metaArtUploadStatus.textContent = message;
  el.metaArtUploadStatus.classList.toggle('hidden', !message);
  el.metaArtUploadStatus.classList.toggle('art-upload-status-error', isError);
}

function resetArtUploadState() {
  state.modal.isUploadingArt = false;
  state.modal.artUploadPromise = null;
  state.modal.artUploadError = null;
  setArtUploadStatus('');
  if (el.metaArtUpload) el.metaArtUpload.value = '';
}

function getPendingUploadedArtPath() {
  return state.modal.pendingMeta?.image_path || null;
}

function getPendingUploadedArtPaths(modalState = state.modal) {
  const paths = Array.isArray(modalState?.pendingUploadedArtPaths)
    ? [...modalState.pendingUploadedArtPaths]
    : [];
  const currentPath = modalState?.pendingMeta?.image_path || null;
  if (currentPath && !paths.includes(currentPath)) paths.push(currentPath);
  return paths;
}

function trackPendingUploadedArtPath(imagePath, modalState = state.modal) {
  if (!imagePath || !modalState) return;
  if (!Array.isArray(modalState.pendingUploadedArtPaths)) {
    modalState.pendingUploadedArtPaths = [];
  }
  if (!modalState.pendingUploadedArtPaths.includes(imagePath)) {
    modalState.pendingUploadedArtPaths.push(imagePath);
  }
}

function untrackPendingUploadedArtPath(imagePath, modalState = state.modal) {
  if (!imagePath || !Array.isArray(modalState?.pendingUploadedArtPaths)) return;
  modalState.pendingUploadedArtPaths = modalState.pendingUploadedArtPaths
    .filter(path => path !== imagePath);
}

async function discardUploadedArtPath(imagePath) {
  if (!imagePath) return false;
  try {
    await apiFetch('/api/albums/discard-uploaded-art', {
      method: 'POST',
      body: JSON.stringify({ image_path: imagePath }),
    });
    return true;
  } catch (error) {
    console.warn('Could not discard uploaded album art:', error);
    return false;
  }
}

function clearPendingUploadedArtReference(imagePath = getPendingUploadedArtPath()) {
  clearPendingUploadedArtReferenceFromState(state.modal, imagePath);
}

function clearPendingUploadedArtReferenceFromState(modalState, imagePath) {
  untrackPendingUploadedArtPath(imagePath, modalState);
  if (modalState?.pendingMeta?.image_path) {
    if (imagePath && modalState.pendingMeta.image_path !== imagePath) return;
    delete modalState.pendingMeta.image_path;
    if (Object.keys(modalState.pendingMeta).length === 0) {
      modalState.pendingMeta = null;
    }
  }
}

function restoreModalArtPreviewAfterDiscard() {
  const album = state.modal.albumId ? getAlbumById(state.modal.albumId) : null;
  const url = album ? artUrl(album.image_path) : null;
  if (url) {
    el.metaArt.src = url;
    el.metaArt.classList.remove('hidden');
  } else {
    el.metaArt.src = '';
    el.metaArt.classList.add('hidden');
  }
  setArtUploadStatus('');
  if (el.metaArtUpload) el.metaArtUpload.value = '';
}

async function discardPendingUploadedArt(options = {}) {
  const modalState = state.modal;
  const currentImagePath = modalState?.pendingMeta?.image_path || null;
  const imagePaths = getPendingUploadedArtPaths(modalState);
  let discardedAny = false;
  let discardedCurrent = false;

  for (const imagePath of imagePaths) {
    const discarded = await discardUploadedArtPath(imagePath);
    if (!discarded) continue;
    clearPendingUploadedArtReferenceFromState(modalState, imagePath);
    discardedAny = true;
    discardedCurrent = discardedCurrent || imagePath === currentImagePath;
  }

  if (options.resetPreview && discardedCurrent) {
    restoreModalArtPreviewAfterDiscard();
  }
  return discardedAny;
}

function syncAlbumModalBusyControls() {
  const busy = !!(state.modal.isSaving || state.modal.isUploadingArt);
  if (el.btnSave) {
    el.btnSave.disabled = busy;
    el.btnSave.textContent = state.modal.isSaving ? 'Saving…' : 'Save';
  }
  [el.btnCancel, el.modalClose, el.btnModalDelete].forEach(button => {
    if (button) button.disabled = busy;
  });
  if (el.metaArtUpload) el.metaArtUpload.disabled = busy;
  if (el.metaArtUploadLabel) el.metaArtUploadLabel.setAttribute('aria-disabled', busy ? 'true' : 'false');
  getAlbumDialog()?.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function createModalState(overrides = {}) {
  return {
    open:        true,
    mode:        null,
    step:        'details',
    albumId:     null,
    isManual:    false,
    isFetching:  false,
    isSaving:    false,
    isUploadingArt: false,
    artUploadPromise: null,
    artUploadError: null,
    pendingUploadedArtPaths: [],
    pendingMeta: null,
    ...overrides,
  };
}

function focusSaveError() {
  if (!el.fetchError?.classList.contains('hidden')) {
    el.fetchError.focus?.();
    return;
  }
  el.btnSave?.focus?.();
}

async function waitForPendingArtUpload() {
  const pendingUpload = state.modal.artUploadPromise;
  if (!pendingUpload) return true;
  const uploaded = await pendingUpload;
  if (uploaded) return true;
  showError(state.modal.artUploadError || 'Image upload failed. Save again to continue without the selected image.');
  focusSaveError();
  return false;
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
      const normalized = trimmed.toLowerCase();
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
  const showRepeatsField = state.showRepeatsField !== false;
  const showPriorityField = state.showPriorityField === true;
  const showPlannedAtField = state.showPlannedAtField === true;
  const hideRepeats = !showRepeatsField;
  const hidePriority = !showPriorityField;
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
  state.modal = createModalState({
    mode: 'log',
    albumId: null,
    isManual: true,
  });

  el.modalTitle.textContent = 'Log Album';

  el.stepDetails.classList.remove('hidden');
  el.btnSave.classList.remove('hidden');
  el.btnSave.textContent = 'Save';
  el.btnModalDelete.classList.add('hidden');

  // Clear all fields.
  clearDetailsFields();
  populateDetailsFields(null, true);
  hideError();
  resetArtUploadState();
  syncAlbumModalFieldVisibility();
  syncAlbumModalDebugControls();
  syncAlbumModalBusyControls();

  el.modalOverlay.classList.remove('hidden');
  openManagedModal({
    overlay: el.modalOverlay,
    dialog: getAlbumDialog(),
    initialFocus: el.metaAlbumName,
    onRequestClose: () => closeModal(),
  });
}

// ---------------------------------------------------------------------------
// Handle image upload (manual entry)
// ---------------------------------------------------------------------------

export async function handleImageUpload(file) {
  if (!file) return true;

  state.modal.isUploadingArt = true;
  state.modal.artUploadError = null;
  setArtUploadStatus('Uploading art...');
  syncAlbumModalBusyControls();

  const uploadPromise = (async () => {
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
      if (!result.ok) throw new Error(data.error || 'Upload failed.');

      const previousImagePath = getPendingUploadedArtPath();
      if (previousImagePath && previousImagePath !== data.image_path) {
        const discardedPrevious = await discardUploadedArtPath(previousImagePath);
        if (discardedPrevious) {
          clearPendingUploadedArtReference(previousImagePath);
        } else {
          trackPendingUploadedArtPath(previousImagePath);
        }
      }

      // Store the returned path in pendingMeta so it gets saved with the album.
      if (!state.modal.pendingMeta) state.modal.pendingMeta = {};
      state.modal.pendingMeta.image_path = data.image_path;
      trackPendingUploadedArtPath(data.image_path);

      // Show a preview.
      el.metaArt.src = '/' + data.image_path;
      el.metaArt.classList.remove('hidden');
      setArtUploadStatus('Art uploaded.');
      return true;

    } catch (e) {
      const message = `Image upload failed: ${getMessage(e)}`;
      state.modal.artUploadError = message;
      setArtUploadStatus(message, true);
      showError(message);
      return false;
    } finally {
      state.modal.isUploadingArt = false;
      state.modal.artUploadPromise = null;
      if (el.metaArtUpload) el.metaArtUpload.value = '';
      syncAlbumModalBusyControls();
    }
  })();

  state.modal.artUploadPromise = uploadPromise;
  return uploadPromise;
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

  if (!await waitForPendingArtUpload()) return;

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
  syncAlbumModalBusyControls();
  hideError();

  try {
    const pendingImagePath = getPendingUploadedArtPath();
    storeAlbumDetails(normalizeAlbumClientShape(await apiFetch('/api/albums', {
      method: 'POST',
      body: JSON.stringify(payload),
    })));
    clearPendingUploadedArtReference(pendingImagePath);
    invalidateDashboardCache();
    resetPagination();
    await loadAlbums();
    closeModal({ force: true });

  } catch (e) {
    showError(getMessage(e));
    focusSaveError();
  } finally {
    state.modal.isSaving = false;
    syncAlbumModalBusyControls();
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

  state.modal = createModalState({
    mode: 'edit',
    albumId: id,
    isManual: !album.spotify_url,
  });

  el.modalTitle.textContent = 'Edit Album';

  el.stepDetails.classList.remove('hidden');
  el.btnSave.classList.remove('hidden');
  el.btnModalDelete.classList.remove('hidden');

  hideError();
  resetArtUploadState();
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
  syncAlbumModalBusyControls();

  el.modalOverlay.classList.remove('hidden');
  openManagedModal({
    overlay: el.modalOverlay,
    dialog: getAlbumDialog(),
    initialFocus: el.metaAlbumName,
    onRequestClose: () => closeModal(),
  });
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

    if (!await waitForPendingArtUpload()) return;

    // If a new image was uploaded during editing, include its path.
    if (state.modal.pendingMeta?.image_path) {
      payload.image_path = state.modal.pendingMeta.image_path;
    }
  } else if (!await waitForPendingArtUpload()) {
    return;
  }

  state.modal.isSaving = true;
  el.btnSave.textContent = 'Saving…';
  syncAlbumModalBusyControls();
  hideError();

  try {
    const pendingImagePath = getPendingUploadedArtPath();
    storeAlbumDetails(normalizeAlbumClientShape(await apiFetch(`/api/albums/${state.modal.albumId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })));
    clearPendingUploadedArtReference(pendingImagePath);
    invalidateDashboardCache();
    await loadAlbums({ preservePage: true });
    closeModal({ force: true });

  } catch (e) {
    showError(getMessage(e));
    focusSaveError();
  } finally {
    state.modal.isSaving = false;
    syncAlbumModalBusyControls();
  }
}

// ---------------------------------------------------------------------------
// Modal close
// ---------------------------------------------------------------------------

export function closeModal(options = {}) {
  if ((state.modal.isSaving || state.modal.isUploadingArt) && !options.force) {
    return false;
  }
  state.modal.open = false;
  el.modalOverlay.classList.add('hidden');
  el.btnModalDelete.classList.add('hidden');
  el.artRefetchPreview.classList.add('hidden');
  void discardPendingUploadedArt();
  resetArtUploadState();
  syncAlbumModalBusyControls();
  closeManagedModal(el.modalOverlay, options);
  syncAlbumModalDebugControls();
  hideError();
  return true;
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

export function openDeleteConfirm(id) {
  const album = getAlbumById(id);
  if (!album) return false;

  state.deleteTarget = { id, name: album.album_name };

  el.deleteMessage.textContent =
    `Are you sure you want to delete "${album.album_name}" by ` +
    `${formatArtists(album.artists)}? This cannot be undone.`;

  el.deleteOverlay.classList.remove('hidden');
  openManagedModal({
    overlay: el.deleteOverlay,
    dialog: el.deleteOverlay.querySelector('.modal') ?? el.deleteOverlay,
    initialFocus: el.btnDeleteCancel,
    opener: el.btnModalDelete,
    onRequestClose: () => closeDeleteConfirm(),
  });
  return true;
}

export function closeDeleteConfirm(options = {}) {
  state.deleteTarget = null;
  el.deleteOverlay.classList.add('hidden');
  closeManagedModal(el.deleteOverlay, options);
  return true;
}

export async function handleDeleteConfirm() {
  if (!state.deleteTarget) return;
  const { id } = state.deleteTarget;

  try {
    await apiFetch(`/api/albums/${id}`, { method: 'DELETE' });
    removeAlbumDetails(id);
    invalidateDashboardCache();
    await loadAlbums({ preservePage: true });
    closeDeleteConfirm({ restoreFocus: false });
    closeModal({ force: true });

  } catch (e) {
    // Close the confirm modal and show the error in a more visible way
    // since there's no error display in the delete modal itself.
    closeDeleteConfirm();
    alert(`Failed to delete album: ${getMessage(e)}`);
  }
}
