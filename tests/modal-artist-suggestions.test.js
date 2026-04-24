import { beforeEach, describe, expect, it, vi } from 'vitest';

const stateMock = {
  albums: [],
  modal: {
    open: false,
    mode: null,
  },
  debugMode: false,
};

const elMock = {
  fetchError: globalThis.document.createElement('div'),
  metaArt: globalThis.document.createElement('img'),
  metaAlbumName: globalThis.document.createElement('input'),
  metaArtistNames: globalThis.document.createElement('input'),
  metaArtistNamesList: globalThis.document.createElement('datalist'),
  metaReleaseDate: globalThis.document.createElement('input'),
  metaTrackCount: globalThis.document.createElement('input'),
  metaDuration: globalThis.document.createElement('input'),
  metaArtistId: globalThis.document.createElement('input'),
  metaAlbumType: globalThis.document.createElement('input'),
  metaAlbumLink: globalThis.document.createElement('input'),
  metaArtistLink: globalThis.document.createElement('input'),
  fieldPlannedAtRow: globalThis.document.createElement('div'),
  inputPlannedAt: globalThis.document.createElement('input'),
  inputListenedAt: globalThis.document.createElement('input'),
  inputRating: globalThis.document.createElement('input'),
  inputNotes: globalThis.document.createElement('textarea'),
  inputStatus: globalThis.document.createElement('select'),
  inputRepeats: globalThis.document.createElement('input'),
  inputPriority: globalThis.document.createElement('input'),
  ratingDisplay: globalThis.document.createElement('span'),
  modalTitle: globalThis.document.createElement('h2'),
  stepFetch: globalThis.document.createElement('div'),
  stepDetails: globalThis.document.createElement('div'),
  btnSave: globalThis.document.createElement('button'),
  btnModalDelete: globalThis.document.createElement('button'),
  fieldManualMetaRow: globalThis.document.createElement('div'),
  fieldArtistId: globalThis.document.createElement('div'),
  fieldAlbumType: globalThis.document.createElement('div'),
  fieldManualLinksRow: globalThis.document.createElement('div'),
  fieldAlbumLink: globalThis.document.createElement('div'),
  fieldArtistLink: globalThis.document.createElement('div'),
  fieldReleaseDate: globalThis.document.createElement('div'),
  fieldTrackCount: globalThis.document.createElement('div'),
  fieldDuration: globalThis.document.createElement('div'),
  metaArtUploadLabel: globalThis.document.createElement('label'),
  btnFetch: globalThis.document.createElement('button'),
  fieldRepeatsRow: globalThis.document.createElement('div'),
  fieldPriorityRow: globalThis.document.createElement('div'),
  btnShowAlbumInfo: globalThis.document.createElement('button'),
  btnDeleteArt: globalThis.document.createElement('button'),
  btnRandomArt: globalThis.document.createElement('button'),
  modalOverlay: globalThis.document.createElement('div'),
};

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
  apiFetch: vi.fn(),
  LS_SHOW_REPEATS_FIELD: 'ts_showRepeatsField',
  LS_SHOW_PRIORITY_FIELD: 'ts_showPriorityField',
  LS_SHOW_PLANNED_AT_FIELD: 'ts_showPlannedAtField',
}));

vi.mock('../public/js/utils.js', () => ({
  formatArtists: artists => Array.isArray(artists) ? artists.map(artist => artist?.name ?? artist).join(', ') : (artists || '—'),
  formatDuration: vi.fn(),
  parseDurationInput: vi.fn(),
  artUrl: vi.fn(() => null),
  todayISO: vi.fn(() => '2026-04-15'),
  parseArtistInput: vi.fn(),
  escHtml: value => value,
  normalizeAlbumTypeForStorage: vi.fn(),
  formatAlbumTypeForDisplay: value => value ?? '',
  deriveArtistNames: artists => Array.isArray(artists)
    ? artists.map(artist => artist?.name ?? artist).filter(name => typeof name === 'string' && name.trim() !== '')
    : [],
  normalizeAlbumClientShape: album => album,
}));

vi.mock('../public/js/render.js', () => ({
  render: vi.fn(),
}));

vi.mock('../public/js/modal-art.js', () => ({
  showArtButtons: vi.fn(),
}));

describe('manual log artist suggestions', () => {
  beforeEach(() => {
    localStorage.clear();
    stateMock.albums = [];
    stateMock.modal = {
      open: false,
      mode: null,
    };

    elMock.fetchError.textContent = '';
    elMock.fetchError.className = 'hidden';
    elMock.metaArtistNamesList.innerHTML = '';
    elMock.stepFetch.className = '';
    elMock.stepDetails.className = 'hidden';
    elMock.btnSave.className = 'hidden';
    elMock.btnModalDelete.className = '';
  });

  it('populates artist suggestions from artists already in the database', async () => {
    stateMock.albums = [
      {
        artists: [{ name: 'Nujabes' }, { name: 'Shing02' }],
      },
      {
        artist_names: ['Aesop Rock', 'Nujabes'],
      },
    ];

    const { openLogModal } = await import('../public/js/modal.js');
    openLogModal();

    const suggestions = [...elMock.metaArtistNamesList.querySelectorAll('option')]
      .map(option => option.value);

    expect(suggestions).toEqual(['Aesop Rock', 'Nujabes', 'Shing02']);
  });

  it('builds planned and completed modal date defaults without reactive status logic', async () => {
    const { getModalDateDefaultsForStatus } = await import('../public/js/modal.js');

    expect(getModalDateDefaultsForStatus('planned')).toEqual({
      planned_at: '2026-04-15',
      listened_at: '',
    });

    expect(getModalDateDefaultsForStatus('completed')).toEqual({
      planned_at: '',
      listened_at: '2026-04-15',
    });
  });

  it('shows track count only for manual entries and hydrates the existing value', async () => {
    stateMock.modal.mode = 'edit';
    elMock.fieldTrackCount.className = 'hidden';

    const { populateDetailsFields } = await import('../public/js/modal.js');

    populateDetailsFields({
      album_name: 'Manual Album',
      artists: [{ name: 'Manual Artist' }],
      release_year: 2004,
      track_count: 12,
      duration_ms: 180000,
    }, true);

    expect(elMock.metaTrackCount.value).toBe('12');
    expect(elMock.fieldTrackCount.classList.contains('hidden')).toBe(false);

    populateDetailsFields({
      album_name: 'Spotify Album',
      artists: [{ name: 'Spotify Artist' }],
      track_count: 9,
      duration_ms: 180000,
    }, false);

    expect(elMock.fieldTrackCount.classList.contains('hidden')).toBe(true);
  });
});
