const path = require('path');
const fs = require('fs');

const { IMAGES_DIR } = require('./db');

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
  const filename = `${albumId}.jpg`;
  const filepath = path.join(IMAGES_DIR, filename);

  if (fs.existsSync(filepath)) {
    return `images/${filename}`;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download album art: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filepath, buffer);

  return `images/${filename}`;
}

module.exports = { extractAlbumId, downloadImage };
