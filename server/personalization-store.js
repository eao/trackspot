const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');
const { loadColorSchemePresets } = require('./color-scheme-presets');
const {
  ALLOWED_IMAGE_TYPES,
  ensureSafeStoredName,
  sanitizeFileNamePart,
  buildThumbnailFileName,
  getBackgroundImageRecord,
} = require('./background-library');

const OPACITY_PRESETS_DIR = process.env.OPACITY_PRESETS_DIR || path.join(DATA_DIR, 'opacity-presets');
const THEMES_DIR = process.env.THEMES_DIR || path.join(DATA_DIR, 'themes');
const THEME_PREVIEW_IMAGES_DIR = process.env.THEME_PREVIEW_IMAGES_DIR || path.join(DATA_DIR, 'theme-preview-images');
const THEME_PREVIEW_IMAGES_THUMBS_DIR = process.env.THEME_PREVIEW_IMAGES_THUMBS_DIR || path.join(DATA_DIR, 'theme-preview-images-thumbs');
const OPACITY_PRESETS_SEED_SENTINEL = path.join(OPACITY_PRESETS_DIR, '.seeded');

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

const SEEDED_OPACITY_PRESETS = [
  {
    id: 'default-opaque',
    name: 'Default Opaque',
    includedWithApp: true,
    opacity: OPACITY_PRESET_KEYS.reduce((result, key) => {
      result[key] = DEFAULT_OPACITY[key];
      return result;
    }, {}),
  },
];
const INCLUDED_WITH_APP_THEME_NAMES = new Set(['Basic Blue']);

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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
  return String(value || '').trim().toLocaleLowerCase();
}

function createStableId(prefix = 'preset') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
  return path.join(OPACITY_PRESETS_DIR, `${presetId}.json`);
}

function getThemeFilePath(themeId) {
  return path.join(THEMES_DIR, `${themeId}.json`);
}

function ensureSeededOpacityPresets() {
  if (fs.existsSync(OPACITY_PRESETS_SEED_SENTINEL)) return;

  if (listJsonFileNames(OPACITY_PRESETS_DIR).length === 0) {
    SEEDED_OPACITY_PRESETS.forEach(preset => {
      writeJsonFile(getOpacityPresetFilePath(preset.id), {
        id: preset.id,
        name: preset.name,
        includedWithApp: !!preset.includedWithApp,
        opacity: normalizeOpacityValues(preset.opacity),
      });
    });
  }

  fs.writeFileSync(OPACITY_PRESETS_SEED_SENTINEL, 'seeded\n');
}

function loadOpacityPresetRecords() {
  ensureSeededOpacityPresets();

  return listJsonFileNames(OPACITY_PRESETS_DIR)
    .map(fileName => {
      const filePath = path.join(OPACITY_PRESETS_DIR, fileName);
      const raw = readJsonFile(filePath, `opacity preset "${fileName}"`);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw createStoreError(500, `Opacity preset file "${fileName}" must contain a JSON object.`);
      }

      const id = typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : path.parse(fileName).name;
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        throw createStoreError(500, `Opacity preset file "${fileName}" is missing a non-empty "name".`);
      }

      return {
        id,
        name,
        includedWithApp: !!raw.includedWithApp,
        opacity: normalizeOpacityValues(raw.opacity),
      };
    })
    .sort(compareIncludedFirstByName);
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
  return {
    id: preset.id,
    name: preset.name,
    includedWithApp: !!preset.includedWithApp,
    canEdit: !preset.includedWithApp,
    canDelete: !preset.includedWithApp,
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
    includedWithApp: !!input?.includedWithApp,
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

  const records = loadOpacityPresetRecords();
  const name = typeof input?.name === 'string' ? input.name.trim() : existing.name;
  if (!name) {
    throw createStoreError(400, 'Opacity preset name is required.');
  }

  ensureUniquePresetName(name, records, existing.id, 'opacity preset');

  const updated = {
    id: existing.id,
    name,
    includedWithApp: !!input?.includedWithApp,
    opacity: normalizeOpacityValues(input?.opacity ?? existing.opacity),
  };

  writeJsonFile(getOpacityPresetFilePath(existing.id), updated);
  return serializeOpacityPresetForResponse(updated);
}

function deleteThemePreviewAssets(theme) {
  const previewFileName = ensureSafeStoredName(theme?.previewImage?.fileName);
  const thumbnailFileName = previewFileName ? buildThumbnailFileName(previewFileName) : null;

  if (previewFileName) {
    const previewPath = path.join(THEME_PREVIEW_IMAGES_DIR, previewFileName);
    if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
  }

  if (thumbnailFileName) {
    const thumbPath = path.join(THEME_PREVIEW_IMAGES_THUMBS_DIR, thumbnailFileName);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }
}

function serializeThemePreview(fileName) {
  const safeFileName = ensureSafeStoredName(fileName);
  if (!safeFileName) return null;

  const previewPath = path.join(THEME_PREVIEW_IMAGES_DIR, safeFileName);
  if (!fs.existsSync(previewPath)) return null;

  const thumbnailFileName = buildThumbnailFileName(safeFileName);
  const thumbnailPath = path.join(THEME_PREVIEW_IMAGES_THUMBS_DIR, thumbnailFileName);

  return {
    fileName: safeFileName,
    url: `/theme-previews/${encodeURIComponent(safeFileName)}`,
    thumbnailUrl: fs.existsSync(thumbnailPath)
      ? `/theme-previews-thumbs/${encodeURIComponent(thumbnailFileName)}`
      : null,
  };
}

function getColorSchemePresetMap() {
  return new Map(loadColorSchemePresets().map(preset => [preset.id, preset]));
}

function hydrateThemeRecord(rawTheme, fileName) {
  const colorSchemesById = getColorSchemePresetMap();
  const opacityPresetsById = new Map(loadOpacityPresetRecords().map(preset => [preset.id, preset]));

  if (!rawTheme || typeof rawTheme !== 'object' || Array.isArray(rawTheme)) {
    return { valid: false, reason: `Theme file "${fileName}" must contain a JSON object.` };
  }

  const id = typeof rawTheme.id === 'string' && rawTheme.id.trim()
    ? rawTheme.id.trim()
    : path.parse(fileName).name;
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
  const includedWithApp = !!rawTheme.includedWithApp || INCLUDED_WITH_APP_THEME_NAMES.has(name);

  return {
    valid: true,
    theme: {
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
    },
  };
}

function removeThemeFile(themeId) {
  const filePath = getThemeFilePath(themeId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function listThemes() {
  const hydratedThemes = [];

  listJsonFileNames(THEMES_DIR).forEach(fileName => {
    const filePath = path.join(THEMES_DIR, fileName);
    const raw = readJsonFile(filePath, `theme "${fileName}"`);
    const hydrated = hydrateThemeRecord(raw, fileName);
    if (!hydrated.valid) {
      const invalidId = typeof raw?.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : path.parse(fileName).name;
      deleteThemePreviewAssets(raw);
      removeThemeFile(invalidId);
      return;
    }

    hydratedThemes.push(hydrated.theme);
  });

  const seenNames = new Map();
  hydratedThemes.forEach(theme => {
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

  if (!findOpacityPresetById(opacityPresetId)) {
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
    includedWithApp: !!input?.includedWithApp,
  };
}

function writePreviewFiles(previewImageFile, previewThumbnailFile, previousPreview = null) {
  if (!previewImageFile) {
    return previousPreview ? { ...previousPreview } : null;
  }

  const storedName = buildStoredPreviewImageName(previewImageFile.originalname, previewImageFile.mimetype);
  const previewPath = path.join(THEME_PREVIEW_IMAGES_DIR, storedName);
  fs.writeFileSync(previewPath, previewImageFile.buffer);

  if (previewThumbnailFile?.buffer?.length) {
    const thumbPath = path.join(THEME_PREVIEW_IMAGES_THUMBS_DIR, buildThumbnailFileName(storedName));
    fs.writeFileSync(thumbPath, previewThumbnailFile.buffer);
  }

  if (previousPreview) {
    deleteThemePreviewAssets({ previewImage: previousPreview });
  }

  return {
    fileName: storedName,
  };
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
  const previewImage = writePreviewFiles(input.previewImageFile, input.previewThumbnailFile, null);
  const theme = {
    id: createStableId('theme'),
    ...normalized,
    previewImage,
  };

  writeJsonFile(getThemeFilePath(theme.id), serializeThemeFile(theme));
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

  const normalized = validateThemeInput(input, { currentThemeId: themeId });
  const previewImage = writePreviewFiles(input.previewImageFile, input.previewThumbnailFile, existing.previewImage);

  const theme = {
    id: existing.id,
    ...normalized,
    previewImage: previewImage ?? { fileName: existing.previewImage.fileName },
  };

  writeJsonFile(getThemeFilePath(existing.id), serializeThemeFile(theme));
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

  deleteThemePreviewAssets(existing);
  removeThemeFile(existing.id);

  return existing;
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
    deleteThemePreviewAssets(existing);
    removeThemeFile(themeId);
    deletedThemes.push(existing);
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
  const presetPath = getOpacityPresetFilePath(preset.id);
  if (fs.existsSync(presetPath)) fs.unlinkSync(presetPath);

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
