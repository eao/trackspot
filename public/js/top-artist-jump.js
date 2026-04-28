import {
  state,
  DEFAULT_COMPLEX_STATUSES,
  normalizeSortState,
} from './state.js';
import { loadAlbums, resetPagination } from './render.js';
import {
  syncFilterControlsFromState,
  updateStatusFilterBtn,
  updateImportTypeFilterBtn,
  updateRatedFilterBtn,
  updateTypeFilterBtn,
  updateSortFieldBtn,
  updateSortOrderBtn,
} from './sidebar.js';
import { getNavigationRevision, setPage } from './navigation.js';

let statsTopArtistJumpToken = 0;

export function applyTopArtistCollectionPreset(artistName) {
  const normalizedArtistName = String(artistName ?? '').trim();
  if (!normalizedArtistName) return false;

  const allStatusFilter = state.complexStatuses.find(cs => cs.id === 'cs_all')?.id
    ?? DEFAULT_COMPLEX_STATUSES.find(cs => cs.id === 'cs_all')?.id
    ?? 'cs_all';

  state.filters = {
    search: '',
    artist: normalizedArtistName,
    artistMatchExact: true,
    year: '',
    ratingMin: '',
    ratingMax: '',
    statusFilter: allStatusFilter,
    importTypeFilter: 'all',
    ratedFilter: 'both',
    typeAlbum: true,
    typeEP: true,
    typeSingle: true,
    typeCompilation: true,
    typeOther: true,
  };
  state.sort = normalizeSortState({
    field: 'release_date',
    order: 'desc',
  });

  resetPagination();
  syncFilterControlsFromState();
  updateStatusFilterBtn();
  updateImportTypeFilterBtn();
  updateRatedFilterBtn();
  updateTypeFilterBtn();
  updateSortFieldBtn();
  updateSortOrderBtn();

  if (state.navigation?.scrollPositions) {
    state.navigation.scrollPositions.collection = 0;
  }

  return true;
}

export async function handleStatsOpenTopArtist(event) {
  const token = ++statsTopArtistJumpToken;
  const sourcePage = state.navigation?.page;
  if (sourcePage !== 'stats') return false;

  const sourceNavigationRevision = getNavigationRevision();
  if (!applyTopArtistCollectionPreset(event?.detail?.artistName)) return false;

  const loadApplied = await loadAlbums({
    gateStartupArt: true,
    renderAlbums: () => {},
  });

  if (token !== statsTopArtistJumpToken) return false;
  if (loadApplied === false) return false;
  if (state.navigation?.page !== sourcePage) return false;
  if (getNavigationRevision() !== sourceNavigationRevision) return false;

  await setPage('collection', {
    suppressTransitions: true,
    skipCollectionLoad: true,
  });
  return true;
}

export function initStatsTopArtistJumpListener(target = window) {
  target.addEventListener('stats:open-top-artist', handleStatsOpenTopArtist);
  return () => {
    target.removeEventListener('stats:open-top-artist', handleStatsOpenTopArtist);
  };
}
