const path = require('path');
const os = require('os');
const dotenv = require('dotenv');

const APP_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(APP_ROOT, '.env');

dotenv.config({ path: ENV_PATH, quiet: true });

const DEFAULT_PORT = '1060';
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_BACKUP_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]', '*']);

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

function parseList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseOriginList(value) {
  return parseList(value)
    .map(origin => {
      try {
        return new URL(origin).origin;
      } catch {
        return origin.replace(/\/+$/, '');
      }
    });
}

function normalizeHostName(value) {
  let raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const protocolIndex = raw.indexOf('://');
  if (protocolIndex !== -1) raw = raw.slice(protocolIndex + 3);
  raw = raw.split('/')[0];

  if (raw.startsWith('[')) {
    const closingBracket = raw.indexOf(']');
    return closingBracket === -1 ? raw : raw.slice(1, closingBracket);
  }

  const colonCount = (raw.match(/:/g) || []).length;
  if (colonCount === 1) return raw.split(':')[0];
  return raw;
}

function formatHostForOrigin(host) {
  const normalized = normalizeHostName(host);
  if (!normalized) return '';
  return normalized.includes(':') ? `[${normalized}]` : normalized;
}

function isWildcardHost(value = getHost()) {
  return WILDCARD_HOSTS.has(normalizeHostName(value));
}

function getConfiguredHostOrigin() {
  const host = normalizeHostName(getHost());
  if (!host || isWildcardHost(host)) return null;
  return `http://${formatHostForOrigin(host)}:${getPort()}`;
}

function getHostNameFromOrigin(origin) {
  try {
    return normalizeHostName(new URL(origin).hostname);
  } catch {
    return '';
  }
}

function getLocalNetworkHosts() {
  const hosts = [];
  const hostName = normalizeHostName(os.hostname());
  if (hostName) hosts.push(hostName);

  Object.values(os.networkInterfaces() || {}).forEach(entries => {
    (entries || []).forEach(entry => {
      const address = normalizeHostName(entry?.address);
      if (address && !isWildcardHost(address)) hosts.push(address);
    });
  });

  return [...new Set(hosts)];
}

function getCorsAllowedOrigins() {
  return [...new Set([
    'https://open.spotify.com',
    'https://xpui.app.spotify.com',
    `http://localhost:${getPort()}`,
    `http://127.0.0.1:${getPort()}`,
    `http://[::1]:${getPort()}`,
    getConfiguredHostOrigin(),
    ...parseOriginList(process.env.CORS_ALLOWED_ORIGINS),
  ].filter(Boolean))];
}

function getTrustedHosts() {
  const configuredOrigins = parseOriginList(process.env.CORS_ALLOWED_ORIGINS);
  const configuredHost = normalizeHostName(getHost());
  const wildcardHost = isWildcardHost(configuredHost);
  const hosts = [
    'localhost',
    '127.0.0.1',
    '::1',
    wildcardHost ? '' : configuredHost,
    ...(wildcardHost ? getLocalNetworkHosts() : []),
    ...configuredOrigins.map(getHostNameFromOrigin),
    ...parseList(process.env.TRUSTED_HOSTS).map(normalizeHostName),
  ];
  return [...new Set(hosts.filter(Boolean))];
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
  getLocalNetworkHosts,
  getTrustedHosts,
  isWildcardHost,
  normalizeHostName,
  parsePositiveInteger,
  resolveConfigPath,
};
