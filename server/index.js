require('dotenv').config();
const express = require('express');
const path = require('path');
const { syncGeneratedColorSchemePresetsModule } = require('./color-scheme-presets');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

syncGeneratedColorSchemePresetsModule();

const app = express();
const PORT = process.env.PORT || 1060;

// Parse incoming JSON request bodies. Spicetify album imports can exceed the
// default 100 KB limit for especially large albums, so allow a modest buffer.
app.use(express.json({ limit: '512kb' }));

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
// The Spicetify extension runs inside the Spotify desktop client, which has
// its own origin. We need to allow it to POST to our API.
// We also allow localhost for browser-based testing.

app.use((req, res, next) => {
  const allowed = [
    'https://open.spotify.com',
    'https://xpui.app.spotify.com',
    'http://localhost:1060',
  ];
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');

  // OPTIONS is a preflight request browsers and Electron apps send before
  // the real request. We need to respond to it successfully or the actual
  // request will never be made.
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

// Serve the frontend (HTML, CSS, JS) from the public/ directory.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(
  '/vendor/html-to-image',
  express.static(path.join(__dirname, '..', 'node_modules', 'html-to-image', 'dist')),
);

// Serve album art images from the data directory.
// This means a file at data/images/abc123.jpg is accessible at
// http://localhost:1060/images/abc123.jpg — matching the image_path
// values stored in the database.
const { DATA_DIR, IMAGES_DIR } = require('./db');
const USER_BACKGROUNDS_DIR = process.env.USER_BACKGROUNDS_DIR || path.join(DATA_DIR, 'backgrounds-user');
const USER_BACKGROUND_THUMBS_DIR = process.env.USER_BACKGROUND_THUMBS_DIR || path.join(DATA_DIR, 'backgrounds-user-thumbs');
const PRESET_BACKGROUNDS_DIR = process.env.PRESET_BACKGROUNDS_DIR || path.join(__dirname, '..', 'public', 'background-presets');
const PRESET_BACKGROUND_THUMBS_DIR = process.env.PRESET_BACKGROUND_THUMBS_DIR || path.join(__dirname, '..', 'public', 'background-presets-thumbs');
const SECONDARY_USER_BACKGROUNDS_DIR = process.env.SECONDARY_USER_BACKGROUNDS_DIR || path.join(DATA_DIR, 'backgrounds-user-secondary');
const SECONDARY_USER_BACKGROUND_THUMBS_DIR = process.env.SECONDARY_USER_BACKGROUND_THUMBS_DIR || path.join(DATA_DIR, 'backgrounds-user-secondary-thumbs');
const SECONDARY_PRESET_BACKGROUNDS_DIR = process.env.SECONDARY_PRESET_BACKGROUNDS_DIR || path.join(__dirname, '..', 'public', 'background-presets-secondary');
const SECONDARY_PRESET_BACKGROUND_THUMBS_DIR = process.env.SECONDARY_PRESET_BACKGROUND_THUMBS_DIR || path.join(__dirname, '..', 'public', 'background-presets-secondary-thumbs');
const THEME_PREVIEW_IMAGES_DIR = process.env.THEME_PREVIEW_IMAGES_DIR || path.join(DATA_DIR, 'theme-preview-images');
const THEME_PREVIEW_IMAGES_THUMBS_DIR = process.env.THEME_PREVIEW_IMAGES_THUMBS_DIR || path.join(DATA_DIR, 'theme-preview-images-thumbs');
const SEED_THEME_PREVIEW_IMAGES_DIR = path.join(__dirname, 'seed-data', 'theme-preview-images');
const SEED_THEME_PREVIEW_IMAGES_THUMBS_DIR = path.join(__dirname, 'seed-data', 'theme-preview-images-thumbs');
app.use('/images', express.static(path.join(IMAGES_DIR, '..', 'images')));
app.use('/backgrounds/user', express.static(USER_BACKGROUNDS_DIR));
app.use('/backgrounds/user-thumbnails', express.static(USER_BACKGROUND_THUMBS_DIR));
app.use('/backgrounds/presets', express.static(PRESET_BACKGROUNDS_DIR));
app.use('/backgrounds/preset-thumbnails', express.static(PRESET_BACKGROUND_THUMBS_DIR));
app.use('/backgrounds/secondary/user', express.static(SECONDARY_USER_BACKGROUNDS_DIR));
app.use('/backgrounds/secondary/user-thumbnails', express.static(SECONDARY_USER_BACKGROUND_THUMBS_DIR));
app.use('/backgrounds/secondary/presets', express.static(SECONDARY_PRESET_BACKGROUNDS_DIR));
app.use('/backgrounds/secondary/preset-thumbnails', express.static(SECONDARY_PRESET_BACKGROUND_THUMBS_DIR));
app.use('/theme-previews', express.static(THEME_PREVIEW_IMAGES_DIR));
app.use('/theme-previews', express.static(SEED_THEME_PREVIEW_IMAGES_DIR));
app.use('/theme-previews-thumbs', express.static(THEME_PREVIEW_IMAGES_THUMBS_DIR));
app.use('/theme-previews-thumbs', express.static(SEED_THEME_PREVIEW_IMAGES_THUMBS_DIR));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

const albumsRouter = require('./routes/albums');
const spotifyRouter = require('./routes/spotify');
const backupRouter  = require('./routes/backup');
const importsRouter = require('./routes/imports');
const backgroundsRouter = require('./routes/backgrounds');
const opacityPresetsRouter = require('./routes/opacity-presets');
const themesRouter = require('./routes/themes');
const preferencesRouter = require('./routes/preferences');

app.use('/api/albums', albumsRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/backup', backupRouter);
app.use('/api/imports', importsRouter);
app.use('/api/backgrounds', backgroundsRouter);
app.use('/api/opacity-presets', opacityPresetsRouter);
app.use('/api/themes', themesRouter);
app.use('/api/preferences', preferencesRouter);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

// Catches errors thrown by multer (e.g. file too large, wrong type)
// and any other unhandled errors in route handlers.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred.';
  res.status(status).json({ error: message });
});

// ---------------------------------------------------------------------------
// Catch-all route
// ---------------------------------------------------------------------------

// Any request that doesn't match an API route or a static file gets
// served index.html. This is standard practice for single-page apps —
// it means if you ever bookmark a specific URL within the app, the
// server will still serve the page correctly rather than returning a 404.
app.get('*path', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Album tracker running on port ${PORT}`);
});
