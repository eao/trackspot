import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTempDataDir,
  makeMultipartBody,
  removeTempDir,
  requestJson,
  resetServerModules,
  startTestServer,
} from './helpers/server.js';

const require = createRequire(import.meta.url);
const serverModulePaths = [
  'server/app.js',
  'server/routes/themes.js',
  'server/routes/opacity-presets.js',
  'server/routes/backgrounds.js',
  'server/routes/albums.js',
  'server/routes/backup.js',
  'server/routes/imports.js',
  'server/routes/preferences.js',
  'server/routes/welcome-tour.js',
  'server/personalization-store.js',
  'server/background-library.js',
  'server/preferences-store.js',
  'server/welcome-tour-store.js',
  'server/db.js',
];
const seedThemesDir = path.join(process.cwd(), 'server', 'seed-data', 'themes');

let dataDir;
let dbModule;
let testServer;
const tempDirs = [];

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function readSeedThemes() {
  return fs.readdirSync(seedThemesDir)
    .filter(fileName => fileName.endsWith('.json'))
    .map(fileName => JSON.parse(fs.readFileSync(path.join(seedThemesDir, fileName), 'utf8')));
}

function createSeedBackgroundPlaceholders(primaryPresetDir, secondaryPresetDir) {
  readSeedThemes().forEach(theme => {
    if (theme.primaryBackgroundSelection?.kind === 'preset') {
      fs.writeFileSync(path.join(primaryPresetDir, theme.primaryBackgroundSelection.id), 'preset');
    }
    if (theme.secondaryBackgroundSelection?.kind === 'preset') {
      fs.writeFileSync(path.join(secondaryPresetDir, theme.secondaryBackgroundSelection.id), 'preset');
    }
  });
}

function loadPersonalizationRouteContext() {
  dataDir = createTempDataDir('trackspot-personalization-routes-');
  const presetDir = makeTempDir('trackspot-personalization-preset-bg-');
  const presetThumbDir = makeTempDir('trackspot-personalization-preset-bg-thumbs-');
  const secondaryPresetDir = makeTempDir('trackspot-personalization-secondary-preset-bg-');
  const secondaryPresetThumbDir = makeTempDir('trackspot-personalization-secondary-preset-bg-thumbs-');
  process.env.PRESET_BACKGROUNDS_DIR = presetDir;
  process.env.PRESET_BACKGROUND_THUMBS_DIR = presetThumbDir;
  process.env.SECONDARY_PRESET_BACKGROUNDS_DIR = secondaryPresetDir;
  process.env.SECONDARY_PRESET_BACKGROUND_THUMBS_DIR = secondaryPresetThumbDir;
  createSeedBackgroundPlaceholders(presetDir, secondaryPresetDir);

  resetServerModules(serverModulePaths);
  dbModule = require('../server/db.js');
  const { createApp } = require('../server/app.js');
  const app = createApp();
  const store = require('../server/personalization-store.js');
  return { app, store };
}

function writeDataFile(relativePath, contents = 'file') {
  const filePath = path.join(dataDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function makeThemeInput(overrides = {}) {
  return {
    name: `Theme ${Date.now()} ${Math.random().toString(36).slice(2)}`,
    description: 'Route test theme',
    colorSchemePresetId: 'bunan-blue',
    opacityPresetId: 'default-opaque',
    primaryBackgroundSelection: null,
    primaryBackgroundDisplay: null,
    secondaryBackgroundSelection: null,
    secondaryBackgroundDisplay: null,
    previewImageFile: {
      originalname: 'preview.png',
      mimetype: 'image/png',
      buffer: Buffer.from('preview'),
    },
    previewThumbnailFile: null,
    ...overrides,
  };
}

afterEach(async () => {
  await testServer?.close();
  testServer = null;
  dbModule?.db?.close();
  dbModule = null;
  delete process.env.DATA_DIR;
  delete process.env.PRESET_BACKGROUNDS_DIR;
  delete process.env.PRESET_BACKGROUND_THUMBS_DIR;
  delete process.env.SECONDARY_PRESET_BACKGROUNDS_DIR;
  delete process.env.SECONDARY_PRESET_BACKGROUND_THUMBS_DIR;
  resetServerModules(serverModulePaths);
  removeTempDir(dataDir);
  dataDir = null;
  while (tempDirs.length) removeTempDir(tempDirs.pop());
});

describe('personalization API routes', () => {
  it('creates a theme from multipart fields and writes preview assets', async () => {
    const { app, store } = loadPersonalizationRouteContext();
    const backgroundName = 'route-background.png';
    writeDataFile(`backgrounds-user/${backgroundName}`, 'background');
    testServer = await startTestServer(app);

    const result = await requestJson(testServer.baseUrl, '/api/themes', {
      method: 'POST',
      ...makeMultipartBody({
        name: 'Multipart Theme',
        description: 'Created by route test',
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
        primaryBackgroundSelection: JSON.stringify({ kind: 'user', id: backgroundName }),
        primaryBackgroundDisplay: JSON.stringify({
          positionX: 'left',
          positionY: 'bottom',
          fill: 'fit-width',
          customScale: 2,
        }),
      }, {
        previewImage: {
          name: 'preview.png',
          type: 'image/png',
          contents: Buffer.from('preview-image'),
        },
      }),
    });

    expect(result.status).toBe(201);
    expect(result.body.theme).toMatchObject({
      name: 'Multipart Theme',
      description: 'Created by route test',
      primaryBackgroundSelection: {
        kind: 'user',
        fileName: backgroundName,
      },
      primaryBackgroundDisplay: {
        positionX: 'left',
        positionY: 'bottom',
        fill: 'fit-width',
        customScale: 2,
      },
      previewImage: {
        fileName: expect.stringMatching(/__preview\.png$/),
        url: expect.stringContaining('/theme-previews/'),
      },
    });
    expect(fs.existsSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, result.body.theme.previewImage.fileName))).toBe(true);
    expect(fs.readdirSync(store.THEMES_DIR).filter(fileName => fileName.endsWith('.json'))).toHaveLength(1);
  });

  it('rejects malformed background JSON without creating a theme file', async () => {
    const { app, store } = loadPersonalizationRouteContext();
    testServer = await startTestServer(app);

    const result = await requestJson(testServer.baseUrl, '/api/themes', {
      method: 'POST',
      ...makeMultipartBody({
        name: 'Broken Theme',
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
        primaryBackgroundSelection: '{"kind":',
      }, {
        previewImage: {
          name: 'preview.png',
          type: 'image/png',
          contents: Buffer.from('preview-image'),
        },
      }),
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/Could not parse primary background selection/);
    expect(fs.readdirSync(store.THEMES_DIR).filter(fileName => fileName.endsWith('.json'))).toEqual([]);
    expect(fs.readdirSync(store.THEME_PREVIEW_IMAGES_DIR)).toEqual([]);
  });

  it('patches a theme without replacing its existing preview image', async () => {
    const { app, store } = loadPersonalizationRouteContext();
    const theme = store.createTheme(makeThemeInput({ name: 'Patch Preserve Theme' }));
    const previewFileName = theme.previewImage.fileName;
    testServer = await startTestServer(app);

    const result = await requestJson(testServer.baseUrl, `/api/themes/${theme.id}`, {
      method: 'PATCH',
      ...makeMultipartBody({
        name: 'Patch Preserve Theme Updated',
        description: 'Preview should stay',
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
      }),
    });

    expect(result.status).toBe(200);
    expect(result.body.theme.name).toBe('Patch Preserve Theme Updated');
    expect(result.body.theme.previewImage.fileName).toBe(previewFileName);
    expect(fs.existsSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, previewFileName))).toBe(true);
  });

  it('reports dependent themes when deleting opacity presets and cascades when requested', async () => {
    const { app, store } = loadPersonalizationRouteContext();
    const preset = store.createOpacityPreset({
      name: 'Route Opacity',
      opacity: { header: 60, card: 70 },
    });
    const theme = store.createTheme(makeThemeInput({
      name: 'Opacity Dependent Theme',
      opacityPresetId: preset.id,
    }));
    testServer = await startTestServer(app);

    const blocked = await requestJson(testServer.baseUrl, `/api/opacity-presets/${preset.id}`, {
      method: 'DELETE',
    });

    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({
      code: 'DEPENDENT_THEMES',
      dependentThemes: [expect.objectContaining({ id: theme.id })],
    });

    const cascaded = await requestJson(testServer.baseUrl, `/api/opacity-presets/${preset.id}?cascadeThemes=1`, {
      method: 'DELETE',
    });

    expect(cascaded.status).toBe(200);
    expect(cascaded.body.deletedThemes).toEqual([expect.objectContaining({ id: theme.id })]);
    expect(store.findOpacityPresetById(preset.id)).toBeNull();
    expect(store.findThemeById(theme.id)).toBeNull();
  }, 10000);

  it('blocks dependent background deletion until cascade is requested', async () => {
    const { app, store } = loadPersonalizationRouteContext();
    const backgroundName = 'dependent-background.png';
    writeDataFile(`backgrounds-user/${backgroundName}`, 'background');
    writeDataFile(`backgrounds-user-thumbs/${backgroundName.replace(/\.png$/, '.jpg')}`, 'thumb');
    const theme = store.createTheme(makeThemeInput({
      name: 'Background Dependent Theme',
      primaryBackgroundSelection: { kind: 'user', id: backgroundName },
    }));
    testServer = await startTestServer(app);

    const blocked = await requestJson(testServer.baseUrl, `/api/backgrounds/user/${encodeURIComponent(backgroundName)}`, {
      method: 'DELETE',
    });

    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({
      code: 'DEPENDENT_THEMES',
      dependentThemes: [expect.objectContaining({ id: theme.id })],
    });

    const cascaded = await requestJson(testServer.baseUrl, `/api/backgrounds/user/${encodeURIComponent(backgroundName)}?cascadeThemes=1`, {
      method: 'DELETE',
    });

    expect(cascaded.status).toBe(200);
    expect(cascaded.body.deletedThemes).toEqual([expect.objectContaining({ id: theme.id })]);
    expect(fs.existsSync(path.join(dataDir, 'backgrounds-user', backgroundName))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'backgrounds-user-thumbs', backgroundName.replace(/\.png$/, '.jpg')))).toBe(false);
    expect(store.findThemeById(theme.id)).toBeNull();
  });
});
