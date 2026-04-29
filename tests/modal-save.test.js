import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const loadAlbumsMock = vi.fn();
const resetPaginationMock = vi.fn();
const invalidateDashboardCacheMock = vi.fn();

const stateMock = {
  albums: [],
  albumDetailsCache: {},
  modal: {
    open: true,
    mode: 'log',
    albumId: null,
    isManual: true,
    isSaving: false,
    pendingUploadedArtPaths: [],
    pendingMeta: null,
  },
  debugMode: false,
  showRepeatsField: true,
  showPriorityField: true,
  showPlannedAtField: true,
};

function makeEl(tagName = 'div') {
  return globalThis.document.createElement(tagName);
}

const elMock = {
  fetchError: makeEl(),
  metaAlbumName: makeEl('input'),
  metaArtistNames: makeEl('input'),
  metaReleaseDate: makeEl('input'),
  metaTrackCount: makeEl('input'),
  metaDuration: makeEl('input'),
  metaArtistId: makeEl('input'),
  metaAlbumType: makeEl('input'),
  metaAlbumLink: makeEl('input'),
  metaArtistLink: makeEl('input'),
  inputPlannedAt: makeEl('input'),
  inputListenedAt: makeEl('input'),
  inputRating: makeEl('input'),
  inputNotes: makeEl('textarea'),
  inputStatus: makeEl('input'),
  inputRepeats: makeEl('input'),
  inputPriority: makeEl('input'),
  btnSave: makeEl('button'),
  btnCancel: makeEl('button'),
  modalClose: makeEl('button'),
  btnModalDelete: makeEl('button'),
  modalOverlay: makeEl(),
  metaArt: makeEl('img'),
  metaArtUpload: makeEl('input'),
  metaArtUploadLabel: makeEl('label'),
  metaArtUploadStatus: makeEl(),
  artRefetchPreview: makeEl(),
  deleteOverlay: makeEl(),
  deleteMessage: makeEl(),
  btnDeleteCancel: makeEl('button'),
  btnDeleteConfirm: makeEl('button'),
  btnShowAlbumInfo: makeEl('button'),
  btnDeleteArt: makeEl('button'),
  btnRandomArt: makeEl('button'),
};

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
  apiFetch: apiFetchMock,
}));

vi.mock('../public/js/utils.js', () => ({
  formatArtists: vi.fn(),
  formatDuration: vi.fn(),
  parseDurationInput: vi.fn(value => (value ? 245000 : null)),
  artUrl: vi.fn(),
  todayISO: vi.fn(() => '2026-04-15'),
  parseArtistInput: vi.fn(value => value.split(',').map(item => item.trim()).filter(Boolean)),
  escHtml: value => value,
  normalizeAlbumTypeForStorage: vi.fn(value => String(value || '').trim().toUpperCase() || null),
  formatAlbumTypeForDisplay: value => value ?? '',
  deriveArtistNames: vi.fn(),
  normalizeAlbumClientShape: album => album,
}));

vi.mock('../public/js/render.js', () => ({
  loadAlbums: loadAlbumsMock,
  resetPagination: resetPaginationMock,
}));

vi.mock('../public/js/dashboard.js', () => ({
  invalidateDashboardCache: invalidateDashboardCacheMock,
}));

vi.mock('../public/js/modal-art.js', () => ({
  showArtButtons: vi.fn(),
}));

function resetInputs() {
  Object.values(elMock).forEach(element => {
    element.className = '';
    if ('value' in element) element.value = '';
    if ('textContent' in element) element.textContent = '';
    element.disabled = false;
  });
  elMock.metaArtUpload.type = 'file';
  elMock.fetchError.className = 'hidden';
  elMock.modalOverlay.className = '';
  elMock.deleteOverlay.className = 'hidden';
  elMock.metaArtUploadStatus.className = 'hidden';
  elMock.inputStatus.value = 'completed';
  elMock.inputRepeats.value = '0';
  elMock.inputPriority.value = '0';
  elMock.btnSave.textContent = 'Save';
}

function resetState() {
  stateMock.albums = [];
  stateMock.albumDetailsCache = {};
  stateMock.modal = {
    open: true,
    mode: 'log',
    albumId: null,
    isManual: true,
    isSaving: false,
    pendingUploadedArtPaths: [],
    pendingMeta: null,
  };
}

function fillManualFields() {
  elMock.metaAlbumName.value = 'Manual Album';
  elMock.metaArtistNames.value = 'Artist One, Artist Two';
  elMock.metaArtistId.value = 'artist-id';
  elMock.metaReleaseDate.value = '2026-04-01';
  elMock.metaTrackCount.value = '8';
  elMock.metaDuration.value = '4:05';
  elMock.metaAlbumType.value = 'ep';
  elMock.metaAlbumLink.value = 'https://example.com/album';
  elMock.metaArtistLink.value = 'https://example.com/artist';
  elMock.inputStatus.value = 'planned';
  elMock.inputPlannedAt.value = '2026-05-01';
  elMock.inputListenedAt.value = '';
  elMock.inputRating.value = '';
  elMock.inputNotes.value = 'listen later';
  elMock.inputRepeats.value = '2';
  elMock.inputPriority.value = '5';
}

describe('modal save payloads', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ id: 1, album_name: 'Saved Album' });
    loadAlbumsMock.mockReset();
    loadAlbumsMock.mockResolvedValue(true);
    resetPaginationMock.mockReset();
    invalidateDashboardCacheMock.mockReset();
    resetInputs();
    resetState();
    globalThis.fetch = originalFetch;
  });

  it('shows validation errors and skips the API for missing new-album required fields', async () => {
    const { handleSaveNew } = await import('../public/js/modal.js');

    await handleSaveNew();

    expect(elMock.fetchError.textContent).toBe('Album name is required.');
    expect(apiFetchMock).not.toHaveBeenCalled();

    elMock.metaAlbumName.value = 'Untitled';
    await handleSaveNew();

    expect(elMock.fetchError.textContent).toBe('Artist name is required.');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('sends planned manual album metadata, artists, links, and uploaded image path', async () => {
    const { handleSaveNew } = await import('../public/js/modal.js');
    fillManualFields();
    stateMock.modal.pendingMeta = {
      image_path: 'images/uploaded-manual.jpg',
      release_year: 2026,
    };

    await handleSaveNew();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums', {
      method: 'POST',
      body: expect.any(String),
    });
    const payload = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      image_path: 'images/uploaded-manual.jpg',
      album_name: 'Manual Album',
      release_date: '2026-04-01',
      track_count: 8,
      duration_ms: 245000,
      status: 'planned',
      rating: null,
      notes: 'listen later',
      planned_at: '2026-05-01',
      listened_at: null,
      repeats: 2,
      priority: 5,
      album_type: 'EP',
      album_link: 'https://example.com/album',
      artist_link: 'https://example.com/artist',
    });
    expect(payload).not.toHaveProperty('release_year');
    expect(payload.artists).toEqual([
      {
        id: 'artist-id',
        name: 'Artist One',
        share_url: 'https://open.spotify.com/artist/artist-id',
        avatar_url: null,
      },
      {
        id: 'artist-id',
        name: 'Artist Two',
        share_url: 'https://open.spotify.com/artist/artist-id',
        avatar_url: null,
      },
    ]);
    expect(resetPaginationMock).toHaveBeenCalledOnce();
    expect(loadAlbumsMock).toHaveBeenCalledWith();
    expect(stateMock.modal.open).toBe(false);
  });

  it('sends only user-editable fields when editing a Spotify album', async () => {
    const { handleSaveEdit } = await import('../public/js/modal.js');
    stateMock.modal = {
      open: true,
      mode: 'edit',
      albumId: 7,
      isManual: false,
      isSaving: false,
      pendingMeta: { image_path: 'images/ignored.jpg' },
    };
    elMock.metaAlbumName.value = 'Should Not Send';
    elMock.metaArtistNames.value = 'Ignored Artist';
    elMock.inputStatus.value = 'completed';
    elMock.inputRating.value = '88';
    elMock.inputNotes.value = 'edited notes';
    elMock.inputListenedAt.value = '2026-04-20';
    elMock.inputRepeats.value = '3';
    elMock.inputPriority.value = '4';

    await handleSaveEdit();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums/7', {
      method: 'PATCH',
      body: expect.any(String),
    });
    expect(JSON.parse(apiFetchMock.mock.calls[0][1].body)).toEqual({
      status: 'completed',
      rating: 88,
      notes: 'edited notes',
      planned_at: null,
      listened_at: '2026-04-20',
      repeats: 3,
      priority: 4,
    });
    expect(loadAlbumsMock).toHaveBeenCalledWith({ preservePage: true });
  });

  it('includes editable metadata and pending replacement image when editing a manual album', async () => {
    const { handleSaveEdit } = await import('../public/js/modal.js');
    stateMock.modal = {
      open: true,
      mode: 'edit',
      albumId: 8,
      isManual: true,
      isSaving: false,
      pendingMeta: { image_path: 'images/replacement.jpg' },
    };
    fillManualFields();
    elMock.inputRating.value = '91';

    await handleSaveEdit();

    const payload = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      album_name: 'Manual Album',
      release_date: '2026-04-01',
      track_count: 8,
      duration_ms: 245000,
      album_type: 'EP',
      album_link: 'https://example.com/album',
      artist_link: 'https://example.com/artist',
      image_path: 'images/replacement.jpg',
      rating: 91,
    });
    expect(payload.artists).toHaveLength(2);
    expect(loadAlbumsMock).toHaveBeenCalledWith({ preservePage: true });
  });

  it('keeps the modal open and restores controls when a save fails', async () => {
    const { handleSaveNew } = await import('../public/js/modal.js');
    fillManualFields();
    apiFetchMock.mockRejectedValueOnce(new Error('Server went away.'));

    await handleSaveNew();

    expect(stateMock.modal.open).toBe(true);
    expect(elMock.modalOverlay.classList.contains('hidden')).toBe(false);
    expect(elMock.fetchError.textContent).toBe('Server went away.');
    expect(elMock.btnSave.disabled).toBe(false);
  });

  it('preserves an uploaded manual image when saving fails so the user can retry', async () => {
    const { handleSaveNew } = await import('../public/js/modal.js');
    fillManualFields();
    stateMock.modal.pendingMeta = { image_path: 'images/manual_123_orphan.jpg' };
    stateMock.modal.pendingUploadedArtPaths = ['images/manual_123_orphan.jpg'];
    elMock.metaArt.src = '/images/manual_123_orphan.jpg';
    elMock.metaArt.classList.remove('hidden');
    elMock.metaArtUploadStatus.textContent = 'Art uploaded.';
    elMock.metaArtUploadStatus.classList.remove('hidden');
    apiFetchMock.mockRejectedValueOnce(new Error('Validation failed.'));

    await handleSaveNew();

    expect(apiFetchMock).toHaveBeenCalledOnce();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums', {
      method: 'POST',
      body: expect.any(String),
    });
    expect(JSON.parse(apiFetchMock.mock.calls[0][1].body).image_path).toBe('images/manual_123_orphan.jpg');
    expect(stateMock.modal.pendingMeta).toEqual({ image_path: 'images/manual_123_orphan.jpg' });
    expect(stateMock.modal.pendingUploadedArtPaths).toEqual(['images/manual_123_orphan.jpg']);
    expect(elMock.metaArt.src).toContain('/images/manual_123_orphan.jpg');
    expect(elMock.metaArt.classList.contains('hidden')).toBe(false);
    expect(elMock.metaArtUploadStatus.textContent).toBe('Art uploaded.');
    expect(elMock.fetchError.textContent).toBe('Validation failed.');
  });

  it('discards the previous manual image when a replacement upload succeeds', async () => {
    const { handleImageUpload } = await import('../public/js/modal.js');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ image_path: 'images/manual_1_first.jpg' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ image_path: 'images/manual_2_second.jpg' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    apiFetchMock.mockResolvedValue({ ok: true, deleted: true });

    await handleImageUpload(new File(['first'], 'first.jpg', { type: 'image/jpeg' }));
    await handleImageUpload(new File(['second'], 'second.jpg', { type: 'image/jpeg' }));

    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums/discard-uploaded-art', {
      method: 'POST',
      body: JSON.stringify({ image_path: 'images/manual_1_first.jpg' }),
    });
    expect(stateMock.modal.pendingMeta).toEqual({ image_path: 'images/manual_2_second.jpg' });
    expect(stateMock.modal.pendingUploadedArtPaths).toEqual(['images/manual_2_second.jpg']);
    expect(elMock.metaArt.src).toContain('/images/manual_2_second.jpg');
  });

  it('guards modal close while saving or uploading unless forced', async () => {
    const { closeModal } = await import('../public/js/modal.js');

    stateMock.modal.isSaving = true;
    expect(closeModal()).toBe(false);
    expect(stateMock.modal.open).toBe(true);
    expect(elMock.modalOverlay.classList.contains('hidden')).toBe(false);

    stateMock.modal.isSaving = false;
    stateMock.modal.isUploadingArt = true;
    expect(closeModal()).toBe(false);
    expect(stateMock.modal.open).toBe(true);

    expect(closeModal({ force: true })).toBe(true);
    expect(stateMock.modal.open).toBe(false);
    expect(elMock.modalOverlay.classList.contains('hidden')).toBe(true);
  });

  it('discards an uploaded manual image when the modal closes before save', async () => {
    const { closeModal } = await import('../public/js/modal.js');
    stateMock.modal.pendingMeta = { image_path: 'images/manual_123_orphan.jpg' };
    apiFetchMock.mockResolvedValueOnce({ ok: true, deleted: true });

    expect(closeModal()).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums/discard-uploaded-art', {
      method: 'POST',
      body: JSON.stringify({ image_path: 'images/manual_123_orphan.jpg' }),
    });
    expect(stateMock.modal.pendingMeta).toBeNull();
  });

  it('keeps the edit modal context when delete confirmation is canceled', async () => {
    const { openDeleteConfirm, closeDeleteConfirm } = await import('../public/js/modal.js');
    stateMock.albums = [
      {
        id: 7,
        album_name: 'Keep Editing',
        artists: [{ name: 'Context Artist' }],
      },
    ];
    stateMock.modal = {
      open: true,
      mode: 'edit',
      albumId: 7,
      isManual: true,
      isSaving: false,
      pendingMeta: null,
    };

    expect(openDeleteConfirm(7)).toBe(true);
    expect(stateMock.modal.open).toBe(true);
    expect(elMock.modalOverlay.classList.contains('hidden')).toBe(false);
    expect(elMock.deleteOverlay.classList.contains('hidden')).toBe(false);

    closeDeleteConfirm();

    expect(stateMock.modal.open).toBe(true);
    expect(elMock.modalOverlay.classList.contains('hidden')).toBe(false);
    expect(elMock.deleteOverlay.classList.contains('hidden')).toBe(true);
  });

  it('ignores an uncached edit modal fetch after the modal is closed', async () => {
    let resolveFetch;
    apiFetchMock.mockImplementationOnce(() => new Promise(resolve => {
      resolveFetch = resolve;
    }));

    const { openEditModal, closeModal } = await import('../public/js/modal.js');
    const editPromise = openEditModal(99);
    await Promise.resolve();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/albums/99');

    closeModal({ force: true });
    resolveFetch({
      id: 99,
      album_name: 'Late Album',
      artists: [],
      spotify_url: null,
    });

    await expect(editPromise).resolves.toBe(false);
    expect(stateMock.modal.open).toBe(false);
    expect(stateMock.albumDetailsCache[99]).toBeUndefined();
    expect(elMock.modalOverlay.classList.contains('hidden')).toBe(true);
  });

  it('waits for pending art upload before saving with the uploaded image path', async () => {
    const { handleImageUpload, handleSaveNew } = await import('../public/js/modal.js');
    fillManualFields();
    let resolveUpload;
    globalThis.fetch = vi.fn(() => new Promise(resolve => {
      resolveUpload = resolve;
    }));

    const uploadPromise = handleImageUpload(new File(['cover'], 'cover.jpg', { type: 'image/jpeg' }));
    const savePromise = handleSaveNew();

    expect(stateMock.modal.isUploadingArt).toBe(true);
    expect(elMock.btnSave.disabled).toBe(true);
    expect(apiFetchMock).not.toHaveBeenCalled();

    resolveUpload(new Response(JSON.stringify({ image_path: 'images/uploaded-cover.jpg' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await uploadPromise;
    await savePromise;

    const payload = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(payload.image_path).toBe('images/uploaded-cover.jpg');
    expect(elMock.metaArtUpload.value).toBe('');
  });

  it('stops the current save attempt when a pending art upload fails', async () => {
    const { handleImageUpload, handleSaveNew } = await import('../public/js/modal.js');
    fillManualFields();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Too large.' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    }));

    const uploadPromise = handleImageUpload(new File(['cover'], 'cover.jpg', { type: 'image/jpeg' }));
    await handleSaveNew();
    await uploadPromise;

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(elMock.fetchError.textContent).toContain('Too large.');
    expect(elMock.btnSave.disabled).toBe(false);

    await handleSaveNew();

    expect(apiFetchMock).toHaveBeenCalledOnce();
    const payload = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(payload).not.toHaveProperty('image_path');
  });
});
