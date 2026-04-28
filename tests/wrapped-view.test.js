import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../public/js/state.js';
import { renderWrappedView } from '../public/js/wrapped-view.js';

describe('wrapped view notes rendering', () => {
  function formatReleaseDateLabel(year, monthIndex, day) {
    return new Date(year, monthIndex, day).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function makeAlbum({
    id,
    listened_at,
    album_name,
    artist_name,
    artists = null,
    rating = null,
    notes,
    created_at = `${listened_at} 09:00:00`,
    duration_ms = 180000,
    release_year = 2025,
    spotify_release_date = null,
    spotify_album_id = null,
    spotify_url = null,
    album_link = null,
    artist_link = null,
    spotify_first_track = null,
    spotify_graphql_json = null,
    image_path = `images/${id}.jpg`,
  }) {
    return {
      id,
      status: 'completed',
      listened_at,
      created_at,
      album_name,
      artist_name,
      artists: artists ?? [{ id: null, name: artist_name, avatar_url: null, share_url: null }],
      image_path,
      rating,
      notes,
      duration_ms,
      release_year,
      spotify_release_date,
      spotify_album_id,
      spotify_url,
      album_link,
      artist_link,
      spotify_first_track,
      spotify_graphql_json,
    };
  }

  beforeEach(() => {
    vi.useRealTimers();
    state.earlyWrapped = false;
    state.wrappedName = '';

    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      setTransform() {},
      clearRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      globalAlpha: 1,
    }));

    globalThis.requestAnimationFrame = vi.fn(() => 1);
    globalThis.cancelAnimationFrame = vi.fn();
  });

  it('locks the current year behind a countdown by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 19, 8, 30, 5));

    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2026-01-10',
        album_name: 'Current Year Album',
        artist_name: 'Artist One',
        rating: 88,
        notes: 'countdown check',
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2026,
      yearsAvailable: [2025, 2026],
      onYearChange: vi.fn(),
    });

    expect(container.querySelector('.w-unlock-countdown')).not.toBeNull();
    expect(container.querySelector('.w-cover-wall')).toBeNull();
    expect(container.textContent).toContain('until Wrapped unlocks');
    expect(Array.from(container.querySelectorAll('.w-unlock-label')).map(el => el.textContent)).toEqual([
      'Days',
      'Hours',
      'Minutes',
      'Seconds',
    ]);

    container._wrappedCleanup?.();
    vi.useRealTimers();
  });

  it('shows the current year wrapped immediately when Early Wrapped is enabled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 19, 8, 30, 5));
    state.earlyWrapped = true;

    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2026-01-10',
        album_name: 'Current Year Album',
        artist_name: 'Artist One',
        rating: 88,
        notes: 'wrapped visible',
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2026,
      yearsAvailable: [2025, 2026],
      onYearChange: vi.fn(),
    });

    expect(container.querySelector('.w-unlock-countdown')).toBeNull();
    expect(container.querySelector('.w-cover-wall')).not.toBeNull();

    container._wrappedCleanup?.();
    vi.useRealTimers();
  });

  it('refreshes the current year view when Early Wrapped is toggled on', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 19, 8, 30, 5));

    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2026-01-10',
        album_name: 'Current Year Album',
        artist_name: 'Artist One',
        rating: 88,
        notes: 'live refresh',
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2026,
      yearsAvailable: [2025, 2026],
      onYearChange: vi.fn(),
    });

    expect(container.querySelector('.w-unlock-countdown')).not.toBeNull();

    state.earlyWrapped = true;
    vi.advanceTimersByTime(1000);

    expect(container.querySelector('.w-unlock-countdown')).toBeNull();
    expect(container.querySelector('.w-cover-wall')).not.toBeNull();

    container._wrappedCleanup?.();
    vi.useRealTimers();
  });

  it('renders clickable links in notable cards, ticker pills, and expanded notes', () => {
    const container = document.createElement('div');
    const albums = [
      {
        id: 1,
        status: 'completed',
        listened_at: '2025-01-10',
        created_at: '2025-01-10 09:00:00',
        album_name: 'First Album',
        artist_name: 'Artist One',
        artists: [{ name: 'Artist One', avatar_url: 'https://cdn.example.com/artist.jpg' }],
        image_path: 'images/first.jpg',
        rating: 10,
        duration_ms: 180000,
        release_year: 2025,
        notes: 'See [docs](https://example.com)',
      },
      {
        id: 2,
        status: 'completed',
        listened_at: '2025-02-12',
        created_at: '2025-02-12 09:00:00',
        album_name: 'Second Album',
        artist_name: 'Artist Two',
        artists: [{ name: 'Artist Two', avatar_url: null }],
        image_path: 'images/second.jpg',
        rating: 95,
        duration_ms: 220000,
        release_year: 2025,
        notes: 'Raw link https://open.spotify.com/album/abc',
      },
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    expect(container.querySelector('.w-notable-quote a[href="https://example.com"]')).not.toBeNull();
    expect(container.querySelector('.w-ticker-chip-text a[href="spotify:album:abc"]')).not.toBeNull();

    container.querySelector('[data-action="expand-notes"]').click();

    expect(container.querySelector('.w-notes-list-text a[href="https://example.com"]')).not.toBeNull();
    expect(container.querySelector('.w-notes-list-text a[href="spotify:album:abc"]')).not.toBeNull();

    container._wrappedCleanup?.();
  });

  it('falls back when album cover colors are unsafe for inline styles', () => {
    const container = document.createElement('div');
    const album = makeAlbum({
      id: 1,
      listened_at: '2025-01-10',
      album_name: 'Unsafe Color Album',
      artist_name: 'Artist One',
      rating: 88,
      notes: 'color check',
    });
    album.dominant_color_dark = '#fff" onmouseover="alert(1)';
    album.dominant_color_light = 'red';

    renderWrappedView(container, {
      albums: [album],
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    const style = container.querySelector('.ts-cover')?.getAttribute('style') || '';
    expect(style).toContain('#334155');
    expect(style).toContain('#94a3b8');
    expect(style).not.toContain('onmouseover');
    expect(container.innerHTML).not.toContain('onmouseover');

    container._wrappedCleanup?.();
  });

  it('uses the second-longest note as the fallback most-notable card when the longest is already Screed', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-01-10',
        album_name: 'Lowest and Longest',
        artist_name: 'Artist One',
        rating: 10,
        notes: 'a'.repeat(300),
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-02-12',
        album_name: 'Fallback Notable',
        artist_name: 'Artist Two',
        rating: 90,
        notes: 'b'.repeat(200),
      }),
      makeAlbum({
        id: 3,
        listened_at: '2025-03-12',
        album_name: 'Highest Rated',
        artist_name: 'Artist Three',
        rating: 95,
        notes: 'c'.repeat(100),
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    const labels = Array.from(container.querySelectorAll('.w-notable-label')).map(el => el.textContent.trim());
    expect(labels).toContain('Screed\nMost notable');
    expect(labels).toContain('(2nd) Most notable');
    expect(labels).toContain('Numero uno');

    container._wrappedCleanup?.();
  });

  it('uses the third-longest note when the top two notable notes already belong to Screed and Numero uno', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-01-10',
        album_name: 'Screed Album',
        artist_name: 'Artist One',
        rating: 10,
        notes: 'a'.repeat(300),
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-02-12',
        album_name: 'Numero Album',
        artist_name: 'Artist Two',
        rating: 95,
        notes: 'b'.repeat(250),
      }),
      makeAlbum({
        id: 3,
        listened_at: '2025-03-12',
        album_name: 'Third Notable',
        artist_name: 'Artist Three',
        rating: 70,
        notes: 'c'.repeat(200),
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    const labels = Array.from(container.querySelectorAll('.w-notable-label')).map(el => el.textContent.trim());
    expect(labels).toContain('Screed\nMost notable');
    expect(labels).toContain('Numero uno\n(2nd) Most notable');
    expect(labels).toContain('(3rd) Most notable');

    container._wrappedCleanup?.();
  });

  it('does not add an extra most-notable card when only Screed and Numero uno have notes', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-01-10',
        album_name: 'Screed Album',
        artist_name: 'Artist One',
        rating: 10,
        notes: 'a'.repeat(300),
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-02-12',
        album_name: 'Numero Album',
        artist_name: 'Artist Two',
        rating: 95,
        notes: 'b'.repeat(250),
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    const labels = Array.from(container.querySelectorAll('.w-notable-label')).map(el => el.textContent.trim());
    expect(labels).toEqual([
      'Screed\nMost notable',
      'Numero uno\n(2nd) Most notable',
    ]);

    container._wrappedCleanup?.();
  });

  it('shows the special message when a wrapped year has no notes at all', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-01-15',
        album_name: 'Silent Album',
        artist_name: 'Quiet Artist',
        rating: 85,
        notes: '',
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    expect(container.textContent).toContain("(...It seems you didn't have much to say.)");

    container._wrappedCleanup?.();
  });

  it('keeps the share-card words written stat visible at 0 when there are no notes', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-01-15',
        album_name: 'Silent Album',
        artist_name: 'Quiet Artist',
        rating: 85,
        notes: '',
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-03-15',
        album_name: 'Second Silent Album',
        artist_name: 'Quiet Artist',
        rating: 90,
        notes: '',
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    const stats = new Map(
      Array.from(container.querySelectorAll('.wsc-kstat'))
        .map(element => [
          element.querySelector('.wsc-kstat-lab')?.textContent?.trim(),
          element.querySelector('.wsc-kstat-val')?.textContent?.trim(),
        ]),
    );

    expect(container.querySelectorAll('.wsc-key-stats .wsc-kstat')).toHaveLength(4);
    expect(stats.get('words written')).toBe('0');
    expect(container.querySelector('.wsc-hero-artist-text .wsc-kstat-lab')?.textContent).toBe('top artist');
    expect(container.querySelector('.wsc-hero-artist-name')?.textContent).toBe('Quiet Artist');

    container._wrappedCleanup?.();
  });

  it('uses spotify-derived release dates in Time traveler labels even for non-DAY precision or suspicious Jan 1 dates', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-01-15',
        album_name: 'Year Precision Album',
        artist_name: 'Artist One',
        rating: 88,
        notes: 'note',
        release_year: 1963,
        spotify_release_date: {
          isoString: '1963-01-01T00:00:00Z',
          precision: 'YEAR',
          year: 1963,
        },
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-06-15',
        album_name: 'Newer Album',
        artist_name: 'Artist Two',
        rating: 90,
        notes: 'note',
        release_year: 2025,
        spotify_release_date: {
          isoString: '2025-04-04T00:00:00Z',
          precision: 'DAY',
          year: 2025,
        },
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    expect(container.textContent).toContain(`Released ${formatReleaseDateLabel(1963, 0, 1)}`);
    expect(container.textContent).toContain(`Released ${formatReleaseDateLabel(2025, 3, 4)}`);

    container._wrappedCleanup?.();
  });

  it('falls back to release year in Time traveler labels when spotify-derived dates are unavailable', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-02-01',
        album_name: 'Manual Old',
        artist_name: 'Artist One',
        rating: 80,
        notes: 'note',
        release_year: 1980,
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-07-01',
        album_name: 'Manual New',
        artist_name: 'Artist Two',
        rating: 85,
        notes: 'note',
        release_year: 2025,
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    expect(container.textContent).toContain('Released 1980');
    expect(container.textContent).toContain('Released 2025');

    container._wrappedCleanup?.();
  });

  it('renders the Time traveler eyebrow as a quiet spotify link labeled Yesterday and today', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-02-01',
        album_name: 'Manual Old',
        artist_name: 'Artist One',
        rating: 80,
        notes: 'note',
        release_year: 1980,
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-07-01',
        album_name: 'Manual New',
        artist_name: 'Artist Two',
        rating: 85,
        notes: 'note',
        release_year: 2025,
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    const link = Array.from(container.querySelectorAll('.w-eyebrow-link'))
      .find(element => element.textContent === 'Yesterday and today');
    expect(link?.textContent).toBe('Yesterday and today');
    expect(link?.getAttribute('href')).toBe('spotify:track:37PSl0SD25vE0hFEJxpRir');

    container._wrappedCleanup?.();
  });

  it('renders the Bookends eyebrow as split quiet spotify links around normal text', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-01-05',
        album_name: 'First Album',
        artist_name: 'Artist One',
        rating: 80,
        notes: 'note',
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-12-20',
        album_name: 'Last Album',
        artist_name: 'Artist Two',
        rating: 90,
        notes: 'note',
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    const beginningLink = Array.from(container.querySelectorAll('.w-eyebrow-link'))
      .find(element => element.textContent === 'The beginning');
    const endLink = Array.from(container.querySelectorAll('.w-eyebrow-link'))
      .find(element => element.textContent === 'the end');

    expect(container.textContent).toContain('The beginning and the end');
    expect(beginningLink?.getAttribute('href')).toBe('spotify:track:5xoMRan7YOKvYL6vueYugk');
    expect(endLink?.getAttribute('href')).toBe('spotify:track:6WMxH9twwIFfH3OVfs40lA');

    container._wrappedCleanup?.();
  });

  it('renders the configured quiet spotify eyebrow links for the remaining Wrapped sections', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-01-05',
        album_name: 'First Album',
        artist_name: 'Artist One',
        rating: 80,
        notes: 'first note',
        release_year: 2024,
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-12-20',
        album_name: 'Last Album',
        artist_name: 'Artist One',
        rating: 90,
        notes: 'second note',
        release_year: 2025,
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    const eyebrowLinks = new Map(
      Array.from(container.querySelectorAll('.w-eyebrow-link'))
        .map(element => [element.textContent, element.getAttribute('href')]),
    );

    expect(eyebrowLinks.get('For the record')).toBe('spotify:track:5rinOGUygOiBOW4m33IUiy');
    expect(eyebrowLinks.get('Hunting high and low')).toBe('spotify:track:3HQVanEnLlPtywbJai0uiG');
    expect(eyebrowLinks.get('My idol')).toBe('spotify:track:4zU8jbl3hDBzGuAci24t89');
    expect(eyebrowLinks.get('The peak')).toBe('spotify:track:2hXPmiqKdXcbV0L1VKnTDN');
    expect(eyebrowLinks.get('Right now')).toBe('spotify:track:58Q3FZFs1YXPpliWQB5kXB');
    expect(eyebrowLinks.get('Shout')).toBe('spotify:track:2gQaQUhDCNGfBVXTvxAmXQ');
    expect(eyebrowLinks.get("And here's to many more")).toBe('spotify:track:4bmdIyjJLJlHPzYVW4vhJ2');

    container._wrappedCleanup?.();
  });

  it('renders quiet spotify links for Wrapped album and artist labels without linking the year text', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2025-01-05',
        album_name: 'First Album',
        artist_name: 'Artist One',
        artists: [{
          id: 'artistone1234567890123',
          name: 'Artist One',
          avatar_url: 'https://cdn.example.com/artist-one.jpg',
          share_url: 'https://open.spotify.com/artist/artistone1234567890123',
        }],
        spotify_album_id: 'firstalbum123456789012',
        rating: 80,
        notes: 'first note',
        release_year: 1980,
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-12-20',
        album_name: 'Last Album',
        artist_name: 'Artist One',
        artists: [{
          id: 'artistone1234567890123',
          name: 'Artist One',
          avatar_url: null,
          share_url: 'https://open.spotify.com/artist/artistone1234567890123',
        }],
        spotify_album_id: 'lastalbum1234567890123',
        rating: 95,
        notes: 'second note',
        release_year: 2025,
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2025,
      yearsAvailable: [2025],
      onYearChange: vi.fn(),
    });

    expect(container.querySelector('.w-bookend .w-fame-name .w-quiet-link[href="spotify:album:firstalbum123456789012"]')?.textContent).toBe('First Album');
    expect(container.querySelector('.w-bookend .w-fame-artist .w-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');
    expect(container.querySelector('.w-artist-name .w-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');
    expect(container.querySelector('.w-top10-name .w-quiet-link[href="spotify:album:lastalbum1234567890123"]')?.textContent).toBe('Last Album');
    expect(container.querySelector('.w-top10-artist .w-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');
    expect(container.querySelector('.w-fame-grid .w-fame-name .w-quiet-link[href="spotify:album:lastalbum1234567890123"]')?.textContent).toBe('Last Album');
    expect(container.querySelector('.w-fame-grid .w-fame-artist .w-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');
    expect(container.querySelector('.w-notable-name .w-quiet-link[href="spotify:album:lastalbum1234567890123"]')?.textContent).toBe('Last Album');
    expect(container.querySelector('.w-notable-artist .w-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');

    container.querySelector('[data-action="expand-notes"]').click();

    expect(container.querySelector('.w-notes-list-name .w-quiet-link[href="spotify:album:firstalbum123456789012"]')?.textContent).toBe('First Album');
    expect(container.querySelector('.w-notes-list-artist .w-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');
    expect(container.querySelector('.wsc-hero-artist-name .w-quiet-link[href="spotify:artist:artistone1234567890123"]')?.textContent).toBe('Artist One');
    expect(container.querySelector('.wsc-list .wsc-name .w-quiet-link[href="spotify:album:firstalbum123456789012"]')?.textContent).toBe('First Album');
    expect(container.querySelector('.wsc-list .wsc-name .w-quiet-link[href="spotify:album:lastalbum1234567890123"]')?.textContent).toBe('Last Album');
    expect(container.querySelector('.w-top10-yr a')).toBeNull();
    expect(container.querySelector('.w-notable-year a')).toBeNull();
    expect(container.querySelector('.w-notes-list-year a')).toBeNull();

    container._wrappedCleanup?.();
  });

  it('shares the wrapped name across wrapped year renders', () => {
    const firstContainer = document.createElement('div');
    const secondContainer = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2024-01-05',
        album_name: 'First Album',
        artist_name: 'Artist One',
        rating: 80,
        notes: 'first note',
        release_year: 2024,
      }),
      makeAlbum({
        id: 2,
        listened_at: '2025-12-20',
        album_name: 'Second Album',
        artist_name: 'Artist Two',
        rating: 90,
        notes: 'second note',
        release_year: 2025,
      }),
    ];

    renderWrappedView(firstContainer, {
      albums,
      year: 2024,
      yearsAvailable: [2024, 2025],
      onYearChange: vi.fn(),
    });

    expect(firstContainer.querySelector('.wsc-owner-name')).not.toBeNull();
    expect(firstContainer.querySelector('.wsc-owner-name')?.textContent).toBe('');
    expect(firstContainer.querySelector('.wsc-owner-name')?.classList.contains('wsc-owner-name-empty')).toBe(true);

    const firstInput = firstContainer.querySelector('[data-share-name]');
    firstInput.value = 'Casey';
    firstInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(state.wrappedName).toBe('Casey');
    expect(firstContainer.querySelector('.wsc-owner-name')?.textContent).toBe("Casey's");
    expect(firstContainer.querySelector('.wsc-owner-name')?.classList.contains('wsc-owner-name-empty')).toBe(false);

    renderWrappedView(secondContainer, {
      albums,
      year: 2025,
      yearsAvailable: [2024, 2025],
      onYearChange: vi.fn(),
    });

    expect(secondContainer.querySelector('[data-share-name]')?.value).toBe('Casey');
    expect(secondContainer.querySelector('.wsc-owner-name')?.textContent).toBe("Casey's");

    firstContainer._wrappedCleanup?.();
    secondContainer._wrappedCleanup?.();
  });

  it('renders Spotify first-track embeds and manual fallbacks in the Wrapped Discord preview', () => {
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2024-01-05',
        album_name: 'Spotify Album',
        artist_name: 'Artist One',
        rating: 95,
        notes: 'spotify note',
        release_year: 2024,
        spotify_first_track: {
          id: 'abc123TRACK',
          name: 'Opening Track',
          uri: 'spotify:track:abc123TRACK',
          share_url: 'https://open.spotify.com/track/abc123TRACK',
        },
      }),
      makeAlbum({
        id: 2,
        listened_at: '2024-01-06',
        album_name: 'Manual Album',
        artist_name: 'Various Artists',
        rating: 90,
        notes: 'manual note',
        release_year: 2024,
        album_link: 'https://example.com/manual-album',
        spotify_graphql_json: null,
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: 2024,
      yearsAvailable: [2024],
      onYearChange: vi.fn(),
    });

    const preview = container.querySelector('[aria-label="Top Albums"]');
    const iframe = preview?.querySelector('iframe');
    expect(container.querySelector('.w-discord-preview-intro')?.textContent).toContain('Spotty');
    expect(container.querySelector('.w-discord-message-avatar')?.getAttribute('src')).toBe('/avatars/Spotty-Santa-Avatar.png');
    expect(preview?.textContent).toContain('Top Albums');
    expect(iframe?.getAttribute('src')).toBe('https://open.spotify.com/embed/track/abc123TRACK?utm_source=generator');
    expect(iframe?.getAttribute('height')).toBe('80');
    expect(preview?.textContent).not.toContain('Manual Album');
    expect(preview?.textContent).not.toContain('(not on Spotify)');

    container._wrappedCleanup?.();
  });

  it('shows a fixed local message time in the Discord share intro', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 5, 22, 27, 30));
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2023-01-05',
        album_name: 'Spotify Album',
        artist_name: 'Artist One',
        rating: 95,
        notes: 'spotify note',
        release_year: 2023,
        spotify_first_track: {
          id: 'abc123TRACK',
          name: 'Opening Track',
          uri: 'spotify:track:abc123TRACK',
          share_url: 'https://open.spotify.com/track/abc123TRACK',
        },
      }),
    ];

    try {
      renderWrappedView(container, {
        albums,
        year: 2023,
        yearsAvailable: [2023],
        onYearChange: vi.fn(),
      });

      const initialTime = container.querySelector('.w-discord-message-time')?.textContent;
      expect(initialTime).toMatch(/10:27\s*PM|22:27/);

      vi.setSystemTime(new Date(2024, 0, 5, 22, 35, 0));
      vi.advanceTimersByTime(8 * 60 * 1000);

      expect(container.querySelector('.w-discord-message-time')?.textContent).toBe(initialTime);
    } finally {
      container._wrappedCleanup?.();
      vi.useRealTimers();
    }
  });

  it('copies Discord-formatted text for each Wrapped Spotify preview panel', async () => {
    vi.useFakeTimers();
    const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    state.wrappedName = 'Erik';
    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2024-01-05',
        album_name: 'Spotify Album',
        artist_name: 'Artist One',
        rating: 95,
        notes: 'spotify note',
        release_year: 2024,
        duration_ms: 200000,
        spotify_first_track: {
          id: 'abc123TRACK',
          name: 'Opening Track',
          uri: 'spotify:track:abc123TRACK',
          share_url: 'https://open.spotify.com/track/abc123TRACK',
        },
      }),
      makeAlbum({
        id: 2,
        listened_at: '2024-01-06',
        album_name: 'Manual Album',
        artist_name: 'Various Artists',
        rating: 90,
        notes: 'manual note',
        release_year: 2024,
        duration_ms: 100000,
        album_link: 'https://example.com/manual-album',
      }),
    ];

    try {
      renderWrappedView(container, {
        albums,
        year: 2024,
        yearsAvailable: [2024],
        onYearChange: vi.fn(),
      });

      container.querySelector('[data-discord-preview-type="top"]').click();
      await vi.waitFor(() => {
        expect(writeText).toHaveBeenCalledOnce();
      });
      const topButton = container.querySelector('[data-discord-preview-type="top"]');
      expect(topButton.textContent).toContain('Copy');
      expect(topButton.textContent).not.toContain('Copying...');
      expect(topButton.classList.contains('w-discord-copy-btn-copied')).toBe(true);
      expect(container.querySelector('[data-discord-copy-status="top"]').textContent).toBe('');
      expect(writeText).toHaveBeenLastCalledWith([
        '=========================',
        "Erik's top 2 albums from [Trackspot Wrapped](<https://github.com/eao/trackspot>) 2024:",
        '=========================',
        '* 1\\. [Spotify Album](https://open.spotify.com/track/abc123TRACK) - Artist One  (95/100)',
        '* 2\\. [Manual Album](<https://example.com/manual-album>) - Various Artists  (90/100)',
        '  * ( ↑ not on Spotify )',
        '=========================',
        'Check out the first tracks from each album!',
      ].join('\n'));

      container.querySelector('[data-discord-preview-type="released"]').click();
      await vi.waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(2);
      });
      expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining(
        "Erik's top 2 2024 releases in [Trackspot Wrapped](<https://github.com/eao/trackspot>):"
      ));

      vi.advanceTimersByTime(2000);
      expect(topButton.classList.contains('w-discord-copy-btn-copied')).toBe(false);
    } finally {
      container._wrappedCleanup?.();
      vi.useRealTimers();
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
      } else {
        delete navigator.clipboard;
      }
    }
  });

  it('exports the rendered share card from the Wrapped view button', async () => {
    const originalHtmlToImage = window.htmlToImage;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    let resolveExportBlob;
    const exportBlobPromise = new Promise(resolve => {
      resolveExportBlob = resolve;
    });
    const exportCanvas = document.createElement('canvas');
    exportCanvas.toBlob = vi.fn(callback => {
      exportBlobPromise.then(blob => callback(blob));
    });
    let clickedDownload = '';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function mockClick() {
      clickedDownload = this.download;
    });
    window.htmlToImage = {
      toCanvas: vi.fn(async () => exportCanvas),
    };
    URL.createObjectURL = vi.fn(() => 'blob:wrapped-card');
    URL.revokeObjectURL = vi.fn();

    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2024-01-05',
        album_name: 'First Album',
        artist_name: 'Artist One',
        rating: 90,
        notes: 'first note',
        release_year: 2024,
        image_path: null,
      }),
    ];

    try {
      renderWrappedView(container, {
        albums,
        year: 2024,
        yearsAvailable: [2024],
        onYearChange: vi.fn(),
      });

      const exportBtn = container.querySelector('[data-action="export-share-card"]');
      const card = container.querySelector('.w-share-card');
      exportBtn.click();

      expect(exportBtn.disabled).toBe(true);
      expect(exportBtn.textContent.trim()).toBe('Downloading...');

      await vi.waitFor(() => {
        expect(window.htmlToImage.toCanvas).toHaveBeenCalledOnce();
      });
      resolveExportBlob(new Blob(['png'], { type: 'image/png' }));
      await exportBlobPromise;
      await Promise.resolve();

      expect(window.htmlToImage.toCanvas).toHaveBeenCalledWith(card, expect.objectContaining({
        pixelRatio: 2,
        cacheBust: true,
        style: expect.objectContaining({
          margin: '0',
          borderColor: 'transparent',
        }),
      }));
      expect(exportCanvas.toBlob).toHaveBeenCalledOnce();
      await vi.waitFor(() => {
        expect(clickedDownload).toBe('trackspot-wrapped-2024.png');
      });
      expect(exportBtn.disabled).toBe(false);
      expect(exportBtn.querySelector('.lucide-download')).not.toBeNull();
      expect(exportBtn.textContent.trim()).toBe('Download share card');
    } finally {
      container._wrappedCleanup?.();
      window.htmlToImage = originalHtmlToImage;
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      clickSpy.mockRestore();
    }
  });

  it('copies the rendered share card from the Wrapped view button', async () => {
    const originalHtmlToImage = window.htmlToImage;
    const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const originalClipboardItem = window.ClipboardItem;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.toBlob = vi.fn(callback => {
      callback(new Blob(['png'], { type: 'image/png' }));
    });
    const write = vi.fn(async () => {});
    class MockClipboardItem {
      constructor(items) {
        this.items = items;
      }
    }
    window.htmlToImage = {
      toCanvas: vi.fn(async () => exportCanvas),
    };
    window.ClipboardItem = MockClipboardItem;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });

    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2024-01-05',
        album_name: 'First Album',
        artist_name: 'Artist One',
        rating: 90,
        notes: 'first note',
        release_year: 2024,
        image_path: null,
      }),
    ];

    try {
      renderWrappedView(container, {
        albums,
        year: 2024,
        yearsAvailable: [2024],
        onYearChange: vi.fn(),
      });

      const copyBtn = container.querySelector('[data-action="copy-share-card"]');
      const card = container.querySelector('.w-share-card');
      copyBtn.click();

      expect(copyBtn.disabled).toBe(true);
      expect(copyBtn.textContent.trim()).toBe('Copying...');

      await vi.waitFor(() => {
        expect(write).toHaveBeenCalledWith([expect.any(MockClipboardItem)]);
      });

      expect(window.htmlToImage.toCanvas).toHaveBeenCalledWith(card, expect.objectContaining({
        pixelRatio: 2,
        cacheBust: true,
      }));
      expect(exportCanvas.toBlob).toHaveBeenCalledOnce();
      expect(copyBtn.disabled).toBe(false);
      expect(copyBtn.querySelector('.lucide-images')).not.toBeNull();
      expect(copyBtn.textContent.trim()).toBe('Copy share card to clipboard');
      expect(container.querySelector('[data-share-export-status]')?.textContent).toBe('Copied share card to clipboard.');
    } finally {
      container._wrappedCleanup?.();
      window.htmlToImage = originalHtmlToImage;
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
      } else {
        delete navigator.clipboard;
      }
      window.ClipboardItem = originalClipboardItem;
    }
  });

  it('shows a non-blocking error when Wrapped share card export fails', async () => {
    const originalHtmlToImage = window.htmlToImage;
    window.htmlToImage = {
      toCanvas: vi.fn(async () => {
        throw new Error('Export failed.');
      }),
    };

    const container = document.createElement('div');
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: '2024-01-05',
        album_name: 'First Album',
        artist_name: 'Artist One',
        rating: 90,
        notes: 'first note',
        release_year: 2024,
        image_path: null,
      }),
    ];

    try {
      renderWrappedView(container, {
        albums,
        year: 2024,
        yearsAvailable: [2024],
        onYearChange: vi.fn(),
      });

      const exportBtn = container.querySelector('[data-action="export-share-card"]');
      exportBtn.click();

      const status = container.querySelector('[data-share-export-status]');
      await vi.waitFor(() => {
        expect(exportBtn.disabled).toBe(false);
        expect(status.textContent).toBe('Export failed.');
      });
      expect(exportBtn.textContent.trim()).toBe('Download share card');
      expect(status.classList.contains('w-export-status-error')).toBe(true);
    } finally {
      container._wrappedCleanup?.();
      window.htmlToImage = originalHtmlToImage;
    }
  });

  it('does not render export controls while Wrapped is locked', () => {
    const container = document.createElement('div');
    const currentYear = new Date().getFullYear();
    const albums = [
      makeAlbum({
        id: 1,
        listened_at: `${currentYear}-01-05`,
        album_name: 'Current Album',
        artist_name: 'Artist One',
        rating: 90,
        notes: 'current note',
        release_year: currentYear,
      }),
    ];

    renderWrappedView(container, {
      albums,
      year: currentYear,
      yearsAvailable: [currentYear],
      onYearChange: vi.fn(),
    });

    expect(container.querySelector('[data-action="export-share-card"]')).toBeNull();
    expect(container.querySelector('[data-action="copy-share-card"]')).toBeNull();

    container._wrappedCleanup?.();
  });
});
