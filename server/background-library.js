const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');
const { APP_ROOT, getConfiguredPath } = require('./config');

const PUBLIC_PRESET_BACKGROUNDS_DIR = path.join(APP_ROOT, 'public', 'background-presets');
const PUBLIC_PRESET_BACKGROUND_THUMBS_DIR = path.join(APP_ROOT, 'public', 'background-presets-thumbs');
const SECONDARY_PUBLIC_PRESET_BACKGROUNDS_DIR = path.join(APP_ROOT, 'public', 'background-presets-secondary');
const SECONDARY_PUBLIC_PRESET_BACKGROUND_THUMBS_DIR = path.join(APP_ROOT, 'public', 'background-presets-secondary-thumbs');

const USER_BACKGROUNDS_DIR = getConfiguredPath('USER_BACKGROUNDS_DIR', path.join(DATA_DIR, 'backgrounds-user'));
const USER_BACKGROUND_THUMBS_DIR = getConfiguredPath('USER_BACKGROUND_THUMBS_DIR', path.join(DATA_DIR, 'backgrounds-user-thumbs'));
const PRESET_BACKGROUNDS_DIR = getConfiguredPath('PRESET_BACKGROUNDS_DIR', PUBLIC_PRESET_BACKGROUNDS_DIR);
const PRESET_BACKGROUND_THUMBS_DIR = getConfiguredPath('PRESET_BACKGROUND_THUMBS_DIR', path.join(DATA_DIR, 'background-presets-thumbs'));
const SECONDARY_USER_BACKGROUNDS_DIR = getConfiguredPath('SECONDARY_USER_BACKGROUNDS_DIR', path.join(DATA_DIR, 'backgrounds-user-secondary'));
const SECONDARY_USER_BACKGROUND_THUMBS_DIR = getConfiguredPath('SECONDARY_USER_BACKGROUND_THUMBS_DIR', path.join(DATA_DIR, 'backgrounds-user-secondary-thumbs'));
const SECONDARY_PRESET_BACKGROUNDS_DIR = getConfiguredPath('SECONDARY_PRESET_BACKGROUNDS_DIR', SECONDARY_PUBLIC_PRESET_BACKGROUNDS_DIR);
const SECONDARY_PRESET_BACKGROUND_THUMBS_DIR = getConfiguredPath('SECONDARY_PRESET_BACKGROUND_THUMBS_DIR', path.join(DATA_DIR, 'background-presets-secondary-thumbs'));

const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.gif',
  '.jpeg',
  ...ALLOWED_IMAGE_TYPES.values(),
]);

[
  USER_BACKGROUNDS_DIR,
  USER_BACKGROUND_THUMBS_DIR,
  PRESET_BACKGROUND_THUMBS_DIR,
  SECONDARY_USER_BACKGROUNDS_DIR,
  SECONDARY_USER_BACKGROUND_THUMBS_DIR,
  SECONDARY_PRESET_BACKGROUND_THUMBS_DIR,
].forEach(directoryPath => {
  fs.mkdirSync(directoryPath, { recursive: true });
});

const BACKGROUND_SLOT_CONFIGS = {
  primary: {
    key: 'primary',
    userDir: USER_BACKGROUNDS_DIR,
    userThumbDir: USER_BACKGROUND_THUMBS_DIR,
    presetDir: PRESET_BACKGROUNDS_DIR,
    presetThumbDir: PRESET_BACKGROUND_THUMBS_DIR,
    bundledPresetThumbDir: PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
    userBaseUrl: '/backgrounds/user',
    userThumbBaseUrl: '/backgrounds/user-thumbnails',
    presetBaseUrl: '/backgrounds/presets',
    presetThumbBaseUrl: '/backgrounds/preset-thumbnails',
  },
  secondary: {
    key: 'secondary',
    userDir: SECONDARY_USER_BACKGROUNDS_DIR,
    userThumbDir: SECONDARY_USER_BACKGROUND_THUMBS_DIR,
    presetDir: SECONDARY_PRESET_BACKGROUNDS_DIR,
    presetThumbDir: SECONDARY_PRESET_BACKGROUND_THUMBS_DIR,
    bundledPresetThumbDir: SECONDARY_PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
    userBaseUrl: '/backgrounds/secondary/user',
    userThumbBaseUrl: '/backgrounds/secondary/user-thumbnails',
    presetBaseUrl: '/backgrounds/secondary/presets',
    presetThumbBaseUrl: '/backgrounds/secondary/preset-thumbnails',
  },
};

function sanitizeFileNamePart(value) {
  return String(value)
    // eslint-disable-next-line no-control-regex -- Windows file names cannot contain ASCII control characters.
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeFileLabel(fileName) {
  const parsed = path.parse(fileName);
  return parsed.name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fileName;
}

function buildUserBackgroundName(originalName, mimeType) {
  const parsed = path.parse(originalName || 'background');
  const ext = ALLOWED_IMAGE_TYPES.get(mimeType) || parsed.ext || '.jpg';
  const safeBase = sanitizeFileNamePart(parsed.name || 'Background') || 'Background';
  const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${uniquePrefix}__${safeBase}${ext.toLowerCase()}`;
}

function ensureSafeStoredName(storedName) {
  const safeName = typeof storedName === 'string' ? storedName.trim() : '';
  if (
    !safeName ||
    safeName === '.' ||
    safeName === '..' ||
    safeName.includes('/') ||
    safeName.includes('\\') ||
    /^[A-Za-z]:/.test(safeName) ||
    path.basename(safeName) !== safeName ||
    path.win32.basename(safeName) !== safeName ||
    !ALLOWED_IMAGE_EXTENSIONS.has(path.extname(safeName).toLowerCase())
  ) {
    return null;
  }
  return safeName;
}

function buildThumbnailFileName(fileName) {
  return `${path.parse(fileName).name}.jpg`;
}

function compareImageRecords(left, right) {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  }) || left.fileName.localeCompare(right.fileName, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function listStoredImages(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];

  return fs.readdirSync(directoryPath, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .filter(entry => /\.(jpe?g|png|webp|gif)$/i.test(entry.name))
    .map(entry => entry.name);
}

function buildImageRecord({ kind, fileName, baseUrl, thumbnailDir, fallbackThumbnailDir, thumbnailBaseUrl, canDelete }) {
  const nameParts = fileName.split('__');
  const labelSource = kind === 'user' && nameParts.length > 1
    ? nameParts.slice(1).join('__')
    : fileName;
  const thumbnailFileName = buildThumbnailFileName(fileName);
  const thumbnailPath = thumbnailDir ? path.join(thumbnailDir, thumbnailFileName) : null;
  const fallbackThumbnailPath = fallbackThumbnailDir ? path.join(fallbackThumbnailDir, thumbnailFileName) : null;
  const hasThumbnail = (thumbnailPath && fs.existsSync(thumbnailPath))
    || (fallbackThumbnailPath && fs.existsSync(fallbackThumbnailPath));
  const thumbnailUrl = hasThumbnail
    ? `${thumbnailBaseUrl}/${encodeURIComponent(thumbnailFileName)}`
    : null;

  return {
    id: fileName,
    kind,
    name: humanizeFileLabel(labelSource),
    fileName,
    url: `${baseUrl}/${encodeURIComponent(fileName)}`,
    thumbnailUrl,
    canDelete,
  };
}

function listImageRecords(directoryPath, options) {
  return listStoredImages(directoryPath)
    .map(fileName => buildImageRecord({ ...options, fileName }))
    .sort(compareImageRecords);
}

function getBackgroundSlotConfig(slotKey = 'primary') {
  return BACKGROUND_SLOT_CONFIGS[slotKey] ?? BACKGROUND_SLOT_CONFIGS.primary;
}

function syncPresetThumbnailFiles(presetDir = PRESET_BACKGROUNDS_DIR, thumbnailDir = PRESET_BACKGROUND_THUMBS_DIR) {
  fs.mkdirSync(thumbnailDir, { recursive: true });

  const presetFileNames = listStoredImages(presetDir);
  const expectedThumbnails = new Map(
    presetFileNames.map(fileName => [buildThumbnailFileName(fileName), fileName]),
  );

  fs.readdirSync(thumbnailDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .filter(entry => /\.jpe?g$/i.test(entry.name))
    .forEach(entry => {
      const sourceFileName = expectedThumbnails.get(entry.name);
      const thumbnailPath = path.join(thumbnailDir, entry.name);

      if (!sourceFileName) {
        fs.unlinkSync(thumbnailPath);
        return;
      }

      const sourcePath = path.join(presetDir, sourceFileName);
      const sourceStats = fs.statSync(sourcePath);
      const thumbnailStats = fs.statSync(thumbnailPath);

      if (thumbnailStats.mtimeMs < sourceStats.mtimeMs) {
        fs.unlinkSync(thumbnailPath);
      }
    });
}

function listBackgroundLibrary(slotKey = 'primary') {
  const slotConfig = getBackgroundSlotConfig(slotKey);
  syncPresetThumbnailFiles(slotConfig.presetDir, slotConfig.presetThumbDir);

  return {
    userImages: listImageRecords(slotConfig.userDir, {
      kind: 'user',
      baseUrl: slotConfig.userBaseUrl,
      thumbnailDir: slotConfig.userThumbDir,
      thumbnailBaseUrl: slotConfig.userThumbBaseUrl,
      canDelete: true,
    }),
    presetImages: listImageRecords(slotConfig.presetDir, {
      kind: 'preset',
      baseUrl: slotConfig.presetBaseUrl,
      thumbnailDir: slotConfig.presetThumbDir,
      fallbackThumbnailDir: slotConfig.bundledPresetThumbDir,
      thumbnailBaseUrl: slotConfig.presetThumbBaseUrl,
      canDelete: false,
    }),
  };
}

function getBackgroundImageRecord(slotKey = 'primary', selection = null) {
  const kind = selection?.kind === 'preset' ? 'preset' : selection?.kind === 'user' ? 'user' : null;
  const safeName = ensureSafeStoredName(selection?.id || selection?.fileName);
  if (!kind || !safeName) return null;

  const slotConfig = getBackgroundSlotConfig(slotKey);
  const baseUrl = kind === 'preset' ? slotConfig.presetBaseUrl : slotConfig.userBaseUrl;
  const thumbnailDir = kind === 'preset' ? slotConfig.presetThumbDir : slotConfig.userThumbDir;
  const fallbackThumbnailDir = kind === 'preset' ? slotConfig.bundledPresetThumbDir : null;
  const thumbnailBaseUrl = kind === 'preset' ? slotConfig.presetThumbBaseUrl : slotConfig.userThumbBaseUrl;
  const directoryPath = kind === 'preset' ? slotConfig.presetDir : slotConfig.userDir;
  const targetPath = path.join(directoryPath, safeName);
  if (!fs.existsSync(targetPath)) return null;

  return buildImageRecord({
    kind,
    fileName: safeName,
    baseUrl,
    thumbnailDir,
    fallbackThumbnailDir,
    thumbnailBaseUrl,
    canDelete: kind === 'user',
  });
}

module.exports = {
  PUBLIC_PRESET_BACKGROUNDS_DIR,
  PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
  USER_BACKGROUNDS_DIR,
  USER_BACKGROUND_THUMBS_DIR,
  PRESET_BACKGROUNDS_DIR,
  PRESET_BACKGROUND_THUMBS_DIR,
  SECONDARY_PUBLIC_PRESET_BACKGROUNDS_DIR,
  SECONDARY_PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
  SECONDARY_USER_BACKGROUNDS_DIR,
  SECONDARY_USER_BACKGROUND_THUMBS_DIR,
  SECONDARY_PRESET_BACKGROUNDS_DIR,
  SECONDARY_PRESET_BACKGROUND_THUMBS_DIR,
  BACKGROUND_SLOT_CONFIGS,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  sanitizeFileNamePart,
  humanizeFileLabel,
  buildUserBackgroundName,
  ensureSafeStoredName,
  buildThumbnailFileName,
  compareImageRecords,
  listStoredImages,
  buildImageRecord,
  listImageRecords,
  getBackgroundSlotConfig,
  syncPresetThumbnailFiles,
  listBackgroundLibrary,
  getBackgroundImageRecord,
};
