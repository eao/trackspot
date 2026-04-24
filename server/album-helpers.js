function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function localDateISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const RELEASE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidReleaseDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function buildReleaseDateFromParts(year, month, day) {
  if (!isValidReleaseDateParts(year, month, day)) return null;
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function normalizeReleaseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(RELEASE_DATE_RE);
  if (!match) {
    throw new Error('Release date must be in YYYY-MM-DD format.');
  }

  const [, year, month, day] = match;
  const normalized = buildReleaseDateFromParts(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10),
    Number.parseInt(day, 10),
  );
  if (!normalized) {
    throw new Error('Release date must be a real calendar date.');
  }

  return normalized;
}

function deriveReleaseYear(releaseDate) {
  const normalized = normalizeReleaseDate(releaseDate);
  return normalized ? Number.parseInt(normalized.slice(0, 4), 10) : null;
}

function buildReleaseDateFromYear(year) {
  const parsed = Number(year);
  if (!Number.isInteger(parsed)) return null;
  return buildReleaseDateFromParts(parsed, 1, 1);
}

function normalizeSpotifyReleaseDate(value) {
  if (!value || typeof value !== 'object') return null;

  const isoString = typeof value.isoString === 'string' && value.isoString.trim()
    ? value.isoString.trim()
    : null;
  const precision = typeof value.precision === 'string' && value.precision.trim()
    ? value.precision.trim().toUpperCase()
    : null;
  const rawYear = value.year ?? (isoString ? Number.parseInt(isoString.slice(0, 4), 10) : null);
  const year = Number.isInteger(Number(rawYear)) ? Number(rawYear) : null;

  if (!isoString && !precision && year === null) return null;

  const normalized = {};
  if (isoString) normalized.isoString = isoString;
  if (precision) normalized.precision = precision;
  if (year !== null) normalized.year = year;
  return normalized;
}

function extractSpotifyIdFromUri(value, type) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(new RegExp(`^spotify:${type}:([A-Za-z0-9]+)$`, 'i'));
  return match ? match[1] : null;
}

function extractSpotifyIdFromUrl(value, type) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(new RegExp(`open\\.spotify\\.com/(?:[a-z]{2}/)?${type}/([A-Za-z0-9]+)`, 'i'));
  return match ? match[1] : null;
}

function normalizeSpotifyFirstTrack(value) {
  if (!value || typeof value !== 'object') return null;

  const id = typeof value.id === 'string' && value.id.trim()
    ? value.id.trim()
    : extractSpotifyIdFromUri(value.uri, 'track') || extractSpotifyIdFromUrl(value.share_url, 'track');
  if (!id) return null;

  const normalized = {
    id,
    name: typeof value.name === 'string' ? value.name.trim() : '',
    uri: `spotify:track:${id}`,
    share_url: typeof value.share_url === 'string' && value.share_url.trim()
      ? value.share_url.trim()
      : `https://open.spotify.com/track/${id}`,
  };

  return normalized;
}

function normalizeRestTrack(value) {
  if (!value || typeof value !== 'object') return null;
  return normalizeSpotifyFirstTrack({
    id: value.id,
    name: value.name,
    uri: value.uri,
    share_url: value.external_urls?.spotify,
  });
}

function extractSpotifyFirstTrackFromGraphqlPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const track = rawPayload?.data?.albumUnion?.tracksV2?.items?.[0]?.track;
  return normalizeSpotifyFirstTrack({
    name: track?.name,
    uri: track?.uri,
  });
}

function buildSpotifyReleaseDateFromRest(releaseDate, releaseDatePrecision) {
  const rawDate = typeof releaseDate === 'string' ? releaseDate.trim() : '';
  const precision = typeof releaseDatePrecision === 'string' ? releaseDatePrecision.trim().toUpperCase() : '';
  if (!rawDate || !precision) return null;

  let isoString = null;
  if (precision === 'DAY' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    isoString = `${rawDate}T00:00:00Z`;
  } else if (precision === 'MONTH' && /^\d{4}-\d{2}$/.test(rawDate)) {
    isoString = `${rawDate}-01T00:00:00Z`;
  } else if (precision === 'YEAR' && /^\d{4}$/.test(rawDate)) {
    isoString = `${rawDate}-01-01T00:00:00Z`;
  }

  return normalizeSpotifyReleaseDate({
    isoString,
    precision,
  });
}

function extractSpotifyReleaseDateFromGraphqlPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  return normalizeSpotifyReleaseDate(rawPayload?.data?.albumUnion?.date ?? null);
}

function getReleaseDateFromSpotifyReleaseDate(value) {
  const spotifyReleaseDate = normalizeSpotifyReleaseDate(value);
  if (!spotifyReleaseDate) return null;

  const isoMatch = spotifyReleaseDate.isoString?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildReleaseDateFromParts(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10),
      Number.parseInt(day, 10),
    );
  }

  const precision = spotifyReleaseDate.precision ?? '';
  const year = Number.isInteger(spotifyReleaseDate.year) ? spotifyReleaseDate.year : null;
  if (year === null) return null;

  if (precision === 'YEAR') {
    return buildReleaseDateFromParts(year, 1, 1);
  }

  return null;
}

function parseAlbum(row, options = {}) {
  const {
    includeSpotifyGraphqlJson = true,
  } = options;

  if (!row) return null;
  const parsed = {
    ...row,
    artists: parseJsonField(row.artists, []),
    genres: parseJsonField(row.genres, []),
    copyright: parseJsonField(row.copyright, []),
    spotify_release_date: parseJsonField(row.spotify_release_date, null),
    spotify_first_track: parseJsonField(row.spotify_first_track, null),
  };

  if (includeSpotifyGraphqlJson) {
    parsed.spotify_graphql_json = parseJsonField(row.spotify_graphql_json, null);
  } else {
    delete parsed.spotify_graphql_json;
  }

  return parsed;
}

function parseAlbums(rows, options = {}) {
  return rows.map(row => parseAlbum(row, options));
}

function validateRating(rating) {
  if (rating === null || rating === undefined || rating === '') return null;
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new Error('Rating must be an integer between 0 and 100.');
  }
  return n;
}

const VALID_STATUSES = ['completed', 'planned', 'dropped'];

function validateStatus(status) {
  if (!status) return 'completed';
  if (!VALID_STATUSES.includes(status)) throw new Error('Invalid status.');
  return status;
}

function validateNonNegativeInt(val, fieldName) {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${fieldName} must be a non-negative integer.`);
  return n;
}

function validateOptionalNonNegativeInt(val, fieldName) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${fieldName} must be a non-negative integer.`);
  return n;
}

module.exports = {
  buildReleaseDateFromYear,
  localDateISO,
  deriveReleaseYear,
  getReleaseDateFromSpotifyReleaseDate,
  parseAlbum,
  parseAlbums,
  parseJsonField,
  normalizeReleaseDate,
  normalizeSpotifyReleaseDate,
  buildSpotifyReleaseDateFromRest,
  extractSpotifyReleaseDateFromGraphqlPayload,
  extractSpotifyFirstTrackFromGraphqlPayload,
  normalizeRestTrack,
  normalizeSpotifyFirstTrack,
  VALID_STATUSES,
  validateNonNegativeInt,
  validateOptionalNonNegativeInt,
  validateRating,
  validateStatus,
};
