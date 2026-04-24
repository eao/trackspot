const { db } = require('./db');
const { downloadImage } = require('./spotify-helpers');
const {
  deriveReleaseYear,
  getReleaseDateFromSpotifyReleaseDate,
  localDateISO,
  parseAlbum,
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

async function importSpotifyGraphqlAlbum(raw, overrides = {}) {
  if (!raw || !raw.data || !raw.data.albumUnion) {
    throw new InvalidImportPayloadError('Invalid payload. Expected Spotify GraphQL album data.');
  }

  const album = raw.data.albumUnion;
  const spotifyUrl = raw.spotifyUrl ?? null;
  const spotifyId = raw.spotifyId ?? null;

  if (spotifyId) {
    const existing = db.prepare(
      `SELECT id, album_name, artists FROM albums WHERE spotify_album_id = ?`
    ).get(spotifyId);
    if (existing) {
      throw new DuplicateAlbumError({
        ...existing,
        artists: JSON.parse(existing.artists ?? '[]'),
      });
    }
  }

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
      imagePath = await downloadImage(largest.url, spotifyId);
    }
  }

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

  const result = db.prepare(`
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
  `).run({
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
  });

  return parseAlbum(
    db.prepare(`SELECT * FROM albums WHERE id = ?`).get(result.lastInsertRowid)
  );
}

module.exports = {
  DuplicateAlbumError,
  InvalidImportPayloadError,
  importSpotifyGraphqlAlbum,
};
