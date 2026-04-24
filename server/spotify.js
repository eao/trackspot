const path = require('path');
const fs = require('fs');
const https = require('https');

const { IMAGES_DIR } = require('./db');
const {
  buildSpotifyReleaseDateFromRest,
  deriveReleaseYear,
  getReleaseDateFromSpotifyReleaseDate,
  normalizeRestTrack,
} = require('./album-helpers');

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------
// The Client Credentials flow gives us an access token that lasts 1 hour.
// We cache it in memory and only request a new one when it's expired.
// Since this is a single-process app, in-memory caching is perfectly fine.

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Spotify auth failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Subtract 60 seconds from the expiry as a safety buffer.
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return cachedToken;
}

// ---------------------------------------------------------------------------
// Album ID extraction
// ---------------------------------------------------------------------------
// Accepts any of these formats Spotify might give you:
//   https://open.spotify.com/album/2gvrhSDbT29UtKoQSJDqmW?si=xxx
//   https://open.spotify.com/album/2gvrhSDbT29UtKoQSJDqmW
//   spotify:album:2gvrhSDbT29UtKoQSJDqmW

function extractAlbumId(input) {
  const trimmed = input.trim();

  // URI format
  const uriMatch = trimmed.match(/^spotify:album:([A-Za-z0-9]+)/);
  if (uriMatch) return uriMatch[1];

  // URL format
  const urlMatch = trimmed.match(/open\.spotify\.com\/album\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];

  throw new Error('Could not extract album ID from input. Please paste a Spotify album link.');
}

// ---------------------------------------------------------------------------
// Image downloading
// ---------------------------------------------------------------------------
// We pick the largest available image Spotify gives us, download it, and
// save it to the images directory. The filename is the Spotify album ID,
// which is stable and unique.

async function downloadImage(imageUrl, albumId) {
  const ext = 'jpg'; // Spotify album art is always JPEG
  const filename = `${albumId}.${ext}`;
  const filepath = path.join(IMAGES_DIR, filename);

  // If we already have this image (e.g. re-fetching metadata), skip download.
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

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

async function fetchAlbumData(spotifyInput) {
  const albumId = extractAlbumId(spotifyInput);
  const token = await getAccessToken();

  const response = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (response.status === 404) {
    throw new Error('Album not found on Spotify. Please check the link.');
  }
  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
  }

  const album = await response.json();

  // Images are provided largest-first by Spotify.
  const imageUrl = album.images?.[0]?.url ?? null;
  const imagePath = imageUrl ? await downloadImage(imageUrl, albumId) : null;

  const spotifyReleaseDate = buildSpotifyReleaseDateFromRest(
    album.release_date,
    album.release_date_precision,
  );
  const releaseDate = getReleaseDateFromSpotifyReleaseDate(spotifyReleaseDate);
  const releaseYear = deriveReleaseYear(releaseDate);
  const spotifyFirstTrack = normalizeRestTrack(album.tracks?.items?.[0] ?? null);
  const artists = (album.artists ?? []).map(artist => ({
    id: artist?.id ?? null,
    name: artist?.name ?? 'Unknown Artist',
    share_url: artist?.external_urls?.spotify ?? (artist?.id ? `https://open.spotify.com/artist/${artist.id}` : null),
    avatar_url: null,
  }));
  const artistNames = artists.map(artist => artist.name);

  return {
    spotify_url:      spotifyInput.trim(),
    spotify_album_id: albumId,
    share_url:        album.external_urls?.spotify ?? spotifyInput.trim(),
    album_name:       album.name,
    album_type:       album.album_type?.toUpperCase?.() ?? album.album_type ?? null,
    artists,
    artist_names:     artistNames,       // array — routes layer will JSON.stringify
    release_date:     releaseDate,
    release_year:     releaseYear,
    spotify_release_date: spotifyReleaseDate,
    spotify_first_track: spotifyFirstTrack,
    label:            album.label ?? null,
    genres:           album.genres ?? [], // array — routes layer will JSON.stringify
    track_count:      album.total_tracks ?? null,
    duration_ms:      null,
    copyright:        (album.copyrights ?? []).map(item => ({
      text: item?.text ?? '',
      type: item?.type ?? '',
    })),
    is_pre_release:   null,
    dominant_color_dark: null,
    dominant_color_light: null,
    dominant_color_raw: null,
    image_path:       imagePath,
    image_url_small:  album.images?.find(image => image?.width && image.width <= 64)?.url ?? null,
    image_url_medium: album.images?.find(image => image?.width && image.width <= 300)?.url ?? album.images?.[1]?.url ?? null,
    image_url_large:  album.images?.[0]?.url ?? null,
  };
}

module.exports = { fetchAlbumData, extractAlbumId, downloadImage };
