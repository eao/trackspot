const SAFE_SPOTIFY_URI_RE = /^spotify:(album|artist|track|playlist):([A-Za-z0-9]+)$/i;

function normalizeExternalLink(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;

  const spotifyMatch = raw.match(SAFE_SPOTIFY_URI_RE);
  if (spotifyMatch) {
    return `spotify:${spotifyMatch[1].toLowerCase()}:${spotifyMatch[2]}`;
  }

  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeArtistExternalLinks(artists) {
  if (!Array.isArray(artists)) return artists;

  return artists.map(artist => {
    if (!artist || typeof artist !== 'object' || Array.isArray(artist)) return artist;

    const normalized = { ...artist };
    if (Object.prototype.hasOwnProperty.call(normalized, 'manual_link')) {
      normalized.manual_link = normalizeExternalLink(normalized.manual_link);
    }
    if (Object.prototype.hasOwnProperty.call(normalized, 'share_url')) {
      normalized.share_url = normalizeExternalLink(normalized.share_url);
    }
    return normalized;
  });
}

module.exports = {
  normalizeArtistExternalLinks,
  normalizeExternalLink,
};
