import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  normalizeSpotifyNoteLinks,
  parseSpotifyResource,
  splitTrailingUrlPunctuation,
} = require('../server/spotify-note-links.js');

describe('spotify note link helpers', () => {
  it('parses supported Spotify web URLs and desktop URIs', () => {
    expect(parseSpotifyResource('https://open.spotify.com/track/308uvg4mGNDn8GawwuaktM?si=abc')).toEqual({
      type: 'track',
      id: '308uvg4mGNDn8GawwuaktM',
      uri: 'spotify:track:308uvg4mGNDn8GawwuaktM',
      webUrl: 'https://open.spotify.com/track/308uvg4mGNDn8GawwuaktM',
    });

    expect(parseSpotifyResource('spotify:playlist:1N2q2PpfXKlGhtQxBRlvB9')).toEqual({
      type: 'playlist',
      id: '1N2q2PpfXKlGhtQxBRlvB9',
      uri: 'spotify:playlist:1N2q2PpfXKlGhtQxBRlvB9',
      webUrl: 'https://open.spotify.com/playlist/1N2q2PpfXKlGhtQxBRlvB9',
    });
  });

  it('keeps trailing punctuation outside bare-link replacements', () => {
    expect(splitTrailingUrlPunctuation('https://open.spotify.com/album/abc?si=1.)')).toEqual({
      candidate: 'https://open.spotify.com/album/abc?si=1',
      trailing: '.)',
    });
  });

  it('rewrites bare links with oEmbed titles and keeps markdown labels', async () => {
    const fetchImpl = vi.fn(async url => ({
      ok: true,
      json: async () => ({
        title: decodeURIComponent(String(url)).includes('/track/')
          ? 'Track Name'
          : 'Ignored Title',
      }),
    }));

    const notes = await normalizeSpotifyNoteLinks(
      'Track https://open.spotify.com/track/308uvg4mGNDn8GawwuaktM?si=abc, artist [Custom](https://open.spotify.com/artist/0Ve5w7gefOsFmwW6aU3eSW?si=xyz)',
      { fetchImpl },
    );

    expect(notes).toBe('Track [Track Name](spotify:track:308uvg4mGNDn8GawwuaktM), artist [Custom](spotify:artist:0Ve5w7gefOsFmwW6aU3eSW)');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('leaves unsupported or failed bare lookups unchanged', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));

    const notes = await normalizeSpotifyNoteLinks(
      'Playlist https://open.spotify.com/playlist/1N2q2PpfXKlGhtQxBRlvB9?si=abc',
      { fetchImpl },
    );

    expect(notes).toBe('Playlist https://open.spotify.com/playlist/1N2q2PpfXKlGhtQxBRlvB9?si=abc');
  });
});
