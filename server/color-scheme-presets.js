const fs = require('fs');
const path = require('path');

const STYLES_DIR = path.join(__dirname, '..', 'styles');
const STYLES_SCRAPPED_DIR = path.join(__dirname, '..', 'styles-scrapped');
const STYLES_MANIFEST_PATH = path.join(STYLES_DIR, 'manifest.json');
const GENERATED_PRESETS_MODULE_PATH = path.join(__dirname, '..', 'public', 'js', 'color-scheme-presets.generated.js');

function listThemeJsonFileNames(stylesDir = STYLES_DIR) {
  if (!fs.existsSync(stylesDir)) {
    throw new Error(`Color scheme styles directory not found: ${stylesDir}`);
  }

  return fs.readdirSync(stylesDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
    .filter(entry => entry.name !== 'manifest.json')
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: 'base',
    }));
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${error.message}`, { cause: error });
  }
}

function loadColorSchemeManifest(options = {}) {
  const {
    manifestPath = STYLES_MANIFEST_PATH,
  } = options;

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Color scheme manifest not found: ${manifestPath}`);
  }

  const manifest = readJsonFile(manifestPath, `theme manifest "${path.basename(manifestPath)}"`);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Theme manifest must contain a JSON object.');
  }

  if (!Array.isArray(manifest.themes)) {
    throw new Error('Theme manifest must contain a "themes" array.');
  }

  return manifest;
}

function validateColorSchemePreset(preset, fileName) {
  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
    throw new Error(`Theme file "${fileName}" must contain a JSON object.`);
  }

  if (typeof preset.id !== 'string' || !preset.id.trim()) {
    throw new Error(`Theme file "${fileName}" is missing a non-empty "id".`);
  }

  if (typeof preset.name !== 'string' || !preset.name.trim()) {
    throw new Error(`Theme file "${fileName}" is missing a non-empty "name".`);
  }

  if (typeof preset.description !== 'string' || !preset.description.trim()) {
    throw new Error(`Theme file "${fileName}" is missing a non-empty "description".`);
  }

  if (!preset.vars || typeof preset.vars !== 'object' || Array.isArray(preset.vars)) {
    throw new Error(`Theme file "${fileName}" must include a "vars" object.`);
  }

  Object.entries(preset.vars).forEach(([key, value]) => {
    if (typeof key !== 'string' || !key.trim()) {
      throw new Error(`Theme file "${fileName}" contains an invalid CSS variable name.`);
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Theme file "${fileName}" has a non-string value for "${key}".`);
    }
  });

  if (preset.css !== undefined && typeof preset.css !== 'string') {
    throw new Error(`Theme file "${fileName}" has a non-string "css" value.`);
  }

  if (preset.wrappedCss !== undefined && typeof preset.wrappedCss !== 'string') {
    throw new Error(`Theme file "${fileName}" has a non-string "wrappedCss" value.`);
  }
}

function loadColorSchemePresets(options = {}) {
  const {
    stylesDir = STYLES_DIR,
    manifestPath = STYLES_MANIFEST_PATH,
  } = options;

  const manifest = loadColorSchemeManifest({ manifestPath });
  const manifestDir = path.dirname(manifestPath);
  const styleFilesOnDisk = listThemeJsonFileNames(stylesDir);
  const seenIds = new Set();
  const seenFiles = new Set();

  const presets = manifest.themes.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Theme manifest entry ${index + 1} must be an object.`);
    }

    if (typeof entry.id !== 'string' || !entry.id.trim()) {
      throw new Error(`Theme manifest entry ${index + 1} is missing a non-empty "id".`);
    }

    if (typeof entry.file !== 'string' || !entry.file.trim()) {
      throw new Error(`Theme manifest entry "${entry.id}" is missing a non-empty "file".`);
    }

    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
      throw new Error(`Theme manifest entry "${entry.id}" has a non-boolean "enabled" value.`);
    }

    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate theme id "${entry.id}" found in the manifest.`);
    }
    seenIds.add(entry.id);

    const fileName = path.basename(entry.file);
    if (seenFiles.has(fileName)) {
      throw new Error(`Duplicate manifest file entry "${fileName}" found in the manifest.`);
    }
    seenFiles.add(fileName);

    const filePath = path.join(manifestDir, entry.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Theme manifest entry "${entry.id}" points to a missing file: ${entry.file}`);
    }

    const parsed = readJsonFile(filePath, `theme file "${fileName}"`);
    validateColorSchemePreset(parsed, fileName);

    if (parsed.id !== entry.id) {
      throw new Error(`Theme manifest entry "${entry.id}" does not match the id in "${fileName}" (${parsed.id}).`);
    }

    if (entry.enabled === false) return [];

    return [{
      id: parsed.id,
      name: parsed.name,
      description: parsed.description,
      vars: parsed.vars,
      ...(parsed.css ? { css: parsed.css } : {}),
      ...(parsed.wrappedCss ? { wrappedCss: parsed.wrappedCss } : {}),
    }];
  });

  const unlistedFiles = styleFilesOnDisk.filter(fileName => !seenFiles.has(fileName));
  if (unlistedFiles.length) {
    throw new Error(`Theme files missing from manifest: ${unlistedFiles.join(', ')}`);
  }

  if (!presets.length) {
    throw new Error(`No enabled theme JSON files were found in ${stylesDir}.`);
  }

  return presets;
}

function buildGeneratedColorSchemePresetsModule(presets) {
  return `// This file is generated. Do not edit it directly.
// Source of truth: /styles/manifest.json and /styles/*.json

export const COLOR_SCHEME_PRESETS = ${JSON.stringify(presets, null, 2)};
`;
}

function syncGeneratedColorSchemePresetsModule(options = {}) {
  const {
    stylesDir = STYLES_DIR,
    manifestPath = STYLES_MANIFEST_PATH,
    outputPath = GENERATED_PRESETS_MODULE_PATH,
  } = options;

  const presets = loadColorSchemePresets({ stylesDir, manifestPath });
  const moduleSource = buildGeneratedColorSchemePresetsModule(presets);
  const previousSource = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (previousSource !== moduleSource) {
    fs.writeFileSync(outputPath, moduleSource);
  }

  return {
    presets,
    outputPath,
    changed: previousSource !== moduleSource,
  };
}

function assertGeneratedColorSchemePresetsModuleFresh(options = {}) {
  const {
    stylesDir = STYLES_DIR,
    manifestPath = STYLES_MANIFEST_PATH,
    outputPath = GENERATED_PRESETS_MODULE_PATH,
  } = options;

  const presets = loadColorSchemePresets({ stylesDir, manifestPath });
  const moduleSource = buildGeneratedColorSchemePresetsModule(presets);
  const previousSource = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;

  if (previousSource !== moduleSource) {
    throw new Error(
      `Generated color scheme presets are stale or missing at ${outputPath}. Run "npm run styles:sync" before starting Trackspot.`
    );
  }

  return {
    presets,
    outputPath,
    changed: false,
  };
}

module.exports = {
  STYLES_DIR,
  STYLES_SCRAPPED_DIR,
  STYLES_MANIFEST_PATH,
  GENERATED_PRESETS_MODULE_PATH,
  assertGeneratedColorSchemePresetsModuleFresh,
  buildGeneratedColorSchemePresetsModule,
  listThemeJsonFileNames,
  loadColorSchemeManifest,
  loadColorSchemePresets,
  syncGeneratedColorSchemePresetsModule,
};
