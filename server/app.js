const express = require('express');
const path = require('path');

function createApp() {
  const app = express();

  // Parse incoming JSON request bodies. Spicetify album imports can exceed the
  // default 100 KB limit for especially large albums, so allow a modest buffer.
  app.use(express.json({ limit: '512kb' }));

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

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(
    '/vendor/html-to-image',
    express.static(path.join(__dirname, '..', 'node_modules', 'html-to-image', 'dist')),
  );

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

  const albumsRouter = require('./routes/albums');
  const backupRouter = require('./routes/backup');
  const importsRouter = require('./routes/imports');
  const backgroundsRouter = require('./routes/backgrounds');
  const opacityPresetsRouter = require('./routes/opacity-presets');
  const themesRouter = require('./routes/themes');
  const preferencesRouter = require('./routes/preferences');
  const welcomeTourRouter = require('./routes/welcome-tour');

  app.use('/api/albums', albumsRouter);
  app.use('/api/backup', backupRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api/backgrounds', backgroundsRouter);
  app.use('/api/opacity-presets', opacityPresetsRouter);
  app.use('/api/themes', themesRouter);
  app.use('/api/preferences', preferencesRouter);
  app.use('/api/welcome-tour', welcomeTourRouter);

  app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'An unexpected error occurred.';
    res.status(status).json({ error: message });
  });

  app.get('*path', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  return app;
}

module.exports = {
  createApp,
};
