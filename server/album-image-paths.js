const path = require('path');
const fs = require('fs');

const MANAGED_ALBUM_IMAGE_PREFIX = 'images/';
const ALBUM_IMAGE_FILENAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i;
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function getAlbumImageFilename(imagePath) {
  return imagePath.slice(MANAGED_ALBUM_IMAGE_PREFIX.length);
}

function normalizeAlbumImagePath(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('Invalid album image path.');

  const normalized = value.trim();
  if (normalized.includes('\\') || !normalized.startsWith(MANAGED_ALBUM_IMAGE_PREFIX)) {
    throw new Error('Album image paths must stay under images/.');
  }

  const filename = getAlbumImageFilename(normalized);
  if (
    !ALBUM_IMAGE_FILENAME_RE.test(filename) ||
    filename !== path.posix.basename(filename)
  ) {
    throw new Error('Invalid album image filename.');
  }

  return `${MANAGED_ALBUM_IMAGE_PREFIX}${filename}`;
}

function resolveAlbumImagePath(imagePath, imagesDir) {
  if (!imagesDir) throw new Error('Album image root is required.');

  const normalized = normalizeAlbumImagePath(imagePath);
  if (!normalized) return null;

  const fullPath = path.resolve(imagesDir, getAlbumImageFilename(normalized));
  const imagesRoot = path.resolve(imagesDir);
  const relativePath = path.relative(imagesRoot, fullPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Album image path escapes the images directory.');
  }

  return {
    imagePath: normalized,
    filename: getAlbumImageFilename(normalized),
    fullPath,
  };
}

function requireExistingAlbumImagePath(imagePath, imagesDir) {
  const resolved = resolveAlbumImagePath(imagePath, imagesDir);
  if (!resolved || !fs.existsSync(resolved.fullPath)) {
    throw new Error('Album image file does not exist.');
  }
  return resolved.imagePath;
}

function normalizeImageExtension(ext = '.jpg') {
  const normalized = String(ext || '.jpg').toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.has(normalized) ? normalized : '.jpg';
}

function sanitizeAlbumImageNamePart(value, fallback = 'album') {
  const sanitized = String(value || fallback)
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[^A-Za-z0-9_]+/, '');
  return sanitized || fallback;
}

function buildManagedAlbumImageFilename(name, ext = '.jpg') {
  return `${sanitizeAlbumImageNamePart(name)}${normalizeImageExtension(ext)}`;
}

function buildManagedAlbumImagePath(name, ext = '.jpg') {
  return `${MANAGED_ALBUM_IMAGE_PREFIX}${buildManagedAlbumImageFilename(name, ext)}`;
}

function buildUniqueAlbumImagePath({ imagesDir, prefix = 'album', ext = '.jpg', maxAttempts = 20 } = {}) {
  if (!imagesDir) throw new Error('Album image root is required.');

  const safePrefix = sanitizeAlbumImageNamePart(prefix);
  const safeExt = normalizeImageExtension(ext);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${attempt ? `_${attempt}` : ''}`;
    const imagePath = `${MANAGED_ALBUM_IMAGE_PREFIX}${safePrefix}_${suffix}${safeExt}`;
    const resolved = resolveAlbumImagePath(imagePath, imagesDir);
    if (!fs.existsSync(resolved.fullPath)) return resolved;
  }

  throw new Error('Could not allocate a unique album image filename.');
}

module.exports = {
  ALBUM_IMAGE_FILENAME_RE,
  MANAGED_ALBUM_IMAGE_PREFIX,
  buildManagedAlbumImageFilename,
  buildManagedAlbumImagePath,
  buildUniqueAlbumImagePath,
  getAlbumImageFilename,
  normalizeAlbumImagePath,
  resolveAlbumImagePath,
  requireExistingAlbumImagePath,
};
