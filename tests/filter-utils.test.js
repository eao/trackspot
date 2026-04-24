import { describe, expect, it } from 'vitest';
import { applyAlbumFilters } from '../public/js/filter-utils.js';
import { normalizeAlbumClientShape } from '../public/js/utils.js';

describe('applyAlbumFilters', () => {
  it('matches search and artist filters even when artist_names has not been derived yet', () => {
    const rawAlbum = {
      id: 1,
      album_name: 'Glow',
      artists: [{ name: 'Nujabes' }],
      status: 'completed',
      rating: 90,
      album_type: 'ALBUM',
      source: 'spotify',
      release_year: 2002,
    };

    expect(applyAlbumFilters([rawAlbum], { search: 'nuj', statusFilter: '', importTypeFilter: 'all' })).toHaveLength(1);
    expect(applyAlbumFilters([rawAlbum], { artist: 'nuj', artistMatchExact: false, statusFilter: '', importTypeFilter: 'all' })).toHaveLength(1);
    expect(applyAlbumFilters([rawAlbum], { artist: 'nujabes', artistMatchExact: true, statusFilter: '', importTypeFilter: 'all' })).toHaveLength(1);
  });

  it('derives artist_names when normalizing albums for client state', () => {
    const normalized = normalizeAlbumClientShape({
      id: 2,
      album_name: 'Metaphorical Music',
      artists: [{ name: 'Nujabes' }, { name: 'Shing02' }],
    });

    expect(normalized.artist_names).toEqual(['Nujabes', 'Shing02']);
  });
});
