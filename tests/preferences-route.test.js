import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const modulePaths = [
  '../server/routes/preferences.js',
  '../server/preferences-store.js',
  '../server/atomic-json.js',
  '../server/db.js',
];

const tempDirs = [];

function resetModules() {
  for (const modulePath of modulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function loadPreferencesRouteContext() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackspot-preferences-route-test-'));
  tempDirs.push(dataDir);
  process.env.DATA_DIR = dataDir;
  resetModules();

  return {
    preferencesRouter: require('../server/routes/preferences.js'),
  };
}

function getRouteHandler(router, method, routePath) {
  const layer = router.stack.find(entry =>
    entry.route?.path === routePath && entry.route.methods?.[method]
  );
  return layer?.route?.stack?.[0]?.handle ?? null;
}

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();

  delete process.env.DATA_DIR;
  resetModules();

  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('preferences route', () => {
  it('returns normalized defaults when no preferences file exists yet', () => {
    const { preferencesRouter } = loadPreferencesRouteContext();
    const handler = getRouteHandler(preferencesRouter, 'get', '/');
    const res = createResponse();

    handler({}, res, error => { throw error; });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.preferences).toEqual({
      complexStatuses: [
        { id: 'cs_listened', name: 'Listened', statuses: ['completed', 'dropped'], includedWithApp: true },
        { id: 'cs_all', name: 'All', statuses: ['completed', 'dropped', 'planned'], includedWithApp: true },
      ],
      grinchMode: false,
      accentPeriod: true,
      earlyWrapped: false,
      seasonalThemeHistory: {},
      wrappedName: '',
      welcomeTourCompletedAt: null,
      welcomeTourSkippedAt: null,
      welcomeSamplesAddedAt: null,
      contentWidthPx: 1000,
      pageControlVisibility: 'hover',
      quickActionsToolbarVisibility: 'visible',
      filterPreset: null,
      headerScrollMode: 'smart',
      listArtClickToEnlarge: true,
      reserveSidebarSpace: false,
      paginationMode: 'suggested',
      paginationPageSize: 18,
      showFirstLastPages: false,
      showPageCount: true,
      showRepeatsField: true,
      showPriorityField: false,
      showRefetchArt: false,
      showPlannedAtField: false,
      uButtons: [],
    });
  });

  it('persists patched complex statuses and seasonal preferences', () => {
    const { preferencesRouter } = loadPreferencesRouteContext();
    const handler = getRouteHandler(preferencesRouter, 'patch', '/');
    const res = createResponse();

    handler({
      body: {
        complexStatuses: [
          { id: 'cs_listened', name: 'Listened', statuses: ['completed', 'dropped'], includedWithApp: true },
          { id: 'cs_all', name: 'All', statuses: ['completed', 'dropped', 'planned'], includedWithApp: true },
          { id: 'cs_focus', name: 'Focus', statuses: ['planned'], includedWithApp: false },
        ],
        grinchMode: true,
        accentPeriod: true,
        earlyWrapped: true,
        seasonalThemeHistory: {
          christmas: 2026,
        },
        wrappedName: 'Erik',
        contentWidthPx: 1600,
        pageControlVisibility: 'static',
        quickActionsToolbarVisibility: 'hover',
        filterPreset: {
          filters: { search: 'jazz' },
          sort: { field: 'rating', order: 'desc' },
        },
        headerScrollMode: 'fixed',
        listArtClickToEnlarge: false,
        reserveSidebarSpace: true,
        paginationMode: 'custom',
        paginationPageSize: 50,
        showFirstLastPages: true,
        showPageCount: false,
        showRepeatsField: false,
        showPriorityField: true,
        showRefetchArt: true,
        showPlannedAtField: true,
        uButtons: [
          { id: 'sort', enabled: false },
        ],
      },
    }, res, error => { throw error; });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.preferences).toEqual({
      complexStatuses: [
        { id: 'cs_listened', name: 'Listened', statuses: ['completed', 'dropped'], includedWithApp: true },
        { id: 'cs_all', name: 'All', statuses: ['completed', 'dropped', 'planned'], includedWithApp: true },
        { id: 'cs_focus', name: 'Focus', statuses: ['planned'], includedWithApp: false },
      ],
      grinchMode: true,
      accentPeriod: true,
      earlyWrapped: true,
      seasonalThemeHistory: {
        christmas: 2026,
      },
      wrappedName: 'Erik',
      welcomeTourCompletedAt: null,
      welcomeTourSkippedAt: null,
      welcomeSamplesAddedAt: null,
      contentWidthPx: 1600,
      pageControlVisibility: 'static',
      quickActionsToolbarVisibility: 'hover',
      filterPreset: {
        filters: { search: 'jazz' },
        sort: { field: 'rating', order: 'desc' },
      },
      headerScrollMode: 'fixed',
      listArtClickToEnlarge: false,
      reserveSidebarSpace: true,
      paginationMode: 'custom',
      paginationPageSize: 50,
      showFirstLastPages: true,
      showPageCount: false,
      showRepeatsField: false,
      showPriorityField: true,
      showRefetchArt: true,
      showPlannedAtField: true,
      uButtons: [
        { id: 'sort', enabled: false },
      ],
    });

    const readHandler = getRouteHandler(preferencesRouter, 'get', '/');
    const readRes = createResponse();
    readHandler({}, readRes, error => { throw error; });

    expect(readRes.jsonBody.preferences).toEqual(res.jsonBody.preferences);
  });

  it('keeps the previous preferences file when an atomic write fails', () => {
    loadPreferencesRouteContext();
    const store = require('../server/preferences-store.js');
    const preferencesPath = path.join(process.env.DATA_DIR, 'preferences.json');
    const originalPreferences = {
      wrappedName: 'Keep Me',
      contentWidthPx: 1200,
    };
    fs.writeFileSync(preferencesPath, `${JSON.stringify(originalPreferences, null, 2)}\n`);

    const originalWriteFileSync = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((target, contents, options) => {
      if (typeof target === 'number') {
        throw new Error('simulated temp write failure');
      }
      return originalWriteFileSync.call(fs, target, contents, options);
    });

    expect(() => store.updatePreferences({ wrappedName: 'Overwrite Attempt' }))
      .toThrow(/simulated temp write failure/);

    vi.restoreAllMocks();

    expect(JSON.parse(fs.readFileSync(preferencesPath, 'utf8'))).toEqual(originalPreferences);
    expect(fs.readdirSync(path.dirname(preferencesPath)).filter(fileName => fileName.endsWith('.tmp'))).toEqual([]);
  });
});
