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

function clonePlainObject(value) {
  return value && typeof value === 'object' ? { ...value } : value;
}

function captureCollectionStateForJump() {
  return {
    filters: clonePlainObject(state.filters),
    sort: clonePlainObject(state.sort),
    albums: Array.isArray(state.albums) ? [...state.albums] : state.albums,
    albumsLoaded: state.albumsLoaded,
    albumsLoading: state.albumsLoading,
    albumsError: state.albumsError,
    albumListMeta: clonePlainObject(state.albumListMeta),
    albumDetailsCache: clonePlainObject(state.albumDetailsCache),
    paginationCurrentPage: state.pagination?.currentPage,
    collectionScrollPosition: state.navigation?.scrollPositions?.collection,
  };
}

function collectionJumpStateMatches(snapshot) {
  const filters = snapshot?.filters || {};
  const sort = snapshot?.sort || {};
  const currentFilters = state.filters || {};
  const currentSort = state.sort || {};
  return Object.keys(filters).every(key => currentFilters[key] === filters[key])
    && Object.keys(currentFilters).every(key => currentFilters[key] === filters[key])
    && Object.keys(sort).every(key => currentSort[key] === sort[key])
    && Object.keys(currentSort).every(key => currentSort[key] === sort[key]);
}

function restoreCollectionStateAfterAbortedJump(previousState, appliedState) {
  if (!collectionJumpStateMatches(appliedState)) return;

  state.filters = clonePlainObject(previousState.filters);
  state.sort = clonePlainObject(previousState.sort);
  if (Array.isArray(previousState.albums)) {
    state.albums = [...previousState.albums];
  } else if ('albums' in previousState) {
    state.albums = previousState.albums;
  }
  state.albumsLoaded = previousState.albumsLoaded;
  state.albumsLoading = previousState.albumsLoading;
  state.albumsError = previousState.albumsError;
  state.albumListMeta = clonePlainObject(previousState.albumListMeta);
  state.albumDetailsCache = clonePlainObject(previousState.albumDetailsCache);
  if (state.pagination && previousState.paginationCurrentPage !== undefined) {
    state.pagination.currentPage = previousState.paginationCurrentPage;
  }
  if (state.navigation?.scrollPositions && previousState.collectionScrollPosition !== undefined) {
    state.navigation.scrollPositions.collection = previousState.collectionScrollPosition;
  }

  syncFilterControlsFromState();
  updateStatusFilterBtn();
  updateImportTypeFilterBtn();
  updateRatedFilterBtn();
  updateTypeFilterBtn();
  updateSortFieldBtn();
  updateSortOrderBtn();
}

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
  const previousCollectionState = captureCollectionStateForJump();
  if (!applyTopArtistCollectionPreset(event?.detail?.artistName)) return false;
  const appliedCollectionState = captureCollectionStateForJump();

  const loadApplied = await loadAlbums({
    gateStartupArt: true,
    renderAlbums: () => {},
  });

  if (token !== statsTopArtistJumpToken) return false;
  if (
    loadApplied === false
    || state.navigation?.page !== sourcePage
    || getNavigationRevision() !== sourceNavigationRevision
  ) {
    restoreCollectionStateAfterAbortedJump(previousCollectionState, appliedCollectionState);
    return false;
  }

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
