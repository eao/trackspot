// =============================================================================
// Pure helper functions — no imports from other app modules.
// =============================================================================

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatDate(isoString) {
  if (!isoString) return '—';
  return isoString.substring(0, 10);
}

export function formatRating(rating) {
  return rating === null || rating === undefined ? '—' : String(rating);
}

export function formatArtists(artists) {
  if (!Array.isArray(artists)) return artists || '—';
  return artists.map(a => typeof a === 'string' ? a : a.name).join(', ');
}

export function deriveArtistNames(artists) {
  if (!Array.isArray(artists)) return [];
  return artists
    .map(a => typeof a === 'string' ? a : a?.name)
    .filter(name => typeof name === 'string' && name.trim() !== '');
}

export function normalizeAlbumClientShape(album) {
  if (!album || typeof album !== 'object') return album;
  return {
    ...album,
    artist_names: Array.isArray(album.artist_names)
      ? album.artist_names.filter(name => typeof name === 'string' && name.trim() !== '')
      : deriveArtistNames(album.artists),
  };
}

export function normalizeAlbumCollectionClientShape(albums) {
  return Array.isArray(albums)
    ? albums.map(normalizeAlbumClientShape)
    : [];
}

export function formatDuration(ms) {
  if (!ms) return '—';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return `${m}:${String(s).padStart(2,'0')}`;
}

const ALBUM_TYPE_STORAGE_MAP = {
  album: 'ALBUM',
  ep: 'EP',
  single: 'SINGLE',
  compilation: 'COMPILATION',
};

const ALBUM_TYPE_DISPLAY_MAP = {
  ALBUM: 'Album',
  EP: 'EP',
  SINGLE: 'Single',
  COMPILATION: 'Compilation',
};

export function normalizeAlbumTypeForStorage(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return ALBUM_TYPE_STORAGE_MAP[trimmed.toLowerCase()] ?? trimmed;
}

export function formatAlbumTypeForDisplay(value) {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return ALBUM_TYPE_DISPLAY_MAP[trimmed.toUpperCase()] ?? trimmed;
}

export function formatAlbumMetaTooltip(album) {
  if (!album || typeof album !== 'object') return '';

  const parts = [];
  const albumType = formatAlbumTypeForDisplay(album.album_type);
  if (albumType) {
    parts.push(albumType);
  }

  if (Number.isInteger(album.track_count) && album.track_count >= 0) {
    parts.push(`${album.track_count} ${album.track_count === 1 ? 'track' : 'tracks'}`);
  }

  return parts.join('・');
}

export function parseDurationInput(str) {
  // Converts flexible duration strings to milliseconds.
  // Accepts: s, ss, m:ss, mm:ss, h:mm:ss, hh:mm:ss, etc.
  if (!str || !str.trim()) return null;
  const parts = str.trim().split(':').map(s => s.trim());
  let h = 0, m = 0, s = 0;
  if (parts.length === 1) {
    s = parseInt(parts[0], 10);
  } else if (parts.length === 2) {
    m = parseInt(parts[0], 10);
    s = parseInt(parts[1], 10);
  } else if (parts.length >= 3) {
    h = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    s = parseInt(parts[2], 10);
  }
  if ([h, m, s].some(isNaN)) return null;
  return (h * 3600 + m * 60 + s) * 1000;
}

export function artistSpotifyUri(artist) {
  if (!artist?.id) return null;
  return `spotify:artist:${artist.id}`;
}

export function artUrl(imagePath) {
  if (!imagePath) return null;
  // image_path is stored as 'images/filename.jpg' and is served at /images/filename.jpg.
  return '/' + imagePath;
}

export function getPreferredAlbumArtUrl(album, { fallbackToSpotify = true } = {}) {
  const storedUrl = artUrl(album?.image_path);
  if (storedUrl) return storedUrl;
  if (!fallbackToSpotify || !album || typeof album !== 'object') return null;
  return album.image_url_medium || album.image_url_small || album.image_url_large || null;
}

// ---------------------------------------------------------------------------
// XSS protection
// ---------------------------------------------------------------------------
// Any user-supplied or API-supplied string rendered into innerHTML must be
// escaped first. This prevents a malicious album name from injecting scripts.

export function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SPOTIFY_URI_RE = /^spotify:(track|album|artist|playlist):([A-Za-z0-9]+)$/i;
const SPOTIFY_WEB_URL_RE = /^https:\/\/open\.spotify\.com\/(track|album|artist|playlist)\/([A-Za-z0-9]+)(?:[/?#].*)?$/i;
const NOTES_LINK_PATTERN = /\[([^\]]*)\]\(((?:https?:\/\/|spotify:)[^)]+)\)|(https?:\/\/\S+|spotify:(?:track|album|artist|playlist):[A-Za-z0-9]+)/g;

function parseSpotifyNotesTarget(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let match = trimmed.match(SPOTIFY_URI_RE);
  if (match) {
    const type = match[1].toLowerCase();
    const id = match[2];
    return { type, id, uri: `spotify:${type}:${id}` };
  }

  match = trimmed.match(SPOTIFY_WEB_URL_RE);
  if (match) {
    const type = match[1].toLowerCase();
    const id = match[2];
    return { type, id, uri: `spotify:${type}:${id}` };
  }

  return null;
}

function splitTrailingUrlPunctuation(value) {
  let candidate = value;
  let trailing = '';

  while (candidate) {
    const lastChar = candidate[candidate.length - 1];
    if (/[.,!?;:]/.test(lastChar)) {
      trailing = lastChar + trailing;
      candidate = candidate.slice(0, -1);
      continue;
    }

    if (lastChar === ')') {
      const opens = (candidate.match(/\(/g) || []).length;
      const closes = (candidate.match(/\)/g) || []).length;
      if (closes > opens) {
        trailing = lastChar + trailing;
        candidate = candidate.slice(0, -1);
        continue;
      }
    }

    break;
  }

  return { candidate, trailing };
}

function buildNotesAnchorHtml(text, href) {
  const escapedText = escHtml(text);
  const escapedHref = escHtml(href);
  const spotifyTarget = parseSpotifyNotesTarget(href);
  const attrs = spotifyTarget
    ? ' class="notes-link"'
    : ' target="_blank" rel="noopener noreferrer" class="notes-link"';
  return `<a href="${escapedHref}"${attrs}>${escapedText}</a>`;
}

// Render notes text as HTML, converting Markdown links [text](url) and bare
// URLs into clickable <a> tags. All other content is escaped to prevent XSS.
export function renderNotesHtml(str) {
  if (!str) return '';
  const result = [];
  NOTES_LINK_PATTERN.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = NOTES_LINK_PATTERN.exec(str)) !== null) {
    if (m.index > last) result.push(escHtml(str.slice(last, m.index)));
    if (m[1] !== undefined) {
      const spotifyTarget = parseSpotifyNotesTarget(m[2]);
      const href = spotifyTarget?.uri ?? m[2];
      result.push(buildNotesAnchorHtml(m[1] || m[2], href));
    } else {
      const { candidate, trailing } = splitTrailingUrlPunctuation(m[3]);
      const spotifyTarget = parseSpotifyNotesTarget(candidate);
      const href = spotifyTarget?.uri ?? candidate;
      result.push(buildNotesAnchorHtml(candidate, href));
      if (trailing) result.push(escHtml(trailing));
    }
    last = m.index + m[0].length;
  }
  if (last < str.length) result.push(escHtml(str.slice(last)));
  return result.join('');
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Artist name parsing
// ---------------------------------------------------------------------------
// Supports two formats:
//   "Artist A, Artist B"              → ['Artist A', 'Artist B']
//   "{{Crosby, Stills, Nash & Young}}, {{Neil Young}}"  → ['Crosby, Stills, Nash & Young', 'Neil Young']
//   "{{Crosby, Stills, Nash & Young}}, The Beatles"     → ['Crosby, Stills, Nash & Young', 'The Beatles']
// If any {{}} are present, those are extracted first, then remaining
// comma-separated fragments are processed normally.

export function parseArtistInput(input) {
  if (!input || !input.trim()) return [];

  const results = [];

  // Extract all {{...}} wrapped names first.
  const braceRe = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = braceRe.exec(input)) !== null) {
    results.push(match[1].trim());
  }

  if (results.length > 0) {
    // Remove all {{...}} segments and leftover commas/spaces from remaining.
    const remaining = input.replace(/\{\{[^}]+\}\}/g, '').replace(/^[\s,]+|[\s,]+$/g, '');
    // Split anything left by comma.
    if (remaining.trim()) {
      remaining.split(',').map(s => s.trim()).filter(Boolean).forEach(a => results.push(a));
    }
    return results;
  }

  // No braces — plain comma split.
  return input.split(',').map(s => s.trim()).filter(Boolean);
}
