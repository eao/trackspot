import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const touchedPaths = [];
const seedRoot = path.join(process.cwd(), 'server', 'seed-data');
const seedOpacityPresetsDir = path.join(seedRoot, 'opacity-presets');
const seedThemesDir = path.join(seedRoot, 'themes');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readSeedOpacityPresets() {
  return fs.readdirSync(seedOpacityPresetsDir)
    .filter(fileName => fileName.endsWith('.json'))
    .map(fileName => readJson(path.join(seedOpacityPresetsDir, fileName)));
}

function readSeedThemes() {
  return fs.readdirSync(seedThemesDir)
    .filter(fileName => fileName.endsWith('.json'))
    .map(fileName => readJson(path.join(seedThemesDir, fileName)));
}

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  touchedPaths.push(dir);
  return dir;
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

function loadPersonalizationStoreTestContext() {
  const dataDir = makeTempDir('trackspot-personalization-');
  const presetDir = makeTempDir('trackspot-theme-bg-preset-');
  const presetThumbDir = makeTempDir('trackspot-theme-bg-preset-thumbs-');
  const secondaryPresetDir = makeTempDir('trackspot-theme-bg-secondary-preset-');
  const secondaryPresetThumbDir = makeTempDir('trackspot-theme-bg-secondary-preset-thumbs-');

  process.env.DATA_DIR = dataDir;
  process.env.PRESET_BACKGROUNDS_DIR = presetDir;
  process.env.PRESET_BACKGROUND_THUMBS_DIR = presetThumbDir;
  process.env.SECONDARY_PRESET_BACKGROUNDS_DIR = secondaryPresetDir;
  process.env.SECONDARY_PRESET_BACKGROUND_THUMBS_DIR = secondaryPresetThumbDir;

  createSeedBackgroundPlaceholders(presetDir, secondaryPresetDir);

  delete require.cache[require.resolve('../server/db.js')];
  delete require.cache[require.resolve('../server/background-library.js')];
  delete require.cache[require.resolve('../server/personalization-store.js')];

  const store = require('../server/personalization-store.js');
  return {
    store,
    dataDir,
    presetDir,
    presetThumbDir,
    secondaryPresetDir,
    secondaryPresetThumbDir,
  };
}

afterEach(() => {
  delete process.env.DATA_DIR;
  delete process.env.PRESET_BACKGROUNDS_DIR;
  delete process.env.PRESET_BACKGROUND_THUMBS_DIR;
  delete process.env.SECONDARY_PRESET_BACKGROUNDS_DIR;
  delete process.env.SECONDARY_PRESET_BACKGROUND_THUMBS_DIR;

  while (touchedPaths.length) {
    fs.rmSync(touchedPaths.pop(), { recursive: true, force: true });
  }
});

describe('personalization store', () => {
  it('loads all seed opacity presets as included-with-app records without writing them to data', () => {
    const { store, dataDir } = loadPersonalizationStoreTestContext();
    const seedPresets = readSeedOpacityPresets();

    const presets = store.listOpacityPresets();

    expect(presets).toHaveLength(seedPresets.length);
    expect(presets.map(preset => preset.id).sort()).toEqual(seedPresets.map(preset => preset.id).sort());
    expect(presets.every(preset => preset.includedWithApp)).toBe(true);
    expect(presets.every(preset => preset.canEdit === false && preset.canDelete === false)).toBe(true);
    expect(fs.readdirSync(path.join(dataDir, 'opacity-presets')).filter(fileName => fileName.endsWith('.json'))).toEqual([]);
  });

  it('loads all seed themes with preview URLs as included-with-app records', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const seedThemes = readSeedThemes();

    const themes = store.listThemes();

    expect(themes).toHaveLength(seedThemes.length);
    expect(themes.map(theme => theme.id).sort()).toEqual(seedThemes.map(theme => theme.id).sort());
    expect(themes.every(theme => theme.includedWithApp)).toBe(true);
    expect(themes.every(theme => theme.canEdit === false && theme.canDelete === false)).toBe(true);
    themes.forEach(theme => {
      expect(theme.previewImage.url).toBe(`/theme-previews/${encodeURIComponent(theme.previewImage.fileName)}`);
      expect(theme.previewImage.thumbnailUrl).toBe(`/theme-previews-thumbs/${encodeURIComponent(path.parse(theme.previewImage.fileName).name)}.jpg`);
    });
  });

  it('creates user themes that reference a seed opacity preset', () => {
    const { store, presetDir } = loadPersonalizationStoreTestContext();

    fs.writeFileSync(path.join(presetDir, 'Aurora.png'), 'preset');

    const theme = store.createTheme({
      name: 'Aurora Night',
      description: 'Test theme',
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: { kind: 'preset', id: 'Aurora.png' },
      primaryBackgroundDisplay: {
        positionX: 'center',
        positionY: 'center',
        fill: 'cover',
        customScale: 1,
      },
      secondaryBackgroundSelection: null,
      secondaryBackgroundDisplay: {
        positionX: 'right',
        positionY: 'top',
        fill: 'original-size',
        customScale: 1,
      },
      previewImageFile: {
        originalname: 'aurora-preview.png',
        mimetype: 'image/png',
        buffer: Buffer.from('preview-image'),
      },
      previewThumbnailFile: {
        originalname: 'aurora-preview.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('preview-thumb'),
      },
    });

    const themes = store.listThemes();

    expect(themes.find(item => item.id === theme.id)?.opacityPresetId).toBe('default-opaque');
    expect(themes.find(item => item.id === theme.id)?.includedWithApp).toBe(false);
    expect(fs.existsSync(path.join(store.THEMES_DIR, `${theme.id}.json`))).toBe(true);
  });

  it('creates user opacity presets in the data directory', () => {
    const { store } = loadPersonalizationStoreTestContext();

    const preset = store.createOpacityPreset({
      name: 'My Preset',
      opacity: {
        header: 80,
        quickActionsToolbar: 80,
      },
    });

    expect(preset.includedWithApp).toBe(false);
    expect(preset.canEdit).toBe(true);
    expect(preset.canDelete).toBe(true);
    expect(fs.existsSync(path.join(store.OPACITY_PRESETS_DIR, `${preset.id}.json`))).toBe(true);
  });

  it('prevents editing or deleting seed themes and opacity presets', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const seedTheme = store.listThemes()[0];
    const seedPreset = store.listOpacityPresets()[0];

    expect(() => store.updateTheme(seedTheme.id, { name: 'Changed' })).toThrow('Included-with-app themes cannot be edited.');
    expect(() => store.deleteTheme(seedTheme.id)).toThrow('Included-with-app themes cannot be deleted.');
    expect(() => store.updateOpacityPreset(seedPreset.id, { name: 'Changed' })).toThrow('Included-with-app opacity presets cannot be edited.');
    expect(() => store.deleteOpacityPreset(seedPreset.id)).toThrow('Included-with-app opacity presets cannot be deleted.');
  });

  it('ignores runtime theme and opacity preset copies with seed IDs', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const seedTheme = readSeedThemes()[0];
    const seedPreset = readSeedOpacityPresets()[0];

    fs.writeFileSync(path.join(store.THEMES_DIR, `${seedTheme.id}.json`), JSON.stringify({
      ...seedTheme,
      name: 'Runtime Copy Should Be Ignored',
      includedWithApp: false,
    }, null, 2));
    fs.writeFileSync(path.join(store.OPACITY_PRESETS_DIR, `${seedPreset.id}.json`), JSON.stringify({
      ...seedPreset,
      name: 'Runtime Preset Copy Should Be Ignored',
      includedWithApp: false,
    }, null, 2));

    const themes = store.listThemes().filter(theme => theme.id === seedTheme.id);
    const presets = store.listOpacityPresets().filter(preset => preset.id === seedPreset.id);

    expect(themes).toHaveLength(1);
    expect(themes[0].name).toBe(seedTheme.name);
    expect(themes[0].includedWithApp).toBe(true);
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe(seedPreset.name);
    expect(presets[0].includedWithApp).toBe(true);
  });
});
