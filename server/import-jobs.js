const { parse } = require('csv-parse/sync');
const { db } = require('./db');
const { extractAlbumId } = require('./spotify-helpers');
const {
  parseJsonField,
  VALID_STATUSES,
  validateRating,
  validateStatus,
} = require('./album-helpers');

const ROW_LEASE_MS = 2 * 60 * 1000;
const CSV_HEADER_NAMES = Object.freeze({
  spotifyUrl: 'Spotify URL',
  rating: 'Rating',
  notes: 'Notes',
  listenDate: 'Listen date',
  status: 'Status',
});

function sqlNowPlus(ms = 0) {
  return new Date(Date.now() + ms).toISOString().replace('T', ' ').slice(0, 19);
}

function makeHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function hasNonBlankCell(record) {
  return record.some(value => String(value ?? '').trim() !== '');
}

function getCsvHeaderMap(record) {
  if (!Array.isArray(record)) return null;

  const headerMap = new Map();
  let hasSpotifyUrlHeader = false;

  record.forEach((value, index) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return;
    if (Object.values(CSV_HEADER_NAMES).includes(trimmed)) {
      headerMap.set(trimmed, index);
      if (trimmed === CSV_HEADER_NAMES.spotifyUrl) {
        hasSpotifyUrlHeader = true;
      }
    }
  });

  return hasSpotifyUrlHeader ? headerMap : null;
}

function getCsvFieldValue(record, headerMap, headerName, fallbackIndex) {
  if (headerMap) {
    const mappedIndex = headerMap.get(headerName);
    return mappedIndex === undefined ? undefined : record[mappedIndex];
  }

  return record[fallbackIndex];
}

function normalizeCsvStatus(value, defaultStatus, warnings) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return { status: defaultStatus, defaulted: true };
  }

  const normalized = trimmed.toLowerCase();
  if (VALID_STATUSES.includes(normalized)) {
    return { status: normalized, defaulted: false };
  }

  const titleCase = VALID_STATUSES.map(status => status[0].toUpperCase() + status.slice(1)).join(', ');
  warnings.push(`Status "${trimmed}" was invalid and fell back to ${defaultStatus}. Valid values: ${titleCase}.`);
  return { status: defaultStatus, defaulted: true };
}

function normalizeCsvDate(value, warnings) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})([-/])(\d{2})\2(\d{2})$/);
  if (!match) {
    warnings.push(`Date "${trimmed}" was invalid and was left blank.`);
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid = date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValid) {
    warnings.push(`Date "${trimmed}" was invalid and was left blank.`);
    return null;
  }

  return `${match[1]}-${match[3]}-${match[4]}`;
}

function normalizeCsvRating(value, warnings) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  try {
    return validateRating(trimmed);
  } catch {
    warnings.push(`Rating "${trimmed}" was invalid and was left blank.`);
    return null;
  }
}

function normalizeCsvLink(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return { spotifyUrl: null, spotifyAlbumId: null };
  }

  try {
    const spotifyAlbumId = extractAlbumId(trimmed);
    return {
      spotifyAlbumId,
      spotifyUrl: `https://open.spotify.com/album/${spotifyAlbumId}`,
    };
  } catch {
    return { spotifyUrl: null, spotifyAlbumId: null };
  }
}

function parseCsvImportRows(csvContent, defaultStatus, existingAlbumIds = new Set()) {
  const normalizedDefaultStatus = validateStatus(defaultStatus);
  const records = parse(csvContent, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
  });

  const rows = [];
  const seenAlbumIds = new Set();
  const firstNonBlankRecordIndex = records.findIndex(record => Array.isArray(record) && hasNonBlankCell(record));
  const headerMap = firstNonBlankRecordIndex >= 0
    ? getCsvHeaderMap(records[firstNonBlankRecordIndex])
    : null;

  records.forEach((record, index) => {
    if (!Array.isArray(record) || !hasNonBlankCell(record)) return;
    if (headerMap && index === firstNonBlankRecordIndex) return;

    const rowIndex = index + 1;
    const warnings = [];
    const { spotifyUrl, spotifyAlbumId } = normalizeCsvLink(
      getCsvFieldValue(record, headerMap, CSV_HEADER_NAMES.spotifyUrl, 0),
    );

    if (!spotifyAlbumId) {
      rows.push({
        row_index: rowIndex,
        spotify_url: null,
        spotify_album_id: null,
        desired_status: normalizedDefaultStatus,
        rating: null,
        notes: null,
        listened_at: null,
        default_status_applied: 1,
        warnings,
        status: 'skipped',
        error: 'Row skipped because the Spotify URL field did not contain a valid Spotify album link.',
        raw_row: record.slice(),
      });
      return;
    }

    const rating = normalizeCsvRating(
      getCsvFieldValue(record, headerMap, CSV_HEADER_NAMES.rating, 1),
      warnings,
    );
    const notesRaw = getCsvFieldValue(record, headerMap, CSV_HEADER_NAMES.notes, 2);
    const notes = notesRaw === undefined || notesRaw === null || notesRaw === '' ? null : String(notesRaw);
    const listenedAt = normalizeCsvDate(
      getCsvFieldValue(record, headerMap, CSV_HEADER_NAMES.listenDate, 3),
      warnings,
    );
    const { status: desiredStatus, defaulted } = normalizeCsvStatus(
      getCsvFieldValue(record, headerMap, CSV_HEADER_NAMES.status, 4),
      normalizedDefaultStatus,
      warnings,
    );

    let status = 'queued';
    let error = null;

    if (existingAlbumIds.has(spotifyAlbumId)) {
      status = 'skipped';
      error = 'Album already exists in Trackspot and was skipped.';
    } else if (seenAlbumIds.has(spotifyAlbumId)) {
      status = 'skipped';
      error = 'Duplicate album later in this CSV was skipped.';
    } else {
      seenAlbumIds.add(spotifyAlbumId);
    }

    rows.push({
      row_index: rowIndex,
      spotify_url: spotifyUrl,
      spotify_album_id: spotifyAlbumId,
      desired_status: desiredStatus,
      rating,
      notes,
      listened_at: listenedAt,
      default_status_applied: defaulted ? 1 : 0,
      warnings,
      status,
      error,
      raw_row: record.slice(),
    });
  });

  return rows;
}

function serializeImportRow(row) {
  if (!row) return null;
  const warnings = parseJsonField(row.warnings_json, []);
  return {
    ...row,
    default_status_applied: Boolean(row.default_status_applied),
    warnings,
  };
}

function refreshImportJob(jobId, options = {}) {
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS total_rows,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_rows,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_rows,
      SUM(CASE WHEN status = 'imported' THEN 1 ELSE 0 END) AS imported_rows,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_rows,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_rows,
      SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) AS canceled_rows,
      SUM(CASE WHEN warnings_json IS NOT NULL AND warnings_json != '[]' THEN 1 ELSE 0 END) AS warning_rows
    FROM import_job_rows
    WHERE job_id = ?
  `).get(jobId);

  const existing = db.prepare(`SELECT * FROM import_jobs WHERE id = ?`).get(jobId);
  if (!existing) return null;

  let status = options.forceStatus || existing.status;
  if (!options.forceStatus && !['completed', 'failed', 'canceled'].includes(existing.status)) {
    if (counts.total_rows === 0 || (counts.queued_rows === 0 && counts.processing_rows === 0)) {
      status = 'completed';
    } else if (counts.processing_rows > 0 || counts.imported_rows > 0 || counts.skipped_rows > 0 || counts.failed_rows > 0) {
      status = 'processing';
    } else {
      status = 'queued';
    }
  }

  const completedAt = (status === 'completed' || status === 'failed' || status === 'canceled')
    ? (existing.completed_at || sqlNowPlus())
    : null;

  db.prepare(`
    UPDATE import_jobs SET
      status = :status,
      total_rows = :total_rows,
      queued_rows = :queued_rows,
      processing_rows = :processing_rows,
      imported_rows = :imported_rows,
      skipped_rows = :skipped_rows,
      failed_rows = :failed_rows,
      canceled_rows = :canceled_rows,
      warning_rows = :warning_rows,
      last_error = :last_error,
      completed_at = :completed_at
    WHERE id = :id
  `).run({
    id: jobId,
    status,
    total_rows: counts.total_rows ?? 0,
    queued_rows: counts.queued_rows ?? 0,
    processing_rows: counts.processing_rows ?? 0,
    imported_rows: counts.imported_rows ?? 0,
    skipped_rows: counts.skipped_rows ?? 0,
    failed_rows: counts.failed_rows ?? 0,
    canceled_rows: counts.canceled_rows ?? 0,
    warning_rows: counts.warning_rows ?? 0,
    last_error: options.lastError ?? existing.last_error ?? null,
    completed_at: completedAt,
  });

  return getImportJob(jobId);
}

function getImportJob(jobId) {
  const job = db.prepare(`SELECT * FROM import_jobs WHERE id = ?`).get(jobId);
  if (!job) return null;

  const problemRows = db.prepare(`
    SELECT *
    FROM import_job_rows
    WHERE job_id = ?
      AND (
        status IN ('skipped', 'failed', 'canceled')
        OR (warnings_json IS NOT NULL AND warnings_json != '[]')
      )
    ORDER BY row_index ASC
    LIMIT 100
  `).all(jobId).map(serializeImportRow);

  return {
    ...job,
    problem_rows: problemRows,
    remaining_rows: (job.queued_rows ?? 0) + (job.processing_rows ?? 0),
  };
}

function getImportJobReport(jobId) {
  const job = db.prepare(`SELECT * FROM import_jobs WHERE id = ?`).get(jobId);
  if (!job) return null;

  const rows = db.prepare(`
    SELECT *
    FROM import_job_rows
    WHERE job_id = ?
    ORDER BY row_index ASC, id ASC
  `).all(jobId).map(row => {
    const serialized = serializeImportRow(row);
    return {
      ...serialized,
      raw_row: parseJsonField(row.raw_row_json, []),
    };
  });

  return {
    job: {
      ...job,
      remaining_rows: (job.queued_rows ?? 0) + (job.processing_rows ?? 0),
    },
    rows,
  };
}

function getActiveImportJob() {
  const active = db.prepare(`
    SELECT id
    FROM import_jobs
    WHERE status IN ('queued', 'processing')
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get();

  return active ? getImportJob(active.id) : null;
}

function createCsvImportJob({ filename, defaultStatus, csvBuffer }) {
  const activeJob = getActiveImportJob();
  if (activeJob) {
    const error = makeHttpError(409, 'A CSV import is already running.');
    error.activeJob = activeJob;
    throw error;
  }

  const validatedDefaultStatus = validateStatus(defaultStatus);
  const existingAlbumIds = new Set(
    db.prepare(`
      SELECT spotify_album_id
      FROM albums
      WHERE spotify_album_id IS NOT NULL
    `).all().map(row => row.spotify_album_id)
  );

  const rows = parseCsvImportRows(csvBuffer.toString('utf8'), validatedDefaultStatus, existingAlbumIds);
  if (!rows.length) {
    throw makeHttpError(400, 'CSV file contained no usable rows.');
  }

  const insertJob = db.prepare(`
    INSERT INTO import_jobs (
      source_type, filename, default_status, status
    ) VALUES (
      'csv', :filename, :default_status, 'queued'
    )
  `);

  const insertRow = db.prepare(`
    INSERT INTO import_job_rows (
      job_id, row_index, spotify_url, spotify_album_id, desired_status,
      rating, notes, listened_at, default_status_applied, warnings_json,
      status, error, raw_row_json
    ) VALUES (
      :job_id, :row_index, :spotify_url, :spotify_album_id, :desired_status,
      :rating, :notes, :listened_at, :default_status_applied, :warnings_json,
      :status, :error, :raw_row_json
    )
  `);

  const jobId = db.transaction(() => {
    const result = insertJob.run({
      filename: filename || 'import.csv',
      default_status: validatedDefaultStatus,
    });

    for (const row of rows) {
      insertRow.run({
        job_id: result.lastInsertRowid,
        row_index: row.row_index,
        spotify_url: row.spotify_url,
        spotify_album_id: row.spotify_album_id,
        desired_status: row.desired_status,
        rating: row.rating,
        notes: row.notes,
        listened_at: row.listened_at,
        default_status_applied: row.default_status_applied,
        warnings_json: JSON.stringify(row.warnings),
        status: row.status,
        error: row.error,
        raw_row_json: JSON.stringify(row.raw_row),
      });
    }

    return result.lastInsertRowid;
  })();

  return refreshImportJob(jobId);
}

function cancelImportJob(jobId) {
  const existing = db.prepare(`SELECT * FROM import_jobs WHERE id = ?`).get(jobId);
  if (!existing) throw makeHttpError(404, 'Import job not found.');

  if (!['queued', 'processing'].includes(existing.status)) {
    return getImportJob(jobId);
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE import_job_rows
      SET
        status = 'canceled',
        error = CASE
          WHEN status = 'processing' THEN 'Import was canceled while the row was in progress.'
          ELSE 'Import was canceled before this row was processed.'
        END,
        lease_owner = NULL,
        lease_expires_at = NULL
      WHERE job_id = ?
        AND status IN ('queued', 'processing')
    `).run(jobId);
  })();

  return refreshImportJob(jobId, {
    forceStatus: 'canceled',
    lastError: 'Import canceled by user.',
  });
}

function requeueExpiredImportRows() {
  const expiredJobIds = db.prepare(`
    SELECT DISTINCT job_id
    FROM import_job_rows
    WHERE status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= datetime('now')
  `).all().map(row => row.job_id);

  db.prepare(`
    UPDATE import_job_rows
    SET
      status = 'queued',
      lease_owner = NULL,
      lease_expires_at = NULL
    WHERE status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= datetime('now')
  `).run();

  for (const jobId of expiredJobIds) {
    refreshImportJob(jobId);
  }
}

function claimNextImportRow(workerId) {
  if (!workerId) throw makeHttpError(400, 'workerId is required.');

  requeueExpiredImportRows();

  let claim = null;

  db.transaction(() => {
    const activeJob = db.prepare(`
      SELECT *
      FROM import_jobs
      WHERE status IN ('queued', 'processing')
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `).get();

    if (!activeJob) {
      claim = { job: null, row: null };
      return;
    }

    const row = db.prepare(`
      SELECT *
      FROM import_job_rows
      WHERE job_id = ?
        AND status = 'queued'
      ORDER BY row_index ASC, id ASC
      LIMIT 1
    `).get(activeJob.id);

    if (!row) {
      claim = { job: getImportJob(activeJob.id), row: null };
      return;
    }

    db.prepare(`
      UPDATE import_job_rows
      SET
        status = 'processing',
        lease_owner = ?,
        lease_expires_at = ?
      WHERE id = ?
    `).run(workerId, sqlNowPlus(ROW_LEASE_MS), row.id);

    claim = {
      job: null,
      row: serializeImportRow(
        db.prepare(`SELECT * FROM import_job_rows WHERE id = ?`).get(row.id)
      ),
    };
  })();

  if (!claim || !claim.row) {
    return claim || { job: null, row: null };
  }

  const job = refreshImportJob(claim.row.job_id);
  return {
    job,
    row: {
      ...claim.row,
      spotify_uri: claim.row.spotify_album_id ? `spotify:album:${claim.row.spotify_album_id}` : null,
    },
  };
}

function getClaimedImportRow(rowId, workerId) {
  const row = db.prepare(`SELECT * FROM import_job_rows WHERE id = ?`).get(rowId);
  if (!row) throw makeHttpError(404, 'Import row not found.');
  if (row.status !== 'processing') throw makeHttpError(409, 'Import row is no longer in progress.');
  if (!workerId || row.lease_owner !== workerId) {
    throw makeHttpError(409, 'Import row lease is no longer owned by this worker.');
  }
  return serializeImportRow(row);
}

function finishImportJobRow(rowId, workerId, nextStatus, fields = {}) {
  const row = getClaimedImportRow(rowId, workerId);

  db.prepare(`
    UPDATE import_job_rows
    SET
      status = :status,
      error = :error,
      created_album_id = :created_album_id,
      lease_owner = NULL,
      lease_expires_at = NULL
    WHERE id = :id
  `).run({
    id: row.id,
    status: nextStatus,
    error: fields.error ?? null,
    created_album_id: fields.created_album_id ?? null,
  });

  return refreshImportJob(row.job_id);
}

function markImportJobRowImported(rowId, workerId, albumId) {
  return finishImportJobRow(rowId, workerId, 'imported', {
    created_album_id: albumId,
  });
}

function completeImportJobRowWithAlbum(rowId, workerId, insertAlbum) {
  if (typeof insertAlbum !== 'function') {
    throw new TypeError('insertAlbum callback is required.');
  }

  let result = null;

  db.transaction(() => {
    const row = getClaimedImportRow(rowId, workerId);
    const album = insertAlbum(row);

    db.prepare(`
      UPDATE import_job_rows
      SET
        status = 'imported',
        error = NULL,
        created_album_id = :created_album_id,
        lease_owner = NULL,
        lease_expires_at = NULL
      WHERE id = :id
    `).run({
      id: row.id,
      created_album_id: album.id,
    });

    result = { album, jobId: row.job_id };
  })();

  return {
    album: result.album,
    job: refreshImportJob(result.jobId),
  };
}

function markImportJobRowSkipped(rowId, workerId, error) {
  return finishImportJobRow(rowId, workerId, 'skipped', { error });
}

function markImportJobRowFailed(rowId, workerId, error) {
  return finishImportJobRow(rowId, workerId, 'failed', { error });
}

module.exports = {
  ROW_LEASE_MS,
  cancelImportJob,
  claimNextImportRow,
  completeImportJobRowWithAlbum,
  createCsvImportJob,
  getActiveImportJob,
  getClaimedImportRow,
  getImportJob,
  getImportJobReport,
  markImportJobRowFailed,
  markImportJobRowImported,
  markImportJobRowSkipped,
  parseCsvImportRows,
  refreshImportJob,
};
