const express = require('express');
const multer = require('multer');
const {
  ALLOWED_IMAGE_TYPES,
} = require('../background-library');
const {
  listThemes,
  createTheme,
  updateTheme,
  deleteTheme,
} = require('../personalization-store');

const router = express.Router();

const MAX_THEME_PREVIEW_FILE_SIZE = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_THEME_PREVIEW_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      const error = new Error('Only JPG, PNG, GIF, and WebP theme preview images are supported.');
      error.status = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
});

function parseJsonField(value, fallback = null, label = 'field') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    throw Object.assign(new Error(`Could not parse ${label}: ${error.message}`), { status: 400 });
  }
}

function buildThemeInput(req) {
  return {
    name: req.body?.name ?? '',
    description: req.body?.description ?? '',
    colorSchemePresetId: req.body?.colorSchemePresetId ?? '',
    opacityPresetId: req.body?.opacityPresetId ?? '',
    backgroundImageOpacity: req.body?.backgroundImageOpacity,
    backgroundImageBlur: req.body?.backgroundImageBlur,
    secondaryBackgroundImageOpacity: req.body?.secondaryBackgroundImageOpacity,
    secondaryBackgroundImageBlur: req.body?.secondaryBackgroundImageBlur,
    primaryBackgroundSelection: parseJsonField(req.body?.primaryBackgroundSelection, null, 'primary background selection'),
    primaryBackgroundDisplay: parseJsonField(req.body?.primaryBackgroundDisplay, null, 'primary background display'),
    secondaryBackgroundSelection: parseJsonField(req.body?.secondaryBackgroundSelection, null, 'secondary background selection'),
    secondaryBackgroundDisplay: parseJsonField(req.body?.secondaryBackgroundDisplay, null, 'secondary background display'),
    includedWithApp: req.body?.includedWithApp === 'true' || req.body?.includedWithApp === true,
    previewImageFile: req.files?.previewImage?.[0] ?? null,
    previewThumbnailFile: req.files?.previewThumbnail?.[0] ?? null,
  };
}

router.get('/', (_req, res, next) => {
  try {
    res.json({ themes: listThemes() });
  } catch (error) {
    next(error);
  }
});

router.post('/', upload.fields([
  { name: 'previewImage', maxCount: 1 },
  { name: 'previewThumbnail', maxCount: 1 },
]), (req, res, next) => {
  try {
    const theme = createTheme(buildThemeInput(req));
    res.status(201).json({ theme });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', upload.fields([
  { name: 'previewImage', maxCount: 1 },
  { name: 'previewThumbnail', maxCount: 1 },
]), (req, res, next) => {
  try {
    const theme = updateTheme(req.params.id, buildThemeInput(req));
    res.json({ theme });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const theme = deleteTheme(req.params.id);
    res.json({ ok: true, theme });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
