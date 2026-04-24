// =============================================================================
// Pure filtering helpers for album collections.
// =============================================================================

const KNOWN_ALBUM_TYPES = ['ALBUM', 'EP', 'SINGLE', 'COMPILATION'];

function getArtistNames(album) {
  if (Array.isArray(album.artist_names)) {
    return album.artist_names.filter(name => typeof name === 'string');
  }

  if (Array.isArray(album.artists)) {
    return album.artists
      .map(artist => typeof artist === 'string' ? artist : artist?.name)
      .filter(name => typeof name === 'string');
  }

  return [];
}

function getAlbumName(album) {
  return typeof album.album_name === 'string' ? album.album_name : '';
}

export function applyAlbumFilters(albums, filters, complexStatuses = []) {
  const {
    search = '',
    artist = '',
    artistMatchExact = false,
    year = '',
    ratingMin = '',
    ratingMax = '',
    statusFilter = '',
    importTypeFilter = 'all',
    ratedFilter = 'both',
    typeAlbum = true,
    typeEP = true,
    typeSingle = true,
    typeCompilation = true,
    typeOther = true,
  } = filters;

  return albums.filter(album => {
    const artistNames = getArtistNames(album);
    const albumName = getAlbumName(album);

    if (search) {
      const q = search.toLowerCase();
      const inAlbum = albumName.toLowerCase().includes(q);
      const inArtist = artistNames.some(a => a.toLowerCase().includes(q));
      if (!inAlbum && !inArtist) return false;
    }

    if (artist) {
      const q = artist.toLowerCase();
      const match = artistMatchExact
        ? artistNames.some(a => a.toLowerCase() === q)
        : artistNames.some(a => a.toLowerCase().includes(q));
      if (!match) return false;
    }

    if (year) {
      const parts = year.split('-').map(s => s.trim()).filter(Boolean);
      const releaseYear = album.release_year;
      if (parts.length === 2) {
        const lo = parseInt(parts[0], 10);
        const hi = parseInt(parts[1], 10);
        if (Number.isNaN(lo) || Number.isNaN(hi) || releaseYear === null || releaseYear < lo || releaseYear > hi) {
          return false;
        }
      } else if (releaseYear !== parseInt(parts[0], 10)) {
        return false;
      }
    }

    if (ratingMin !== '' && album.rating !== null && album.rating < parseInt(ratingMin, 10)) return false;
    if (ratingMax !== '' && album.rating !== null && album.rating > parseInt(ratingMax, 10)) return false;

    const complexStatus = complexStatuses.find(c => c.id === statusFilter);
    if (complexStatus) {
      if (!complexStatus.statuses.includes(album.status)) return false;
    } else if (statusFilter && album.status !== statusFilter) {
      return false;
    }

    if (importTypeFilter !== 'all' && (album.source ?? 'manual') !== importTypeFilter) return false;
    if (ratedFilter === 'rated' && album.rating === null) return false;
    if (ratedFilter === 'unrated' && album.rating !== null) return false;

    const type = album.album_type?.toUpperCase() ?? null;
    if (type === 'ALBUM' && !typeAlbum) return false;
    if (type === 'EP' && !typeEP) return false;
    if (type === 'SINGLE' && !typeSingle) return false;
    if (type === 'COMPILATION' && !typeCompilation) return false;
    if ((type === null || !KNOWN_ALBUM_TYPES.includes(type)) && !typeOther) return false;

    return true;
  });
}
