import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const originalEnv = {
  BACKUP_UPLOAD_MAX_BYTES: process.env.BACKUP_UPLOAD_MAX_BYTES,
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  DATA_DIR: process.env.DATA_DIR,
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  TRUSTED_HOSTS: process.env.TRUSTED_HOSTS,
};

function resetConfigModule() {
  delete require.cache[require.resolve('../server/config.js')];
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetConfigModule();
});

describe('server config', () => {
  it('resolves relative runtime paths from the app root instead of process cwd', () => {
    process.env.DATA_DIR = './relative-data';
    resetConfigModule();
    const { APP_ROOT, getDataDir } = require('../server/config.js');

    expect(getDataDir()).toBe(path.join(APP_ROOT, 'relative-data'));
  });

  it('uses local-only host defaults and appends configurable CORS origins', () => {
    delete process.env.HOST;
    process.env.PORT = '4242';
    process.env.CORS_ALLOWED_ORIGINS = 'http://example.test, http://lan.test:4242';
    process.env.TRUSTED_HOSTS = 'trackspot.local, 100.64.0.10:4242';
    resetConfigModule();
    const { getCorsAllowedOrigins, getHost, getPort, getTrustedHosts, shouldTrustAnyRequestHost } = require('../server/config.js');

    expect(getHost()).toBe('127.0.0.1');
    expect(getPort()).toBe('4242');
    expect(shouldTrustAnyRequestHost()).toBe(false);
    expect(getCorsAllowedOrigins()).toEqual(expect.arrayContaining([
      'https://open.spotify.com',
      'https://xpui.app.spotify.com',
      'http://localhost:4242',
      'http://[::1]:4242',
      'http://example.test',
      'http://lan.test:4242',
    ]));
    expect(getTrustedHosts()).toEqual(expect.arrayContaining([
      'localhost',
      '127.0.0.1',
      '::1',
      'example.test',
      'lan.test',
      'trackspot.local',
      '100.64.0.10',
    ]));
  });

  it('treats wildcard bind hosts as an explicit trusted-network opt in', () => {
    process.env.HOST = '0.0.0.0';
    resetConfigModule();
    const { getCorsAllowedOrigins, getTrustedHosts, shouldTrustAnyRequestHost } = require('../server/config.js');

    expect(shouldTrustAnyRequestHost()).toBe(true);
    expect(getCorsAllowedOrigins()).not.toContain('http://0.0.0.0:1060');
    expect(getTrustedHosts()).toEqual(expect.arrayContaining([
      'localhost',
      '127.0.0.1',
      '::1',
    ]));
    expect(getTrustedHosts()).not.toContain('0.0.0.0');
  });
});
