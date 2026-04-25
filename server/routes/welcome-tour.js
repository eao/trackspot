const express = require('express');
const {
  getWelcomeTourStatus,
  markWelcomeTourComplete,
  insertWelcomeSamples,
  removeWelcomeSamples,
  upsertWelcomeTourLock,
  releaseWelcomeTourLock,
} = require('../welcome-tour-store');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(getWelcomeTourStatus());
});

router.post('/complete', (req, res) => {
  const preferences = markWelcomeTourComplete({ skipped: !!req.body?.skipped });
  res.json({
    preferences,
    status: getWelcomeTourStatus(),
  });
});

router.post('/samples', (req, res) => {
  const result = insertWelcomeSamples();
  res.status(result.insertedCount > 0 ? 201 : 200).json({
    ...result,
    status: getWelcomeTourStatus(),
  });
});

router.delete('/samples', (req, res) => {
  const result = removeWelcomeSamples();
  res.json({
    ...result,
    status: getWelcomeTourStatus(),
  });
});

router.post('/lock', (req, res) => {
  res.json(upsertWelcomeTourLock(req.body?.sessionId));
});

router.delete('/lock', (req, res) => {
  res.json(releaseWelcomeTourLock(req.body?.sessionId));
});

module.exports = router;
