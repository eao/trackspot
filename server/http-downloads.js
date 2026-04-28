const DEFAULT_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

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
  DEFAULT_MAX_DOWNLOAD_BYTES,
  parseContentLength,
  responseToBufferWithLimit,
};
