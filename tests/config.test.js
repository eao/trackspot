import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  vi.restoreAllMocks();
  resetConfigModule();
});

describe('server config', () => {
  it('resolves relative runtime paths from the app root instead of process cwd', () => {
    process.env.DATA_DIR = './relative-data';
    resetConfigModule();
    const { APP_ROOT, getDataDir } = require('../server/config.js');

    expect(getDataDir()).toBe(path.join(APP_ROOT, 'relative-data'));
  });

  it('defaults to wildcard hosting for easy trusted-network access and appends configurable CORS origins', () => {
    process.env.HOST = '';
    process.env.PORT = '4242';
    process.env.CORS_ALLOWED_ORIGINS = 'http://example.test, http://lan.test:4242';
    process.env.TRUSTED_HOSTS = 'trackspot.local, 100.64.0.10:4242';
    vi.spyOn(os, 'hostname').mockReturnValue('trackspot-host');
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      'Wi-Fi': [
        { address: '192.168.1.42', family: 'IPv4', internal: false },
        { address: 'fe80::1234', family: 'IPv6', internal: false },
      ],
      Loopback: [
        { address: '127.0.0.1', family: 'IPv4', internal: true },
      ],
    });
    resetConfigModule();
    const { getCorsAllowedOrigins, getHost, getPort, getTrustedHosts } = require('../server/config.js');

    expect(getHost()).toBe('0.0.0.0');
    expect(getPort()).toBe('4242');
    expect(getCorsAllowedOrigins()).toEqual(expect.arrayContaining([
      'https://open.spotify.com',
      'https://xpui.app.spotify.com',
      'http://localhost:4242',
      'http://127.0.0.1:4242',
      'http://[::1]:4242',
      'http://example.test',
      'http://lan.test:4242',
    ]));
    expect(getCorsAllowedOrigins()).not.toContain('http://0.0.0.0:4242');
    expect(getTrustedHosts()).toEqual(expect.arrayContaining([
      'localhost',
      '127.0.0.1',
      '::1',
      'trackspot-host',
      '192.168.1.42',
      'fe80::1234',
      'example.test',
      'lan.test',
      'trackspot.local',
      '100.64.0.10',
    ]));
    expect(getTrustedHosts()).not.toContain('0.0.0.0');
  });

  it('allows security-minded users to opt into local-only hosting', () => {
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4242';
    process.env.CORS_ALLOWED_ORIGINS = '';
    process.env.TRUSTED_HOSTS = '';
    resetConfigModule();
    const { getCorsAllowedOrigins, getHost, getTrustedHosts } = require('../server/config.js');

    expect(getHost()).toBe('127.0.0.1');
    expect(getCorsAllowedOrigins()).toContain('http://127.0.0.1:4242');
    expect(getTrustedHosts()).toEqual(expect.arrayContaining([
      'localhost',
      '127.0.0.1',
      '::1',
    ]));
  });

  it('treats wildcard bind hosts as an explicit trusted-network opt in', () => {
    process.env.HOST = '0.0.0.0';
    vi.spyOn(os, 'hostname').mockReturnValue('trackspot-host');
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      Ethernet: [
        { address: '10.0.0.22', family: 'IPv4', internal: false },
      ],
    });
    resetConfigModule();
    const { getCorsAllowedOrigins, getTrustedHosts } = require('../server/config.js');

    expect(getCorsAllowedOrigins()).not.toContain('http://0.0.0.0:1060');
    expect(getTrustedHosts()).toEqual(expect.arrayContaining([
      'localhost',
      '127.0.0.1',
      '::1',
      'trackspot-host',
      '10.0.0.22',
    ]));
    expect(getTrustedHosts()).not.toContain('0.0.0.0');
  });
});
