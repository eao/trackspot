import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  vi.restoreAllMocks();

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

  it('keeps invalid user opacity preset files deleteable without blocking personalization loads', () => {
    const { store } = loadPersonalizationStoreTestContext();

    fs.writeFileSync(path.join(store.OPACITY_PRESETS_DIR, 'malformed-opacity.json'), '{nope');
    fs.writeFileSync(path.join(store.OPACITY_PRESETS_DIR, 'array-opacity.json'), JSON.stringify([]));
    fs.writeFileSync(path.join(store.OPACITY_PRESETS_DIR, 'missing-name-opacity.json'), JSON.stringify({
      id: 'missing-name-opacity',
      opacity: {
        header: 70,
      },
    }));
    fs.writeFileSync(path.join(store.OPACITY_PRESETS_DIR, 'unsafe-id-opacity.json'), JSON.stringify({
      id: '../unsafe-opacity',
      name: 'Unsafe Opacity',
      opacity: {
        header: 60,
      },
    }));
    fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, 'invalid-opacity-theme.png'), 'preview');
    fs.writeFileSync(path.join(store.THEMES_DIR, 'invalid-opacity-theme.json'), JSON.stringify({
      id: 'invalid-opacity-theme',
      name: 'Invalid Opacity Theme',
      previewImage: { fileName: 'invalid-opacity-theme.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'missing-name-opacity',
    }, null, 2));

    const invalidPresets = store.listOpacityPresets()
      .filter(preset => preset.invalid)
      .sort((left, right) => left.id.localeCompare(right.id));

    expect(invalidPresets.map(preset => preset.id)).toEqual([
      'array-opacity',
      'malformed-opacity',
      'missing-name-opacity',
      'unsafe-id-opacity',
    ]);
    expect(invalidPresets.every(preset => preset.canEdit === false && preset.canDelete === true)).toBe(true);
    expect(invalidPresets.find(preset => preset.id === 'malformed-opacity')?.invalidReason)
      .toContain('Could not parse opacity preset "malformed-opacity.json"');
    expect(store.findThemeById('invalid-opacity-theme')).toMatchObject({
      invalid: true,
      invalidReason: 'Theme "Invalid Opacity Theme" references a missing opacity preset.',
      opacityPresetId: 'missing-name-opacity',
    });

    const deleted = store.deleteOpacityPreset('malformed-opacity');

    expect(deleted.preset).toMatchObject({
      id: 'malformed-opacity',
      invalid: true,
    });
    expect(fs.existsSync(path.join(store.OPACITY_PRESETS_DIR, 'malformed-opacity.json'))).toBe(false);
    expect(store.listThemes().length).toBeGreaterThan(0);
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

  it('keeps a user theme with a duplicate built-in name visible as invalid and deleteable', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const seedTheme = readSeedThemes()[0];
    const previewFileName = 'duplicate-built-in-name.png';

    fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, previewFileName), 'preview');
    fs.writeFileSync(path.join(store.THEMES_DIR, 'duplicate-built-in-name.json'), JSON.stringify({
      id: 'duplicate-built-in-name',
      name: seedTheme.name,
      previewImage: { fileName: previewFileName },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
    }, null, 2));

    const themes = store.listThemes();
    const seedRecord = themes.find(theme => theme.id === seedTheme.id);
    const duplicate = themes.find(theme => theme.id === 'duplicate-built-in-name');

    expect(seedRecord).toMatchObject({
      id: seedTheme.id,
      name: seedTheme.name,
      invalid: false,
      includedWithApp: true,
    });
    expect(duplicate).toMatchObject({
      id: 'duplicate-built-in-name',
      name: seedTheme.name,
      invalid: true,
      invalidReason: 'Another theme already uses this name.',
      canEdit: true,
      canDelete: true,
    });

    store.deleteTheme(duplicate.id);
    expect(fs.existsSync(path.join(store.THEMES_DIR, 'duplicate-built-in-name.json'))).toBe(false);
  });

  it('keeps user themes with duplicate names visible as invalid repair records', () => {
    const { store } = loadPersonalizationStoreTestContext();

    ['first-duplicate-name', 'second-duplicate-name'].forEach(themeId => {
      const previewFileName = `${themeId}.png`;
      fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, previewFileName), 'preview');
      fs.writeFileSync(path.join(store.THEMES_DIR, `${themeId}.json`), JSON.stringify({
        id: themeId,
        name: 'Duplicate User Name',
        previewImage: { fileName: previewFileName },
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
      }, null, 2));
    });

    const duplicates = store.listThemes()
      .filter(theme => theme.name === 'Duplicate User Name')
      .sort((left, right) => left.id.localeCompare(right.id));

    expect(duplicates.map(theme => theme.id)).toEqual(['first-duplicate-name', 'second-duplicate-name']);
    expect(duplicates.every(theme => theme.invalid && theme.canEdit && theme.canDelete)).toBe(true);
    expect(duplicates.every(theme => theme.invalidReason === 'Another theme already uses this name.')).toBe(true);
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

  it('cleans new theme preview files when theme JSON creation fails', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const originalWriteFileSync = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((target, contents, options) => {
      if (typeof target === 'number') {
        throw new Error('simulated theme JSON write failure');
      }
      return originalWriteFileSync.call(fs, target, contents, options);
    });

    expect(() => store.createTheme(makeThemeInput({
      name: 'Failed Preview Theme',
      previewThumbnailFile: {
        originalname: 'failed-preview.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('preview-thumb'),
      },
    }))).toThrow(/simulated theme JSON write failure/);

    vi.restoreAllMocks();

    expect(fs.readdirSync(store.THEMES_DIR).filter(fileName => fileName.endsWith('.json'))).toEqual([]);
    expect(fs.readdirSync(store.THEME_PREVIEW_IMAGES_DIR)).toEqual([]);
    expect(fs.readdirSync(store.THEME_PREVIEW_IMAGES_THUMBS_DIR)).toEqual([]);
  });

  it('cleans replacement preview files when theme JSON update fails', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const theme = store.createTheme(makeThemeInput({ name: 'Preview Update Rollback Theme' }));
    const previousPreviewFileName = theme.previewImage.fileName;
    const originalWriteFileSync = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((target, contents, options) => {
      if (typeof target === 'number') {
        throw new Error('simulated theme JSON update failure');
      }
      return originalWriteFileSync.call(fs, target, contents, options);
    });

    expect(() => store.updateTheme(theme.id, makeThemeInput({
      name: 'Preview Update Rollback Theme',
      previewImageFile: {
        originalname: 'replacement-preview.png',
        mimetype: 'image/png',
        buffer: Buffer.from('replacement-preview'),
      },
    }))).toThrow(/simulated theme JSON update failure/);

    vi.restoreAllMocks();

    expect(fs.readdirSync(store.THEME_PREVIEW_IMAGES_DIR)).toEqual([previousPreviewFileName]);
    expect(store.findThemeById(theme.id)?.previewImage.fileName).toBe(previousPreviewFileName);
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
      canEdit: true,
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

  it('treats directories with image extensions as missing theme assets', () => {
    const { store, presetDir } = loadPersonalizationStoreTestContext();

    fs.mkdirSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, 'directory-preview.png'));
    fs.writeFileSync(path.join(store.THEMES_DIR, 'directory-preview-theme.json'), JSON.stringify({
      id: 'directory-preview-theme',
      name: 'Directory Preview Theme',
      previewImage: { fileName: 'directory-preview.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
    }, null, 2));

    fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, 'directory-background-preview.png'), 'preview');
    fs.mkdirSync(path.join(presetDir, 'directory-background.png'));
    fs.writeFileSync(path.join(store.THEMES_DIR, 'directory-background-theme.json'), JSON.stringify({
      id: 'directory-background-theme',
      name: 'Directory Background Theme',
      previewImage: { fileName: 'directory-background-preview.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
      primaryBackgroundSelection: { kind: 'preset', id: 'directory-background.png' },
    }, null, 2));

    expect(store.findThemeById('directory-preview-theme')).toMatchObject({
      invalid: true,
      invalidReason: 'Theme "Directory Preview Theme" is missing its preview image.',
    });
    expect(store.findThemeById('directory-background-theme')).toMatchObject({
      invalid: true,
      invalidReason: 'Theme "Directory Background Theme" references a missing primary background image.',
    });
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

  it('returns cleanup warnings instead of failing when deleted theme preview cleanup fails', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const themeId = 'delete-warning-theme';
    const previewFileName = 'delete-warning-preview.png';
    const themePath = path.join(store.THEMES_DIR, `${themeId}.json`);
    const previewPath = path.join(store.THEME_PREVIEW_IMAGES_DIR, previewFileName);

    fs.writeFileSync(themePath, JSON.stringify({
      id: themeId,
      name: 'Delete Warning Theme',
      previewImage: { fileName: previewFileName },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
    }, null, 2));
    fs.writeFileSync(previewPath, 'preview');

    const originalUnlinkSync = fs.unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation(targetPath => {
      if (path.resolve(String(targetPath)) === path.resolve(previewPath)) {
        throw new Error('simulated preview cleanup failure');
      }
      return originalUnlinkSync.call(fs, targetPath);
    });

    const deleted = store.deleteTheme(themeId);

    vi.restoreAllMocks();

    expect(deleted.cleanupWarnings?.[0]).toMatch(/simulated preview cleanup failure/);
    expect(fs.existsSync(themePath)).toBe(false);
    expect(fs.existsSync(previewPath)).toBe(true);
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

  it('keeps the previous opacity preset file when an atomic JSON write fails', () => {
    const { store } = loadPersonalizationStoreTestContext();

    const preset = store.createOpacityPreset({
      name: 'Atomic Preset',
      opacity: {
        header: 80,
      },
    });
    const presetPath = path.join(store.OPACITY_PRESETS_DIR, `${preset.id}.json`);
    const previousContents = fs.readFileSync(presetPath, 'utf8');

    const originalWriteFileSync = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((target, contents, options) => {
      if (typeof target === 'number') {
        throw new Error('simulated temp write failure');
      }
      return originalWriteFileSync.call(fs, target, contents, options);
    });

    expect(() => store.updateOpacityPreset(preset.id, { name: 'Overwrite Attempt' }))
      .toThrow(/simulated temp write failure/);

    vi.restoreAllMocks();

    expect(fs.readFileSync(presetPath, 'utf8')).toBe(previousContents);
    expect(fs.readdirSync(store.OPACITY_PRESETS_DIR).filter(fileName => fileName.endsWith('.tmp'))).toEqual([]);
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

  it('updates renamed user theme files in place without creating id-named duplicates', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const themePath = path.join(store.THEMES_DIR, 'custom-file.json');

    fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, 'renamed-theme-preview.png'), 'preview');
    fs.writeFileSync(themePath, JSON.stringify({
      id: 'real-theme-id',
      name: 'Renamed Theme',
      previewImage: { fileName: 'renamed-theme-preview.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
    }, null, 2));

    const updated = store.updateTheme('real-theme-id', makeThemeInput({
      name: 'Updated Renamed Theme',
      previewImageFile: null,
      previewThumbnailFile: null,
    }));

    expect(updated).toMatchObject({
      id: 'real-theme-id',
      name: 'Updated Renamed Theme',
      invalid: false,
    });
    expect(readJson(themePath).name).toBe('Updated Renamed Theme');
    expect(fs.existsSync(path.join(store.THEMES_DIR, 'real-theme-id.json'))).toBe(false);
  });

  it('deletes renamed opacity preset source files and cascades dependent themes once', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const opacityPath = path.join(store.OPACITY_PRESETS_DIR, 'renamed-opacity.json');
    const themePath = path.join(store.THEMES_DIR, 'renamed-opacity-dependent-theme.json');

    fs.writeFileSync(opacityPath, JSON.stringify({
      id: 'opacity-real-id',
      name: 'Renamed Opacity',
      opacity: {
        header: 70,
      },
    }, null, 2));
    fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, 'renamed-opacity-theme.png'), 'preview');
    fs.writeFileSync(themePath, JSON.stringify({
      id: 'renamed-opacity-dependent-theme',
      name: 'Renamed Opacity Dependent Theme',
      previewImage: { fileName: 'renamed-opacity-theme.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'opacity-real-id',
    }, null, 2));

    expect(() => store.deleteOpacityPreset('opacity-real-id')).toThrow('Deleting "Renamed Opacity" will also delete 1 theme(s).');

    const result = store.deleteOpacityPreset('opacity-real-id', { cascadeThemes: true });

    expect(result.preset.id).toBe('opacity-real-id');
    expect(result.deletedThemes.map(theme => theme.id)).toEqual(['renamed-opacity-dependent-theme']);
    expect(fs.existsSync(opacityPath)).toBe(false);
    expect(fs.existsSync(path.join(store.OPACITY_PRESETS_DIR, 'opacity-real-id.json'))).toBe(false);
    expect(fs.existsSync(themePath)).toBe(false);
  });

  it('keeps shared preview assets when deleting one referenced user theme', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const previewPath = path.join(store.THEME_PREVIEW_IMAGES_DIR, 'shared-preview.png');
    const thumbnailPath = path.join(store.THEME_PREVIEW_IMAGES_THUMBS_DIR, 'shared-preview.jpg');

    fs.writeFileSync(previewPath, 'preview');
    fs.writeFileSync(thumbnailPath, 'thumbnail');
    ['first-shared-theme', 'second-shared-theme'].forEach((themeId, index) => {
      fs.writeFileSync(path.join(store.THEMES_DIR, `${themeId}.json`), JSON.stringify({
        id: themeId,
        name: index === 0 ? 'First Shared Theme' : 'Second Shared Theme',
        previewImage: { fileName: 'shared-preview.png' },
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
      }, null, 2));
    });

    const deleted = store.deleteTheme('first-shared-theme');

    expect(deleted.id).toBe('first-shared-theme');
    expect(fs.existsSync(previewPath)).toBe(true);
    expect(fs.existsSync(thumbnailPath)).toBe(true);
    expect(store.findThemeById('second-shared-theme')).toMatchObject({
      id: 'second-shared-theme',
      invalid: false,
    });
  });

  it('keeps shared preview assets when updating one referenced user theme preview', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const sharedPreviewPath = path.join(store.THEME_PREVIEW_IMAGES_DIR, 'update-shared-preview.png');
    const sharedThumbnailPath = path.join(store.THEME_PREVIEW_IMAGES_THUMBS_DIR, 'update-shared-preview.jpg');

    fs.writeFileSync(sharedPreviewPath, 'preview');
    fs.writeFileSync(sharedThumbnailPath, 'thumbnail');
    ['first-update-shared-theme', 'second-update-shared-theme'].forEach((themeId, index) => {
      fs.writeFileSync(path.join(store.THEMES_DIR, `${themeId}.json`), JSON.stringify({
        id: themeId,
        name: index === 0 ? 'First Update Shared Theme' : 'Second Update Shared Theme',
        previewImage: { fileName: 'update-shared-preview.png' },
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
      }, null, 2));
    });

    const updated = store.updateTheme('first-update-shared-theme', makeThemeInput({
      name: 'First Update Shared Theme',
      previewImageFile: {
        originalname: 'replacement-preview.png',
        mimetype: 'image/png',
        buffer: Buffer.from('replacement-preview'),
      },
      previewThumbnailFile: null,
    }));

    expect(updated.previewImage.fileName).not.toBe('update-shared-preview.png');
    expect(fs.existsSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, updated.previewImage.fileName))).toBe(true);
    expect(fs.existsSync(sharedPreviewPath)).toBe(true);
    expect(fs.existsSync(sharedThumbnailPath)).toBe(true);
    expect(store.findThemeById('second-update-shared-theme')).toMatchObject({
      id: 'second-update-shared-theme',
      invalid: false,
    });
  });

  it('repairs invalid user themes when submitted dependencies validate', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const themePath = path.join(store.THEMES_DIR, 'repair-color-theme.json');

    fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, 'repair-color-preview.png'), 'preview');
    fs.writeFileSync(themePath, JSON.stringify({
      id: 'repair-color-theme',
      name: 'Repair Color Theme',
      previewImage: { fileName: 'repair-color-preview.png' },
      colorSchemePresetId: 'missing-scheme',
      opacityPresetId: 'default-opaque',
    }, null, 2));

    expect(store.findThemeById('repair-color-theme')).toMatchObject({
      invalid: true,
      canEdit: true,
    });
    expect(() => store.updateTheme('repair-color-theme', makeThemeInput({
      name: 'Still Broken Color Theme',
      colorSchemePresetId: 'missing-scheme',
      previewImageFile: null,
      previewThumbnailFile: null,
    }))).toThrow('Selected color scheme does not exist.');

    const repaired = store.updateTheme('repair-color-theme', makeThemeInput({
      name: 'Repaired Color Theme',
      colorSchemePresetId: 'bunan-blue',
      previewImageFile: null,
      previewThumbnailFile: null,
    }));

    expect(repaired).toMatchObject({
      id: 'repair-color-theme',
      name: 'Repaired Color Theme',
      invalid: false,
      canEdit: true,
    });
    expect(readJson(themePath).name).toBe('Repaired Color Theme');
  });

  it('requires a replacement upload when repairing a theme with a missing preview image', () => {
    const { store } = loadPersonalizationStoreTestContext();

    fs.writeFileSync(path.join(store.THEMES_DIR, 'repair-preview-theme.json'), JSON.stringify({
      id: 'repair-preview-theme',
      name: 'Repair Preview Theme',
      previewImage: { fileName: 'missing-preview.png' },
      colorSchemePresetId: 'bunan-blue',
      opacityPresetId: 'default-opaque',
    }, null, 2));

    expect(store.findThemeById('repair-preview-theme')).toMatchObject({
      invalid: true,
      invalidReason: 'Theme "Repair Preview Theme" is missing its preview image.',
    });
    expect(() => store.updateTheme('repair-preview-theme', makeThemeInput({
      name: 'Repair Preview Theme',
      previewImageFile: null,
      previewThumbnailFile: null,
    }))).toThrow('Theme preview image is required.');

    const repaired = store.updateTheme('repair-preview-theme', makeThemeInput({
      name: 'Repaired Preview Theme',
      previewImageFile: {
        originalname: 'replacement-preview.png',
        mimetype: 'image/png',
        buffer: Buffer.from('replacement-preview'),
      },
      previewThumbnailFile: null,
    }));

    expect(repaired).toMatchObject({
      id: 'repair-preview-theme',
      name: 'Repaired Preview Theme',
      invalid: false,
    });
    expect(fs.existsSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, repaired.previewImage.fileName))).toBe(true);
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
      .filter(preset => preset.name.startsWith('Unsafe Opacity'))
      .sort((left, right) => left.name.localeCompare(right.name));
    expect(unsafePresets.map(preset => preset.id)).toEqual([
      'unsafe-opacity-0',
      'unsafe-opacity-1',
      'unsafe-opacity-2',
      'unsafe-opacity-3',
    ]);
    expect(unsafePresets.every(preset => preset.invalid && !preset.canEdit && preset.canDelete)).toBe(true);

    const unsafeThemes = store.listThemes()
      .filter(theme => theme.name.startsWith('Unsafe Theme'))
      .sort((left, right) => left.name.localeCompare(right.name));
    expect(unsafeThemes.map(theme => theme.id)).toEqual([
      'unsafe-theme-0',
      'unsafe-theme-1',
      'unsafe-theme-2',
      'unsafe-theme-3',
    ]);
    expect(unsafeThemes.every(theme => theme.invalid && theme.canEdit && theme.canDelete)).toBe(true);

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

  it('keeps duplicate user ids reachable through source-file repair ids', () => {
    const { store } = loadPersonalizationStoreTestContext();

    fs.writeFileSync(path.join(store.OPACITY_PRESETS_DIR, 'first-duplicate-id.json'), JSON.stringify({
      id: 'duplicate-opacity-id',
      name: 'First Duplicate Opacity',
      opacity: {
        header: 70,
      },
    }, null, 2));
    fs.writeFileSync(path.join(store.OPACITY_PRESETS_DIR, 'second-duplicate-id.json'), JSON.stringify({
      id: 'duplicate-opacity-id',
      name: 'Second Duplicate Opacity',
      opacity: {
        header: 80,
      },
    }, null, 2));

    ['first-duplicate-id', 'second-duplicate-id'].forEach((fileBase, index) => {
      const previewFileName = `${fileBase}.png`;
      fs.writeFileSync(path.join(store.THEME_PREVIEW_IMAGES_DIR, previewFileName), 'preview');
      fs.writeFileSync(path.join(store.THEMES_DIR, `${fileBase}.json`), JSON.stringify({
        id: 'duplicate-theme-id',
        name: index === 0 ? 'First Duplicate Id Theme' : 'Second Duplicate Id Theme',
        previewImage: { fileName: previewFileName },
        colorSchemePresetId: 'bunan-blue',
        opacityPresetId: 'default-opaque',
      }, null, 2));
    });

    const duplicatePresets = store.listOpacityPresets()
      .filter(preset => preset.name.includes('Duplicate Opacity'))
      .sort((left, right) => left.id.localeCompare(right.id));
    const duplicateThemes = store.listThemes()
      .filter(theme => theme.name.includes('Duplicate Id Theme'))
      .sort((left, right) => left.id.localeCompare(right.id));

    expect(duplicatePresets.map(preset => preset.id)).toEqual([
      'opacity-file-first-duplicate-id',
      'opacity-file-second-duplicate-id',
    ]);
    expect(duplicatePresets.every(preset => preset.invalid && !preset.canEdit && preset.canDelete)).toBe(true);
    expect(duplicatePresets.every(preset => preset.invalidReason === 'Another opacity preset already uses this id.')).toBe(true);
    expect(duplicateThemes.map(theme => theme.id)).toEqual([
      'theme-file-first-duplicate-id',
      'theme-file-second-duplicate-id',
    ]);
    expect(duplicateThemes.every(theme => theme.invalid && theme.canEdit && theme.canDelete)).toBe(true);
    expect(duplicateThemes.every(theme => theme.invalidReason === 'Another theme already uses this id.')).toBe(true);

    store.deleteOpacityPreset(duplicatePresets[1].id);
    store.deleteTheme(duplicateThemes[1].id);
    expect(fs.existsSync(path.join(store.OPACITY_PRESETS_DIR, 'second-duplicate-id.json'))).toBe(false);
    expect(fs.existsSync(path.join(store.THEMES_DIR, 'second-duplicate-id.json'))).toBe(false);
    expect(fs.existsSync(path.join(store.OPACITY_PRESETS_DIR, 'first-duplicate-id.json'))).toBe(true);
    expect(fs.existsSync(path.join(store.THEMES_DIR, 'first-duplicate-id.json'))).toBe(true);
  });

  it('keeps runtime records with seed IDs visible as invalid deleteable repair records', () => {
    const { store } = loadPersonalizationStoreTestContext();
    const seedTheme = readSeedThemes()[0];
    const seedPreset = readSeedOpacityPresets()[0];

    const shadowThemePath = path.join(store.THEMES_DIR, `${seedTheme.id}.json`);
    const shadowPresetPath = path.join(store.OPACITY_PRESETS_DIR, `${seedPreset.id}.json`);
    fs.writeFileSync(shadowThemePath, JSON.stringify({
      ...seedTheme,
      name: 'Runtime Copy Should Be Ignored',
      includedWithApp: false,
    }, null, 2));
    fs.writeFileSync(shadowPresetPath, JSON.stringify({
      ...seedPreset,
      name: 'Runtime Preset Copy Should Be Ignored',
      includedWithApp: false,
    }, null, 2));

    const themes = store.listThemes();
    const presets = store.listOpacityPresets();
    const seedThemeRecords = themes.filter(theme => theme.id === seedTheme.id);
    const seedPresetRecords = presets.filter(preset => preset.id === seedPreset.id);
    const shadowTheme = themes.find(theme => theme.name === 'Runtime Copy Should Be Ignored');
    const shadowPreset = presets.find(preset => preset.name === 'Runtime Preset Copy Should Be Ignored');

    expect(seedThemeRecords).toHaveLength(1);
    expect(seedThemeRecords[0].name).toBe(seedTheme.name);
    expect(seedThemeRecords[0].includedWithApp).toBe(true);
    expect(seedPresetRecords).toHaveLength(1);
    expect(seedPresetRecords[0].name).toBe(seedPreset.name);
    expect(seedPresetRecords[0].includedWithApp).toBe(true);

    expect(shadowTheme).toMatchObject({
      id: `theme-file-${seedTheme.id}`,
      invalid: true,
      invalidReason: 'This theme uses an id reserved by an included-with-app theme.',
      canEdit: true,
      canDelete: true,
    });
    expect(shadowPreset).toMatchObject({
      id: `opacity-file-${seedPreset.id}`,
      invalid: true,
      invalidReason: 'This opacity preset uses an id reserved by an included-with-app preset.',
      canEdit: false,
      canDelete: true,
    });

    store.deleteTheme(shadowTheme.id);
    store.deleteOpacityPreset(shadowPreset.id);
    expect(fs.existsSync(shadowThemePath)).toBe(false);
    expect(fs.existsSync(shadowPresetPath)).toBe(false);
  });
});
