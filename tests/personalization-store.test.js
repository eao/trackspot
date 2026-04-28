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

function makeThemeInput(overrides = {}) {
  return {
    name: 'User Theme',
    description: 'User-created theme',
    colorSchemePresetId: 'bunan-blue',
    opacityPresetId: 'default-opaque',
    primaryBackgroundSelection: null,
    primaryBackgroundDisplay: null,
    secondaryBackgroundSelection: null,
    secondaryBackgroundDisplay: null,
    previewImageFile: {
      originalname: 'user-theme-preview.png',
      mimetype: 'image/png',
      buffer: Buffer.from('preview-image'),
    },
    previewThumbnailFile: null,
    ...overrides,
  };
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

  it('keeps invalid user theme files and preview assets when listing themes', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const themeId = 'broken-theme';
    const previewFileName = 'broken-preview.png';
    const thumbnailFileName = 'broken-preview.jpg';
    const themePath = path.join(store.THEMES_DIR, `${themeId}.json`);
    const previewPath = path.join(store.THEME_PREVIEW_IMAGES_DIR, previewFileName);
    const thumbnailPath = path.join(store.THEME_PREVIEW_IMAGES_THUMBS_DIR, thumbnailFileName);

    fs.writeFileSync(themePath, JSON.stringify({
      id: themeId,
      name: 'Broken Theme',
      description: 'References a missing color scheme.',
      previewImage: { fileName: previewFileName },
      colorSchemePresetId: 'missing-scheme',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: null,
      secondaryBackgroundSelection: null,
    }, null, 2));
    fs.writeFileSync(previewPath, 'preview');
    fs.writeFileSync(thumbnailPath, 'thumbnail');

    const themes = store.listThemes();
    const invalidTheme = themes.find(theme => theme.id === themeId);

    expect(invalidTheme).toMatchObject({
      id: themeId,
      name: 'Broken Theme',
      invalid: true,
      invalidReason: 'Theme "Broken Theme" references a missing color scheme.',
      canEdit: false,
      canDelete: true,
      colorSchemePresetId: 'missing-scheme',
      opacityPresetId: 'default-opaque',
    });
    expect(invalidTheme.previewImage).toMatchObject({
      fileName: previewFileName,
      url: `/theme-previews/${encodeURIComponent(previewFileName)}`,
      thumbnailUrl: `/theme-previews-thumbs/${thumbnailFileName}`,
    });
    expect(fs.existsSync(themePath)).toBe(true);
    expect(fs.existsSync(previewPath)).toBe(true);
    expect(fs.existsSync(thumbnailPath)).toBe(true);
  });

  it('deletes invalid user theme files and preview assets only through explicit delete', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const themeId = 'delete-broken-theme';
    const previewFileName = 'delete-broken-preview.png';
    const thumbnailFileName = 'delete-broken-preview.jpg';
    const themePath = path.join(store.THEMES_DIR, `${themeId}.json`);
    const previewPath = path.join(store.THEME_PREVIEW_IMAGES_DIR, previewFileName);
    const thumbnailPath = path.join(store.THEME_PREVIEW_IMAGES_THUMBS_DIR, thumbnailFileName);

    fs.writeFileSync(themePath, JSON.stringify({
      id: themeId,
      name: 'Delete Broken Theme',
      previewImage: { fileName: previewFileName },
      colorSchemePresetId: 'missing-scheme',
      opacityPresetId: 'default-opaque',
    }, null, 2));
    fs.writeFileSync(previewPath, 'preview');
    fs.writeFileSync(thumbnailPath, 'thumbnail');

    expect(store.listThemes().find(theme => theme.id === themeId)?.invalid).toBe(true);

    const deleted = store.deleteTheme(themeId);

    expect(deleted.invalid).toBe(true);
    expect(fs.existsSync(themePath)).toBe(false);
    expect(fs.existsSync(previewPath)).toBe(false);
    expect(fs.existsSync(thumbnailPath)).toBe(false);
  });

  it('includes invalid themes in explicit dependency cascade checks', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const preset = store.createOpacityPreset({
      name: 'Cascade Test Preset',
      opacity: {
        header: 80,
      },
    });
    const themeId = 'broken-dependent-theme';
    const themePath = path.join(store.THEMES_DIR, `${themeId}.json`);

    fs.writeFileSync(themePath, JSON.stringify({
      id: themeId,
      name: 'Broken Dependent Theme',
      previewImage: { fileName: 'missing-preview.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: preset.id,
    }, null, 2));

    let error;
    try {
      store.deleteOpacityPreset(preset.id);
    } catch (caught) {
      error = caught;
    }

    expect(error?.status).toBe(409);
    expect(error?.code).toBe('DEPENDENT_THEMES');
    expect(error?.dependentThemes?.[0]).toMatchObject({
      id: themeId,
      invalid: true,
      opacityPresetId: preset.id,
    });

    const result = store.deleteOpacityPreset(preset.id, { cascadeThemes: true });

    expect(result.deletedThemes[0]).toMatchObject({
      id: themeId,
      invalid: true,
    });
    expect(fs.existsSync(themePath)).toBe(false);
    expect(store.findOpacityPresetById(preset.id)).toBeNull();
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

  it('ignores client included-with-app flags for user-created opacity presets', () => {
    const { store } = loadPersonalizationStoreTestContext();

    const preset = store.createOpacityPreset({
      name: 'Client Locked Preset',
      includedWithApp: true,
      opacity: {
        header: 80,
      },
    });
    expect(preset).toMatchObject({
      includedWithApp: false,
      canEdit: true,
      canDelete: true,
    });

    const updatedPreset = store.updateOpacityPreset(preset.id, {
      name: 'Still Editable Preset',
      includedWithApp: true,
    });
    expect(updatedPreset).toMatchObject({
      includedWithApp: false,
      canEdit: true,
      canDelete: true,
    });
    expect(store.deleteOpacityPreset(preset.id).preset.id).toBe(preset.id);
  });

  it('ignores client included-with-app flags for user-created themes', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const theme = store.createTheme(makeThemeInput({
      name: 'Client Locked Theme',
      includedWithApp: true,
    }));
    expect(theme).toMatchObject({
      includedWithApp: false,
      canEdit: true,
      canDelete: true,
    });

    const updatedTheme = store.updateTheme(theme.id, makeThemeInput({
      name: 'Still Editable Theme',
      includedWithApp: true,
      previewImageFile: null,
      previewThumbnailFile: null,
    }));
    expect(updatedTheme).toMatchObject({
      includedWithApp: false,
      canEdit: true,
      canDelete: true,
    });
    expect(store.deleteTheme(theme.id).id).toBe(theme.id);
  });

  it('ignores persisted included-with-app flags in user personalization records', () => {
    const { store } = loadPersonalizationStoreTestContext();

    fs.writeFileSync(path.join(store.OPACITY_PRESETS_DIR, 'restored-opacity.json'), JSON.stringify({
      id: 'restored-opacity',
      name: 'Restored Opacity',
      includedWithApp: true,
      opacity: {
        header: 60,
      },
    }));

    fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, 'restored-preview.png'), 'preview');
    fs.writeFileSync(path.join(store.THEMES_DIR, 'restored-theme.json'), JSON.stringify({
      id: 'restored-theme',
      name: 'Restored Theme',
      previewImage: { fileName: 'restored-preview.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      includedWithApp: true,
    }));

    expect(store.listOpacityPresets().find(preset => preset.id === 'restored-opacity')).toMatchObject({
      includedWithApp: false,
      canEdit: true,
      canDelete: true,
    });
    expect(store.findThemeById('restored-theme')).toMatchObject({
      includedWithApp: false,
      canEdit: true,
      canDelete: true,
    });

    expect(store.updateOpacityPreset('restored-opacity', { name: 'Updated Restored Opacity' }).includedWithApp).toBe(false);
    expect(store.updateTheme('restored-theme', makeThemeInput({
      name: 'Updated Restored Theme',
      previewImageFile: null,
      previewThumbnailFile: null,
    })).includedWithApp).toBe(false);
    expect(store.deleteOpacityPreset('restored-opacity').preset.id).toBe('restored-opacity');
    expect(store.deleteTheme('restored-theme').id).toBe('restored-theme');
  });

  it('does not trust unsafe persisted personalization ids for path operations', () => {
    const { store, dataDir } = loadPersonalizationStoreTestContext();
    const unsafeIds = ['../preferences', 'a/b', 'a\\b', 'C:foo'];
    const sentinelPath = path.join(dataDir, 'preferences.json');
    fs.writeFileSync(sentinelPath, 'keep-me');
    fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, 'unsafe-preview.png'), 'preview');

    unsafeIds.forEach((unsafeId, index) => {
      fs.writeFileSync(path.join(store.OPACITY_PRESETS_DIR, `unsafe-opacity-${index}.json`), JSON.stringify({
        id: unsafeId,
        name: `Unsafe Opacity ${index}`,
        opacity: {
          header: 70,
        },
      }));
      fs.writeFileSync(path.join(store.THEMES_DIR, `unsafe-theme-${index}.json`), JSON.stringify({
        id: unsafeId,
        name: `Unsafe Theme ${index}`,
        previewImage: { fileName: 'unsafe-preview.png' },
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
      }));
    });

    const unsafePresets = store.listOpacityPresets()
      .filter(preset => preset.name.startsWith('Unsafe Opacity'));
    expect(unsafePresets).toEqual([]);

    const unsafeThemes = store.listThemes()
      .filter(theme => theme.name.startsWith('Unsafe Theme'))
      .sort((left, right) => left.name.localeCompare(right.name));
    expect(unsafeThemes.map(theme => theme.id)).toEqual([
      'unsafe-theme-0',
      'unsafe-theme-1',
      'unsafe-theme-2',
      'unsafe-theme-3',
    ]);
    expect(unsafeThemes.every(theme => theme.invalid && theme.canDelete)).toBe(true);

    unsafeIds.forEach((unsafeId, index) => {
      expect(() => store.updateOpacityPreset(unsafeId, { name: `Nope ${index}` }))
        .toThrow('Opacity preset not found.');
      expect(() => store.deleteOpacityPreset(unsafeId))
        .toThrow('Opacity preset not found.');
      expect(() => store.updateTheme(unsafeId, makeThemeInput({
        name: `Nope ${index}`,
        previewImageFile: null,
        previewThumbnailFile: null,
      }))).toThrow('Theme not found.');
      expect(() => store.deleteTheme(unsafeId))
        .toThrow('Theme not found.');
    });

    expect(fs.readFileSync(sentinelPath, 'utf8')).toBe('keep-me');
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
