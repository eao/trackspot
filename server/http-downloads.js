const DEFAULT_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 15000;
const ALLOWED_SPOTIFY_IMAGE_HOSTS = Object.freeze(new Set([
  'i.scdn.co',
  'mosaic.scdn.co',
  'image-cdn-ak.spotifycdn.com',
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

async function fetchSpotifyImage(imageUrl, options = {}) {
  assertAllowedSpotifyImageUrl(imageUrl);
  const response = await fetch(imageUrl, {
    signal: options.signal ?? createTimeoutSignal(options.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Failed to download album art: ${response.status}`);
  }
  return response;
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
  DEFAULT_MAX_DOWNLOAD_BYTES,
  assertAllowedSpotifyImageUrl,
  fetchSpotifyImage,
  isAllowedSpotifyImageUrl,
  parseContentLength,
  responseToBufferWithLimit,
};
