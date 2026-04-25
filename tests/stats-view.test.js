import { describe, expect, it } from 'vitest';
import { cleanupStatsView, renderStatsView } from '../public/js/stats-view.js';

describe('stats view spotify links', () => {
  function makeAlbum({
    id,
    album_name,
    artist_name,
    spotify_album_id = null,
    artists = null,
    artist_link = null,
    spotify_url = null,
    album_link = null,
    rating = null,
    planned_at = null,
    listened_at = null,
    created_at = '2025-01-01 09:00:00',
    image_path = null,
  }) {
    return {
      id,
      album_name,
      artist_name,
      spotify_album_id,
      artists: artists ?? [{ id: null, name: artist_name, avatar_url: null, share_url: null }],
      artist_link,
      spotify_url,
      album_link,
      rating,
      planned_at,
      listened_at,
      created_at,
      image_path,
      status: listened_at ? 'completed' : 'planned',
      dominant_color_dark: '#334155',
      dominant_color_light: '#94a3b8',
    };
  }

  function makeStats() {
    const linkedArtist = {
      id: 'artistone1234567890123',
      name: 'Artist One',
      avatar_url: null,
      share_url: 'https://open.spotify.com/artist/artistone1234567890123',
    };
    const secondArtist = {
      id: 'artisttwo1234567890123',
      name: 'Artist Two',
      avatar_url: null,
      share_url: 'https://open.spotify.com/artist/artisttwo1234567890123',
    };

    const hallAlbum = makeAlbum({
      id: 1,
      album_name: 'Hall Album',
      artist_name: 'Artist One',
      spotify_album_id: 'hallalbum1234567890123',
      artists: [linkedArtist],
      rating: 98,
      listened_at: '2025-02-03',
    });
    const waitingAlbum = makeAlbum({
      id: 2,
      album_name: 'Waiting Album',
      artist_name: 'Artist Two',
      spotify_album_id: 'waitingalbum123456789',
      artists: [secondArtist],
      planned_at: '2024-01-02',
      created_at: '2024-01-02 09:00:00',
    });
    const gapAlbum = makeAlbum({
      id: 3,
      album_name: 'Gap Album',
      artist_name: 'Artist One',
      spotify_album_id: 'gapalbum1234567890123',
      artists: [linkedArtist],
      planned_at: '2024-02-01',
      listened_at: '2025-02-01',
      rating: 88,
    });

    return {
      total: 3,
      counts: { planned: 1, completed: 2, dropped: 0 },
      totalHours: 6,
      rate30: 0,
      rate90: 0,
      currentStreak: 0,
      longestStreak: 0,
      activeDays30: 0,
      topArtists: [],
      decades: [],
      monthly: [],
      dailyMap: {},
      ratingBuckets: [],
      ratingBucketLabels: [],
      avgRating: 93,
      topRated: [hallAlbum],
      oldestBacklog: [waitingAlbum],
      gaps: [{ album: gapAlbum, days: 366 }],
      hasPlannedAt: true,
      recentFinished: [],
      today: new Date('2025-04-01T00:00:00Z'),
    };
  }

  it('renders quiet spotify album and artist links in Your dearest, Crouched at the starting line, and Home at last', () => {
    const container = document.createElement('div');

    renderStatsView(container, makeStats());

    expect(container.querySelector('.a-card-body .fame-name .stats-quiet-link[href="spotify:album:hallalbum1234567890123"]')?.textContent).toBe('Hall Album');
    expect(container.querySelector('.a-card-body .fame-artist .stats-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');

    const cardTitles = Array.from(container.querySelectorAll('.a-card-title')).map(el => el.textContent);
    expect(cardTitles).toContain('Your dearest');
    expect(cardTitles).toContain('Crouched at the starting line');
    expect(cardTitles).toContain('Home at last');

    const waitingCard = Array.from(container.querySelectorAll('.a-card'))
      .find(card => card.querySelector('.a-card-title')?.textContent === 'Crouched at the starting line');
    expect(waitingCard?.querySelector('.fame-name .stats-quiet-link[href="spotify:album:waitingalbum123456789"]')?.textContent).toBe('Waiting Album');
    expect(waitingCard?.querySelector('.fame-artist .stats-quiet-link[href="spotify:artist:artisttwo1234567890123"]')?.textContent).toBe('Artist Two');

    const gapCard = Array.from(container.querySelectorAll('.a-card'))
      .find(card => card.querySelector('.a-card-title')?.textContent === 'Home at last');
    expect(gapCard?.querySelector('.fame-name .stats-quiet-link[href="spotify:album:gapalbum1234567890123"]')?.textContent).toBe('Gap Album');
    expect(gapCard?.querySelector('.fame-artist .stats-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');

    const topRatedCard = Array.from(container.querySelectorAll('.a-card'))
      .find(card => card.querySelector('.a-card-title')?.textContent === 'Your dearest');
    expect(topRatedCard?.querySelector('.fame-name .stats-quiet-link[href="spotify:album:hallalbum1234567890123"]')?.textContent).toBe('Hall Album');
    expect(topRatedCard?.querySelector('.fame-artist .stats-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');

    cleanupStatsView(container);
  });

  it('renders Top artists names as quiet internal links and dispatches a collection-jump event on click', () => {
    const container = document.createElement('div');
    const stats = makeStats();
    stats.topArtists = [
      {
        name: 'Artist One',
        total: 2,
        completed: 1,
        planned: 1,
        dropped: 0,
        avgRating: 93,
      },
    ];

    const received = [];
    const onOpenTopArtist = event => {
      received.push(event.detail);
    };

    window.addEventListener('stats:open-top-artist', onOpenTopArtist);

    renderStatsView(container, stats);

    const link = container.querySelector('.topart-name .stats-top-artist-link');
    expect(link?.textContent).toBe('Artist One');
    expect(link?.getAttribute('href')).toBe('/collection/list');

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(received).toEqual([{ artistName: 'Artist One' }]);

    window.removeEventListener('stats:open-top-artist', onOpenTopArtist);
    cleanupStatsView(container);
  });
});
