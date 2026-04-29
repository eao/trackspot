const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');
const { getConfiguredPath } = require('./config');
const { atomicWriteJsonFileSync } = require('./atomic-json');
const { loadColorSchemePresets } = require('./color-scheme-presets');
const {
  ALLOWED_IMAGE_TYPES,
  ensureSafeStoredName,
  sanitizeFileNamePart,
  buildThumbnailFileName,
  getBackgroundImageRecord,
} = require('./background-library');

const OPACITY_PRESETS_DIR = getConfiguredPath('OPACITY_PRESETS_DIR', path.join(DATA_DIR, 'opacity-presets'));
const THEMES_DIR = getConfiguredPath('THEMES_DIR', path.join(DATA_DIR, 'themes'));
const THEME_PREVIEW_IMAGES_DIR = getConfiguredPath('THEME_PREVIEW_IMAGES_DIR', path.join(DATA_DIR, 'theme-preview-images'));
const THEME_PREVIEW_IMAGES_THUMBS_DIR = getConfiguredPath('THEME_PREVIEW_IMAGES_THUMBS_DIR', path.join(DATA_DIR, 'theme-preview-images-thumbs'));
const SEED_DATA_DIR = path.join(__dirname, 'seed-data');
const SEED_OPACITY_PRESETS_DIR = path.join(SEED_DATA_DIR, 'opacity-presets');
const SEED_THEMES_DIR = path.join(SEED_DATA_DIR, 'themes');
const SEED_THEME_PREVIEW_IMAGES_DIR = path.join(SEED_DATA_DIR, 'theme-preview-images');
const SEED_THEME_PREVIEW_IMAGES_THUMBS_DIR = path.join(SEED_DATA_DIR, 'theme-preview-images-thumbs');

[
  OPACITY_PRESETS_DIR,
  THEMES_DIR,
  THEME_PREVIEW_IMAGES_DIR,
  THEME_PREVIEW_IMAGES_THUMBS_DIR,
].forEach(directoryPath => {
  fs.mkdirSync(directoryPath, { recursive: true });
});

const DEFAULT_BACKGROUND_DISPLAY = {
  positionX: 'center',
  positionY: 'center',
  fill: 'cover',
  customScale: 1,
};

const DEFAULT_SECONDARY_BACKGROUND_DISPLAY = {
  positionX: 'right',
  positionY: 'top',
  fill: 'original-size',
  customScale: 1,
};

const MIN_CUSTOM_BACKGROUND_SCALE = 0.05;
const MAX_CUSTOM_BACKGROUND_SCALE = 5;
const CUSTOM_BACKGROUND_SCALE_PRECISION = 5;

const PERSONALIZATION_OPACITY_KEYS = [
  'backgroundImage',
  'backgroundImageBlur',
  'secondaryBackgroundImage',
  'secondaryBackgroundImageBlur',
  'header',
  'quickActionsToolbar',
  'sidebar',
  'rowHeaderBackground',
  'row',
  'rowArt',
  'rowText',
  'card',
  'cardArt',
  'cardText',
  'styleBackgroundGradient',
];

const OPACITY_PRESET_KEYS = PERSONALIZATION_OPACITY_KEYS.filter(key => ![
  'backgroundImage',
  'backgroundImageBlur',
  'secondaryBackgroundImage',
  'secondaryBackgroundImageBlur',
].includes(key));

const DEFAULT_OPACITY = {
  backgroundImage: 45,
  backgroundImageBlur: 0,
  secondaryBackgroundImage: 100,
  secondaryBackgroundImageBlur: 0,
  header: 100,
  quickActionsToolbar: 100,
  sidebar: 100,
  rowHeaderBackground: 100,
  row: 100,
  rowArt: 100,
  rowText: 100,
  card: 100,
  cardArt: 100,
  cardText: 100,
  styleBackgroundGradient: 0,
};

const SAFE_PERSONALIZATION_ID_RE = /^[A-Za-z0-9_-]+$/;

function createStoreError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw createStoreError(500, `Could not parse ${label}: ${error.message}`);
  }
}

function writeJsonFile(filePath, value) {
  atomicWriteJsonFileSync(filePath, value);
}

function isSafePersonalizationId(value) {
  return typeof value === 'string' && SAFE_PERSONALIZATION_ID_RE.test(value.trim());
}

function normalizePersonalizationId(value, label = 'id') {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!SAFE_PERSONALIZATION_ID_RE.test(id)) {
    throw createStoreError(400, `Invalid ${label}.`);
  }
  return id;
}

function resolveInsideDirectory(directoryPath, fileName) {
  const resolvedDir = path.resolve(directoryPath);
  const resolvedPath = path.resolve(resolvedDir, fileName);
  const relativePath = path.relative(resolvedDir, resolvedPath);

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw createStoreError(400, 'Unsafe file path.');
  }

  return resolvedPath;
}

function ensureSafeJsonFileName(fileName) {
  const normalized = typeof fileName === 'string' ? fileName.trim() : '';
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    /^[A-Za-z]:/.test(normalized) ||
    path.basename(normalized) !== normalized ||
    path.win32.basename(normalized) !== normalized ||
    path.extname(normalized).toLowerCase() !== '.json'
  ) {
    return null;
  }

  return normalized;
}

function listJsonFileNames(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];

  return fs.readdirSync(directoryPath, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .filter(entry => path.extname(entry.name).toLowerCase() === '.json')
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: 'base',
    }));
}

function normalizeNameForUniqueness(value) {
  return String(value || '').trim().toLowerCase();
}

function createStableId(prefix = 'preset') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getRawRecordId(raw, fileName) {
  return typeof raw?.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : path.parse(fileName).name;
}

function getSafeFallbackIdFromFileName(fileName, prefix) {
  const baseName = path.parse(fileName).name.trim();
  if (isSafePersonalizationId(baseName)) return baseName;

  const safeBase = baseName
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safeBase ? `${prefix}-${safeBase}` : prefix;
}

function buildStoredPreviewImageName(originalName, mimeType) {
  const parsed = path.parse(originalName || 'theme-preview');
  const ext = ALLOWED_IMAGE_TYPES.get(mimeType) || parsed.ext || '.jpg';
  const safeBase = sanitizeFileNamePart(parsed.name || 'Theme Preview') || 'Theme Preview';
  const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${uniquePrefix}__${safeBase}${ext.toLowerCase()}`;
}

function clampOpacityValue(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) return 100;
  return Math.min(100, Math.max(0, parsed));
}

function normalizeOpacityValues(opacity) {
  return OPACITY_PRESET_KEYS.reduce((result, key) => {
    result[key] = clampOpacityValue(opacity?.[key] ?? DEFAULT_OPACITY[key]);
    return result;
  }, {});
}

function compareIncludedFirstByName(left, right) {
  const leftIncluded = !!left?.includedWithApp;
  const rightIncluded = !!right?.includedWithApp;
  if (leftIncluded !== rightIncluded) return leftIncluded ? 1 : -1;

  return (left?.name || '').localeCompare(right?.name || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  }) || (left?.id || '').localeCompare(right?.id || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function normalizeBackgroundDisplay(display, defaults) {
  const positionX = ['left', 'center', 'right'].includes(display?.positionX) ? display.positionX : defaults.positionX;
  const positionY = ['top', 'center', 'bottom'].includes(display?.positionY) ? display.positionY : defaults.positionY;
  const fill = ['cover', 'fit-height', 'fit-width', 'original-size', 'custom-scale'].includes(display?.fill)
    ? display.fill
    : defaults.fill;
  const parsedScale = typeof display?.customScale === 'number'
    ? display.customScale
    : Number.parseFloat(String(display?.customScale ?? defaults.customScale));
  const customScale = Number.isFinite(parsedScale)
    ? Math.min(MAX_CUSTOM_BACKGROUND_SCALE, Math.max(MIN_CUSTOM_BACKGROUND_SCALE, Number(parsedScale.toFixed(CUSTOM_BACKGROUND_SCALE_PRECISION))))
    : defaults.customScale;

  return {
    positionX,
    positionY,
    fill,
    customScale,
  };
}

function normalizeBackgroundReference(selection) {
  const kind = selection?.kind === 'preset' ? 'preset' : selection?.kind === 'user' ? 'user' : null;
  const safeId = ensureSafeStoredName(selection?.id || selection?.fileName);
  if (!kind || !safeId) return null;

  return {
    kind,
    id: safeId,
  };
}

function getOpacityPresetFilePath(presetId) {
  const safeId = normalizePersonalizationId(presetId, 'opacity preset id');
  return resolveInsideDirectory(OPACITY_PRESETS_DIR, `${safeId}.json`);
}

function getThemeFilePath(themeId) {
  const safeId = normalizePersonalizationId(themeId, 'theme id');
  return resolveInsideDirectory(THEMES_DIR, `${safeId}.json`);
}

function getOpacityPresetWritePath(preset) {
  const sourceFileName = ensureSafeJsonFileName(preset?.sourceFileName);
  if (sourceFileName) return resolveInsideDirectory(OPACITY_PRESETS_DIR, sourceFileName);
  return getOpacityPresetFilePath(preset?.id);
}

function removeOpacityPresetFile(preset) {
  const filePath = getOpacityPresetWritePath(preset);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function attachOpacityPresetSourceFileName(preset, fileName) {
  Object.defineProperty(preset, 'sourceFileName', {
    value: fileName,
    enumerable: false,
    configurable: true,
  });
  return preset;
}

function buildInvalidUserOpacityPresetRecord(rawPreset, fileName, reason) {
  const rawObject = rawPreset && typeof rawPreset === 'object' && !Array.isArray(rawPreset)
    ? rawPreset
    : {};
  const fallbackName = path.parse(fileName).name;
  const rawId = getRawRecordId(rawObject, fileName);
  const id = isSafePersonalizationId(rawId)
    ? rawId.trim()
    : getSafeFallbackIdFromFileName(fileName, 'invalid-opacity');
  const name = typeof rawObject.name === 'string' && rawObject.name.trim()
    ? rawObject.name.trim()
    : fallbackName;

  return attachOpacityPresetSourceFileName({
    id,
    name,
    includedWithApp: false,
    canEdit: false,
    canDelete: true,
    invalid: true,
    invalidReason: reason,
    opacity: normalizeOpacityValues(rawObject.opacity),
  }, fileName);
}

function loadOpacityPresetRecordsFromDirectory(directoryPath, options = {}) {
  return listJsonFileNames(directoryPath)
    .map(fileName => {
      const filePath = path.join(directoryPath, fileName);
      let raw;
      try {
        raw = readJsonFile(filePath, `opacity preset "${fileName}"`);
      } catch (error) {
        if (options.forceIncludedWithApp) {
          throw error;
        }

        const fallbackId = path.parse(fileName).name;
        if (options.ignoredIds?.has(fallbackId)) return null;
        return buildInvalidUserOpacityPresetRecord(null, fileName, error.message);
      }

      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        const reason = `Opacity preset file "${fileName}" must contain a JSON object.`;
        if (options.forceIncludedWithApp) {
          throw createStoreError(500, reason);
        }
        return buildInvalidUserOpacityPresetRecord(raw, fileName, reason);
      }

      const rawId = getRawRecordId(raw, fileName);
      if (!isSafePersonalizationId(rawId)) {
        if (options.forceIncludedWithApp) {
          throw createStoreError(500, `Opacity preset file "${fileName}" has an invalid id.`);
        }
        const fallbackId = getSafeFallbackIdFromFileName(fileName, 'invalid-opacity');
        if (options.ignoredIds?.has(fallbackId)) return null;
        return buildInvalidUserOpacityPresetRecord(raw, fileName, `Opacity preset file "${fileName}" has an invalid id.`);
      }
      const id = rawId.trim();
      if (options.ignoredIds?.has(id)) return null;

      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        const reason = `Opacity preset file "${fileName}" is missing a non-empty "name".`;
        if (options.forceIncludedWithApp) {
          throw createStoreError(500, reason);
        }
        return buildInvalidUserOpacityPresetRecord(raw, fileName, reason);
      }

      return attachOpacityPresetSourceFileName({
        id,
        name,
        includedWithApp: !!options.forceIncludedWithApp,
        canEdit: !options.forceIncludedWithApp,
        canDelete: !options.forceIncludedWithApp,
        invalid: false,
        invalidReason: '',
        opacity: normalizeOpacityValues(raw.opacity),
      }, fileName);
    })
    .filter(Boolean);
}

function loadOpacityPresetRecords() {
  const seedRecords = loadOpacityPresetRecordsFromDirectory(SEED_OPACITY_PRESETS_DIR, { forceIncludedWithApp: true });
  const seedIds = new Set(seedRecords.map(preset => preset.id));
  const userRecords = loadOpacityPresetRecordsFromDirectory(OPACITY_PRESETS_DIR, { ignoredIds: seedIds });

  return [...seedRecords, ...userRecords].sort(compareIncludedFirstByName);
}

function findOpacityPresetById(presetId) {
  return loadOpacityPresetRecords().find(preset => preset.id === presetId) ?? null;
}

function ensureUniquePresetName(name, records, currentId = null, label = 'preset') {
  const normalized = normalizeNameForUniqueness(name);
  const duplicate = records.find(record => normalizeNameForUniqueness(record.name) === normalized && record.id !== currentId);
  if (duplicate) {
    throw createStoreError(409, `Another ${label} is already named "${duplicate.name}".`, {
      code: 'DUPLICATE_NAME',
      duplicateId: duplicate.id,
    });
  }
}

function serializeOpacityPresetForResponse(preset) {
  const includedWithApp = !!preset.includedWithApp;
  const invalid = !!preset.invalid;
  return {
    id: preset.id,
    name: preset.name,
    includedWithApp,
    canEdit: preset.canEdit ?? (!includedWithApp && !invalid),
    canDelete: preset.canDelete ?? !includedWithApp,
    invalid,
    invalidReason: typeof preset.invalidReason === 'string' ? preset.invalidReason : '',
    opacity: { ...preset.opacity },
  };
}

function listOpacityPresets() {
  return loadOpacityPresetRecords().map(serializeOpacityPresetForResponse);
}

function createOpacityPreset(input) {
  const records = loadOpacityPresetRecords();
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name) {
    throw createStoreError(400, 'Opacity preset name is required.');
  }

  ensureUniquePresetName(name, records, null, 'opacity preset');

  const preset = {
    id: createStableId('opacity'),
    name,
    includedWithApp: false,
    opacity: normalizeOpacityValues(input?.opacity),
  };

  writeJsonFile(getOpacityPresetFilePath(preset.id), preset);
  return serializeOpacityPresetForResponse(preset);
}

function updateOpacityPreset(presetId, input) {
  const existing = findOpacityPresetById(presetId);
  if (!existing) {
    throw createStoreError(404, 'Opacity preset not found.');
  }
  if (existing.includedWithApp) {
    throw createStoreError(403, 'Included-with-app opacity presets cannot be edited.');
  }
  if (existing.invalid) {
    throw createStoreError(409, 'Invalid opacity presets cannot be edited.');
  }

  const records = loadOpacityPresetRecords();
  const name = typeof input?.name === 'string' ? input.name.trim() : existing.name;
  if (!name) {
    throw createStoreError(400, 'Opacity preset name is required.');
  }

  ensureUniquePresetName(name, records, existing.id, 'opacity preset');

  const updated = {
    id: existing.id,
    name,
    includedWithApp: false,
    opacity: normalizeOpacityValues(input?.opacity ?? existing.opacity),
  };

  writeJsonFile(getOpacityPresetWritePath(existing), updated);
  return serializeOpacityPresetForResponse(updated);
}

function getThemeSourceFileName(theme) {
  const sourceFileName = ensureSafeJsonFileName(theme?.sourceFileName);
  if (sourceFileName) return sourceFileName;
  if (isSafePersonalizationId(theme?.id)) return `${theme.id.trim()}.json`;
  return null;
}

function isPreviewReferencedByAnotherUserTheme(previewFileName, excludedSourceFileName = null) {
  const safePreviewFileName = ensureSafeStoredName(previewFileName);
  if (!safePreviewFileName) return false;

  return listJsonFileNames(THEMES_DIR).some(fileName => {
    if (excludedSourceFileName && fileName === excludedSourceFileName) return false;

    try {
      const rawTheme = readJsonFile(path.join(THEMES_DIR, fileName), `theme "${fileName}"`);
      if (!rawTheme || typeof rawTheme !== 'object' || Array.isArray(rawTheme)) return false;
      return ensureSafeStoredName(rawTheme.previewImage?.fileName) === safePreviewFileName;
    } catch {
      return false;
    }
  });
}

function deleteThemePreviewAssets(theme, options = {}) {
  const previewFileName = ensureSafeStoredName(theme?.previewImage?.fileName);
  const thumbnailFileName = previewFileName ? buildThumbnailFileName(previewFileName) : null;
  const excludedSourceFileName = options.excludeSourceFileName
    ?? getThemeSourceFileName(options.excludeTheme ?? theme);
  const warnings = options.cleanupWarnings ?? null;

  if (isPreviewReferencedByAnotherUserTheme(previewFileName, excludedSourceFileName)) {
    return;
  }

  const removePreviewAsset = (filePath, label) => {
    if (!fs.existsSync(filePath)) return;
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (!warnings) throw error;
      warnings.push(`Could not remove ${label}: ${error.message}`);
    }
  };

  if (previewFileName) {
    const previewPath = path.join(THEME_PREVIEW_IMAGES_DIR, previewFileName);
    removePreviewAsset(previewPath, 'theme preview image');
  }

  if (thumbnailFileName) {
    const thumbPath = path.join(THEME_PREVIEW_IMAGES_THUMBS_DIR, thumbnailFileName);
    removePreviewAsset(thumbPath, 'theme preview thumbnail');
  }
}

function findExistingFilePath(fileName, directoryPaths) {
  const safeFileName = ensureSafeStoredName(fileName);
  if (!safeFileName) return null;

  for (const directoryPath of directoryPaths) {
    const filePath = path.join(directoryPath, safeFileName);
    if (fs.existsSync(filePath)) return filePath;
  }

  return null;
}

function serializeThemePreview(fileName) {
  const safeFileName = ensureSafeStoredName(fileName);
  if (!safeFileName) return null;

  const previewPath = findExistingFilePath(safeFileName, [
    THEME_PREVIEW_IMAGES_DIR,
    SEED_THEME_PREVIEW_IMAGES_DIR,
  ]);
  if (!previewPath) return null;

  const thumbnailFileName = buildThumbnailFileName(safeFileName);
  const thumbnailPath = findExistingFilePath(thumbnailFileName, [
    THEME_PREVIEW_IMAGES_THUMBS_DIR,
    SEED_THEME_PREVIEW_IMAGES_THUMBS_DIR,
  ]);

  return {
    fileName: safeFileName,
    url: `/theme-previews/${encodeURIComponent(safeFileName)}`,
    thumbnailUrl: thumbnailPath
      ? `/theme-previews-thumbs/${encodeURIComponent(thumbnailFileName)}`
      : null,
  };
}

function serializeThemePreviewReference(fileName) {
  const safeFileName = ensureSafeStoredName(fileName);
  if (!safeFileName) return null;

  return serializeThemePreview(safeFileName) || {
    fileName: safeFileName,
    url: '',
    thumbnailUrl: null,
  };
}

function getColorSchemePresetMap() {
  return new Map(loadColorSchemePresets().map(preset => [preset.id, preset]));
}

function attachThemeSourceFileName(theme, fileName) {
  Object.defineProperty(theme, 'sourceFileName', {
    value: fileName,
    enumerable: false,
    configurable: true,
  });
  return theme;
}

function buildInvalidUserThemeRecord(rawTheme, fileName, reason) {
  const rawObject = rawTheme && typeof rawTheme === 'object' && !Array.isArray(rawTheme)
    ? rawTheme
    : {};
  const fallbackName = path.parse(fileName).name;
  const rawId = getRawRecordId(rawObject, fileName);
  const id = isSafePersonalizationId(rawId)
    ? rawId.trim()
    : getSafeFallbackIdFromFileName(fileName, 'invalid-theme');
  const name = typeof rawObject.name === 'string' && rawObject.name.trim()
    ? rawObject.name.trim()
    : fallbackName;
  const colorSchemePresetId = typeof rawObject.colorSchemePresetId === 'string'
    ? rawObject.colorSchemePresetId.trim()
    : '';
  const opacityPresetId = typeof rawObject.opacityPresetId === 'string'
    ? rawObject.opacityPresetId.trim()
    : '';

  return attachThemeSourceFileName({
    id,
    name,
    description: typeof rawObject.description === 'string' ? rawObject.description.trim() : '',
    previewImage: serializeThemePreviewReference(rawObject.previewImage?.fileName),
    colorSchemePresetId,
    colorSchemePresetName: '',
    primaryBackgroundSelection: normalizeBackgroundReference(rawObject.primaryBackgroundSelection),
    primaryBackgroundDisplay: normalizeBackgroundDisplay(rawObject.primaryBackgroundDisplay, DEFAULT_BACKGROUND_DISPLAY),
    secondaryBackgroundSelection: normalizeBackgroundReference(rawObject.secondaryBackgroundSelection),
    secondaryBackgroundDisplay: normalizeBackgroundDisplay(rawObject.secondaryBackgroundDisplay, DEFAULT_SECONDARY_BACKGROUND_DISPLAY),
    backgroundImageOpacity: clampOpacityValue(rawObject.backgroundImageOpacity ?? DEFAULT_OPACITY.backgroundImage),
    backgroundImageBlur: clampOpacityValue(rawObject.backgroundImageBlur ?? DEFAULT_OPACITY.backgroundImageBlur),
    secondaryBackgroundImageOpacity: clampOpacityValue(rawObject.secondaryBackgroundImageOpacity ?? DEFAULT_OPACITY.secondaryBackgroundImage),
    secondaryBackgroundImageBlur: clampOpacityValue(rawObject.secondaryBackgroundImageBlur ?? DEFAULT_OPACITY.secondaryBackgroundImageBlur),
    opacityPresetId,
    opacityPresetName: '',
    includedWithApp: false,
    canEdit: true,
    canDelete: true,
    invalid: true,
    invalidReason: reason,
  }, fileName);
}

function hydrateThemeRecord(rawTheme, fileName, options = {}) {
  const colorSchemesById = getColorSchemePresetMap();
  const opacityPresetsById = new Map(loadOpacityPresetRecords()
    .filter(preset => !preset.invalid)
    .map(preset => [preset.id, preset]));

  if (!rawTheme || typeof rawTheme !== 'object' || Array.isArray(rawTheme)) {
    return { valid: false, reason: `Theme file "${fileName}" must contain a JSON object.` };
  }

  const rawId = getRawRecordId(rawTheme, fileName);
  if (!isSafePersonalizationId(rawId)) {
    return { valid: false, reason: `Theme file "${fileName}" has an invalid id.` };
  }
  const id = rawId.trim();

  const name = typeof rawTheme.name === 'string' ? rawTheme.name.trim() : '';
  if (!name) {
    return { valid: false, reason: `Theme file "${fileName}" is missing a non-empty "name".` };
  }

  const colorSchemePresetId = typeof rawTheme.colorSchemePresetId === 'string' ? rawTheme.colorSchemePresetId.trim() : '';
  if (!colorSchemePresetId || !colorSchemesById.has(colorSchemePresetId)) {
    return { valid: false, reason: `Theme "${name}" references a missing color scheme.` };
  }

  const opacityPresetId = typeof rawTheme.opacityPresetId === 'string' ? rawTheme.opacityPresetId.trim() : '';
  if (!opacityPresetId || !opacityPresetsById.has(opacityPresetId)) {
    return { valid: false, reason: `Theme "${name}" references a missing opacity preset.` };
  }

  const previewImage = serializeThemePreview(rawTheme.previewImage?.fileName);
  if (!previewImage) {
    return { valid: false, reason: `Theme "${name}" is missing its preview image.` };
  }

  const primaryBackgroundSelection = normalizeBackgroundReference(rawTheme.primaryBackgroundSelection);
  const secondaryBackgroundSelection = normalizeBackgroundReference(rawTheme.secondaryBackgroundSelection);
  const hydratedPrimaryBackground = primaryBackgroundSelection
    ? getBackgroundImageRecord('primary', primaryBackgroundSelection)
    : null;
  const hydratedSecondaryBackground = secondaryBackgroundSelection
    ? getBackgroundImageRecord('secondary', secondaryBackgroundSelection)
    : null;

  if (primaryBackgroundSelection && !hydratedPrimaryBackground) {
    return { valid: false, reason: `Theme "${name}" references a missing primary background image.` };
  }
  if (secondaryBackgroundSelection && !hydratedSecondaryBackground) {
    return { valid: false, reason: `Theme "${name}" references a missing secondary background image.` };
  }

  const colorSchemePreset = colorSchemesById.get(colorSchemePresetId);
  const opacityPreset = opacityPresetsById.get(opacityPresetId);
  const includedWithApp = !!options.forceIncludedWithApp;

  return {
    valid: true,
    theme: attachThemeSourceFileName({
      id,
      name,
      description: typeof rawTheme.description === 'string' ? rawTheme.description.trim() : '',
      previewImage,
      colorSchemePresetId,
      colorSchemePresetName: colorSchemePreset.name,
      primaryBackgroundSelection: hydratedPrimaryBackground,
      primaryBackgroundDisplay: normalizeBackgroundDisplay(rawTheme.primaryBackgroundDisplay, DEFAULT_BACKGROUND_DISPLAY),
      secondaryBackgroundSelection: hydratedSecondaryBackground,
      secondaryBackgroundDisplay: normalizeBackgroundDisplay(rawTheme.secondaryBackgroundDisplay, DEFAULT_SECONDARY_BACKGROUND_DISPLAY),
      backgroundImageOpacity: clampOpacityValue(rawTheme.backgroundImageOpacity ?? DEFAULT_OPACITY.backgroundImage),
      backgroundImageBlur: clampOpacityValue(rawTheme.backgroundImageBlur ?? DEFAULT_OPACITY.backgroundImageBlur),
      secondaryBackgroundImageOpacity: clampOpacityValue(rawTheme.secondaryBackgroundImageOpacity ?? DEFAULT_OPACITY.secondaryBackgroundImage),
      secondaryBackgroundImageBlur: clampOpacityValue(rawTheme.secondaryBackgroundImageBlur ?? DEFAULT_OPACITY.secondaryBackgroundImageBlur),
      opacityPresetId,
      opacityPresetName: opacityPreset.name,
      includedWithApp,
      canEdit: !includedWithApp,
      canDelete: !includedWithApp,
      invalid: false,
      invalidReason: '',
    }, fileName),
  };
}

function removeThemeFile(theme) {
  const sourceFileName = ensureSafeJsonFileName(theme?.sourceFileName);
  const filePath = sourceFileName && path.extname(sourceFileName).toLowerCase() === '.json'
    ? resolveInsideDirectory(THEMES_DIR, sourceFileName)
    : getThemeFilePath(typeof theme === 'string' ? theme : theme?.id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function getThemeWritePath(theme) {
  const sourceFileName = ensureSafeJsonFileName(theme?.sourceFileName);
  if (sourceFileName) return resolveInsideDirectory(THEMES_DIR, sourceFileName);

  const safeId = normalizePersonalizationId(theme?.id, 'theme id');
  const fallbackFileName = `${safeId}.json`;
  const conflictingSourceFileName = listJsonFileNames(THEMES_DIR).find(fileName => {
    if (fileName === fallbackFileName) return false;

    try {
      const rawTheme = readJsonFile(path.join(THEMES_DIR, fileName), `theme "${fileName}"`);
      if (!rawTheme || typeof rawTheme !== 'object' || Array.isArray(rawTheme)) return false;
      const rawId = getRawRecordId(rawTheme, fileName);
      return isSafePersonalizationId(rawId) && rawId.trim() === safeId;
    } catch {
      return false;
    }
  });

  if (conflictingSourceFileName) {
    throw createStoreError(409, `Theme "${safeId}" is already stored in "${conflictingSourceFileName}".`);
  }

  return getThemeFilePath(safeId);
}

function loadThemeRecordsFromDirectory(directoryPath, options = {}) {
  const hydratedThemes = [];

  listJsonFileNames(directoryPath).forEach(fileName => {
    const filePath = path.join(directoryPath, fileName);
    let raw;
    try {
      raw = readJsonFile(filePath, `theme "${fileName}"`);
    } catch (error) {
      if (options.forceIncludedWithApp) {
        throw error;
      }

      const fallbackId = path.parse(fileName).name;
      if (!options.ignoredIds?.has(fallbackId)) {
        hydratedThemes.push(buildInvalidUserThemeRecord(null, fileName, error.message));
      }
      return;
    }

    const rawId = getRawRecordId(raw, fileName);
    if (isSafePersonalizationId(rawId) && options.ignoredIds?.has(rawId.trim())) return;

    const hydrated = hydrateThemeRecord(raw, fileName, options);
    if (!hydrated.valid) {
      if (options.forceIncludedWithApp) {
        throw createStoreError(500, hydrated.reason);
      }

      hydratedThemes.push(buildInvalidUserThemeRecord(raw, fileName, hydrated.reason));
      return;
    }

    hydratedThemes.push(hydrated.theme);
  });

  return hydratedThemes;
}

function listThemes() {
  const seedThemes = loadThemeRecordsFromDirectory(SEED_THEMES_DIR, { forceIncludedWithApp: true });
  const seedIds = new Set(seedThemes.map(theme => theme.id));
  const userThemes = loadThemeRecordsFromDirectory(THEMES_DIR, { ignoredIds: seedIds });
  const hydratedThemes = [...seedThemes, ...userThemes];

  const seenNames = new Map();
  hydratedThemes.filter(theme => !theme.invalid).forEach(theme => {
    const normalizedName = normalizeNameForUniqueness(theme.name);
    const duplicate = seenNames.get(normalizedName);
    if (duplicate) {
      throw createStoreError(500, `Theme names must be unique, but both "${duplicate.name}" and "${theme.name}" exist.`);
    }
    seenNames.set(normalizedName, theme);
  });

  return hydratedThemes.sort(compareIncludedFirstByName);
}

function findThemeById(themeId) {
  return listThemes().find(theme => theme.id === themeId) ?? null;
}

function validateThemeInput(input, options = {}) {
  const {
    currentThemeId = null,
    requirePreviewImage = false,
  } = options;
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name) {
    throw createStoreError(400, 'Theme name is required.');
  }

  const existingThemes = listThemes();
  ensureUniquePresetName(name, existingThemes, currentThemeId, 'theme');

  const colorSchemePresetId = typeof input?.colorSchemePresetId === 'string' ? input.colorSchemePresetId.trim() : '';
  const opacityPresetId = typeof input?.opacityPresetId === 'string' ? input.opacityPresetId.trim() : '';
  if (!colorSchemePresetId) {
    throw createStoreError(400, 'Theme color scheme is required.');
  }
  if (!opacityPresetId) {
    throw createStoreError(400, 'Theme opacity preset is required.');
  }

  const colorSchemesById = getColorSchemePresetMap();
  if (!colorSchemesById.has(colorSchemePresetId)) {
    throw createStoreError(400, 'Selected color scheme does not exist.');
  }

  const opacityPreset = findOpacityPresetById(opacityPresetId);
  if (!opacityPreset || opacityPreset.invalid) {
    throw createStoreError(400, 'Selected opacity preset does not exist.');
  }

  const primaryBackgroundSelection = normalizeBackgroundReference(input?.primaryBackgroundSelection);
  const secondaryBackgroundSelection = normalizeBackgroundReference(input?.secondaryBackgroundSelection);

  if (primaryBackgroundSelection && !getBackgroundImageRecord('primary', primaryBackgroundSelection)) {
    throw createStoreError(400, 'Selected primary background image does not exist.');
  }
  if (secondaryBackgroundSelection && !getBackgroundImageRecord('secondary', secondaryBackgroundSelection)) {
    throw createStoreError(400, 'Selected secondary background image does not exist.');
  }

  if (requirePreviewImage && !input?.previewImageFile) {
    throw createStoreError(400, 'Theme preview image is required.');
  }

  return {
    name,
    description: typeof input?.description === 'string' ? input.description.trim() : '',
    colorSchemePresetId,
    opacityPresetId,
    primaryBackgroundSelection,
    primaryBackgroundDisplay: normalizeBackgroundDisplay(input?.primaryBackgroundDisplay, DEFAULT_BACKGROUND_DISPLAY),
    secondaryBackgroundSelection,
    secondaryBackgroundDisplay: normalizeBackgroundDisplay(input?.secondaryBackgroundDisplay, DEFAULT_SECONDARY_BACKGROUND_DISPLAY),
    backgroundImageOpacity: clampOpacityValue(input?.backgroundImageOpacity ?? DEFAULT_OPACITY.backgroundImage),
    backgroundImageBlur: clampOpacityValue(input?.backgroundImageBlur ?? DEFAULT_OPACITY.backgroundImageBlur),
    secondaryBackgroundImageOpacity: clampOpacityValue(input?.secondaryBackgroundImageOpacity ?? DEFAULT_OPACITY.secondaryBackgroundImage),
    secondaryBackgroundImageBlur: clampOpacityValue(input?.secondaryBackgroundImageBlur ?? DEFAULT_OPACITY.secondaryBackgroundImageBlur),
    includedWithApp: false,
  };
}

function writePreviewFiles(previewImageFile, previewThumbnailFile) {
  if (!previewImageFile) {
    return null;
  }

  const storedName = buildStoredPreviewImageName(previewImageFile.originalname, previewImageFile.mimetype);
  const previewPath = path.join(THEME_PREVIEW_IMAGES_DIR, storedName);
  const thumbPath = previewThumbnailFile?.buffer?.length
    ? path.join(THEME_PREVIEW_IMAGES_THUMBS_DIR, buildThumbnailFileName(storedName))
    : null;

  try {
    fs.writeFileSync(previewPath, previewImageFile.buffer);
    if (thumbPath) {
      fs.writeFileSync(thumbPath, previewThumbnailFile.buffer);
    }
  } catch (error) {
    cleanupPreviewWrite(previewPath, thumbPath);
    throw error;
  }

  return {
    fileName: storedName,
    previewPath,
    thumbPath,
  };
}

function cleanupPreviewWrite(previewPathOrImage, thumbPath = null) {
  const previewPath = typeof previewPathOrImage === 'string'
    ? previewPathOrImage
    : previewPathOrImage?.previewPath;
  const thumbnailPath = thumbPath ?? previewPathOrImage?.thumbPath;

  [thumbnailPath, previewPath].forEach(filePath => {
    if (!filePath) return;
    try {
      fs.rmSync(filePath, { force: true });
    } catch (error) {
      console.warn('Theme preview cleanup failed:', error);
    }
  });
}

function serializeThemeFile(theme) {
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    previewImage: {
      fileName: theme.previewImage.fileName,
    },
    colorSchemePresetId: theme.colorSchemePresetId,
    primaryBackgroundSelection: theme.primaryBackgroundSelection,
    primaryBackgroundDisplay: theme.primaryBackgroundDisplay,
    secondaryBackgroundSelection: theme.secondaryBackgroundSelection,
    secondaryBackgroundDisplay: theme.secondaryBackgroundDisplay,
    backgroundImageOpacity: theme.backgroundImageOpacity,
    backgroundImageBlur: theme.backgroundImageBlur,
    secondaryBackgroundImageOpacity: theme.secondaryBackgroundImageOpacity,
    secondaryBackgroundImageBlur: theme.secondaryBackgroundImageBlur,
    opacityPresetId: theme.opacityPresetId,
    includedWithApp: !!theme.includedWithApp,
  };
}

function createTheme(input) {
  const normalized = validateThemeInput(input, { requirePreviewImage: true });
  const previewImage = writePreviewFiles(input.previewImageFile, input.previewThumbnailFile);
  const theme = {
    id: createStableId('theme'),
    ...normalized,
    previewImage,
  };

  try {
    writeJsonFile(getThemeFilePath(theme.id), serializeThemeFile(theme));
  } catch (error) {
    cleanupPreviewWrite(previewImage);
    throw error;
  }
  return findThemeById(theme.id);
}

function updateTheme(themeId, input) {
  const existing = findThemeById(themeId);
  if (!existing) {
    throw createStoreError(404, 'Theme not found.');
  }
  if (existing.includedWithApp) {
    throw createStoreError(403, 'Included-with-app themes cannot be edited.');
  }
  if (existing.invalid && !existing.canDelete) {
    throw createStoreError(409, 'Invalid themes cannot be edited until their missing dependencies are restored.');
  }

  const hasUsableExistingPreview = !!existing.previewImage?.url;
  const normalized = validateThemeInput(input, {
    currentThemeId: existing.id,
    requirePreviewImage: existing.invalid && !hasUsableExistingPreview,
  });
  const previewImage = writePreviewFiles(input.previewImageFile, input.previewThumbnailFile);
  const previousPreview = existing.previewImage?.fileName
    ? { fileName: existing.previewImage.fileName }
    : null;
  const finalPreview = previewImage ?? previousPreview;

  const theme = {
    id: existing.id,
    ...normalized,
    previewImage: finalPreview,
  };

  try {
    writeJsonFile(getThemeWritePath(existing), serializeThemeFile(theme));
  } catch (error) {
    cleanupPreviewWrite(previewImage);
    throw error;
  }
  if (previewImage && previousPreview?.fileName && previousPreview.fileName !== previewImage.fileName) {
    const cleanupWarnings = [];
    deleteThemePreviewAssets({ previewImage: previousPreview }, {
      excludeTheme: existing,
      cleanupWarnings,
    });
    cleanupWarnings.forEach(warning => console.warn(warning));
  }
  return findThemeById(existing.id);
}

function deleteTheme(themeId) {
  const existing = findThemeById(themeId);
  if (!existing) {
    throw createStoreError(404, 'Theme not found.');
  }
  if (existing.includedWithApp) {
    throw createStoreError(403, 'Included-with-app themes cannot be deleted.');
  }

  const cleanupWarnings = [];
  removeThemeFile(existing);
  deleteThemePreviewAssets(existing, { cleanupWarnings });

  return {
    ...existing,
    ...(cleanupWarnings.length ? { cleanupWarnings } : {}),
  };
}

function getThemesReferencingOpacityPreset(opacityPresetId) {
  return listThemes().filter(theme => theme.opacityPresetId === opacityPresetId);
}

function getThemesReferencingBackground(slotKey, imageId, kind) {
  return listThemes().filter(theme => {
    const selection = slotKey === 'secondary'
      ? theme.secondaryBackgroundSelection
      : theme.primaryBackgroundSelection;
    return selection?.id === imageId && selection?.kind === kind;
  });
}

function deleteThemes(themeIds) {
  const deletedThemes = [];
  themeIds.forEach(themeId => {
    const existing = findThemeById(themeId);
    if (!existing || existing.includedWithApp) return;
    const cleanupWarnings = [];
    removeThemeFile(existing);
    deleteThemePreviewAssets(existing, { cleanupWarnings });
    deletedThemes.push({
      ...existing,
      ...(cleanupWarnings.length ? { cleanupWarnings } : {}),
    });
  });
  return deletedThemes;
}

function deleteOpacityPreset(presetId, options = {}) {
  const preset = findOpacityPresetById(presetId);
  if (!preset) {
    throw createStoreError(404, 'Opacity preset not found.');
  }
  if (preset.includedWithApp) {
    throw createStoreError(403, 'Included-with-app opacity presets cannot be deleted.');
  }

  const dependentThemes = getThemesReferencingOpacityPreset(presetId);
  if (dependentThemes.some(theme => !theme.canDelete)) {
    throw createStoreError(403, 'This opacity preset is used by an included-with-app theme and cannot be deleted.');
  }
  if (dependentThemes.length && !options.cascadeThemes) {
    throw createStoreError(409, `Deleting "${preset.name}" will also delete ${dependentThemes.length} theme(s).`, {
      code: 'DEPENDENT_THEMES',
      dependentThemes,
    });
  }

  const deletedThemes = dependentThemes.length ? deleteThemes(dependentThemes.map(theme => theme.id)) : [];
  removeOpacityPresetFile(preset);

  return {
    preset: serializeOpacityPresetForResponse(preset),
    deletedThemes,
  };
}

module.exports = {
  OPACITY_PRESETS_DIR,
  THEMES_DIR,
  THEME_PREVIEW_IMAGES_DIR,
  THEME_PREVIEW_IMAGES_THUMBS_DIR,
  SEED_OPACITY_PRESETS_DIR,
  SEED_THEMES_DIR,
  SEED_THEME_PREVIEW_IMAGES_DIR,
  SEED_THEME_PREVIEW_IMAGES_THUMBS_DIR,
  DEFAULT_BACKGROUND_DISPLAY,
  DEFAULT_SECONDARY_BACKGROUND_DISPLAY,
  DEFAULT_OPACITY,
  PERSONALIZATION_OPACITY_KEYS,
  OPACITY_PRESET_KEYS,
  normalizeOpacityValues,
  normalizeBackgroundReference,
  normalizeBackgroundDisplay,
  listOpacityPresets,
  createOpacityPreset,
  updateOpacityPreset,
  deleteOpacityPreset,
  findOpacityPresetById,
  listThemes,
  findThemeById,
  createTheme,
  updateTheme,
  deleteTheme,
  deleteThemes,
  getThemesReferencingOpacityPreset,
  getThemesReferencingBackground,
  createStoreError,
};
