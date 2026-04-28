require('dotenv').config();

const { createApp } = require('./app');
const { syncGeneratedColorSchemePresetsModule } = require('./color-scheme-presets');

syncGeneratedColorSchemePresetsModule();

const PORT = process.env.PORT || 1060;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Trackspot running on port ${PORT}`);
});
