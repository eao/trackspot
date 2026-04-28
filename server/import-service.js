const fs = require('fs');
const { db, IMAGES_DIR } = require('./db');
const {
  buildManagedAlbumImagePath,
  resolveAlbumImagePath,
} = require('./album-image-paths');
const { DEFAULT_MAX_DOWNLOAD_BYTES, responseToBufferWithLimit } = require('./http-downloads');
const {
  deriveReleaseYear,
  getReleaseDateFromSpotifyReleaseDate,
  localDateISO,
  parseAlbum,
  parseJsonField,
  extractSpotifyReleaseDateFromGraphqlPayload,
  extractSpotifyFirstTrackFromGraphqlPayload,
  validateNonNegativeInt,
  validateRating,
  validateStatus,
} = require('./album-helpers');
const { normalizeSpotifyNoteLinks } = require('./spotify-note-links');

class DuplicateAlbumError extends Error {
  constructor(existing) {
    super('This album has already been logged.');
    this.name = 'DuplicateAlbumError';
    this.existing = existing;
  }
}

class InvalidImportPayloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidImportPayloadError';
  }
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function getExistingSpotifyAlbum(spotifyId) {
  if (!spotifyId) return null;

  const existing = db.prepare(
    `SELECT id, album_name, artists FROM albums WHERE spotify_album_id = ?`
  ).get(spotifyId);

  return existing
    ? {
      ...existing,
      artists: parseJsonField(existing.artists, []),
    }
    : null;
}

function assertSpotifyAlbumNotImported(spotifyId) {
  const existing = getExistingSpotifyAlbum(spotifyId);
  if (existing) {
    throw new DuplicateAlbumError(existing);
  }
}

function getImageFullPath(imagePath) {
  return resolveAlbumImagePath(imagePath, IMAGES_DIR).fullPath;
}

async function downloadImportImage(imageUrl, albumId) {
  const finalImagePath = buildManagedAlbumImagePath(albumId, '.jpg');
  const finalFullPath = getImageFullPath(finalImagePath);
  if (fs.existsSync(finalFullPath)) {
    return { imagePath: finalImagePath, createdImagePath: null };
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download album art: ${response.status}`);
  }

  const tempImagePath = buildManagedAlbumImagePath(
    `${albumId}.import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    '.jpg',
  );
  const tempFullPath = getImageFullPath(tempImagePath);
  const buffer = await responseToBufferWithLimit(response, {
    maxBytes: DEFAULT_MAX_DOWNLOAD_BYTES,
  });
  fs.writeFileSync(tempFullPath, buffer);

  return {
    imagePath: finalImagePath,
    createdImagePath: tempImagePath,
  };
}

function commitPreparedSpotifyGraphqlAlbumImport(preparedImport) {
  const tempImagePath = preparedImport?.createdImagePath;
  const finalImagePath = preparedImport?.values?.image_path;
  if (!tempImagePath || !finalImagePath || tempImagePath === finalImagePath) return;

  const tempFullPath = getImageFullPath(tempImagePath);
  const finalFullPath = getImageFullPath(finalImagePath);

  if (!fs.existsSync(tempFullPath)) {
    preparedImport.createdImagePath = null;
    return;
  }

  if (fs.existsSync(finalFullPath)) {
    fs.unlinkSync(tempFullPath);
    preparedImport.createdImagePath = null;
    return;
  }

  fs.renameSync(tempFullPath, finalFullPath);
  preparedImport.createdImagePath = finalImagePath;
}

function cleanupPreparedSpotifyGraphqlAlbumImport(preparedImport) {
  const imagePath = preparedImport?.createdImagePath;
  if (!imagePath) return;

  if (imagePath === preparedImport?.values?.image_path) {
    const inUse = db.prepare(`
      SELECT 1
      FROM albums
      WHERE image_path = ?
      LIMIT 1
    `).get(imagePath);
    if (inUse) return;
  }

  const fullPath = getImageFullPath(imagePath);
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (error) {
    console.warn('Prepared import art cleanup failed:', error);
  }
}

async function prepareSpotifyGraphqlAlbumImport(raw, overrides = {}) {
  if (!raw || !raw.data || !raw.data.albumUnion) {
    throw new InvalidImportPayloadError('Invalid payload. Expected Spotify GraphQL album data.');
  }

  const album = raw.data.albumUnion;
  const spotifyUrl = raw.spotifyUrl ?? null;
  const spotifyId = raw.spotifyId ?? null;
  const rating = hasOwn(overrides, 'rating') ? validateRating(overrides.rating) : null;
  const status = hasOwn(overrides, 'status') ? validateStatus(overrides.status) : 'completed';
  const rawNotes = hasOwn(overrides, 'notes') ? (overrides.notes ?? null) : null;
  const notes = rawNotes === null ? null : await normalizeSpotifyNoteLinks(rawNotes);
  const plannedAt = hasOwn(overrides, 'planned_at')
    ? (overrides.planned_at || null)
    : (status === 'planned' ? localDateISO() : null);
  const listenedAt = hasOwn(overrides, 'listened_at')
    ? (overrides.listened_at || null)
    : (status === 'planned' ? null : localDateISO());
  const repeats = hasOwn(overrides, 'repeats')
    ? validateNonNegativeInt(overrides.repeats, 'Repeat listens')
    : 0;

  const albumName = album.name ?? 'Unknown Album';
  const albumType = album.type ?? null;
  const shareUrl = album.sharingInfo?.shareUrl ?? null;
  const isPreRelease = album.isPreRelease ? 1 : 0;

  const artists = (album.artists?.items ?? []).map(a => ({
    id: a.id ?? null,
    name: a.profile?.name ?? 'Unknown Artist',
    share_url: a.sharingInfo?.shareUrl ?? null,
    avatar_url: a.visuals?.avatarImage?.sources?.[0]?.url ?? null,
  }));
  if (artists.length === 0) {
    artists.push({ id: null, name: 'Unknown Artist', share_url: null, avatar_url: null });
  }

  const spotifyReleaseDate = extractSpotifyReleaseDateFromGraphqlPayload(raw);
  const spotifyFirstTrack = extractSpotifyFirstTrackFromGraphqlPayload(raw);
  const releaseDate = getReleaseDateFromSpotifyReleaseDate(spotifyReleaseDate);
  const releaseYear = deriveReleaseYear(releaseDate);

  const label = album.label ?? null;
  const genres = (album.genres?.items ?? []).map(g => g?.name).filter(Boolean);
  const trackCount = album.tracksV2?.totalCount ?? null;
  const durationMs = (album.tracksV2?.items ?? []).reduce((sum, item) => {
    return sum + (item?.track?.duration?.totalMilliseconds ?? 0);
  }, 0) || null;

  const copyright = (album.copyright?.items ?? []).map(c => ({
    text: c.text,
    type: c.type,
  }));

  const dominantColorDark = album.coverArt?.extractedColors?.colorDark?.hex ?? null;
  const dominantColorLight = album.coverArt?.extractedColors?.colorLight?.hex ?? null;
  const dominantColorRaw = album.coverArt?.extractedColors?.colorRaw?.hex ?? null;

  let imagePath = null;
  let createdImagePath = null;
  let imageUrlSmall = null;
  let imageUrlMedium = null;
  let imageUrlLarge = null;

  const sources = album.coverArt?.sources ?? [];
  if (sources.length > 0) {
    for (const s of sources) {
      if (s.width <= 64) imageUrlSmall = s.url;
      else if (s.width <= 300) imageUrlMedium = s.url;
      else imageUrlLarge = s.url;
    }

    const largest = sources.reduce((best, s) =>
      (s.width ?? 0) > (best.width ?? 0) ? s : best, sources[0]);
    if (largest.url && spotifyId) {
      const downloadedImage = await downloadImportImage(largest.url, spotifyId);
      imagePath = downloadedImage.imagePath;
      createdImagePath = downloadedImage.createdImagePath;
    }
  }

  return {
    createdImagePath,
    values: {
      spotify_url: spotifyUrl,
      spotify_album_id: spotifyId,
      share_url: shareUrl,
      album_name: albumName,
      album_type: albumType,
      artists: JSON.stringify(artists),
      release_date: releaseDate,
      release_year: releaseYear,
      label,
      genres: JSON.stringify(genres),
      track_count: trackCount,
      duration_ms: durationMs,
      copyright: JSON.stringify(copyright),
      is_pre_release: isPreRelease,
      dominant_color_dark: dominantColorDark,
      dominant_color_light: dominantColorLight,
      dominant_color_raw: dominantColorRaw,
      image_path: imagePath,
      status,
      rating,
      notes,
      planned_at: plannedAt,
      listened_at: listenedAt,
      repeats,
      priority: 0,
      image_url_small: imageUrlSmall,
      image_url_medium: imageUrlMedium,
      image_url_large: imageUrlLarge,
      source: 'spotify',
      spotify_release_date: spotifyReleaseDate ? JSON.stringify(spotifyReleaseDate) : null,
      spotify_first_track: spotifyFirstTrack ? JSON.stringify(spotifyFirstTrack) : null,
      spotify_graphql_json: JSON.stringify(raw),
    },
  };
}

function insertPreparedSpotifyGraphqlAlbum(preparedImport) {
  const values = preparedImport?.values;
  if (!values) {
    throw new InvalidImportPayloadError('Prepared Spotify album import is missing values.');
  }

  assertSpotifyAlbumNotImported(values.spotify_album_id);
  commitPreparedSpotifyGraphqlAlbumImport(preparedImport);

  let result;
  try {
    result = db.prepare(`
      INSERT INTO albums (
        spotify_url, spotify_album_id, share_url, album_name, album_type,
        artists, release_date, release_year, label, genres, track_count, duration_ms,
        copyright, is_pre_release, dominant_color_dark, dominant_color_light,
        dominant_color_raw, image_path, status, rating, notes, planned_at, listened_at,
        repeats, priority, image_url_small, image_url_medium, image_url_large,
        source, spotify_release_date, spotify_first_track, spotify_graphql_json
      ) VALUES (
        :spotify_url, :spotify_album_id, :share_url, :album_name, :album_type,
        :artists, :release_date, :release_year, :label, :genres, :track_count, :duration_ms,
        :copyright, :is_pre_release, :dominant_color_dark, :dominant_color_light,
        :dominant_color_raw, :image_path, :status, :rating, :notes, :planned_at, :listened_at,
        :repeats, :priority, :image_url_small, :image_url_medium, :image_url_large,
        :source, :spotify_release_date, :spotify_first_track, :spotify_graphql_json
      )
    `).run(values);
  } catch (error) {
    if (values.spotify_album_id && String(error.code || '').startsWith('SQLITE_CONSTRAINT')) {
      const existing = getExistingSpotifyAlbum(values.spotify_album_id);
      if (existing) throw new DuplicateAlbumError(existing);
    }
    throw error;
  }

  return parseAlbum(
    db.prepare(`SELECT * FROM albums WHERE id = ?`).get(result.lastInsertRowid)
  );
}

async function importSpotifyGraphqlAlbum(raw, overrides = {}) {
  let preparedImport = null;

  try {
    preparedImport = await prepareSpotifyGraphqlAlbumImport(raw, overrides);
    return insertPreparedSpotifyGraphqlAlbum(preparedImport);
  } catch (error) {
    cleanupPreparedSpotifyGraphqlAlbumImport(preparedImport);
    throw error;
  }
}

module.exports = {
  DuplicateAlbumError,
  InvalidImportPayloadError,
  cleanupPreparedSpotifyGraphqlAlbumImport,
  importSpotifyGraphqlAlbum,
  insertPreparedSpotifyGraphqlAlbum,
  prepareSpotifyGraphqlAlbumImport,
};
