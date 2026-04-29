const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const {
  USER_BACKGROUNDS_DIR,
  USER_BACKGROUND_THUMBS_DIR,
  PRESET_BACKGROUNDS_DIR,
  PRESET_BACKGROUND_THUMBS_DIR,
  PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
  SECONDARY_USER_BACKGROUNDS_DIR,
  SECONDARY_USER_BACKGROUND_THUMBS_DIR,
  SECONDARY_PRESET_BACKGROUNDS_DIR,
  SECONDARY_PRESET_BACKGROUND_THUMBS_DIR,
  SECONDARY_PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
  BACKGROUND_SLOT_CONFIGS,
  ALLOWED_IMAGE_TYPES,
  buildUserBackgroundName,
  buildThumbnailFileName,
  buildImageRecord,
  listImageRecords,
  listStoredImages,
  compareImageRecords,
  getBackgroundSlotConfig,
  listBackgroundLibrary,
  syncPresetThumbnailFiles,
  ensureSafeStoredName,
} = require('../background-library');
const {
  getThemesReferencingBackground,
  deleteThemes,
} = require('../personalization-store');
const { validateImageBuffer } = require('../image-validation');

const router = express.Router();

const MAX_BACKGROUND_FILE_SIZE = 25 * 1024 * 1024;

function getExistingFileStats(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}

function createDeleteRollbackPath(targetPath) {
  const directoryPath = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const candidate = path.join(directoryPath, `.${baseName}.${suffix}.delete-tmp`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not allocate a background delete rollback path.');
}

function moveBackgroundForDelete(targetPath) {
  const rollbackPath = createDeleteRollbackPath(targetPath);
  fs.renameSync(targetPath, rollbackPath);
  return rollbackPath;
}

function restoreMovedBackground(rollbackPath, targetPath) {
  if (!rollbackPath || !fs.existsSync(rollbackPath) || fs.existsSync(targetPath)) return;
  fs.renameSync(rollbackPath, targetPath);
}

function addCleanupWarning(warnings, label, error) {
  warnings.push(`Could not remove ${label}: ${error.message}`);
}

function validateUploadedBackgroundImage(file, label) {
  return validateImageBuffer(file?.buffer, ALLOWED_IMAGE_TYPES, label);
}

function handlePresetThumbnailUpload(slotKey = 'primary') {
  return (req, res) => {
    const safeName = ensureSafeStoredName(req.params.fileName);
    if (!safeName) {
      return res.status(400).json({ error: 'Invalid background image name.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No thumbnail image was uploaded.' });
    }

    try {
      validateUploadedBackgroundImage(req.file, 'background thumbnail');
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message });
    }

    const slotConfig = getBackgroundSlotConfig(slotKey);
    const targetPath = path.join(slotConfig.presetDir, safeName);
    if (!getExistingFileStats(targetPath)) {
      return res.status(404).json({ error: 'Background image not found.' });
    }

    const thumbPath = path.join(slotConfig.presetThumbDir, buildThumbnailFileName(safeName));
    fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
    fs.writeFileSync(thumbPath, req.file.buffer);

    res.status(201).json({
      image: buildImageRecord({
        kind: 'preset',
        fileName: safeName,
        baseUrl: slotConfig.presetBaseUrl,
        thumbnailDir: slotConfig.presetThumbDir,
        thumbnailBaseUrl: slotConfig.presetThumbBaseUrl,
        canDelete: false,
      }),
    });
  };
}

function handleBackgroundUpload(slotKey = 'primary') {
  return (req, res) => {
    const backgroundFile = req.files?.background?.[0] ?? null;
    const thumbnailFile = req.files?.thumbnail?.[0] ?? null;

    if (!backgroundFile) {
      return res.status(400).json({ error: 'No background image was uploaded.' });
    }

    let detectedBackground;
    try {
      detectedBackground = validateUploadedBackgroundImage(backgroundFile, 'background image');
      if (thumbnailFile?.buffer?.length) {
        validateUploadedBackgroundImage(thumbnailFile, 'background thumbnail');
      }
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message });
    }

    const slotConfig = getBackgroundSlotConfig(slotKey);
    const storedName = buildUserBackgroundName(backgroundFile.originalname, detectedBackground.mimeType);
    const destPath = path.join(slotConfig.userDir, storedName);
    fs.writeFileSync(destPath, backgroundFile.buffer);

    if (thumbnailFile?.buffer?.length) {
      const thumbPath = path.join(slotConfig.userThumbDir, buildThumbnailFileName(storedName));
      fs.writeFileSync(thumbPath, thumbnailFile.buffer);
    }

    res.status(201).json({
      image: buildImageRecord({
        kind: 'user',
        fileName: storedName,
        baseUrl: slotConfig.userBaseUrl,
        thumbnailDir: slotConfig.userThumbDir,
        thumbnailBaseUrl: slotConfig.userThumbBaseUrl,
        canDelete: true,
      }),
    });
  };
}

function handleUserThumbnailUpload(slotKey = 'primary') {
  return (req, res) => {
    const safeName = ensureSafeStoredName(req.params.fileName);
    if (!safeName) {
      return res.status(400).json({ error: 'Invalid background image name.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No thumbnail image was uploaded.' });
    }

    try {
      validateUploadedBackgroundImage(req.file, 'background thumbnail');
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message });
    }

    const slotConfig = getBackgroundSlotConfig(slotKey);
    const targetPath = path.join(slotConfig.userDir, safeName);
    if (!getExistingFileStats(targetPath)) {
      return res.status(404).json({ error: 'Background image not found.' });
    }

    const thumbPath = path.join(slotConfig.userThumbDir, buildThumbnailFileName(safeName));
    fs.writeFileSync(thumbPath, req.file.buffer);

    res.status(201).json({
      image: buildImageRecord({
        kind: 'user',
        fileName: safeName,
        baseUrl: slotConfig.userBaseUrl,
        thumbnailDir: slotConfig.userThumbDir,
        thumbnailBaseUrl: slotConfig.userThumbBaseUrl,
        canDelete: true,
      }),
    });
  };
}

function handleUserDelete(slotKey = 'primary') {
  return (req, res, next) => {
    try {
      const safeName = ensureSafeStoredName(req.params.fileName);
      if (!safeName) {
        return res.status(400).json({ error: 'Invalid background image name.' });
      }

      const slotConfig = getBackgroundSlotConfig(slotKey);
      const targetPath = path.join(slotConfig.userDir, safeName);
      if (!getExistingFileStats(targetPath)) {
        return res.status(404).json({ error: 'Background image not found.' });
      }

      const cascadeThemes = req.query.cascadeThemes === '1';
      const dependentThemes = getThemesReferencingBackground(slotKey, safeName, 'user');
      if (dependentThemes.some(theme => !theme.canDelete)) {
        return res.status(403).json({
          error: 'This background image is used by an included-with-app theme and cannot be deleted.',
        });
      }
      if (dependentThemes.length && !cascadeThemes) {
        return res.status(409).json({
          error: `Deleting this background image will also delete ${dependentThemes.length} theme(s).`,
          code: 'DEPENDENT_THEMES',
          dependentThemes,
        });
      }

      let rollbackPath = null;
      const cleanupWarnings = [];

      try {
        rollbackPath = moveBackgroundForDelete(targetPath);
        const deletedThemes = dependentThemes.length
          ? deleteThemes(dependentThemes.map(theme => theme.id))
          : [];

        try {
          fs.unlinkSync(rollbackPath);
          rollbackPath = null;
        } catch (cleanupError) {
          addCleanupWarning(cleanupWarnings, 'deleted background staging file', cleanupError);
        }

        const thumbPath = path.join(slotConfig.userThumbDir, buildThumbnailFileName(safeName));
        if (fs.existsSync(thumbPath)) {
          try {
            fs.unlinkSync(thumbPath);
          } catch (cleanupError) {
            addCleanupWarning(cleanupWarnings, 'background thumbnail', cleanupError);
          }
        }

        return res.json({
          ok: true,
          fileName: safeName,
          deletedThemes,
          ...(cleanupWarnings.length ? { cleanupWarnings } : {}),
        });
      } catch (error) {
        try {
          restoreMovedBackground(rollbackPath, targetPath);
        } catch (rollbackError) {
          console.error('Could not roll back background delete:', rollbackError);
        }
        throw error;
      }
    } catch (error) {
      return next(error);
    }
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BACKGROUND_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      const error = new Error('Only JPG, PNG, GIF, and WebP background images are supported.');
      error.status = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
});

router.get('/', (_req, res) => {
  const primaryLibrary = listBackgroundLibrary('primary');
  const secondaryLibrary = listBackgroundLibrary('secondary');

  res.json({
    userImages: primaryLibrary.userImages,
    presetImages: primaryLibrary.presetImages,
    secondaryUserImages: secondaryLibrary.userImages,
    secondaryPresetImages: secondaryLibrary.presetImages,
  });
});

router.post('/preset/:fileName/thumbnail', upload.single('thumbnail'), handlePresetThumbnailUpload());
router.post('/secondary/preset/:fileName/thumbnail', upload.single('thumbnail'), handlePresetThumbnailUpload('secondary'));

router.post('/upload', upload.fields([
  { name: 'background', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]), handleBackgroundUpload());
router.post('/secondary/upload', upload.fields([
  { name: 'background', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]), handleBackgroundUpload('secondary'));

router.post('/user/:fileName/thumbnail', upload.single('thumbnail'), handleUserThumbnailUpload());
router.post('/secondary/user/:fileName/thumbnail', upload.single('thumbnail'), handleUserThumbnailUpload('secondary'));

router.delete('/user/:fileName', handleUserDelete());
router.delete('/secondary/user/:fileName', handleUserDelete('secondary'));

router.__private = {
  USER_BACKGROUNDS_DIR,
  USER_BACKGROUND_THUMBS_DIR,
  PRESET_BACKGROUNDS_DIR,
  PRESET_BACKGROUND_THUMBS_DIR,
  PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
  SECONDARY_USER_BACKGROUNDS_DIR,
  SECONDARY_USER_BACKGROUND_THUMBS_DIR,
  SECONDARY_PRESET_BACKGROUNDS_DIR,
  SECONDARY_PRESET_BACKGROUND_THUMBS_DIR,
  SECONDARY_PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
  BACKGROUND_SLOT_CONFIGS,
  buildUserBackgroundName,
  buildThumbnailFileName,
  buildImageRecord,
  listImageRecords,
  listStoredImages,
  compareImageRecords,
  getBackgroundSlotConfig,
  listBackgroundLibrary,
  syncPresetThumbnailFiles,
  ensureSafeStoredName,
  getExistingFileStats,
  moveBackgroundForDelete,
  restoreMovedBackground,
};

module.exports = router;
