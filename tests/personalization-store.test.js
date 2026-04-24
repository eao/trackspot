import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const touchedPaths = [];

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  touchedPaths.push(dir);
  return dir;
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
  it('seeds the default opacity presets into the data directory', () => {
    const { store, dataDir } = loadPersonalizationStoreTestContext();

    const presets = store.listOpacityPresets();

    expect(presets.map(preset => preset.name)).toEqual(['Default Opaque']);
    expect(fs.existsSync(path.join(dataDir, 'opacity-presets', 'default-opaque.json'))).toBe(true);
  });

  it('creates themes that reference the seeded default-opaque preset', () => {
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

    expect(themes.map(item => item.opacityPresetId)).toEqual(['default-opaque']);
    expect(themes[0].id).toBe(theme.id);
  });

  it('treats Basic Blue as an included-with-app theme even if the stored file predates that flag', () => {
    const { store, dataDir } = loadPersonalizationStoreTestContext();

    const previewFileName = 'basic-blue.png';
    const previewThumbFileName = 'basic-blue.jpg';
    fs.writeFileSync(path.join(dataDir, 'theme-preview-images', previewFileName), 'preview');
    fs.writeFileSync(path.join(dataDir, 'theme-preview-images-thumbs', previewThumbFileName), 'thumb');
    fs.writeFileSync(path.join(dataDir, 'themes', 'basic-blue.json'), JSON.stringify({
      id: 'basic-blue',
      name: 'Basic Blue',
      description: 'Default theme.',
      previewImage: {
        fileName: previewFileName,
      },
      colorSchemePresetId: 'bunan-blue',
      primaryBackgroundSelection: null,
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
      backgroundImageOpacity: 45,
      backgroundImageBlur: 0,
      secondaryBackgroundImageOpacity: 100,
      secondaryBackgroundImageBlur: 0,
      opacityPresetId: 'default-opaque',
      includedWithApp: false,
    }, null, 2));

    const [theme] = store.listThemes();

    expect(theme.id).toBe('basic-blue');
    expect(theme.includedWithApp).toBe(true);
    expect(theme.canEdit).toBe(false);
    expect(theme.canDelete).toBe(false);
  });
});
