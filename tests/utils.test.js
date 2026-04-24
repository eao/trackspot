import { describe, expect, it } from 'vitest';
import {
  formatAlbumMetaTooltip,
  formatDuration,
  getPreferredAlbumArtUrl,
  parseArtistInput,
  renderNotesHtml,
} from '../public/js/utils.js';

describe('frontend utils', () => {
  it('parses artist input with grouped names and plain names together', () => {
    expect(parseArtistInput('{{Crosby, Stills, Nash & Young}}, Neil Young')).toEqual([
      'Crosby, Stills, Nash & Young',
      'Neil Young',
    ]);
  });

  it('formats durations with hours when needed', () => {
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(125_000)).toBe('2:05');
  });

  it('formats album type and track count tooltip text', () => {
    expect(formatAlbumMetaTooltip({
      album_type: 'ALBUM',
      track_count: 20,
    })).toBe('Album・20 tracks');

    expect(formatAlbumMetaTooltip({
      album_type: 'EP',
      track_count: 1,
    })).toBe('EP・1 track');
  });

  it('renders markdown and bare links as safe anchors, converting Spotify links to desktop URIs', () => {
    const html = renderNotesHtml(
      'See [track](https://open.spotify.com/track/308uvg4mGNDn8GawwuaktM?si=abc) and https://open.spotify.com/album/3rHzUZDIsTv0zVyoNDN8YQ.'
    );

    expect(html).toContain('href="spotify:track:308uvg4mGNDn8GawwuaktM"');
    expect(html).toContain('href="spotify:album:3rHzUZDIsTv0zVyoNDN8YQ"');
    expect(html).toContain('href="spotify:album:3rHzUZDIsTv0zVyoNDN8YQ" class="notes-link">https://open.spotify.com/album/3rHzUZDIsTv0zVyoNDN8YQ</a>.');
    expect(html).not.toContain('<script>');
  });

  it('renders persisted spotify-uri markdown links', () => {
    const html = renderNotesHtml('Play [this album](spotify:album:3rHzUZDIsTv0zVyoNDN8YQ)');

    expect(html).toContain('href="spotify:album:3rHzUZDIsTv0zVyoNDN8YQ"');
    expect(html).toContain('>this album</a>');
  });

  it('prefers stored album art over Spotify CDN URLs', () => {
    expect(getPreferredAlbumArtUrl({
      image_path: 'images/local-cover.jpg',
      image_url_medium: 'https://i.scdn.co/image/medium',
    })).toBe('/images/local-cover.jpg');
  });

  it('falls back to Spotify CDN art when stored art is unavailable', () => {
    expect(getPreferredAlbumArtUrl({
      image_path: null,
      image_url_medium: 'https://i.scdn.co/image/medium',
    })).toBe('https://i.scdn.co/image/medium');
  });
});
