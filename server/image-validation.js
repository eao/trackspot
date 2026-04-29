const IMAGE_TYPES = [
  {
    mimeType: 'image/jpeg',
    extension: '.jpg',
    matches(buffer) {
      return buffer.length >= 3
        && buffer[0] === 0xFF
        && buffer[1] === 0xD8
        && buffer[2] === 0xFF;
    },
  },
  {
    mimeType: 'image/png',
    extension: '.png',
    matches(buffer) {
      return buffer.length >= 8
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4E
        && buffer[3] === 0x47
        && buffer[4] === 0x0D
        && buffer[5] === 0x0A
        && buffer[6] === 0x1A
        && buffer[7] === 0x0A;
    },
  },
  {
    mimeType: 'image/webp',
    extension: '.webp',
    matches(buffer) {
      return buffer.length >= 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP';
    },
  },
  {
    mimeType: 'image/gif',
    extension: '.gif',
    matches(buffer) {
      if (buffer.length < 6) return false;
      const signature = buffer.toString('ascii', 0, 6);
      return signature === 'GIF87a' || signature === 'GIF89a';
    },
  },
];

function createImageValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  return IMAGE_TYPES.find(type => type.matches(buffer)) ?? null;
}

function normalizeAllowedTypes(allowedTypes) {
  if (allowedTypes instanceof Map) return new Set(allowedTypes.keys());
  if (allowedTypes instanceof Set) return allowedTypes;
  if (Array.isArray(allowedTypes)) return new Set(allowedTypes);
  return new Set();
}

function validateImageBuffer(buffer, allowedTypes, label = 'image') {
  const detected = detectImageType(buffer);
  const allowed = normalizeAllowedTypes(allowedTypes);

  if (!detected || !allowed.has(detected.mimeType)) {
    throw createImageValidationError(`Uploaded ${label} does not match a supported image format.`);
  }

  return detected;
}

module.exports = {
  detectImageType,
  validateImageBuffer,
};
