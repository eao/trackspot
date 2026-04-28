const path = require('path');
const dotenv = require('dotenv');

const APP_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(APP_ROOT, '.env');

dotenv.config({ path: ENV_PATH, quiet: true });

const DEFAULT_PORT = '1060';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_BACKUP_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;

function resolveConfigPath(rawValue, fallbackPath) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) return fallbackPath;
  return path.isAbsolute(value) ? value : path.resolve(APP_ROOT, value);
}

function getConfiguredPath(envName, fallbackPath) {
  return resolveConfigPath(process.env[envName], fallbackPath);
}

function getDataDir() {
  return getConfiguredPath('DATA_DIR', path.join(APP_ROOT, 'data'));
}

function getPort() {
  return String(process.env.PORT || DEFAULT_PORT).trim() || DEFAULT_PORT;
}

function getHost() {
  return String(process.env.HOST || DEFAULT_HOST).trim() || DEFAULT_HOST;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getBackupUploadMaxBytes() {
  return parsePositiveInteger(process.env.BACKUP_UPLOAD_MAX_BYTES, DEFAULT_BACKUP_UPLOAD_MAX_BYTES);
}

function parseOriginList(value) {
  return String(value || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function getCorsAllowedOrigins() {
  return [
    'https://open.spotify.com',
    'https://xpui.app.spotify.com',
    `http://localhost:${getPort()}`,
    ...parseOriginList(process.env.CORS_ALLOWED_ORIGINS),
  ];
}

module.exports = {
  APP_ROOT,
  ENV_PATH,
  DEFAULT_BACKUP_UPLOAD_MAX_BYTES,
  DEFAULT_HOST,
  DEFAULT_PORT,
  getBackupUploadMaxBytes,
  getConfiguredPath,
  getCorsAllowedOrigins,
  getDataDir,
  getHost,
  getPort,
  parsePositiveInteger,
  resolveConfigPath,
};
