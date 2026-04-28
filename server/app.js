const express = require('express');
const path = require('path');
const {
  getConfiguredPath,
  getCorsAllowedOrigins,
  getTrustedHosts,
  normalizeHostName,
  shouldTrustAnyRequestHost,
} = require('./config');

function getOriginFromReferer(referer) {
  try {
    return referer ? new URL(referer).origin : '';
  } catch {
    return '';
  }
}

function getRequestOrigin(req) {
  const host = req.headers.host;
  if (!host) return '';
  return `${req.protocol || 'http'}://${host}`;
}

function getRequestHostName(req) {
  return normalizeHostName(req.headers.host);
}

function normalizeRemoteAddress(value) {
  let address = String(value || '').trim().toLowerCase();
  if (!address) return '';
  if (address.startsWith('::ffff:')) address = address.slice('::ffff:'.length);
  if (address.startsWith('[')) address = normalizeHostName(address);
  return address;
}

function isLoopbackRemoteAddress(value) {
  const address = normalizeRemoteAddress(value);
  return address === '::1'
    || address === '0:0:0:0:0:0:0:1'
    || address === 'localhost'
    || address.startsWith('127.');
}

function isLoopbackRequest(req) {
  return isLoopbackRemoteAddress(req.socket?.remoteAddress || req.connection?.remoteAddress);
}

function isReadOnlyRequest(req) {
  return req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
}

function isAllowedBrowserOrigin(browserOrigin, allowedOrigins) {
  if (!browserOrigin) return true;
  return allowedOrigins.has(browserOrigin);
}

function isSameOriginRequest(req, browserOrigin) {
  return Boolean(browserOrigin) && browserOrigin === getRequestOrigin(req);
}

function isTrustedRequestHost(req, trustedHosts, trustAnyRequestHost = false) {
  if (trustAnyRequestHost) return true;
  const hostName = getRequestHostName(req);
  if (!hostName) return true;
  return trustedHosts.has(hostName);
}

function createApp() {
  const app = express();

  const allowedOrigins = new Set(getCorsAllowedOrigins());
  const trustedHosts = new Set(getTrustedHosts());
  const trustAnyRequestHost = shouldTrustAnyRequestHost();
  app.use((req, res, next) => {
    if (!isTrustedRequestHost(req, trustedHosts, trustAnyRequestHost)) {
      return res.status(403).json({ error: 'Request host is not trusted.' });
    }

    const origin = req.headers.origin;
    if (origin && (allowedOrigins.has(origin) || isSameOriginRequest(req, origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    if (!isReadOnlyRequest(req)) {
      const browserOrigin = origin || getOriginFromReferer(req.headers.referer);
      if (!browserOrigin && !isLoopbackRequest(req)) {
        return res.status(403).json({ error: 'Cross-origin mutation rejected.' });
      }
      if (browserOrigin && !isSameOriginRequest(req, browserOrigin) && !isAllowedBrowserOrigin(browserOrigin, allowedOrigins)) {
        return res.status(403).json({ error: 'Cross-origin mutation rejected.' });
      }
    }
    return next();
  });

  // Parse incoming JSON request bodies. Spicetify album imports can exceed the
  // default 100 KB limit for especially large albums, so allow a modest buffer.
  app.use(express.json({ limit: '512kb' }));

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(
    '/vendor/html-to-image',
    express.static(path.join(__dirname, '..', 'node_modules', 'html-to-image', 'dist')),
  );

  const { DATA_DIR, IMAGES_DIR } = require('./db');
  const {
    USER_BACKGROUNDS_DIR,
    USER_BACKGROUND_THUMBS_DIR,
    PRESET_BACKGROUNDS_DIR,
    PRESET_BACKGROUND_THUMBS_DIR,
    PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
    SECONDARY_USER_BACKGROUNDS_DIR,
    SECONDARY_USER_BACKGROUND_THUMBS_DIR,
    SECONDARY_PRESET_BACKGROUNDS_DIR,
    SECONDARY_PRESET_BACKGROUND_THUMBS_DIR,
    SECONDARY_PUBLIC_PRESET_BACKGROUND_THUMBS_DIR,
  } = require('./background-library');
  const THEME_PREVIEW_IMAGES_DIR = getConfiguredPath('THEME_PREVIEW_IMAGES_DIR', path.join(DATA_DIR, 'theme-preview-images'));
  const THEME_PREVIEW_IMAGES_THUMBS_DIR = getConfiguredPath('THEME_PREVIEW_IMAGES_THUMBS_DIR', path.join(DATA_DIR, 'theme-preview-images-thumbs'));
  const SEED_THEME_PREVIEW_IMAGES_DIR = path.join(__dirname, 'seed-data', 'theme-preview-images');
  const SEED_THEME_PREVIEW_IMAGES_THUMBS_DIR = path.join(__dirname, 'seed-data', 'theme-preview-images-thumbs');

  app.use('/images', express.static(IMAGES_DIR));
  app.use('/backgrounds/user', express.static(USER_BACKGROUNDS_DIR));
  app.use('/backgrounds/user-thumbnails', express.static(USER_BACKGROUND_THUMBS_DIR));
  app.use('/backgrounds/presets', express.static(PRESET_BACKGROUNDS_DIR));
  app.use('/backgrounds/preset-thumbnails', express.static(PRESET_BACKGROUND_THUMBS_DIR));
  app.use('/backgrounds/preset-thumbnails', express.static(PUBLIC_PRESET_BACKGROUND_THUMBS_DIR));
  app.use('/backgrounds/secondary/user', express.static(SECONDARY_USER_BACKGROUNDS_DIR));
  app.use('/backgrounds/secondary/user-thumbnails', express.static(SECONDARY_USER_BACKGROUND_THUMBS_DIR));
  app.use('/backgrounds/secondary/presets', express.static(SECONDARY_PRESET_BACKGROUNDS_DIR));
  app.use('/backgrounds/secondary/preset-thumbnails', express.static(SECONDARY_PRESET_BACKGROUND_THUMBS_DIR));
  app.use('/backgrounds/secondary/preset-thumbnails', express.static(SECONDARY_PUBLIC_PRESET_BACKGROUND_THUMBS_DIR));
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
  const { trackNonBackupMutation } = require('./backup-mutation-lock');

  app.use('/api/albums', trackNonBackupMutation, albumsRouter);
  app.use('/api/backup', backupRouter);
  app.use('/api/imports', trackNonBackupMutation, importsRouter);
  app.use('/api/backgrounds', trackNonBackupMutation, backgroundsRouter);
  app.use('/api/opacity-presets', trackNonBackupMutation, opacityPresetsRouter);
  app.use('/api/themes', trackNonBackupMutation, themesRouter);
  app.use('/api/preferences', trackNonBackupMutation, preferencesRouter);
  app.use('/api/welcome-tour', trackNonBackupMutation, welcomeTourRouter);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  app.get('*path', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.use((err, req, res, _next) => {
    console.error(err);
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'An unexpected error occurred.';
    res.status(status).json({ error: message });
  });

  return app;
}

module.exports = {
  createApp,
  getOriginFromReferer,
  getRequestHostName,
  getRequestOrigin,
  isLoopbackRemoteAddress,
  isAllowedBrowserOrigin,
  isReadOnlyRequest,
  isSameOriginRequest,
  isTrustedRequestHost,
};
