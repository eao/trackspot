const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, IMAGES_DIR } = require('../db');
const {
  buildUniqueAlbumImagePath: buildUniqueManagedAlbumImagePath,
  getAlbumImageFilename,
  normalizeAlbumImagePath,
  resolveAlbumImagePath,
  requireExistingAlbumImagePath: requireExistingManagedAlbumImagePath,
} = require('../album-image-paths');
const {
  deriveReleaseYear,
  getReleaseDateFromSpotifyReleaseDate,
  localDateISO,
  normalizeReleaseDate,
  normalizeSpotifyFirstTrack,
  parseAlbum,
  parseAlbums,
  parseJsonField,
  VALID_STATUSES,
  validateNonNegativeInt,
  validateOptionalNonNegativeInt,
  validateRating,
  extractSpotifyFirstTrackFromGraphqlPayload,
  normalizeSpotifyReleaseDate,
  validateStatus,
} = require('../album-helpers');
const {
  DuplicateAlbumError,
  InvalidImportPayloadError,
  importSpotifyGraphqlAlbum,
} = require('../import-service');
const { normalizeSpotifyNoteLinks } = require('../spotify-note-links');
const { rejectIfWelcomeTourLocked } = require('../welcome-tour-store');

const ALLOWED_ALBUM_IMAGE_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

function buildManualAlbumImageName(file) {
  const ext = ALLOWED_ALBUM_IMAGE_TYPES.get(file?.mimetype) || '.jpg';
  return `manual_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
}

function filterManualAlbumImage(_req, file, cb) {
  if (ALLOWED_ALBUM_IMAGE_TYPES.has(file.mimetype)) {
    cb(null, true);
    return;
  }

  const error = new Error('Only JPEG, PNG, and WebP images are allowed.');
  error.status = 400;
  cb(error);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    cb(null, buildManualAlbumImageName(file));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: filterManualAlbumImage,
});

router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return rejectIfWelcomeTourLocked(req, res, next);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAlbumIndexRevision() {
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS album_count,
      COALESCE(MAX(updated_at), '') AS max_updated_at
    FROM albums
    WHERE spotify_album_id IS NOT NULL
  `).get();

  const maxUpdatedAt = summary.max_updated_at
    ? String(summary.max_updated_at).replace(' ', 'T')
    : 'none';

  return `${summary.album_count ?? 0}:${maxUpdatedAt}`;
}

function normalizeEtagHeader(value) {
  if (!value) return '';
  return String(value).replace(/^W\//, '').replace(/^"|"$/g, '');
}

const KNOWN_ALBUM_TYPES = ['ALBUM', 'EP', 'SINGLE', 'COMPILATION'];
const REFETCH_TEMP_IMAGE_FILENAME_RE = /^_temp_\d+_\d+\.jpg$/i;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function resolveAlbumImage(imagePath) {
  return resolveAlbumImagePath(imagePath, IMAGES_DIR);
}

function requireExistingAlbumImagePath(imagePath) {
  return requireExistingManagedAlbumImagePath(imagePath, IMAGES_DIR);
}

function cleanupUnusedAlbumImage(imagePath) {
  let resolved;
  try {
    resolved = resolveAlbumImage(imagePath);
  } catch {
    return false;
  }
  if (!resolved) return false;

  const inUse = db.prepare(`
    SELECT 1
    FROM albums
    WHERE image_path = ? OR image_path = ?
    LIMIT 1
  `).get(imagePath, resolved.imagePath);
  if (inUse) return false;

  try {
    if (fs.existsSync(resolved.fullPath)) fs.unlinkSync(resolved.fullPath);
    return true;
  } catch (error) {
    console.warn('Album image cleanup failed:', error);
    return false;
  }
}

function buildUniqueAlbumImagePath(prefix, ext = '.jpg') {
  return buildUniqueManagedAlbumImagePath({ imagesDir: IMAGES_DIR, prefix, ext });
}

function normalizeRefetchTempImagePath(value, albumId = null) {
  const imagePath = normalizeAlbumImagePath(value);
  if (!imagePath) throw new Error('Refetched album art path is required.');

  const filename = getAlbumImageFilename(imagePath);
  const expectedPrefix = albumId === null ? null : `_temp_${albumId}_`;
  if (
    !REFETCH_TEMP_IMAGE_FILENAME_RE.test(filename) ||
    (expectedPrefix && !filename.startsWith(expectedPrefix))
  ) {
    throw new Error('Invalid refetched album art path.');
  }

  return imagePath;
}

function parsePositiveInt(value, fallback = null) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsvValues(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function addInClause(column, values, paramPrefix, conditions, params) {
  if (!values.length) return;

  const placeholders = values.map((value, index) => {
    const key = `${paramPrefix}${index}`;
    params[key] = value;
    return `:${key}`;
  });

  conditions.push(`${column} IN (${placeholders.join(', ')})`);
}

function parseYearFilter(year) {
  if (!year) return null;

  const trimmed = String(year).trim();
  if (!trimmed) return null;

  const parts = trimmed.split('-').map(part => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    const lo = Number.parseInt(parts[0], 10);
    const hi = Number.parseInt(parts[1], 10);
    if (Number.isInteger(lo) && Number.isInteger(hi)) {
      return { type: 'range', lo, hi };
    }
    return null;
  }

  const exact = Number.parseInt(parts[0], 10);
  if (!Number.isInteger(exact)) return null;
  return { type: 'exact', exact };
}

function buildArtistNamePredicate(operator, paramName) {
  return `EXISTS (
    SELECT 1
    FROM json_each(albums.artists)
    WHERE LOWER(CASE
      WHEN json_each.type = 'object' THEN COALESCE(json_extract(json_each.value, '$.name'), '')
      ELSE COALESCE(json_each.atom, '')
    END) ${operator} :${paramName}
  )`;
}

function compareTextAsc(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function compareTextDesc(a, b) {
  return compareTextAsc(b, a);
}

function compareNumberAsc(a, b) {
  return Number(a) - Number(b);
}

function compareIdsAsc(a, b) {
  return (Number(a?.id) || 0) - (Number(b?.id) || 0);
}

function compareIdsDesc(a, b) {
  return compareIdsAsc(b, a);
}

function compareNullableValues(leftValue, rightValue, {
  direction = 'asc',
  compare = compareTextAsc,
} = {}) {
  const leftMissing = leftValue === null || leftValue === undefined;
  const rightMissing = rightValue === null || rightValue === undefined;
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }

  return direction === 'desc'
    ? compare(rightValue, leftValue)
    : compare(leftValue, rightValue);
}

function compareAlbumTitlesAsc(a, b) {
  return compareTextAsc(a?.album_name, b?.album_name)
    || compareTextAsc(a?.created_at, b?.created_at)
    || ((Number(a?.id) || 0) - (Number(b?.id) || 0));
}

function compareAlbumTitlesDesc(a, b) {
  return compareTextDesc(a?.album_name, b?.album_name)
    || compareTextDesc(a?.created_at, b?.created_at)
    || ((Number(b?.id) || 0) - (Number(a?.id) || 0));
}

function getComparableDuration(album) {
  const value = Number(album?.duration_ms);
  return Number.isFinite(value) ? value : null;
}

function getComparableTrackCount(album) {
  const value = Number(album?.track_count);
  return Number.isFinite(value) ? value : null;
}

function getComparableRating(album) {
  const value = Number(album?.rating);
  return Number.isFinite(value) ? value : null;
}

function getComparableRepeats(album) {
  const value = Number(album?.repeats);
  return Number.isFinite(value) ? value : null;
}

function getComparablePriority(album) {
  const value = Number(album?.priority);
  return Number.isFinite(value) ? value : null;
}

function getArtistNames(album) {
  if (Array.isArray(album?.artist_names) && album.artist_names.length) {
    return album.artist_names
      .filter(name => typeof name === 'string' && name.trim() !== '')
      .map(name => name.trim());
  }

  const artists = Array.isArray(album?.artists)
    ? album.artists
    : parseJsonField(album?.artists, []);
  if (!Array.isArray(artists)) return [];

  return artists
    .map(artist => typeof artist === 'string' ? artist : artist?.name)
    .filter(name => typeof name === 'string' && name.trim() !== '')
    .map(name => name.trim());
}

function compareArtistNameListsAsc(leftNames, rightNames) {
  const length = Math.min(leftNames.length, rightNames.length);
  for (let index = 0; index < length; index += 1) {
    const diff = compareTextAsc(leftNames[index], rightNames[index]);
    if (diff) return diff;
  }
  return leftNames.length - rightNames.length;
}

function compareArtistLists(leftNames, rightNames, { direction = 'asc' } = {}) {
  const leftMissing = !leftNames.length;
  const rightMissing = !rightNames.length;
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }

  return direction === 'desc'
    ? compareArtistNameListsAsc(rightNames, leftNames)
    : compareArtistNameListsAsc(leftNames, rightNames);
}

function compareAlbumsByArtistNames(a, b, { direction = 'asc' } = {}) {
  return compareArtistLists(getArtistNames(a), getArtistNames(b), { direction });
}

function getNotesText(album) {
  const text = String(album?.notes ?? '').trim();
  return text || null;
}

function getNotesLength(album) {
  const text = getNotesText(album);
  return text ? text.length : null;
}

function compareAlbumsByDurationThenTitle(a, b, {
  preferLonger = true,
  titleDirection = 'asc',
} = {}) {
  const leftDuration = getComparableDuration(a);
  const rightDuration = getComparableDuration(b);
  if (leftDuration != null && rightDuration != null && leftDuration !== rightDuration) {
    return preferLonger
      ? rightDuration - leftDuration
      : leftDuration - rightDuration;
  }
  return titleDirection === 'desc'
    ? compareAlbumTitlesDesc(a, b)
    : compareAlbumTitlesAsc(a, b);
}

function compareAlbumsByRating(a, b, { direction = 'desc' } = {}) {
  const leftRating = getComparableRating(a);
  const rightRating = getComparableRating(b);

  if (leftRating == null || rightRating == null) {
    if (leftRating == null && rightRating == null) {
      return direction === 'asc'
        ? compareTextAsc(a?.created_at, b?.created_at) || compareIdsAsc(a, b)
        : compareTextDesc(a?.created_at, b?.created_at) || compareIdsDesc(a, b);
    }
    return leftRating == null ? 1 : -1;
  }

  const ratingDiff = direction === 'asc'
    ? leftRating - rightRating
    : rightRating - leftRating;

  return ratingDiff || compareAlbumsByDurationThenTitle(a, b, {
    preferLonger: direction !== 'asc',
    titleDirection: direction === 'asc' ? 'desc' : 'asc',
  });
}

function compareAlbumsByArtist(a, b, { direction = 'asc' } = {}) {
  return compareAlbumsByArtistNames(a, b, { direction })
    || compareTextAsc(a?.album_name, b?.album_name)
    || compareNullableValues(a?.release_date, b?.release_date, { direction: 'asc' })
    || compareIdsAsc(a, b);
}

function compareAlbumsByAlbum(a, b, { direction = 'asc' } = {}) {
  return compareNullableValues(a?.album_name, b?.album_name, { direction })
    || compareAlbumsByArtistNames(a, b, { direction: 'asc' })
    || compareNullableValues(a?.release_date, b?.release_date, { direction: 'asc' })
    || compareIdsAsc(a, b);
}

function compareAlbumsByDuration(a, b, { direction = 'desc' } = {}) {
  return compareNullableValues(getComparableDuration(a), getComparableDuration(b), {
    direction,
    compare: compareNumberAsc,
  })
    || compareNullableValues(getComparableTrackCount(a), getComparableTrackCount(b), {
      direction: 'desc',
      compare: compareNumberAsc,
    })
    || compareTextAsc(a?.album_name, b?.album_name)
    || compareIdsAsc(a, b);
}

function compareAlbumsByTrackCount(a, b, { direction = 'desc' } = {}) {
  return compareNullableValues(getComparableTrackCount(a), getComparableTrackCount(b), {
    direction,
    compare: compareNumberAsc,
  })
    || compareNullableValues(getComparableDuration(a), getComparableDuration(b), {
      direction: 'desc',
      compare: compareNumberAsc,
    })
    || compareTextAsc(a?.album_name, b?.album_name)
    || compareIdsAsc(a, b);
}

function compareAlbumsByNotesAlphabetical(a, b, { direction = 'asc' } = {}) {
  return compareNullableValues(getNotesText(a), getNotesText(b), { direction })
    || compareTextAsc(a?.album_name, b?.album_name)
    || compareAlbumsByArtistNames(a, b, { direction: 'asc' })
    || compareIdsAsc(a, b);
}

function compareAlbumsByNotesLength(a, b, { direction = 'desc' } = {}) {
  return compareNullableValues(getNotesLength(a), getNotesLength(b), {
    direction,
    compare: compareNumberAsc,
  })
    || compareNullableValues(getNotesText(a), getNotesText(b), { direction: 'asc' })
    || compareTextAsc(a?.album_name, b?.album_name)
    || compareAlbumsByArtistNames(a, b, { direction: 'asc' })
    || compareIdsAsc(a, b);
}

function compareAlbumsByRepeats(a, b, { direction = 'desc' } = {}) {
  return compareNullableValues(getComparableRepeats(a), getComparableRepeats(b), {
    direction,
    compare: compareNumberAsc,
  })
    || compareNullableValues(getComparableRating(a), getComparableRating(b), {
      direction: 'desc',
      compare: compareNumberAsc,
    })
    || compareNullableValues(a?.listened_at, b?.listened_at, { direction: 'desc' })
    || compareTextAsc(a?.album_name, b?.album_name)
    || compareIdsAsc(a, b);
}

function compareAlbumsByPriority(a, b, { direction = 'desc' } = {}) {
  return compareNullableValues(getComparablePriority(a), getComparablePriority(b), {
    direction,
    compare: compareNumberAsc,
  })
    || compareNullableValues(a?.planned_at, b?.planned_at, { direction: 'asc' })
    || compareTextAsc(a?.album_name, b?.album_name)
    || compareIdsAsc(a, b);
}

function compareAlbumsByEditedAt(a, b, { direction = 'desc' } = {}) {
  return compareNullableValues(a?.updated_at, b?.updated_at, { direction })
    || compareNullableValues(a?.created_at, b?.created_at, { direction: 'asc' })
    || compareIdsAsc(a, b);
}

function compareAlbumsByReleaseDate(a, b, { direction = 'desc' } = {}) {
  return compareNullableValues(a?.release_date, b?.release_date, { direction })
    || compareAlbumsByArtistNames(a, b, { direction: 'asc' })
    || compareTextAsc(a?.album_name, b?.album_name)
    || compareIdsAsc(a, b);
}

function getCustomAlbumComparator(sortField, sortDir) {
  const direction = sortDir === 'ASC' ? 'asc' : 'desc';
  const comparators = {
    rating: (a, b) => compareAlbumsByRating(a, b, { direction }),
    artist: (a, b) => compareAlbumsByArtist(a, b, { direction }),
    album: (a, b) => compareAlbumsByAlbum(a, b, { direction }),
    duration: (a, b) => compareAlbumsByDuration(a, b, { direction }),
    track_count: (a, b) => compareAlbumsByTrackCount(a, b, { direction }),
    notes: (a, b) => compareAlbumsByNotesAlphabetical(a, b, { direction }),
    notes_length: (a, b) => compareAlbumsByNotesLength(a, b, { direction }),
    repeats: (a, b) => compareAlbumsByRepeats(a, b, { direction }),
    priority: (a, b) => compareAlbumsByPriority(a, b, { direction }),
    date_edited: (a, b) => compareAlbumsByEditedAt(a, b, { direction }),
    release_date: (a, b) => compareAlbumsByReleaseDate(a, b, { direction }),
  };
  return comparators[sortField] || null;
}

function resolveAlbumReleaseFields({
  release_date,
  spotify_release_date,
  existingReleaseDate = null,
  existingSpotifyReleaseDate = null,
} = {}) {
  const hasIncomingReleaseDate = release_date !== undefined;
  const hasIncomingSpotifyReleaseDate = spotify_release_date !== undefined;

  const normalizedSpotifyReleaseDate = hasIncomingSpotifyReleaseDate
    ? normalizeSpotifyReleaseDate(spotify_release_date)
    : existingSpotifyReleaseDate;

  let normalizedReleaseDate = hasIncomingReleaseDate
    ? normalizeReleaseDate(release_date)
    : (hasIncomingSpotifyReleaseDate ? null : normalizeReleaseDate(existingReleaseDate));

  if (!normalizedReleaseDate) {
    normalizedReleaseDate = getReleaseDateFromSpotifyReleaseDate(normalizedSpotifyReleaseDate);
  }

  return {
    release_date: normalizedReleaseDate,
    release_year: deriveReleaseYear(normalizedReleaseDate),
    spotify_release_date: normalizedSpotifyReleaseDate,
  };
}

function resolveSpotifyFirstTrackField({
  spotify_first_track,
  spotify_graphql_json,
  existingSpotifyFirstTrack = null,
} = {}) {
  if (spotify_first_track !== undefined) {
    return normalizeSpotifyFirstTrack(spotify_first_track);
  }

  if (spotify_graphql_json !== undefined) {
    return spotify_graphql_json
      ? extractSpotifyFirstTrackFromGraphqlPayload(spotify_graphql_json)
      : null;
  }

  return existingSpotifyFirstTrack;
}

function buildAlbumListQuery(reqQuery = {}) {
  const {
    sort,
    order,
    search,
    artist,
    artist_exact,
    year,
    rating_min,
    rating_max,
    statuses,
    import_type,
    rated,
    types,
    include_other,
    page,
    per_page,
  } = reqQuery;

  const conditions = [];
  const params = {};

  const searchQuery = typeof search === 'string' ? search.trim().toLowerCase() : '';
  if (searchQuery) {
    conditions.push(`(
      LOWER(album_name) LIKE :search
      OR ${buildArtistNamePredicate('LIKE', 'search')}
    )`);
    params.search = `%${searchQuery}%`;
  }

  const artistQuery = typeof artist === 'string' ? artist.trim().toLowerCase() : '';
  const artistExact = artist_exact === '1' || artist_exact === 'true';
  if (artistQuery) {
    const artistParamName = artistExact ? 'artist_exact' : 'artist';
    conditions.push(buildArtistNamePredicate(artistExact ? '=' : 'LIKE', artistParamName));
    params[artistParamName] = artistExact ? artistQuery : `%${artistQuery}%`;
  }

  const yearFilter = parseYearFilter(year);
  if (yearFilter?.type === 'range') {
    conditions.push('(release_year IS NOT NULL AND release_year >= :year_lo AND release_year <= :year_hi)');
    params.year_lo = yearFilter.lo;
    params.year_hi = yearFilter.hi;
  } else if (yearFilter?.type === 'exact') {
    conditions.push('release_year = :year_exact');
    params.year_exact = yearFilter.exact;
  }

  if (rating_min !== undefined && rating_min !== '') {
    conditions.push('(rating >= :rating_min OR rating IS NULL)');
    params.rating_min = Number.parseInt(String(rating_min), 10);
  }

  if (rating_max !== undefined && rating_max !== '') {
    conditions.push('(rating <= :rating_max OR rating IS NULL)');
    params.rating_max = Number.parseInt(String(rating_max), 10);
  }

  const validStatuses = parseCsvValues(statuses).filter(status => VALID_STATUSES.includes(status));
  addInClause('status', validStatuses, 'status_', conditions, params);

  if (import_type === 'spotify' || import_type === 'manual') {
    conditions.push('source = :import_type');
    params.import_type = import_type;
  }

  if (rated === 'rated') {
    conditions.push('rating IS NOT NULL');
  } else if (rated === 'unrated') {
    conditions.push('rating IS NULL');
  }

  const typeValues = parseCsvValues(types)
    .map(value => value.toUpperCase())
    .filter(value => KNOWN_ALBUM_TYPES.includes(value));
  const includeOtherTypes = include_other === '1' || include_other === 'true';
  if (typeValues.length || includeOtherTypes || include_other === '0' || include_other === 'false') {
    const typeConditions = [];
    if (typeValues.length) {
      typeConditions.push(...typeValues.map(value => `UPPER(album_type) = '${value}'`));
    }
    if (includeOtherTypes) {
      typeConditions.push(`(album_type IS NULL OR UPPER(album_type) NOT IN ('${KNOWN_ALBUM_TYPES.join('\', \'')}'))`);
    }
    conditions.push(typeConditions.length ? `(${typeConditions.join(' OR ')})` : '0 = 1');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap = {
    date_listened: 'listened_at',
    date_planned: 'planned_at',
    date_listened_planned: 'COALESCE(listened_at, planned_at)',
    date_logged:   'created_at',
    date_edited:   'updated_at',
    release_date:  'release_date',
    rating:        'rating',
    artist:        'artists',
    album:         'album_name',
    duration:      'duration_ms',
    track_count:   'track_count',
    notes:         'notes',
    notes_length:  'notes',
    repeats:       'repeats',
    priority:      'priority',
  };
  const sortCol = sortMap[sort] || 'COALESCE(listened_at, planned_at)';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';
  const orderClause = `ORDER BY CASE WHEN ${sortCol} IS NULL THEN 1 ELSE 0 END, ${sortCol} ${sortDir}, created_at ${sortDir}, id ${sortDir}`;

  return {
    where,
    params,
    orderClause,
    sortCol,
    sortField: sort,
    sortDir,
    page: parsePositiveInt(page, 1),
    perPage: parsePositiveInt(per_page, null),
  };
}

function buildAlbumListMeta({ totalCount, filteredCount, page, perPage }) {
  if (!perPage || filteredCount <= perPage) {
    return {
      totalCount,
      filteredCount,
      currentPage: 1,
      totalPages: 1,
      startIndex: 0,
      endIndex: filteredCount,
      isPaged: false,
      perPage,
      pageCount: filteredCount,
    };
  }

  const totalPages = Math.ceil(filteredCount / perPage);
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(filteredCount, currentPage * perPage);

  return {
    totalCount,
    filteredCount,
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    isPaged: true,
    perPage,
    pageCount: endIndex - startIndex,
  };
}

// ---------------------------------------------------------------------------
// GET /api/albums
// Returns filtered/paged albums, with optional filtering and sorting via query params.
//
// Query params:
//   sort        — field to sort by: date_listened_planned, date_planned,
//                 date_logged, date_edited, release_date, rating, artist, album,
//                 duration, track_count, notes, notes_length, repeats, priority
//   order       — asc | desc (default: desc)
//   search      — case-insensitive substring match on album or artist
//   artist      — case-insensitive artist match
//   artist_exact — exact artist-name match when true
//   year        — exact year or inclusive range (e.g. 1999-2004)
//   rating_min  — minimum rating (inclusive, NULL ratings still included)
//   rating_max  — maximum rating (inclusive, NULL ratings still included)
//   statuses    — comma-separated statuses
//   import_type — spotify | manual
//   rated       — both | rated | unrated
//   types       — comma-separated known types (ALBUM,EP,SINGLE,COMPILATION)
//   include_other — include non-standard / null album types
//   include_spotify_graphql_json — 1 | true to include raw Spotify GraphQL JSON
//   page        — 1-based current page
//   per_page    — items per page; omitted means unpaged
// ---------------------------------------------------------------------------

router.get('/', (req, res) => {
  const query = buildAlbumListQuery(req.query);

  const totalCountRow = db.prepare('SELECT COUNT(*) AS count FROM albums').get();
  const totalCount = totalCountRow?.count ?? 0;
  const trackedListenedMsRow = db.prepare(`
    SELECT COALESCE(SUM(duration_ms), 0) AS tracked_ms
    FROM albums
  `).get();
  const trackedListenedMs = trackedListenedMsRow?.tracked_ms ?? 0;

  const filteredCountRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM albums
    ${query.where}
  `).get(query.params);
  const filteredCount = filteredCountRow?.count ?? 0;
  const meta = buildAlbumListMeta({
    totalCount,
    filteredCount,
    page: query.page,
    perPage: query.perPage,
  });

  let rows;
  const customComparator = getCustomAlbumComparator(query.sortField, query.sortDir);
  if (customComparator) {
    const allRows = db.prepare(`
      SELECT * FROM albums
      ${query.where}
    `).all(query.params);
    allRows.sort(customComparator);
    rows = meta.isPaged ? allRows.slice(meta.startIndex, meta.endIndex) : allRows;
  } else {
    const pageParams = { ...query.params };
    let limitClause = '';
    if (meta.isPaged) {
      pageParams.limit = meta.perPage;
      pageParams.offset = meta.startIndex;
      limitClause = 'LIMIT :limit OFFSET :offset';
    }

    rows = db.prepare(`
      SELECT * FROM albums
      ${query.where}
      ${query.orderClause}
      ${limitClause}
    `).all(pageParams);
  }
  const includeSpotifyGraphqlJson = req.query.include_spotify_graphql_json === '1'
    || req.query.include_spotify_graphql_json === 'true';

  res.json({
    albums: parseAlbums(rows, { includeSpotifyGraphqlJson }),
    meta: {
      ...meta,
      trackedListenedMs,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/albums/index
// Returns a compact lookup table of spotify_album_id -> { id, status }.
// Supports ETag revalidation so the Spicetify extension can refresh cheaply.
// ---------------------------------------------------------------------------

router.get('/index', (req, res) => {
  const revision = buildAlbumIndexRevision();
  const etag = `"${revision}"`;

  if (normalizeEtagHeader(req.headers['if-none-match']) === revision) {
    res.setHeader('ETag', etag);
    return res.sendStatus(304);
  }

  const rows = db.prepare(`
    SELECT id, spotify_album_id, status
    FROM albums
    WHERE spotify_album_id IS NOT NULL
    ORDER BY id ASC
  `).all();

  const albums = Object.fromEntries(rows.map(row => [
    row.spotify_album_id,
    {
      id: row.id,
      status: row.status,
    },
  ]));

  res.setHeader('ETag', etag);
  res.json({ revision, albums });
});

// ---------------------------------------------------------------------------
// GET /api/albums/:id
// Returns a single album by its database ID.
// ---------------------------------------------------------------------------

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM albums WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Album not found.' });
  res.json(parseAlbum(row));
});

// ---------------------------------------------------------------------------
// POST /api/albums
// Creates a new album entry.
// Body should be the object returned by the Spotify fetch route, plus
// any user-supplied fields (rating, notes, listened_at).
// ---------------------------------------------------------------------------

router.post('/', async (req, res) => {
  const {
      spotify_url, spotify_album_id, share_url, album_name, album_type,
      artists, release_date, label, genres, track_count, duration_ms,
      copyright, is_pre_release, dominant_color_dark, dominant_color_light,
      dominant_color_raw, image_path, image_url_small, image_url_medium,
      image_url_large, status, rating, notes, planned_at, listened_at, repeats, priority,
      album_link, artist_link, spotify_release_date, spotify_first_track, spotify_graphql_json,
      source,
    } = req.body;
  if (!album_name || !artists) {
    return res.status(400).json({ error: 'album_name and artists are required.' });
  }

  let validatedRating, validatedStatus, validatedRepeats, validatedPriority, validatedTrackCount;
  try {
    validatedRating   = validateRating(rating);
    validatedStatus   = validateStatus(status);
    validatedRepeats  = validateNonNegativeInt(repeats, 'Repeat listens');
    validatedPriority = validateNonNegativeInt(priority, 'Priority');
    validatedTrackCount = validateOptionalNonNegativeInt(track_count, 'Track count');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (spotify_album_id) {
    const existing = db.prepare(
      `SELECT id FROM albums WHERE spotify_album_id = ?`
    ).get(spotify_album_id);
    if (existing) {
      return res.status(409).json({
        error: 'This album has already been logged.',
        existing_id: existing.id,
      });
    }
  }

  const normalizedPlannedAt = planned_at !== undefined
    ? (planned_at || null)
    : (validatedStatus === 'planned' ? localDateISO() : null);
  const normalizedListenedAt = listened_at !== undefined
    ? (listened_at || null)
    : (validatedStatus === 'planned' ? null : localDateISO());

  const normalizedNotes = notes === null || notes === undefined
    ? null
    : await normalizeSpotifyNoteLinks(notes);

  let releaseFields;
  try {
    releaseFields = resolveAlbumReleaseFields({
      release_date,
      spotify_release_date,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const normalizedSpotifyFirstTrack = resolveSpotifyFirstTrackField({
    spotify_first_track,
    spotify_graphql_json,
  });

  let normalizedImagePath = null;
  try {
    normalizedImagePath = image_path == null || image_path === ''
      ? null
      : requireExistingAlbumImagePath(image_path);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const result = db.prepare(`
    INSERT INTO albums (
      spotify_url, spotify_album_id, share_url, album_name, album_type,
      artists, release_date, release_year, label, genres, track_count, duration_ms,
      copyright, is_pre_release, dominant_color_dark, dominant_color_light,
      dominant_color_raw, image_path, status, rating, notes, planned_at, listened_at,
      repeats, priority, image_url_small, image_url_medium, image_url_large,
      source, album_link, artist_link, spotify_release_date, spotify_first_track, spotify_graphql_json
    ) VALUES (
      :spotify_url, :spotify_album_id, :share_url, :album_name, :album_type,
      :artists, :release_date, :release_year, :label, :genres, :track_count, :duration_ms,
      :copyright, :is_pre_release, :dominant_color_dark, :dominant_color_light,
      :dominant_color_raw, :image_path, :status, :rating, :notes, :planned_at, :listened_at,
      :repeats, :priority, :image_url_small, :image_url_medium, :image_url_large,
      :source, :album_link, :artist_link, :spotify_release_date, :spotify_first_track, :spotify_graphql_json
    )
  `).run({
    spotify_url:          spotify_url ?? null,
    spotify_album_id:     spotify_album_id ?? null,
    share_url:            share_url ?? null,
    album_name,
    album_type:           album_type ?? null,
    artists:              JSON.stringify(Array.isArray(artists) ? artists : [{ name: artists }]),
    release_date:         releaseFields.release_date,
    release_year:         releaseFields.release_year,
    label:                label ?? null,
    genres:               JSON.stringify(genres ?? []),
    track_count:          validatedTrackCount,
    duration_ms:          duration_ms ?? null,
    copyright:            JSON.stringify(copyright ?? []),
    is_pre_release:       is_pre_release ? 1 : 0,
    dominant_color_dark:  dominant_color_dark ?? null,
    dominant_color_light: dominant_color_light ?? null,
    dominant_color_raw:   dominant_color_raw ?? null,
    image_path:           normalizedImagePath,
    status:               validatedStatus,
    rating:               validatedRating,
    notes:                normalizedNotes,
    planned_at:           normalizedPlannedAt,
    listened_at:          normalizedListenedAt,
    repeats:              validatedRepeats,
    priority:             validatedPriority,
    image_url_small:      image_url_small  ?? null,
    image_url_medium:     image_url_medium ?? null,
    image_url_large:      image_url_large  ?? null,
    source:               source === 'spotify' ? 'spotify' : 'manual',
    album_link:           album_link || null,
    artist_link:          artist_link || null,
    spotify_release_date: releaseFields.spotify_release_date ? JSON.stringify(releaseFields.spotify_release_date) : null,
    spotify_first_track:  normalizedSpotifyFirstTrack ? JSON.stringify(normalizedSpotifyFirstTrack) : null,
    spotify_graphql_json: spotify_graphql_json ? JSON.stringify(spotify_graphql_json) : null,
  });

  const created = parseAlbum(
    db.prepare(`SELECT * FROM albums WHERE id = ?`).get(result.lastInsertRowid)
  );
  res.status(201).json(created);
});

// ---------------------------------------------------------------------------
// PATCH /api/albums/:id
// Updates user-editable fields on an existing album.
// Only the fields provided in the request body are updated.
// Metadata fields (album_name, artist_names, etc.) are intentionally
// not editable here — use the re-fetch route for that.
// ---------------------------------------------------------------------------

router.patch('/:id', async (req, res) => {
  const existing = db.prepare(`SELECT * FROM albums WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Album not found.' });
  const parsedExisting = parseAlbum(existing, { includeSpotifyGraphqlJson: false });

  const { status, rating, notes, planned_at, listened_at, duration_ms, track_count, artists, album_name, release_date, image_path, repeats, priority, album_type, album_link, artist_link, spotify_release_date, spotify_first_track, spotify_graphql_json } = req.body;

  let validatedRating, validatedStatus, validatedRepeats, validatedPriority, validatedTrackCount;
  try {
    validatedRating   = hasOwn(req.body, 'rating') ? validateRating(rating) : existing.rating;
    validatedStatus   = status !== undefined ? validateStatus(status) : existing.status;
    validatedRepeats  = repeats !== undefined ? validateNonNegativeInt(repeats, 'Repeat listens') : existing.repeats;
    validatedPriority = priority !== undefined ? validateNonNegativeInt(priority, 'Priority') : existing.priority;
    validatedTrackCount = track_count !== undefined
      ? validateOptionalNonNegativeInt(track_count, 'Track count')
      : existing.track_count;
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const normalizedNotes = notes !== undefined
    ? (notes === null ? null : await normalizeSpotifyNoteLinks(notes))
    : existing.notes;

  let releaseFields;
  try {
    releaseFields = resolveAlbumReleaseFields({
      release_date,
      spotify_release_date,
      existingReleaseDate: parsedExisting.release_date,
      existingSpotifyReleaseDate: parsedExisting.spotify_release_date,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const normalizedSpotifyFirstTrack = resolveSpotifyFirstTrackField({
    spotify_first_track,
    spotify_graphql_json,
    existingSpotifyFirstTrack: parseJsonField(existing.spotify_first_track, null),
  });

  const hasIncomingImagePath = hasOwn(req.body, 'image_path');
  let nextImagePath = existing.image_path;
  try {
    if (hasIncomingImagePath && image_path !== null && image_path !== undefined && image_path !== '') {
      nextImagePath = requireExistingAlbumImagePath(image_path);
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  db.prepare(`
    UPDATE albums SET
      status      = :status,
      rating      = :rating,
      notes       = :notes,
      planned_at  = :planned_at,
      listened_at = :listened_at,
      duration_ms = :duration_ms,
      track_count = :track_count,
      artists     = :artists,
      album_name  = :album_name,
      release_date = :release_date,
      release_year = :release_year,
      image_path  = :image_path,
      repeats     = :repeats,
      priority    = :priority,
      album_type  = :album_type,
      album_link  = :album_link,
      artist_link = :artist_link,
      spotify_release_date = :spotify_release_date,
      spotify_first_track = :spotify_first_track,
      spotify_graphql_json = :spotify_graphql_json
    WHERE id = :id
  `).run({
    status:       validatedStatus,
    rating:       validatedRating,
    notes:        normalizedNotes,
    planned_at:   planned_at !== undefined ? (planned_at || null) : existing.planned_at,
    listened_at:  listened_at !== undefined ? (listened_at || null) : existing.listened_at,
    duration_ms:  duration_ms !== undefined ? (duration_ms ?? null) : existing.duration_ms,
    track_count:  validatedTrackCount,
    artists:      artists !== undefined ? JSON.stringify(artists) : existing.artists,
    album_name:   album_name ?? existing.album_name,
    release_date: releaseFields.release_date,
    release_year: releaseFields.release_year,
    image_path:   nextImagePath,
    repeats:      validatedRepeats,
    priority:     validatedPriority,
    album_type:   album_type !== undefined ? (album_type ?? null) : existing.album_type,
    album_link:   album_link !== undefined ? (album_link || null) : existing.album_link,
    artist_link:  artist_link !== undefined ? (artist_link || null) : existing.artist_link,
    spotify_release_date: releaseFields.spotify_release_date
      ? JSON.stringify(releaseFields.spotify_release_date)
      : null,
    spotify_first_track: normalizedSpotifyFirstTrack
      ? JSON.stringify(normalizedSpotifyFirstTrack)
      : null,
    spotify_graphql_json: spotify_graphql_json !== undefined
      ? (spotify_graphql_json ? JSON.stringify(spotify_graphql_json) : null)
      : existing.spotify_graphql_json,
    id:           req.params.id,
  });

  const updated = parseAlbum(
    db.prepare(`SELECT * FROM albums WHERE id = ?`).get(req.params.id)
  );
  if (hasIncomingImagePath && nextImagePath !== existing.image_path) {
    cleanupUnusedAlbumImage(existing.image_path);
  }
  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/albums/wipe
// Wipes the entire database — deletes all albums and their image files.
// ---------------------------------------------------------------------------

router.delete('/wipe', (req, res) => {
  const albums = db.prepare('SELECT image_path FROM albums').all();
  const imagePaths = [...new Set(albums.map(album => album.image_path).filter(Boolean))];
  db.prepare('DELETE FROM albums').run();
  for (const imagePath of imagePaths) cleanupUnusedAlbumImage(imagePath);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /api/albums/:id
// Deletes an album and its associated image file (if it exists and is not
// shared with another entry, though in practice each image is per-album).
// ---------------------------------------------------------------------------

router.delete('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM albums WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Album not found.' });

  db.prepare(`DELETE FROM albums WHERE id = ?`).run(req.params.id);
  cleanupUnusedAlbumImage(existing.image_path);
  res.json({ deleted: true, id: parseInt(req.params.id, 10) });
});

// ---------------------------------------------------------------------------
// POST /api/albums/import
// Accepts raw album data from the Spicetify extension (Spotify GraphQL format)
// and saves it to the database, downloading album art in the process.
// Returns the saved album so the extension can open it in the browser.
// ---------------------------------------------------------------------------

router.post('/import', async (req, res) => {
  const raw = req.body;
  const overrides = {};

  ['status', 'repeats', 'rating', 'notes', 'planned_at', 'listened_at'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(raw || {}, key)) {
      overrides[key] = raw[key];
    }
  });

  try {
    const created = await importSpotifyGraphqlAlbum(raw, overrides);
    res.status(201).json(created);
  } catch (e) {
    if (e instanceof DuplicateAlbumError) {
      return res.status(409).json({
        error: e.message,
        existing_id: e.existing.id,
        album_name: e.existing.album_name,
        artists: e.existing.artists,
      });
    }
    if (e instanceof InvalidImportPayloadError) {
      return res.status(400).json({ error: e.message });
    }
    console.error('Import error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/albums/upload-image
// Handles image uploads for manual album entries.
// ---------------------------------------------------------------------------

router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file received.' });
  }

  res.json({ image_path: `images/${req.file.filename}` });
});

// ---------------------------------------------------------------------------
// POST /api/albums/:id/refetch-art
// Re-fetches album art from Spotify CDN. If the album already has art,
// saves the new file as a temp file and returns comparison info.
// If no existing art, applies directly and returns updated album.
// ---------------------------------------------------------------------------

router.post('/:id/refetch-art', async (req, res) => {
  const existing = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Album not found.' });

  const imageUrl = existing.image_url_large || existing.image_url_medium || existing.image_url_small;
  if (!imageUrl) return res.status(400).json({ error: 'No image URL stored for this album.' });

  const { downloadImage } = require('../spotify-helpers');
  const crypto = require('crypto');

  try {
    if (!existing.image_path) {
      // No existing art — download and apply directly.
      const imagePath = requireExistingAlbumImagePath(
        await downloadImage(imageUrl, existing.spotify_album_id || `manual_${existing.id}`)
      );
      db.prepare('UPDATE albums SET image_path = ? WHERE id = ?').run(imagePath, existing.id);
      const updated = parseAlbum(db.prepare('SELECT * FROM albums WHERE id = ?').get(existing.id));
      return res.json({ image_path: imagePath, ...updated });
    }

    // Has existing art — download to a temp path and compare.
    const tempId = `_temp_${existing.id}_${Date.now()}`;
    const newPath = requireExistingAlbumImagePath(await downloadImage(imageUrl, tempId));

    let oldFull = null;
    try {
      oldFull = resolveAlbumImage(existing.image_path)?.fullPath ?? null;
    } catch {
      oldFull = null;
    }
    const newFull = resolveAlbumImage(newPath).fullPath;

    const hashFile = f => {
      const buf = fs.readFileSync(f);
      return crypto.createHash('md5').update(buf).digest('hex');
    };

    const identical = oldFull ? fs.existsSync(oldFull) && hashFile(oldFull) === hashFile(newFull) : false;
    return res.json({ new_image_path: newPath, identical });

  } catch (e) {
    console.error('Refetch art error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/albums/:id/replace-refetched-art
// Commits a refetched temp art file, updates the album, and removes the old
// file only after the database no longer references it.
// ---------------------------------------------------------------------------

router.post('/:id/replace-refetched-art', (req, res) => {
  const existing = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Album not found.' });

  let tempImage;
  try {
    const tempImagePath = normalizeRefetchTempImagePath(req.body?.image_path ?? req.body?.path, existing.id);
    tempImage = resolveAlbumImage(tempImagePath);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (!fs.existsSync(tempImage.fullPath)) {
    return res.status(404).json({ error: 'Refetched album art file not found.' });
  }

  const ext = path.extname(getAlbumImageFilename(tempImage.imagePath)) || '.jpg';
  const finalImage = buildUniqueAlbumImagePath(`refetch_${existing.id}`, ext);
  let renamed = false;

  try {
    fs.renameSync(tempImage.fullPath, finalImage.fullPath);
    renamed = true;

    db.prepare('UPDATE albums SET image_path = ? WHERE id = ?').run(finalImage.imagePath, existing.id);
    cleanupUnusedAlbumImage(existing.image_path);

    const updated = parseAlbum(db.prepare('SELECT * FROM albums WHERE id = ?').get(existing.id));
    return res.json(updated);
  } catch (e) {
    if (renamed) {
      try {
        if (fs.existsSync(finalImage.fullPath) && !fs.existsSync(tempImage.fullPath)) {
          fs.renameSync(finalImage.fullPath, tempImage.fullPath);
        }
      } catch (rollbackError) {
        console.warn('Refetched art rollback failed:', rollbackError);
      }
    }
    console.error('Replace refetched art error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/albums/discard-temp-art
// Deletes a temp art file created during a refetch preview.
// ---------------------------------------------------------------------------

router.post('/discard-temp-art', (req, res) => {
  const { path: imgPath } = req.body;
  if (!imgPath) return res.json({ ok: true });

  let tempImage;
  try {
    tempImage = resolveAlbumImage(normalizeRefetchTempImagePath(imgPath));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const inUse = db.prepare('SELECT 1 FROM albums WHERE image_path = ? LIMIT 1').get(tempImage.imagePath);
  if (!inUse && fs.existsSync(tempImage.fullPath)) fs.unlinkSync(tempImage.fullPath);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/albums/:id/delete-art
// Deletes the album's image file and clears image_path (debug feature).
// ---------------------------------------------------------------------------

router.post('/:id/delete-art', (req, res) => {
  const existing = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Album not found.' });

  db.prepare('UPDATE albums SET image_path = NULL WHERE id = ?').run(existing.id);
  cleanupUnusedAlbumImage(existing.image_path);
  const updated = parseAlbum(db.prepare('SELECT * FROM albums WHERE id = ?').get(existing.id));
  res.json(updated);
});

// ---------------------------------------------------------------------------
// POST /api/albums/:id/random-art
// Replaces the album's art with art from a random different album (debug).
// ---------------------------------------------------------------------------

router.post('/:id/random-art', (req, res) => {
  const existing = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Album not found.' });

  const donors = db.prepare(
    'SELECT id, image_path FROM albums WHERE id != ? AND image_path IS NOT NULL ORDER BY RANDOM() LIMIT 1'
  ).get(req.params.id);

  if (!donors) return res.status(404).json({ error: 'No other albums with art found.' });

  // Copy the donor image to a new filename so it's independent.
  let sourceImage;
  try {
    sourceImage = resolveAlbumImage(donors.image_path);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (!sourceImage || !fs.existsSync(sourceImage.fullPath)) {
    return res.status(404).json({ error: 'Donor album art file not found.' });
  }

  const newImage = buildUniqueAlbumImagePath(`random_${existing.id}`, '.jpg');

  fs.copyFileSync(sourceImage.fullPath, newImage.fullPath);
  db.prepare('UPDATE albums SET image_path = ? WHERE id = ?').run(newImage.imagePath, existing.id);
  cleanupUnusedAlbumImage(existing.image_path);
  const updated = parseAlbum(db.prepare('SELECT * FROM albums WHERE id = ?').get(existing.id));
  res.json(updated);
});

router.__private = {
  ALLOWED_ALBUM_IMAGE_TYPES,
  buildManualAlbumImageName,
  buildAlbumIndexRevision,
  filterManualAlbumImage,
  normalizeEtagHeader,
};


module.exports = router;
