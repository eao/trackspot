const fs = require('fs');
const path = require('path');
const { db, IMAGES_DIR } = require('./db');
const { parseAlbum } = require('./album-helpers');
const { getPreferences, updatePreferences } = require('./preferences-store');

const SAMPLE_KEYS = {
  SPOTIFY: 'spotify-placeholder',
  MANUAL: 'manual-placeholder',
};

const LOCK_TTL_MS = 20000;
const SAMPLE_ASSET_DIR = path.join(__dirname, '..', 'public', 'assets', 'welcome');
const activeLocks = new Map();

function nowIso() {
  return new Date().toISOString();
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function formatSampleDate(year, month, day) {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function getPastOrTodaySampleDate(now, month, day) {
  const year = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const isFutureInCurrentYear = month > currentMonth
    || (month === currentMonth && day > currentDay);
  return isFutureInCurrentYear
    ? formatSampleDate(year, currentMonth, currentDay)
    : formatSampleDate(year, month, day);
}

function getWelcomeSampleDates(now = new Date()) {
  return {
    spotifyListenedAt: getPastOrTodaySampleDate(now, 1, 15),
    manualListenedAt: getPastOrTodaySampleDate(now, 2, 1),
  };
}

function pruneExpiredLocks(now = Date.now()) {
  for (const [sessionId, lock] of activeLocks.entries()) {
    if (!lock || lock.expiresAt <= now) {
      activeLocks.delete(sessionId);
    }
  }
}

function hasActiveWelcomeTourLock() {
  pruneExpiredLocks();
  return activeLocks.size > 0;
}

function upsertWelcomeTourLock(sessionId) {
  const normalizedSessionId = typeof sessionId === 'string' && sessionId.trim()
    ? sessionId.trim()
    : `welcome-tour-${Math.random().toString(36).slice(2)}`;
  const expiresAt = Date.now() + LOCK_TTL_MS;
  activeLocks.set(normalizedSessionId, { expiresAt });
  return {
    sessionId: normalizedSessionId,
    expiresAt: new Date(expiresAt).toISOString(),
    ttlMs: LOCK_TTL_MS,
  };
}

function releaseWelcomeTourLock(sessionId) {
  if (typeof sessionId === 'string' && sessionId.trim()) {
    activeLocks.delete(sessionId.trim());
  }
  pruneExpiredLocks();
  return { active: hasActiveWelcomeTourLock() };
}

function rejectIfWelcomeTourLocked(req, res, next) {
  if (!hasActiveWelcomeTourLock()) return next();
  return res.status(423).json({
    error: 'Finish or leave the Trackspot welcome tour before changing albums.',
    code: 'welcome_tour_active',
  });
}

function getWelcomeSampleRows() {
  return db.prepare(`
    SELECT *
    FROM albums
    WHERE welcome_sample_key IN (?, ?)
    ORDER BY CASE welcome_sample_key
      WHEN ? THEN 0
      ELSE 1
    END, id ASC
  `).all(SAMPLE_KEYS.SPOTIFY, SAMPLE_KEYS.MANUAL, SAMPLE_KEYS.SPOTIFY);
}

function getWelcomeTourStatus() {
  const preferences = getPreferences();
  const albumCount = db.prepare('SELECT COUNT(*) AS count FROM albums').get()?.count ?? 0;
  const sampleRows = getWelcomeSampleRows();
  return {
    preferences,
    albumCount,
    sampleCount: sampleRows.length,
    samples: sampleRows.map(row => parseAlbum(row, { includeSpotifyGraphqlJson: false })),
    shouldAutoStart: albumCount === 0
      && !preferences.welcomeTourCompletedAt
      && !preferences.welcomeTourSkippedAt,
    lockActive: hasActiveWelcomeTourLock(),
  };
}

function markWelcomeTourComplete({ skipped = false } = {}) {
  const timestamp = nowIso();
  return updatePreferences(skipped
    ? {
        welcomeTourSkippedAt: timestamp,
        welcomeTourCompletedAt: null,
      }
    : {
        welcomeTourCompletedAt: timestamp,
        welcomeTourSkippedAt: null,
      });
}

function copySampleArt(assetName, destinationName) {
  const src = path.join(SAMPLE_ASSET_DIR, assetName);
  const dest = path.join(IMAGES_DIR, destinationName);
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  if (!fs.existsSync(src)) {
    throw new Error(`Missing welcome sample art asset: ${assetName}`);
  }
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
  }
  return `images/${destinationName}`;
}

function buildWelcomeSamples() {
  const sampleDates = getWelcomeSampleDates();
  return [
    {
      welcome_sample_key: SAMPLE_KEYS.SPOTIFY,
      spotify_url: 'spotify:album:4pj54JwPaS9XsSRTTgAWZg',
      spotify_album_id: null,
      share_url: null,
      album_name: 'Placeholder Spotify Import',
      album_type: 'ALBUM',
      artists: JSON.stringify([{
        id: null,
        name: 'Example Spotify Artist',
        share_url: null,
        avatar_url: null,
        manual_link: 'spotify:artist:3MKCzCnpzw3TjUYs2v7vDA',
      }]),
      release_date: '1962-01-01',
      release_year: 1962,
      label: 'Example Label',
      genres: JSON.stringify(['Placeholder']),
      track_count: 3,
      duration_ms: 2101839,
      copyright: JSON.stringify([]),
      is_pre_release: 0,
      image_path: copySampleArt('placeholder-spotify-album.jpg', 'welcome-placeholder-spotify-album.jpg'),
      status: 'completed',
      rating: 92,
      notes: 'This placeholder album behaves like a import from Spotify via the Spicetify extension. Imported metadata is read-only, but your listening details stay editable.',
      planned_at: null,
      listened_at: sampleDates.spotifyListenedAt,
      repeats: 0,
      priority: 0,
      source: 'spotify',
      album_link: 'spotify:album:4pj54JwPaS9XsSRTTgAWZg',
      artist_link: null,
    },
    {
      welcome_sample_key: SAMPLE_KEYS.MANUAL,
      spotify_url: null,
      spotify_album_id: null,
      share_url: null,
      album_name: 'Placeholder Manual Log',
      album_type: 'ALBUM',
      artists: JSON.stringify([{
        id: null,
        name: 'Example Manual Artist',
        share_url: null,
        avatar_url: null,
        manual_link: 'https://en.wikipedia.org/wiki/Musician',
      }]),
      release_date: '2024-04-01',
      release_year: 2024,
      label: null,
      genres: JSON.stringify([]),
      track_count: 10,
      duration_ms: 2420000,
      copyright: JSON.stringify([]),
      is_pre_release: 0,
      image_path: copySampleArt('placeholder-manual-album.jpg', 'welcome-placeholder-manual-album.jpg'),
      status: 'dropped',
      rating: null,
      notes: 'Manual logs are albums you have entered yourself. You can edit their title, artist, dates, links, art, etc.',
      planned_at: null,
      listened_at: sampleDates.manualListenedAt,
      repeats: 0,
      priority: 1,
      source: 'manual',
      album_link: 'https://en.wikipedia.org/wiki/Album',
      artist_link: 'https://en.wikipedia.org/wiki/Musician',
    },
  ];
}

function insertWelcomeSamples() {
  const removed = removeWelcomeSamples();
  const samples = buildWelcomeSamples();

  const insert = db.prepare(`
    INSERT INTO albums (
      spotify_url, spotify_album_id, share_url, album_name, album_type,
      artists, release_date, release_year, label, genres, track_count, duration_ms,
      copyright, is_pre_release, image_path, status, rating, notes, planned_at,
      listened_at, repeats, priority, source, album_link, artist_link, welcome_sample_key
    ) VALUES (
      :spotify_url, :spotify_album_id, :share_url, :album_name, :album_type,
      :artists, :release_date, :release_year, :label, :genres, :track_count, :duration_ms,
      :copyright, :is_pre_release, :image_path, :status, :rating, :notes, :planned_at,
      :listened_at, :repeats, :priority, :source, :album_link, :artist_link, :welcome_sample_key
    )
  `);

  const run = db.transaction(rows => {
    rows.forEach(row => insert.run(row));
  });
  run(samples);

  const preferences = updatePreferences({ welcomeSamplesAddedAt: nowIso() });
  return {
    preferences,
    samples: getWelcomeSampleRows().map(row => parseAlbum(row, { includeSpotifyGraphqlJson: false })),
    insertedCount: samples.length,
    replacedCount: removed.removedCount,
  };
}

function removeWelcomeSamples() {
  const rows = getWelcomeSampleRows();
  const imagePaths = rows.map(row => row.image_path).filter(Boolean);
  db.prepare(`
    DELETE FROM albums
    WHERE welcome_sample_key IN (?, ?)
  `).run(SAMPLE_KEYS.SPOTIFY, SAMPLE_KEYS.MANUAL);

  imagePaths.forEach(imagePath => {
    const fullPath = path.join(IMAGES_DIR, '..', imagePath);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (_) {}
  });

  return {
    removedCount: rows.length,
    preferences: getPreferences(),
  };
}

module.exports = {
  SAMPLE_KEYS,
  getWelcomeTourStatus,
  markWelcomeTourComplete,
  insertWelcomeSamples,
  removeWelcomeSamples,
  upsertWelcomeTourLock,
  releaseWelcomeTourLock,
  hasActiveWelcomeTourLock,
  rejectIfWelcomeTourLocked,
};
