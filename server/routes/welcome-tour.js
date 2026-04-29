const express = require('express');
const {
  WelcomeTourLockError,
  assertWelcomeTourSessionCanMutate,
  finishWelcomeTour,
  getWelcomeTourStatus,
  markWelcomeTourComplete,
  insertWelcomeSamples,
  removeWelcomeSamples,
  upsertWelcomeTourLock,
  releaseWelcomeTourLock,
} = require('../welcome-tour-store');

const router = express.Router();

function sendWelcomeTourError(res, error) {
  if (error instanceof WelcomeTourLockError || error?.status) {
    return res.status(error.status || 500).json({
      error: error.message || 'Welcome tour request failed.',
      ...(error.code ? { code: error.code } : {}),
    });
  }
  throw error;
}

router.get('/status', (req, res) => {
  res.json(getWelcomeTourStatus());
});

router.post('/complete', (req, res) => {
  try {
    assertWelcomeTourSessionCanMutate(req.body?.sessionId, { allowUnlocked: true });
  } catch (error) {
    return sendWelcomeTourError(res, error);
  }
  const preferences = markWelcomeTourComplete({ skipped: !!req.body?.skipped });
  res.json({
    preferences,
    status: getWelcomeTourStatus(),
  });
});

router.post('/finish', (req, res) => {
  try {
    res.json(finishWelcomeTour({
      sessionId: req.body?.sessionId,
      skipped: !!req.body?.skipped,
      addSamples: !!req.body?.addSamples,
    }));
  } catch (error) {
    return sendWelcomeTourError(res, error);
  }
});

router.post('/samples', (req, res) => {
  try {
    assertWelcomeTourSessionCanMutate(req.body?.sessionId);
    const result = insertWelcomeSamples();
    res.status(result.insertedCount > 0 ? 201 : 200).json({
      ...result,
      status: getWelcomeTourStatus(),
    });
  } catch (error) {
    return sendWelcomeTourError(res, error);
  }
});

router.delete('/samples', (req, res) => {
  try {
    assertWelcomeTourSessionCanMutate(req.body?.sessionId, { allowUnlocked: true });
    const result = removeWelcomeSamples();
    res.json({
      ...result,
      status: getWelcomeTourStatus(),
    });
  } catch (error) {
    return sendWelcomeTourError(res, error);
  }
});

router.post('/lock', (req, res) => {
  try {
    res.json(upsertWelcomeTourLock(req.body?.sessionId));
  } catch (error) {
    return sendWelcomeTourError(res, error);
  }
});

router.delete('/lock', (req, res) => {
  res.json(releaseWelcomeTourLock(req.body?.sessionId));
});

router.post('/lock/release', (req, res) => {
  res.json(releaseWelcomeTourLock(req.body?.sessionId));
});

module.exports = router;
