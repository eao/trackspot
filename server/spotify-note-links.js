const SUPPORTED_SPOTIFY_TYPES = new Set(['track', 'album', 'artist', 'playlist']);

const SPOTIFY_URI_RE = /^spotify:(track|album|artist|playlist):([A-Za-z0-9]+)$/i;
const SPOTIFY_WEB_URL_RE = /^https:\/\/open\.spotify\.com\/(track|album|artist|playlist)\/([A-Za-z0-9]+)(?:[/?#].*)?$/i;
const NOTES_LINK_PATTERN = /\[([^\]]*)\]\(((?:https?:\/\/|spotify:)[^)]+)\)|(https?:\/\/\S+)/g;

function parseSpotifyResource(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let match = trimmed.match(SPOTIFY_URI_RE);
  if (match) {
    const type = match[1].toLowerCase();
    const id = match[2];
    return {
      type,
      id,
      uri: `spotify:${type}:${id}`,
      webUrl: `https://open.spotify.com/${type}/${id}`,
    };
  }

  match = trimmed.match(SPOTIFY_WEB_URL_RE);
  if (match) {
    const type = match[1].toLowerCase();
    const id = match[2];
    return {
      type,
      id,
      uri: `spotify:${type}:${id}`,
      webUrl: `https://open.spotify.com/${type}/${id}`,
    };
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

function sanitizeMarkdownLinkText(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .trim();
}

async function fetchSpotifyOEmbedTitle(webUrl, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') return null;

  try {
    const response = await fetchImpl(`https://open.spotify.com/oembed?url=${encodeURIComponent(webUrl)}`);
    if (!response.ok) return null;

    const payload = await response.json();
    const title = typeof payload?.title === 'string' ? sanitizeMarkdownLinkText(payload.title) : '';
    return title || null;
  } catch {
    return null;
  }
}

async function normalizeSpotifyNoteLinks(notes, { fetchImpl = globalThis.fetch } = {}) {
  if (notes === null || notes === undefined || notes === '') return notes;
  const input = String(notes);
  const parts = [];
  const titleCache = new Map();
  NOTES_LINK_PATTERN.lastIndex = 0;

  let lastIndex = 0;
  let match;
  while ((match = NOTES_LINK_PATTERN.exec(input)) !== null) {
    if (match.index > lastIndex) {
      parts.push(input.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      const spotify = parseSpotifyResource(match[2]);
      if (spotify && SUPPORTED_SPOTIFY_TYPES.has(spotify.type)) {
        parts.push(`[${match[1]}](${spotify.uri})`);
      } else {
        parts.push(match[0]);
      }
    } else {
      const { candidate, trailing } = splitTrailingUrlPunctuation(match[3]);
      const spotify = parseSpotifyResource(candidate);
      if (!spotify || !SUPPORTED_SPOTIFY_TYPES.has(spotify.type)) {
        parts.push(match[0]);
      } else {
        let title = titleCache.get(spotify.webUrl);
        if (title === undefined) {
          title = await fetchSpotifyOEmbedTitle(spotify.webUrl, { fetchImpl });
          titleCache.set(spotify.webUrl, title);
        }

        if (title) {
          parts.push(`[${title}](${spotify.uri})${trailing}`);
        } else {
          parts.push(match[0]);
        }
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    parts.push(input.slice(lastIndex));
  }

  return parts.join('');
}

module.exports = {
  NOTES_LINK_PATTERN,
  SUPPORTED_SPOTIFY_TYPES,
  fetchSpotifyOEmbedTitle,
  normalizeSpotifyNoteLinks,
  parseSpotifyResource,
  sanitizeMarkdownLinkText,
  splitTrailingUrlPunctuation,
};
