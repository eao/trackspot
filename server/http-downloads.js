const DEFAULT_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 15000;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = Object.freeze(new Set([301, 302, 303, 307, 308]));
const ALLOWED_SPOTIFY_IMAGE_HOSTS = Object.freeze(new Set([
  'i.scdn.co',
  'mosaic.scdn.co',
  'image-cdn-ak.spotifycdn.com',
  'image-cdn-fa.spotifycdn.com',
]));

function parseDownloadUrl(value) {
  try {
    return new URL(String(value ?? ''));
  } catch {
    return null;
  }
}

function isAllowedSpotifyImageUrl(value) {
  const url = parseDownloadUrl(value);
  if (!url || url.protocol !== 'https:') return false;
  return ALLOWED_SPOTIFY_IMAGE_HOSTS.has(url.hostname.toLowerCase());
}

function assertAllowedSpotifyImageUrl(value) {
  if (!isAllowedSpotifyImageUrl(value)) {
    throw new Error('Album art URL must be an HTTPS Spotify image URL.');
  }
}

function createTimeoutSignal(timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined;
  return AbortSignal.timeout(timeoutMs);
}

function parseMaxRedirects(value = DEFAULT_MAX_REDIRECTS) {
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MAX_REDIRECTS;
}

function resolveRedirectUrl(location, baseUrl) {
  if (!location) return null;
  try {
    return new URL(String(location), baseUrl).href;
  } catch {
    return null;
  }
}

async function fetchSpotifyImage(imageUrl, options = {}) {
  assertAllowedSpotifyImageUrl(imageUrl);
  const signal = options.signal ?? createTimeoutSignal(options.timeoutMs);
  const maxRedirects = parseMaxRedirects(options.maxRedirects);
  let currentUrl = String(imageUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal,
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      if (!response.ok) {
        throw new Error(`Failed to download album art: ${response.status}`);
      }
      return response;
    }

    if (redirectCount >= maxRedirects) {
      throw new Error('Failed to download album art: too many redirects.');
    }

    const nextUrl = resolveRedirectUrl(response.headers?.get?.('location'), currentUrl);
    if (!isAllowedSpotifyImageUrl(nextUrl)) {
      throw new Error('Album art redirect must remain on an HTTPS Spotify image URL.');
    }
    currentUrl = nextUrl;
  }

  throw new Error('Failed to download album art: too many redirects.');
}

function parseContentLength(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function responseToBufferWithLimit(response, options = {}) {
  const maxBytes = options.maxBytes || DEFAULT_MAX_DOWNLOAD_BYTES;
  const contentLength = parseContentLength(response.headers?.get?.('content-length'));
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error(`Downloaded file is too large. Maximum allowed size is ${maxBytes} bytes.`);
  }

  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`Downloaded file is too large. Maximum allowed size is ${maxBytes} bytes.`);
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`Downloaded file is too large. Maximum allowed size is ${maxBytes} bytes.`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }

  return Buffer.concat(chunks, totalBytes);
}

module.exports = {
  DEFAULT_DOWNLOAD_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_DOWNLOAD_BYTES,
  assertAllowedSpotifyImageUrl,
  fetchSpotifyImage,
  isAllowedSpotifyImageUrl,
  parseContentLength,
  responseToBufferWithLimit,
};
