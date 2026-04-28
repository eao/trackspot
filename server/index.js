const { createApp } = require('./app');
const { getHost, getPort } = require('./config');
const { assertGeneratedColorSchemePresetsModuleFresh } = require('./color-scheme-presets');

assertGeneratedColorSchemePresetsModuleFresh();

const PORT = getPort();
const HOST = getHost();
const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`Trackspot running at http://${HOST}:${PORT}`);
});
