const express = require('express');
const multer = require('multer');
const {
  cancelImportJob,
  claimNextImportRow,
  createCsvImportJob,
  getActiveImportJob,
  getClaimedImportRow,
  getImportJob,
  getImportJobReport,
  markImportJobRowFailed,
  markImportJobRowImported,
  markImportJobRowSkipped,
} = require('../import-jobs');
const {
  DuplicateAlbumError,
  InvalidImportPayloadError,
  importSpotifyGraphqlAlbum,
} = require('../import-service');
const { rejectIfWelcomeTourLocked } = require('../welcome-tour-store');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return rejectIfWelcomeTourLocked(req, res, next);
});

router.get('/active', (_req, res) => {
  res.json({ job: getActiveImportJob() });
});

router.get('/:id', (req, res) => {
  const job = getImportJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Import job not found.' });
  res.json({ job });
});

router.get('/:id/report', (req, res) => {
  const report = getImportJobReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Import job not found.' });
  res.json(report);
});

router.post('/:id/cancel', (req, res, next) => {
  try {
    const job = cancelImportJob(req.params.id);
    res.json({ job });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/csv', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A CSV file is required.' });
    }

    const job = createCsvImportJob({
      filename: req.file.originalname,
      defaultStatus: req.body.defaultStatus,
      csvBuffer: req.file.buffer,
    });

    res.status(201).json({ job });
  } catch (error) {
    if (error.status === 409 && error.activeJob) {
      return res.status(409).json({ error: error.message, job: error.activeJob });
    }
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/claim', (req, res, next) => {
  try {
    const result = claimNextImportRow(req.body?.workerId);
    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/rows/:id/complete', async (req, res) => {
  const rowId = Number(req.params.id);
  const workerId = req.body?.workerId;
  const graphqlData = req.body?.graphqlData;

  try {
    const row = getClaimedImportRow(rowId, workerId);
    const album = await importSpotifyGraphqlAlbum(
      {
        spotifyUrl: row.spotify_url,
        spotifyId: row.spotify_album_id,
        ...(graphqlData || {}),
      },
      {
        status: row.desired_status,
        rating: row.rating,
        notes: row.notes,
        listened_at: row.listened_at,
      }
    );

    const job = markImportJobRowImported(rowId, workerId, album.id);
    res.json({ job, row_status: 'imported', album_id: album.id });
  } catch (error) {
    if (error instanceof DuplicateAlbumError) {
      const job = markImportJobRowSkipped(
        rowId,
        workerId,
        `Album already exists in Trackspot and was skipped${error.existing?.id ? ` (album ${error.existing.id})` : ''}.`
      );
      return res.json({
        job,
        row_status: 'skipped',
        existing_id: error.existing?.id ?? null,
      });
    }

    if (error instanceof InvalidImportPayloadError) {
      const job = markImportJobRowFailed(rowId, workerId, error.message);
      return res.status(400).json({ error: error.message, job, row_status: 'failed' });
    }

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error('Import row completion error:', error);
    const job = markImportJobRowFailed(rowId, workerId, error.message || 'Unknown import error.');
    res.status(500).json({ error: error.message, job, row_status: 'failed' });
  }
});

router.post('/rows/:id/fail', (req, res, next) => {
  const rowId = Number(req.params.id);
  const workerId = req.body?.workerId;
  const errorMessage = String(req.body?.error || 'Worker failed to import the row.');

  try {
    const job = markImportJobRowFailed(rowId, workerId, errorMessage);
    res.json({ job, row_status: 'failed' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;
