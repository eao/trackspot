import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  loadColorSchemePresets,
  buildGeneratedColorSchemePresetsModule,
  loadColorSchemeManifest,
  assertGeneratedColorSchemePresetsModuleFresh,
} = require('../server/color-scheme-presets.js');

const tempDirs = [];

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('color scheme preset loader', () => {
  it('loads presets in manifest order and skips disabled entries', () => {
    const dir = makeTempDir('trackspot-styles-');
    const manifestPath = path.join(dir, 'manifest.json');

    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({
      id: 'late',
      name: 'Late',
      description: 'Loaded second.',
      vars: { '--accent': '#222222' },
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({
      id: 'early',
      name: 'Early',
      description: 'Loaded first.',
      vars: { '--accent': '#111111' },
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify({
      id: 'hidden',
      name: 'Hidden',
      description: 'Loaded nowhere.',
      vars: { '--accent': '#333333' },
    }, null, 2));
    fs.writeFileSync(manifestPath, JSON.stringify({
      themes: [
        { id: 'early', file: 'b.json', enabled: true },
        { id: 'hidden', file: 'c.json', enabled: false },
        { id: 'late', file: 'a.json', enabled: true },
      ],
    }, null, 2));

    const presets = loadColorSchemePresets({ stylesDir: dir, manifestPath });

    expect(presets.map(preset => preset.id)).toEqual(['early', 'late']);
  });

  it('passes through optional wrapped CSS overrides', () => {
    const dir = makeTempDir('trackspot-styles-');
    const manifestPath = path.join(dir, 'manifest.json');

    fs.writeFileSync(path.join(dir, 'wrapped.json'), JSON.stringify({
      id: 'wrapped-test',
      name: 'Wrapped Test',
      description: 'Has wrapped-only overrides.',
      vars: { '--accent': '#123456' },
      wrappedCss: '.page-panel-wrapped { --font-ui: Comic Sans MS; }',
    }, null, 2));
    fs.writeFileSync(manifestPath, JSON.stringify({
      themes: [
        { id: 'wrapped-test', file: 'wrapped.json', enabled: true },
      ],
    }, null, 2));

    const presets = loadColorSchemePresets({ stylesDir: dir, manifestPath });

    expect(presets).toEqual([expect.objectContaining({
      id: 'wrapped-test',
      wrappedCss: '.page-panel-wrapped { --font-ui: Comic Sans MS; }',
    })]);
  });

  it('loads the manifest shape', () => {
    const dir = makeTempDir('trackspot-styles-');
    const manifestPath = path.join(dir, 'manifest.json');

    fs.writeFileSync(manifestPath, JSON.stringify({
      themes: [
        { id: 'bunan-blue', file: 'bunan-blue.json', enabled: true },
      ],
    }, null, 2));

    const manifest = loadColorSchemeManifest({ manifestPath });

    expect(manifest.themes).toHaveLength(1);
    expect(manifest.themes[0].id).toBe('bunan-blue');
  });

  it('emits an ES module export', () => {
    const moduleSource = buildGeneratedColorSchemePresetsModule([{
      id: 'bunan-blue',
      name: 'Bunan Blue',
      description: 'Default theme.',
      vars: { '--accent': '#4f8ef7' },
    }]);

    expect(moduleSource).toContain('export const COLOR_SCHEME_PRESETS =');
    expect(moduleSource).toContain('"bunan-blue"');
    expect(moduleSource).toContain('/styles/manifest.json');
  });

  it('validates the generated module without rewriting it at runtime', () => {
    const dir = makeTempDir('trackspot-styles-');
    const manifestPath = path.join(dir, 'manifest.json');
    const outputPath = path.join(dir, 'generated.js');
    const preset = {
      id: 'runtime-test',
      name: 'Runtime Test',
      description: 'Generated before startup.',
      vars: { '--accent': '#abcdef' },
    };

    fs.writeFileSync(path.join(dir, 'runtime-test.json'), JSON.stringify(preset, null, 2));
    fs.writeFileSync(manifestPath, JSON.stringify({
      themes: [
        { id: 'runtime-test', file: 'runtime-test.json', enabled: true },
      ],
    }, null, 2));
    fs.writeFileSync(outputPath, buildGeneratedColorSchemePresetsModule([preset]));

    expect(assertGeneratedColorSchemePresetsModuleFresh({ stylesDir: dir, manifestPath, outputPath })).toMatchObject({
      changed: false,
      outputPath,
    });

    fs.writeFileSync(outputPath, 'stale');

    expect(() => assertGeneratedColorSchemePresetsModuleFresh({ stylesDir: dir, manifestPath, outputPath }))
      .toThrow(/npm run styles:sync/);
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('stale');
  });
});
