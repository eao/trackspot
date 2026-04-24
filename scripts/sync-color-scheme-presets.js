const { syncGeneratedColorSchemePresetsModule } = require('../server/color-scheme-presets');

const result = syncGeneratedColorSchemePresetsModule();
const relativeOutputPath = result.outputPath.replace(process.cwd(), '.');

console.log(`Synced ${result.presets.length} color scheme presets to ${relativeOutputPath}`);
