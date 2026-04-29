import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  fetchSpotifyImage,
  isAllowedSpotifyImageUrl,
  responseToBufferWithLimit,
} = require('../server/http-downloads.js');

function makeHeaders(contentLength = null) {
  return {
    get: vi.fn(name => (name.toLowerCase() === 'content-length' ? contentLength : null)),
  };
}

function makeArrayBuffer(bytes) {
  return Uint8Array.from(bytes).buffer;
}

describe('HTTP download size limits', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('only allows HTTPS Spotify image CDN URLs for album art fetches', async () => {
    expect(isAllowedSpotifyImageUrl('https://i.scdn.co/image/cover')).toBe(true);
    expect(isAllowedSpotifyImageUrl('https://image-cdn-ak.spotifycdn.com/image/cover')).toBe(true);
    expect(isAllowedSpotifyImageUrl('http://i.scdn.co/image/cover')).toBe(false);
    expect(isAllowedSpotifyImageUrl('https://127.0.0.1/image/cover')).toBe(false);
    expect(isAllowedSpotifyImageUrl('https://example.test/image/cover')).toBe(false);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(fetchSpotifyImage('https://127.0.0.1/image/cover'))
      .rejects.toThrow(/Spotify image URL/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes a timeout signal to allowed album art fetches', async () => {
    const response = { ok: true };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    await expect(fetchSpotifyImage('https://i.scdn.co/image/cover')).resolves.toBe(response);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://i.scdn.co/image/cover',
      expect.objectContaining({ signal: expect.any(Object) }),
    );
  });

  it('rejects oversized content-length before reading the response body', async () => {
    const response = {
      headers: makeHeaders('6'),
      arrayBuffer: vi.fn(async () => makeArrayBuffer([1, 2, 3])),
    };

    await expect(responseToBufferWithLimit(response, { maxBytes: 5 }))
      .rejects.toThrow(/too large/i);
    expect(response.arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects streamed responses that exceed the limit and cancels the reader', async () => {
    const cancel = vi.fn(async () => {});
    const releaseLock = vi.fn();
    const reads = [
      { done: false, value: Uint8Array.from([1, 2, 3]) },
      { done: false, value: Uint8Array.from([4, 5, 6]) },
    ];
    const reader = {
      read: vi.fn(async () => reads.shift() ?? { done: true }),
      cancel,
      releaseLock,
    };
    const response = {
      headers: makeHeaders(null),
      body: { getReader: () => reader },
    };

    await expect(responseToBufferWithLimit(response, { maxBytes: 5 }))
      .rejects.toThrow(/too large/i);
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('enforces the limit on arrayBuffer fallback responses', async () => {
    const response = {
      headers: makeHeaders(null),
      body: null,
      arrayBuffer: vi.fn(async () => makeArrayBuffer([1, 2, 3, 4, 5, 6])),
    };

    await expect(responseToBufferWithLimit(response, { maxBytes: 5 }))
      .rejects.toThrow(/too large/i);
    expect(response.arrayBuffer).toHaveBeenCalledOnce();
  });

  it('accepts payloads that are exactly at the byte limit', async () => {
    const response = {
      headers: makeHeaders('5'),
      body: null,
      arrayBuffer: vi.fn(async () => makeArrayBuffer([1, 2, 3, 4, 5])),
    };

    const buffer = await responseToBufferWithLimit(response, { maxBytes: 5 });

    expect([...buffer]).toEqual([1, 2, 3, 4, 5]);
  });
});
