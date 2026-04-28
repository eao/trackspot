const fs = require('fs');

const { IMAGES_DIR } = require('./db');
const {
  buildManagedAlbumImagePath,
  resolveAlbumImagePath,
} = require('./album-image-paths');
const { DEFAULT_MAX_DOWNLOAD_BYTES, responseToBufferWithLimit } = require('./http-downloads');

// Accepts Spotify album URLs and URIs:
//   https://open.spotify.com/album/2gvrhSDbT29UtKoQSJDqmW?si=xxx
//   https://open.spotify.com/album/2gvrhSDbT29UtKoQSJDqmW
//   spotify:album:2gvrhSDbT29UtKoQSJDqmW
function extractAlbumId(input) {
  const trimmed = input.trim();

  const uriMatch = trimmed.match(/^spotify:album:([A-Za-z0-9]+)/);
  if (uriMatch) return uriMatch[1];

  const urlMatch = trimmed.match(/open\.spotify\.com\/album\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];

  throw new Error('Could not extract album ID from input. Please paste a Spotify album link.');
}

async function downloadImage(imageUrl, albumId) {
  const imagePath = buildManagedAlbumImagePath(albumId, '.jpg');
  const { fullPath: filepath } = resolveAlbumImagePath(imagePath, IMAGES_DIR);

  if (fs.existsSync(filepath)) {
    return imagePath;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download album art: ${response.status}`);
  }

  const buffer = await responseToBufferWithLimit(response, {
    maxBytes: DEFAULT_MAX_DOWNLOAD_BYTES,
  });
  fs.writeFileSync(filepath, buffer);

  return imagePath;
}

module.exports = { extractAlbumId, downloadImage };
