import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

const touchedPaths = [];
const openDbs = [];
const seedThemesDir = path.join(process.cwd(), 'server', 'seed-data', 'themes');

function readSeedThemes() {
  return fs.readdirSync(seedThemesDir)
    .filter(fileName => fileName.endsWith('.json'))
    .map(fileName => JSON.parse(fs.readFileSync(path.join(seedThemesDir, fileName), 'utf8')));
}

function writeFileIfMissing(filePath, content = 'placeholder') {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content);
  }
}

function createSeedBackgroundPlaceholders(presetDir, secondaryPresetDir) {
  readSeedThemes().forEach(theme => {
    const primary = theme.primaryBackgroundSelection;
    if (primary?.kind === 'preset') {
      writeFileIfMissing(path.join(presetDir, primary.id));
    }

    const secondary = theme.secondaryBackgroundSelection;
    if (secondary?.kind === 'preset') {
      writeFileIfMissing(path.join(secondaryPresetDir, secondary.id));
    }
  });
}

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  touchedPaths.push(dir);
  return dir;
}

function loadBackgroundRouteTestContext() {
  const dataDir = makeTempDir('trackspot-bg-data-');
  const userDir = makeTempDir('trackspot-bg-user-');
  const userThumbDir = makeTempDir('trackspot-bg-user-thumbs-');
  const presetDir = makeTempDir('trackspot-bg-preset-');
  const presetThumbDir = makeTempDir('trackspot-bg-preset-thumbs-');
  const secondaryUserDir = makeTempDir('trackspot-bg-secondary-user-');
  const secondaryUserThumbDir = makeTempDir('trackspot-bg-secondary-user-thumbs-');
  const secondaryPresetDir = makeTempDir('trackspot-bg-secondary-preset-');
  const secondaryPresetThumbDir = makeTempDir('trackspot-bg-secondary-preset-thumbs-');

  process.env.DATA_DIR = dataDir;
  process.env.USER_BACKGROUNDS_DIR = userDir;
  process.env.USER_BACKGROUND_THUMBS_DIR = userThumbDir;
  process.env.PRESET_BACKGROUNDS_DIR = presetDir;
  process.env.PRESET_BACKGROUND_THUMBS_DIR = presetThumbDir;
  process.env.SECONDARY_USER_BACKGROUNDS_DIR = secondaryUserDir;
  process.env.SECONDARY_USER_BACKGROUND_THUMBS_DIR = secondaryUserThumbDir;
  process.env.SECONDARY_PRESET_BACKGROUNDS_DIR = secondaryPresetDir;
  process.env.SECONDARY_PRESET_BACKGROUND_THUMBS_DIR = secondaryPresetThumbDir;

  delete require.cache[require.resolve('../server/db.js')];
  delete require.cache[require.resolve('../server/background-library.js')];
  delete require.cache[require.resolve('../server/personalization-store.js')];
  delete require.cache[require.resolve('../server/routes/backgrounds.js')];
  const backgroundsRouter = require('../server/routes/backgrounds.js');
  const dbModule = require('../server/db.js');
  openDbs.push(dbModule.db);

  return {
    backgroundsRouter,
    dataDir,
    userDir,
    userThumbDir,
    presetDir,
    presetThumbDir,
    secondaryUserDir,
    secondaryUserThumbDir,
    secondaryPresetDir,
    secondaryPresetThumbDir,
  };
}

function loadDefaultBackgroundRouteTestContext() {
  const dataDir = makeTempDir('trackspot-bg-default-data-');

  process.env.DATA_DIR = dataDir;
  delete process.env.USER_BACKGROUNDS_DIR;
  delete process.env.USER_BACKGROUND_THUMBS_DIR;
  delete process.env.PRESET_BACKGROUNDS_DIR;
  delete process.env.PRESET_BACKGROUND_THUMBS_DIR;
  delete process.env.SECONDARY_USER_BACKGROUNDS_DIR;
  delete process.env.SECONDARY_USER_BACKGROUND_THUMBS_DIR;
  delete process.env.SECONDARY_PRESET_BACKGROUNDS_DIR;
  delete process.env.SECONDARY_PRESET_BACKGROUND_THUMBS_DIR;

  delete require.cache[require.resolve('../server/db.js')];
  delete require.cache[require.resolve('../server/background-library.js')];
  delete require.cache[require.resolve('../server/personalization-store.js')];
  delete require.cache[require.resolve('../server/routes/backgrounds.js')];
  const backgroundsRouter = require('../server/routes/backgrounds.js');

  return {
    backgroundsRouter,
    dataDir,
  };
}

function getRouteHandler(router, method, routePath) {
  const layer = router.stack.find(entry =>
    entry.route?.path === routePath && entry.route.methods?.[method]
  );
  return layer?.route?.stack?.at(-1)?.handle ?? null;
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

  while (openDbs.length) {
    openDbs.pop()?.close();
  }

  delete process.env.DATA_DIR;
  delete process.env.USER_BACKGROUNDS_DIR;
  delete process.env.USER_BACKGROUND_THUMBS_DIR;
  delete process.env.PRESET_BACKGROUNDS_DIR;
  delete process.env.PRESET_BACKGROUND_THUMBS_DIR;
  delete process.env.SECONDARY_USER_BACKGROUNDS_DIR;
  delete process.env.SECONDARY_USER_BACKGROUND_THUMBS_DIR;
  delete process.env.SECONDARY_PRESET_BACKGROUNDS_DIR;
  delete process.env.SECONDARY_PRESET_BACKGROUND_THUMBS_DIR;
  delete require.cache[require.resolve('../server/db.js')];
  delete require.cache[require.resolve('../server/background-library.js')];
  delete require.cache[require.resolve('../server/personalization-store.js')];
  delete require.cache[require.resolve('../server/routes/backgrounds.js')];

  while (touchedPaths.length) {
    fs.rmSync(touchedPaths.pop(), { recursive: true, force: true });
  }
});

describe('background route helpers', () => {
  it('lists preset and uploaded images with separate URLs and delete permissions', () => {
    const { backgroundsRouter, userDir, userThumbDir, presetDir, presetThumbDir } = loadBackgroundRouteTestContext();

    fs.writeFileSync(path.join(userDir, '100__My Upload.png'), 'user');
    fs.writeFileSync(path.join(userDir, '200__alpha art.png'), 'user');
    fs.writeFileSync(path.join(userDir, '300__Animated Skyline.gif'), 'user');
    fs.writeFileSync(path.join(userThumbDir, '100__My Upload.jpg'), 'user-thumb');
    fs.writeFileSync(path.join(userThumbDir, '200__alpha art.jpg'), 'user-thumb');
    fs.writeFileSync(path.join(userThumbDir, '300__Animated Skyline.jpg'), 'user-thumb');
    fs.writeFileSync(path.join(presetDir, 'Northern Lights.png'), 'preset');
    fs.writeFileSync(path.join(presetDir, 'aurora 2.png'), 'preset');
    fs.writeFileSync(path.join(presetDir, 'Looping Stars.gif'), 'preset');
    fs.writeFileSync(path.join(presetThumbDir, 'Northern Lights.jpg'), 'preset-thumb');
    fs.writeFileSync(path.join(presetThumbDir, 'aurora 2.jpg'), 'preset-thumb');
    fs.writeFileSync(path.join(presetThumbDir, 'Looping Stars.jpg'), 'preset-thumb');

    const userImages = backgroundsRouter.__private.listImageRecords(userDir, {
      kind: 'user',
      baseUrl: '/backgrounds/user',
      thumbnailDir: userThumbDir,
      thumbnailBaseUrl: '/backgrounds/user-thumbnails',
      canDelete: true,
    });
    const presetImages = backgroundsRouter.__private.listImageRecords(presetDir, {
      kind: 'preset',
      baseUrl: '/backgrounds/presets',
      thumbnailDir: presetThumbDir,
      thumbnailBaseUrl: '/backgrounds/preset-thumbnails',
      canDelete: false,
    });

    expect(userImages).toEqual([
      {
        id: '200__alpha art.png',
        kind: 'user',
        name: 'alpha art',
        fileName: '200__alpha art.png',
        url: '/backgrounds/user/200__alpha%20art.png',
        thumbnailUrl: '/backgrounds/user-thumbnails/200__alpha%20art.jpg',
        canDelete: true,
      },
      {
        id: '300__Animated Skyline.gif',
        kind: 'user',
        name: 'Animated Skyline',
        fileName: '300__Animated Skyline.gif',
        url: '/backgrounds/user/300__Animated%20Skyline.gif',
        thumbnailUrl: '/backgrounds/user-thumbnails/300__Animated%20Skyline.jpg',
        canDelete: true,
      },
      {
        id: '100__My Upload.png',
        kind: 'user',
        name: 'My Upload',
        fileName: '100__My Upload.png',
        url: '/backgrounds/user/100__My%20Upload.png',
        thumbnailUrl: '/backgrounds/user-thumbnails/100__My%20Upload.jpg',
        canDelete: true,
      },
    ]);
    expect(presetImages).toEqual([
      {
        id: 'aurora 2.png',
        kind: 'preset',
        name: 'aurora 2',
        fileName: 'aurora 2.png',
        url: '/backgrounds/presets/aurora%202.png',
        thumbnailUrl: '/backgrounds/preset-thumbnails/aurora%202.jpg',
        canDelete: false,
      },
      {
        id: 'Looping Stars.gif',
        kind: 'preset',
        name: 'Looping Stars',
        fileName: 'Looping Stars.gif',
        url: '/backgrounds/presets/Looping%20Stars.gif',
        thumbnailUrl: '/backgrounds/preset-thumbnails/Looping%20Stars.jpg',
        canDelete: false,
      },
      {
        id: 'Northern Lights.png',
        kind: 'preset',
        name: 'Northern Lights',
        fileName: 'Northern Lights.png',
        url: '/backgrounds/presets/Northern%20Lights.png',
        thumbnailUrl: '/backgrounds/preset-thumbnails/Northern%20Lights.jpg',
        canDelete: false,
      },
    ]);
  });

  it('sanitizes uploaded file names and rejects unsafe stored names', () => {
    const { backgroundsRouter } = loadBackgroundRouteTestContext();

    const storedName = backgroundsRouter.__private.buildUserBackgroundName('My:Scene?.png', 'image/png');
    const gifStoredName = backgroundsRouter.__private.buildUserBackgroundName('Animated:Scene?.gif', 'image/gif');

    expect(storedName).toMatch(/__My Scene\.png$/);
    expect(gifStoredName).toMatch(/__Animated Scene\.gif$/);
    expect(backgroundsRouter.__private.buildThumbnailFileName(storedName)).toMatch(/__My Scene\.jpg$/);
    expect(backgroundsRouter.__private.ensureSafeStoredName(storedName)).toBe(storedName);
    expect(backgroundsRouter.__private.ensureSafeStoredName('../nope.png')).toBeNull();
    expect(backgroundsRouter.__private.ensureSafeStoredName('.')).toBeNull();
    expect(backgroundsRouter.__private.ensureSafeStoredName('..')).toBeNull();
    expect(backgroundsRouter.__private.ensureSafeStoredName('a/b.png')).toBeNull();
    expect(backgroundsRouter.__private.ensureSafeStoredName('a\\b.png')).toBeNull();
    expect(backgroundsRouter.__private.ensureSafeStoredName('C:foo.png')).toBeNull();
    expect(backgroundsRouter.__private.ensureSafeStoredName('cover.html')).toBeNull();
  });

  it('rejects dot segments in user thumbnail routes', () => {
    const { backgroundsRouter } = loadBackgroundRouteTestContext();
    const handler = getRouteHandler(backgroundsRouter, 'post', '/user/:fileName/thumbnail');
    const res = createResponse();

    handler({
      params: { fileName: '.' },
      file: { buffer: Buffer.from('thumb') },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'Invalid background image name.' });
  });

  it('does not cascade-delete dependent themes when the background target is not a file', () => {
    const {
      backgroundsRouter,
      dataDir,
      userDir,
      presetDir,
      secondaryPresetDir,
    } = loadBackgroundRouteTestContext();
    createSeedBackgroundPlaceholders(presetDir, secondaryPresetDir);

    const targetName = 'directory-target.png';
    fs.mkdirSync(path.join(userDir, targetName));
    fs.mkdirSync(path.join(dataDir, 'theme-preview-images'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'themes'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'theme-preview-images', 'directory-preview.png'), 'preview');

    const themePath = path.join(dataDir, 'themes', 'directory-dependent-theme.json');
    fs.writeFileSync(themePath, JSON.stringify({
      id: 'directory-dependent-theme',
      name: 'Directory Dependent Theme',
      previewImage: { fileName: 'directory-preview.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: { kind: 'user', id: targetName },
    }));

    const handler = getRouteHandler(backgroundsRouter, 'delete', '/user/:fileName');
    const res = createResponse();
    let nextError = null;

    handler({
      params: { fileName: targetName },
      query: { cascadeThemes: '1' },
    }, res, error => { nextError = error; });

    expect(nextError).toBeNull();
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({ error: 'Background image not found.' });
    expect(fs.existsSync(themePath)).toBe(true);
  });

  it('does not cascade-delete dependent themes when background deletion cannot be staged', () => {
    const {
      backgroundsRouter,
      dataDir,
      userDir,
      presetDir,
      secondaryPresetDir,
    } = loadBackgroundRouteTestContext();
    createSeedBackgroundPlaceholders(presetDir, secondaryPresetDir);

    const targetName = 'locked-background.png';
    const targetPath = path.join(userDir, targetName);
    fs.writeFileSync(targetPath, 'background');
    fs.mkdirSync(path.join(dataDir, 'theme-preview-images'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'themes'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'theme-preview-images', 'locked-preview.png'), 'preview');

    const themePath = path.join(dataDir, 'themes', 'locked-dependent-theme.json');
    fs.writeFileSync(themePath, JSON.stringify({
      id: 'locked-dependent-theme',
      name: 'Locked Dependent Theme',
      previewImage: { fileName: 'locked-preview.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: { kind: 'user', id: targetName },
    }));

    const originalRenameSync = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      if (oldPath === targetPath) {
        throw new Error('simulated background move failure');
      }
      return originalRenameSync.call(fs, oldPath, newPath);
    });

    const handler = getRouteHandler(backgroundsRouter, 'delete', '/user/:fileName');
    const res = createResponse();
    let nextError = null;

    handler({
      params: { fileName: targetName },
      query: { cascadeThemes: '1' },
    }, res, error => { nextError = error; });

    expect(nextError?.message).toBe('simulated background move failure');
    expect(fs.existsSync(targetPath)).toBe(true);
    expect(fs.existsSync(themePath)).toBe(true);
  });

  it('removes preset thumbnails that no longer match the preset folder or are stale', () => {
    const { backgroundsRouter, presetDir, presetThumbDir } = loadBackgroundRouteTestContext();

    const keptPresetPath = path.join(presetDir, 'Aurora.jpg');
    const refreshedPresetPath = path.join(presetDir, 'Forest.jpg');
    const keptThumbPath = path.join(presetThumbDir, 'Aurora.jpg');
    const staleThumbPath = path.join(presetThumbDir, 'Forest.jpg');
    const orphanThumbPath = path.join(presetThumbDir, 'Removed.jpg');

    fs.writeFileSync(keptPresetPath, 'preset');
    fs.writeFileSync(refreshedPresetPath, 'preset');
    fs.writeFileSync(keptThumbPath, 'thumb');
    fs.writeFileSync(staleThumbPath, 'thumb');
    fs.writeFileSync(orphanThumbPath, 'thumb');

    const now = Date.now();
    fs.utimesSync(keptPresetPath, now / 1000 - 10, now / 1000 - 10);
    fs.utimesSync(keptThumbPath, now / 1000, now / 1000);
    fs.utimesSync(refreshedPresetPath, now / 1000, now / 1000);
    fs.utimesSync(staleThumbPath, now / 1000 - 10, now / 1000 - 10);

    backgroundsRouter.__private.syncPresetThumbnailFiles(presetDir, presetThumbDir);

    expect(fs.existsSync(keptThumbPath)).toBe(true);
    expect(fs.existsSync(staleThumbPath)).toBe(false);
    expect(fs.existsSync(orphanThumbPath)).toBe(false);
  });

  it('uses data-backed mutable preset thumbnails with bundled thumbnails as a read-only fallback', () => {
    const { backgroundsRouter, dataDir } = loadDefaultBackgroundRouteTestContext();

    const library = backgroundsRouter.__private.listBackgroundLibrary('primary');
    const bundledPreset = library.presetImages.find(image => image.fileName === 'Aurora 1.webp');

    expect(backgroundsRouter.__private.PRESET_BACKGROUND_THUMBS_DIR)
      .toBe(path.join(dataDir, 'background-presets-thumbs'));
    expect(backgroundsRouter.__private.PUBLIC_PRESET_BACKGROUND_THUMBS_DIR)
      .toBe(path.join(process.cwd(), 'public', 'background-presets-thumbs'));
    expect(bundledPreset?.thumbnailUrl).toBe('/backgrounds/preset-thumbnails/Aurora%201.jpg');
  });

  it('lists the secondary background library with its own URLs', () => {
    const {
      backgroundsRouter,
      secondaryUserDir,
      secondaryUserThumbDir,
      secondaryPresetDir,
      secondaryPresetThumbDir,
    } = loadBackgroundRouteTestContext();

    fs.writeFileSync(path.join(secondaryUserDir, '100__Top Right.png'), 'user');
    fs.writeFileSync(path.join(secondaryUserThumbDir, '100__Top Right.jpg'), 'thumb');
    fs.writeFileSync(path.join(secondaryPresetDir, 'Nebula.png'), 'preset');
    fs.writeFileSync(path.join(secondaryPresetThumbDir, 'Nebula.jpg'), 'thumb');

    const library = backgroundsRouter.__private.listBackgroundLibrary('secondary');

    expect(library.userImages).toEqual([{
      id: '100__Top Right.png',
      kind: 'user',
      name: 'Top Right',
      fileName: '100__Top Right.png',
      url: '/backgrounds/secondary/user/100__Top%20Right.png',
      thumbnailUrl: '/backgrounds/secondary/user-thumbnails/100__Top%20Right.jpg',
      canDelete: true,
    }]);
    expect(library.presetImages).toEqual([{
      id: 'Nebula.png',
      kind: 'preset',
      name: 'Nebula',
      fileName: 'Nebula.png',
      url: '/backgrounds/secondary/presets/Nebula.png',
      thumbnailUrl: '/backgrounds/secondary/preset-thumbnails/Nebula.jpg',
      canDelete: false,
    }]);
  });
});
