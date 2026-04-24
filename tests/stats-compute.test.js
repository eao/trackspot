import { describe, expect, it } from 'vitest';
import { computeStats, computeYear } from '../public/js/stats-compute.js';

describe('wrapped stats artist imagery', () => {
  it('uses Wrapped-style rating tiebreakers for Hall of Fame ordering', () => {
    const result = computeStats([
      {
        id: 1,
        status: 'completed',
        listened_at: '2025-01-01',
        created_at: '2025-01-01 09:00:00',
        album_name: 'Longest',
        artist_name: 'Artist One',
        artists: [{ name: 'Artist One' }],
        rating: 95,
        duration_ms: 240000,
      },
      {
        id: 2,
        status: 'completed',
        listened_at: '2025-01-02',
        created_at: '2025-01-02 09:00:00',
        album_name: 'Alpha',
        artist_name: 'Artist Two',
        artists: [{ name: 'Artist Two' }],
        rating: 95,
        duration_ms: 180000,
      },
      {
        id: 3,
        status: 'completed',
        listened_at: '2025-01-03',
        created_at: '2025-01-03 09:00:00',
        album_name: 'Same Title',
        artist_name: 'Artist Three',
        artists: [{ name: 'Artist Three' }],
        rating: 95,
        duration_ms: 180000,
      },
      {
        id: 4,
        status: 'completed',
        listened_at: '2025-01-04',
        created_at: '2025-01-04 09:00:00',
        album_name: 'Same Title',
        artist_name: 'Artist Four',
        artists: [{ name: 'Artist Four' }],
        rating: 95,
        duration_ms: 180000,
      },
      {
        id: 5,
        status: 'completed',
        listened_at: '2025-01-05',
        created_at: '2025-01-05 09:00:00',
        album_name: 'Shortest',
        artist_name: 'Artist Five',
        artists: [{ name: 'Artist Five' }],
        rating: 95,
        duration_ms: 120000,
      },
    ]);

    expect(result.topRated.map(album => album.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('prefers artist avatar URLs and keeps stored album art as the fallback', () => {
    const result = computeYear([
      {
        id: 1,
        status: 'completed',
        listened_at: '2025-02-01',
        album_name: 'Album One',
        artist_name: 'Artist One',
        artists: [{ name: 'Artist One', avatar_url: 'https://cdn.example.com/avatar.jpg' }],
        image_path: 'images/album-one.jpg',
        rating: 80,
      },
      {
        id: 2,
        status: 'completed',
        listened_at: '2025-03-01',
        album_name: 'Album Two',
        artist_name: 'Artist One',
        artists: [{ name: 'Artist One', avatar_url: null }],
        image_path: 'images/album-two.jpg',
        rating: 85,
      },
    ], 2025);

    expect(result.topArtists).toHaveLength(1);
    expect(result.topArtists[0]).toMatchObject({
      name: 'Artist One',
      avatar_url: 'https://cdn.example.com/avatar.jpg',
      fallback_image: '/images/album-one.jpg',
    });
  });

  it('uses stored album art as the only fallback when no artist avatar is available', () => {
    const result = computeYear([
      {
        id: 1,
        status: 'completed',
        listened_at: '2025-04-01',
        album_name: 'Album One',
        artist_name: 'Artist One',
        artists: [{ name: 'Artist One', avatar_url: null }],
        image_path: 'images/album-one.jpg',
      },
      {
        id: 2,
        status: 'completed',
        listened_at: '2025-05-01',
        album_name: 'Album Two',
        artist_name: 'Artist One',
        artists: [{ name: 'Artist One', avatar_url: null }],
        image_path: 'images/album-two.jpg',
      },
    ], 2025);

    expect(result.topArtists[0]).toMatchObject({
      avatar_url: null,
      fallback_image: '/images/album-one.jpg',
    });
  });

  it('applies wrapped tie-breakers for first/last listens, artists, top albums, and release dates', () => {
    const result = computeYear([
      {
        id: 1,
        status: 'completed',
        listened_at: '2025-01-05',
        created_at: '2025-01-05 10:00:00',
        album_name: 'First Later',
        artist_name: 'Alpha Artist',
        artists: [{ name: 'Alpha Artist' }],
        rating: 80,
        duration_ms: 200000,
        release_year: 1990,
      },
      {
        id: 2,
        status: 'completed',
        listened_at: '2025-01-05',
        created_at: '2025-01-05 09:00:00',
        album_name: 'First Earlier',
        artist_name: 'Beta Artist',
        artists: [{ name: 'Beta Artist' }],
        rating: 70,
        duration_ms: 210000,
        release_year: 1990,
      },
      {
        id: 3,
        status: 'completed',
        listened_at: '2025-12-20',
        created_at: '2025-12-20 11:00:00',
        album_name: 'Last Earlier',
        artist_name: 'Alpha Artist',
        artists: [{ name: 'Alpha Artist' }],
        rating: 95,
        duration_ms: 240000,
        release_year: 2025,
      },
      {
        id: 4,
        status: 'completed',
        listened_at: '2025-12-20',
        created_at: '2025-12-20 12:00:00',
        album_name: 'Last Later',
        artist_name: 'Beta Artist',
        artists: [{ name: 'Beta Artist' }],
        rating: 95,
        duration_ms: 180000,
        release_year: 2025,
      },
      {
        id: 5,
        status: 'completed',
        listened_at: '2025-06-01',
        created_at: '2025-06-01 08:00:00',
        album_name: 'Alpha Release',
        artist_name: 'Gamma Artist',
        artists: [{ name: 'Gamma Artist' }],
        rating: 95,
        duration_ms: 240000,
        release_year: 1963,
        spotify_release_date: {
          isoString: '1963-01-01T00:00:00Z',
          precision: 'DAY',
          year: 1963,
        },
      },
      {
        id: 6,
        status: 'completed',
        listened_at: '2025-06-02',
        created_at: '2025-06-02 08:00:00',
        album_name: 'Later Release',
        artist_name: 'Gamma Artist',
        artists: [{ name: 'Gamma Artist' }],
        rating: 95,
        duration_ms: 240000,
        release_year: 1963,
        spotify_release_date: {
          isoString: '1963-02-10T00:00:00Z',
          precision: 'DAY',
          year: 1963,
        },
      },
      {
        id: 7,
        status: 'completed',
        listened_at: '2025-07-01',
        created_at: '2025-07-01 08:00:00',
        album_name: 'A Manual Tie',
        artist_name: 'Delta Artist',
        artists: [{ name: 'Delta Artist' }],
        rating: 60,
        duration_ms: 200000,
        release_year: 1963,
      },
    ], 2025);

    expect(result.firstListen?.id).toBe(2);
    expect(result.lastListen?.id).toBe(4);
    expect(result.topArtists.map(artist => artist.name).slice(0, 2)).toEqual(['Gamma Artist', 'Alpha Artist']);
    expect(result.topByRating.map(album => album.id).slice(0, 4)).toEqual([5, 3, 6, 4]);
    expect(result.topReleasedThatYear.map(album => album.id).slice(0, 2)).toEqual([3, 4]);
    expect(result.oldestListened?.id).toBe(6);
    expect(result.newestListened?.id).toBe(3);
  });

  it('picks blank-note screed and numero uno cards from all rated albums', () => {
    const result = computeYear([
      {
        id: 10,
        status: 'completed',
        listened_at: '2025-02-01',
        created_at: '2025-02-01 09:00:00',
        album_name: 'Numero Winner',
        artist_name: 'Artist One',
        artists: [{ name: 'Artist One' }],
        rating: 100,
        duration_ms: 300000,
        notes: '',
      },
      {
        id: 11,
        status: 'completed',
        listened_at: '2025-03-01',
        created_at: '2025-03-01 09:00:00',
        album_name: 'Screed Winner',
        artist_name: 'Artist Two',
        artists: [{ name: 'Artist Two' }],
        rating: 20,
        duration_ms: 120000,
        notes: null,
      },
      {
        id: 12,
        status: 'completed',
        listened_at: '2025-04-01',
        created_at: '2025-04-01 09:00:00',
        album_name: 'Actual Notes',
        artist_name: 'Artist Three',
        artists: [{ name: 'Artist Three' }],
        rating: 80,
        duration_ms: 180000,
        notes: 'This one has words.',
      },
    ], 2025);

    expect(result.numeroUno).toMatchObject({
      album: expect.objectContaining({ id: 10 }),
      text: '',
    });
    expect(result.screed).toMatchObject({
      album: expect.objectContaining({ id: 11 }),
      text: '',
    });
    expect(result.notes).toHaveLength(1);
  });
});
