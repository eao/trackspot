const express = require('express');
const {
  getPreferences,
  updatePreferences,
} = require('../preferences-store');

const router = express.Router();

router.get('/', (_req, res, next) => {
  try {
    res.json({ preferences: getPreferences() });
  } catch (error) {
    next(error);
  }
});

router.patch('/', (req, res, next) => {
  try {
    const preferences = updatePreferences(req.body || {});
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
