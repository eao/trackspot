const express = require('express');
const {
  listOpacityPresets,
  createOpacityPreset,
  updateOpacityPreset,
  deleteOpacityPreset,
} = require('../personalization-store');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ presets: listOpacityPresets() });
});

router.post('/', (req, res, next) => {
  try {
    const preset = createOpacityPreset(req.body || {});
    res.status(201).json({ preset });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const preset = updateOpacityPreset(req.params.id, req.body || {});
    res.json({ preset });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const cascadeThemes = req.query.cascadeThemes === '1';
    const result = deleteOpacityPreset(req.params.id, { cascadeThemes });
    res.json({
      ok: true,
      preset: result.preset,
      deletedThemes: result.deletedThemes,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
