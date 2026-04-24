const express = require('express');
const router = express.Router();
const { db, IMAGES_DIR } = require('../db');
const { fetchAlbumData, extractAlbumId } = require('../spotify');
const { parseAlbum } = require('../album-helpers');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ---------------------------------------------------------------------------
// Multer setup — handles image uploads for manual album entries.
// Images are stored directly in IMAGES_DIR with their original extension.
// ---------------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    // Use a timestamp + random suffix to avoid filename collisions.
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `manual_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed.'));
    }
  },
});

// ---------------------------------------------------------------------------
// POST /api/spotify/fetch
// Accepts a Spotify share URL, fetches metadata, downloads the album art,
// and returns the structured data to the frontend for review before saving.
// Nothing is written to the database here — this is purely a fetch/preview.
// ---------------------------------------------------------------------------

router.post('/fetch', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A Spotify URL is required.' });
  }

  try {
    // Check if this album is already logged before doing any API work.
    let albumId;
    try {
      albumId = extractAlbumId(url);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const existing = db.prepare(
      `SELECT id, album_name, artists FROM albums WHERE spotify_album_id = ?`
    ).get(albumId);

    if (existing) {
      return res.status(409).json({
        error: `This album has already been logged.`,
        existing_id: existing.id,
        album_name: existing.album_name,
        artists: JSON.parse(existing.artists ?? '[]'),
      });
    }

    const data = await fetchAlbumData(url);
    res.json(data);

  } catch (e) {
    console.error('Spotify fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/spotify/refetch/:id
// Re-fetches Spotify metadata for an already-logged album and updates the
// database record in place. Useful if Spotify data changes (rare) or if
// the original fetch was incomplete.
// The image is re-downloaded only if it doesn't already exist on disk.
// The user's rating, notes, and listened_at are not touched.
// ---------------------------------------------------------------------------

router.post('/refetch/:id', async (req, res) => {
  const existing = db.prepare(`SELECT * FROM albums WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Album not found.' });

  if (!existing.spotify_url) {
    return res.status(400).json({
      error: 'This album was entered manually and has no Spotify URL to re-fetch from.',
    });
  }

  try {
    const data = await fetchAlbumData(existing.spotify_url);

    db.prepare(`
      UPDATE albums SET
        album_name           = :album_name,
        album_type           = :album_type,
        artists              = :artists,
        release_date         = :release_date,
        release_year         = :release_year,
        label                = :label,
        genres               = :genres,
        track_count          = :track_count,
        duration_ms          = :duration_ms,
        copyright            = :copyright,
        is_pre_release       = :is_pre_release,
        dominant_color_dark  = :dominant_color_dark,
        dominant_color_light = :dominant_color_light,
        dominant_color_raw   = :dominant_color_raw,
        image_path           = :image_path,
        share_url            = :share_url,
        image_url_small      = :image_url_small,
        image_url_medium     = :image_url_medium,
        image_url_large      = :image_url_large,
        spotify_release_date = :spotify_release_date,
        spotify_first_track  = :spotify_first_track
      WHERE id = :id
    `).run({
      album_name:           data.album_name,
      album_type:           data.album_type ?? existing.album_type,
      artists:              JSON.stringify(data.artists ?? JSON.parse(existing.artists ?? '[]')),
      release_date:         data.release_date,
      release_year:         data.release_year,
      label:                data.label ?? existing.label,
      genres:               JSON.stringify(data.genres ?? JSON.parse(existing.genres ?? '[]')),
      track_count:          data.track_count ?? existing.track_count,
      duration_ms:          data.duration_ms ?? existing.duration_ms,
      copyright:            JSON.stringify(data.copyright ?? JSON.parse(existing.copyright ?? '[]')),
      is_pre_release:       data.is_pre_release ?? existing.is_pre_release,
      dominant_color_dark:  data.dominant_color_dark ?? existing.dominant_color_dark,
      dominant_color_light: data.dominant_color_light ?? existing.dominant_color_light,
      dominant_color_raw:   data.dominant_color_raw ?? existing.dominant_color_raw,
      image_path:           data.image_path ?? existing.image_path,
      share_url:            data.share_url ?? existing.share_url,
      image_url_small:      data.image_url_small  ?? null,
      image_url_medium:     data.image_url_medium ?? null,
      image_url_large:      data.image_url_large  ?? null,
      spotify_release_date: data.spotify_release_date ? JSON.stringify(data.spotify_release_date) : null,
      spotify_first_track:  data.spotify_first_track ? JSON.stringify(data.spotify_first_track) : null,
      id:                   req.params.id,
    });

    const updated = db.prepare(`SELECT * FROM albums WHERE id = ?`).get(req.params.id);
    res.json(parseAlbum(updated));

  } catch (e) {
    console.error('Spotify refetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/spotify/upload-image
// Handles manual image uploads for non-Spotify albums.
// Returns the relative image_path to be included when saving the album.
// ---------------------------------------------------------------------------

router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file received.' });
  }

  // Return the relative path in the same format as Spotify-downloaded images.
  const relativePath = `images/${req.file.filename}`;
  res.json({ image_path: relativePath });
});

module.exports = router;
