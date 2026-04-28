// =============================================================================
// Wrapped view — per-year retrospective. Port of the design's wrapped.jsx.
// =============================================================================

import { state } from './state.js';
import { computeYear, parseDateValue } from './stats-compute.js';
import {
  getPreferredAlbumArtUrl,
  getSafeExternalHref,
  normalizeCssHexColor,
  renderNotesHtml,
} from './utils.js';
import { copyWrappedShareCard, exportWrappedShareCard } from './wrapped-share-export.js';
import { persistWrappedName, setWrappedName, WRAPPED_NAME_EVENT } from './wrapped-name.js';

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = parseDateValue(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDiscordMessageTime(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function fmtSpotifyReleaseDate(isoString) {
  if (!isoString) return '';
  const match = String(isoString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(+year, +month - 1, +day).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return fmtDate(isoString);
}
function fmtHoursDown(h) {
  const n = Math.floor(h);
  return `${n} hour${n === 1 ? '' : 's'}`;
}
function fmtHoursShort(h) {
  return `${Math.floor(h)}h`;
}
function pad(n) { return String(n).padStart(2, '0'); }
function isoYMD(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function compareTextAsc(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}
function compareAlbumTitleAsc(a, b) {
  return compareTextAsc(a?.album?.album_name, b?.album?.album_name)
    || compareTextAsc(a?.album?.artist_name, b?.album?.artist_name)
    || compareTextAsc(a?.album?.created_at, b?.album?.created_at);
}
function compareNotableEntries(a, b) {
  return (b.text.length - a.text.length)
    || ((b.album.rating ?? Number.NEGATIVE_INFINITY) - (a.album.rating ?? Number.NEGATIVE_INFINITY))
    || compareAlbumTitleAsc(a, b);
}

function getWrappedUnlockDate(year) {
  return new Date(year + 1, 0, 1, 0, 0, 0, 0);
}

function isWrappedLocked(year, now = new Date()) {
  const parsedYear = Number.parseInt(String(year ?? ''), 10);
  return Number.isFinite(parsedYear) && parsedYear === now.getFullYear() && !state.earlyWrapped;
}

function getCountdownParts(targetDate, now = new Date()) {
  const diffMs = Math.max(0, targetDate.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function countdownUnitHtml(unit, value) {
  const formattedValue = unit === 'days' ? String(value) : pad(value);
  const label = unit.charAt(0).toUpperCase() + unit.slice(1);
  return `
    <div class="w-unlock-unit">
      <div class="w-unlock-value" data-countdown-unit="${unit}">${formattedValue}</div>
      <div class="w-unlock-label">${label}</div>
    </div>`;
}

function coverHtml(album, size = 64, rounded = 4, { fluid = false } = {}) {
  const src = getPreferredAlbumArtUrl(album);
  const dark = normalizeCssHexColor(album.dominant_color_dark, '#334155');
  const light = normalizeCssHexColor(album.dominant_color_light, '#94a3b8');
  const id = Number(album.id) || 0;
  const seed = (id * 2654435761) >>> 0;
  const angle = seed % 360;
  const dims = fluid
    ? `width:100%;aspect-ratio:1;height:auto`
    : `width:${size}px;height:${size}px`;
  const style = `${dims};border-radius:${rounded}px;background:linear-gradient(${angle}deg, ${light}, ${dark})`;
  if (src) return `<div class="ts-cover" style="${style}"><img src="${escHtml(src)}" alt="" loading="lazy"></div>`;
  const initials = (album.album_name || '?')
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const initSize = Math.max(10, size * 0.28);
  return `<div class="ts-cover" style="${style}"><div class="ts-cover-initials" style="font-size:${initSize}px">${escHtml(initials)}</div></div>`;
}

function artistAvatarHtml(artist, size = 46) {
  const src = artist.avatar_url || artist.fallback_image || null;
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (src) {
    return `<div class="w-artist-avatar" style="${style}"><img src="${escHtml(src)}" alt="" loading="lazy"></div>`;
  }
  const initial = ((artist.name || '?').trim()[0] || '?').toUpperCase();
  return `<div class="w-artist-avatar" style="${style}">${escHtml(initial)}</div>`;
}

const SPOTIFY_URI_RE = /^spotify:(track|album|artist|playlist):([A-Za-z0-9]+)$/i;
const SPOTIFY_WEB_URL_RE = /^https:\/\/open\.spotify\.com\/(track|album|artist|playlist)\/([A-Za-z0-9]+)(?:[/?#].*)?$/i;
const SPOTIFY_TRACK_URI_RE = /^spotify:track:([A-Za-z0-9]+)$/i;
const SPOTIFY_TRACK_EMBED_ALLOW = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
const TRACKSPOT_REPO_URL = 'https://github.com/eao/trackspot';

function normalizeSpotifyHref(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let match = trimmed.match(SPOTIFY_URI_RE);
  if (match) return `spotify:${match[1].toLowerCase()}:${match[2]}`;

  match = trimmed.match(SPOTIFY_WEB_URL_RE);
  if (match) return `spotify:${match[1].toLowerCase()}:${match[2]}`;

  return null;
}

function quietLinkHtml(text, href, className = '') {
  const classes = ['w-quiet-link'];
  if (className) classes.push(className);
  const label = escHtml(text);
  if (!href) return label;
  return `<a class="${classes.join(' ')}" href="${escHtml(href)}">${label}</a>`;
}

function albumSpotifyHref(album) {
  if (album?.spotify_album_id) return `spotify:album:${album.spotify_album_id}`;
  return normalizeSpotifyHref(album?.album_link) || normalizeSpotifyHref(album?.spotify_url);
}

function artistSpotifyHref(artist) {
  if (artist?.id) return `spotify:artist:${artist.id}`;
  return normalizeSpotifyHref(artist?.share_url);
}

function findMatchingArtist(artists, name) {
  if (!Array.isArray(artists) || !name) return null;
  return artists.find(artist =>
    artist
    && typeof artist === 'object'
    && String(artist.name ?? '').localeCompare(String(name), undefined, { sensitivity: 'base' }) === 0,
  ) || null;
}

function albumArtistSpotifyHref(album) {
  const matchedArtist = findMatchingArtist(album?.artists, album?.artist_name);
  if (matchedArtist) return artistSpotifyHref(matchedArtist) || normalizeSpotifyHref(album?.artist_link);

  if (Array.isArray(album?.artists) && album.artists.length === 1 && typeof album.artists[0] === 'object') {
    return artistSpotifyHref(album.artists[0]) || normalizeSpotifyHref(album?.artist_link);
  }

  return normalizeSpotifyHref(album?.artist_link);
}

function albumTitleLinkHtml(album, className = '') {
  return quietLinkHtml(album?.album_name, albumSpotifyHref(album), className);
}

function albumArtistLinkHtml(album, className = '') {
  return quietLinkHtml(album?.artist_name, albumArtistSpotifyHref(album), className);
}

function getFirstSpotifyTrack(album) {
  let track = album?.spotify_first_track;
  if (typeof track === 'string' && track.trim()) {
    try {
      track = JSON.parse(track);
    } catch {
      track = null;
    }
  }
  if (!track || typeof track !== 'object') return null;
  const uri = typeof track.uri === 'string' ? track.uri.trim() : '';
  const match = uri.match(SPOTIFY_TRACK_URI_RE);
  const id = typeof track.id === 'string' && track.id.trim() ? track.id.trim() : match?.[1];
  if (!id) return null;

  return {
    id,
    name: track?.name || '',
    uri: uri || `spotify:track:${id}`,
    share_url: track?.share_url || `https://open.spotify.com/track/${id}`,
  };
}

function spotifyTrackEmbedHtml(track) {
  if (!track?.id) return '';
  const src = `https://open.spotify.com/embed/track/${encodeURIComponent(track.id)}?utm_source=generator`;
  return `
    <iframe
      class="w-discord-preview-embed"
      title="Spotify preview${track.name ? `: ${escHtml(track.name)}` : ''}"
      src="${src}"
      width="100%"
      height="80"
      frameborder="0"
      allowfullscreen
      allow="${SPOTIFY_TRACK_EMBED_ALLOW}"
      loading="lazy"></iframe>`;
}

function albumExternalLink(album) {
  return getSafeExternalHref(album?.album_link)
    || getSafeExternalHref(album?.share_url)
    || getSafeExternalHref(album?.spotify_url);
}

function discordCopyIconHtml() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy" aria-hidden="true" focusable="false"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
}

function spotifyPreviewPanelHtml({ albums, type, title, subtitle }) {
  if (!albums.length) return '';

  const rows = albums.map(album => {
    const track = getFirstSpotifyTrack(album);
    if (!track) return '';
    return `
      <div class="w-discord-preview-row">
        ${spotifyTrackEmbedHtml(track)}
      </div>`;
  }).join('');
  const emptyRows = rows.trim()
    ? ''
    : '<div class="w-discord-preview-empty">No Spotify first-track previews available.</div>';

  return `
    <div class="w-discord-preview" aria-label="${escHtml(title)}">
      <div class="w-discord-preview-head">
        <div class="w-discord-preview-copy-row">
          <div>
            <div class="w-discord-preview-title">${escHtml(title)}</div>
            <div class="w-discord-preview-sub">${escHtml(subtitle)}</div>
          </div>
          <button class="w-discord-copy-btn" data-action="copy-discord-preview" data-discord-preview-type="${escHtml(type)}" type="button">
            ${discordCopyIconHtml()}
            <span>Copy</span>
            <span class="w-discord-copy-popover" aria-hidden="true">Text copied.</span>
          </button>
        </div>
      </div>
      <div class="w-discord-preview-list">
        ${rows}
        ${emptyRows}
      </div>
      <div class="w-discord-copy-status w-discord-copy-status-error" data-discord-copy-status="${escHtml(type)}" role="status" aria-live="polite"></div>
    </div>`;
}

function wrappedSpotifyPreviewHtml(year, data, discordLoadedAt) {
  const topAlbums = data.topByRating.slice(0, 5);
  const topReleases = data.topReleasedThatYear.slice(0, 5);
  if (!topAlbums.length && !topReleases.length) return '';

  return `
    <div class="w-discord-preview-grid">
      <div class="w-discord-preview w-discord-preview-intro">
        <div class="w-discord-message">
          <img class="w-discord-message-avatar" src="/avatars/Spotty-Santa-Avatar.png" alt="">
          <div class="w-discord-message-body">
            <div class="w-discord-message-meta">
              <span class="w-discord-message-author">Spotty</span>
              <span class="w-discord-message-time">${escHtml(fmtDiscordMessageTime(discordLoadedAt))}</span>
            </div>
            <div class="w-discord-message-text">Share your top Wrapped albums with your friends! Hit Copy on either panel below, then paste into Discord to show off your top albums with Spotify embeds.</div>
          </div>
        </div>
      </div>
      ${spotifyPreviewPanelHtml({
        albums: topAlbums,
        type: 'top',
        title: 'Top Albums',
        subtitle: `First-track embeds for top albums logged in ${year}.`,
      })}
      ${spotifyPreviewPanelHtml({
        albums: topReleases,
        type: 'released',
        title: `Top ${year} Releases`,
        subtitle: `First-track embeds for top albums released in ${year}.`,
      })}
    </div>`;
}

function discordOwnerName() {
  const name = typeof state.wrappedName === 'string' ? state.wrappedName.trim() : '';
  return name ? `${name}'s` : 'My';
}

function escapeDiscordLinkLabel(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function wrapDiscordUrl(url, { suppressEmbeds = false } = {}) {
  const value = String(url ?? '').trim();
  if (!value) return '';
  return suppressEmbeds ? `<${value}>` : value;
}

function discordAlbumLinkText(album) {
  const track = getFirstSpotifyTrack(album);
  const title = escapeDiscordLinkLabel(album?.album_name || 'Untitled Album');
  if (track?.share_url) return `[${title}](${wrapDiscordUrl(track.share_url)})`;

  const href = albumExternalLink(album);
  if (href) return `[${title}](${wrapDiscordUrl(href, { suppressEmbeds: true })})`;
  return title;
}

function buildDiscordShareText({ year, albums, type }) {
  const list = albums.slice(0, 5);
  const owner = discordOwnerName();
  const header = type === 'released'
    ? `${owner} top ${list.length} ${year} releases in [Trackspot Wrapped](<${TRACKSPOT_REPO_URL}>):`
    : `${owner} top ${list.length} albums from [Trackspot Wrapped](<${TRACKSPOT_REPO_URL}>) ${year}:`;
  const lines = [
    '=========================',
    header,
    '=========================',
  ];

  list.forEach((album, index) => {
    const artist = String(album?.artist_name || '').trim() || 'Unknown Artist';
    const rating = album?.rating != null ? `  (${album.rating}/100)` : '';
    lines.push(`* ${index + 1}\\. ${discordAlbumLinkText(album)} - ${artist}${rating}`);
    if (!getFirstSpotifyTrack(album)) {
      lines.push('  * ( ↑ not on Spotify )');
    }
  });

  lines.push(
    '=========================',
    'Check out the first tracks from each album!',
  );
  return lines.join('\n');
}

function getDiscordPreviewAlbums(data, type) {
  return type === 'released'
    ? data.topReleasedThatYear.slice(0, 5)
    : data.topByRating.slice(0, 5);
}

function yearCarouselHtml(year, yearsAvailable) {
  const idx = yearsAvailable.findIndex(y => +y === +year);
  const slots = [-1, 0, 1].map(offset => {
    const si = idx + offset;
    const hasData = si >= 0 && si < yearsAvailable.length;
    return { year: hasData ? +yearsAvailable[si] : +year + offset, hasData, isCurrent: offset === 0 };
  });
  const buttons = slots.map((s, i) => {
    const cls = `w-yc-btn${s.isCurrent ? ' w-yc-active' : ''}${!s.hasData ? ' w-yc-ghost' : ''}`;
    const disabled = !s.hasData || s.isCurrent ? 'disabled' : '';
    const leading = i === 0
      ? `<span class="w-yc-arrow" style="visibility:${!s.isCurrent && s.hasData ? 'visible' : 'hidden'}">‹</span>` : '';
    const trailing = i === 2
      ? `<span class="w-yc-arrow" style="visibility:${!s.isCurrent && s.hasData ? 'visible' : 'hidden'}">›</span>` : '';
    return `<button class="${cls}" data-year="${s.year}" ${disabled}>${leading}${s.year}${trailing}</button>`;
  }).join('');
  return `<div class="w-year-carousel">${buttons}</div>`;
}

function heroBackdropHtml(year, albums) {
  const dailyMap = {};
  let max = 0;
  for (const a of albums) {
    if (a.status !== 'completed' || !a.listened_at) continue;
    if (!a.listened_at.startsWith(String(year))) continue;
    const k = a.listened_at.slice(0, 10);
    dailyMap[k] = (dailyMap[k] || 0) + 1;
    if (dailyMap[k] > max) max = dailyMap[k];
  }
  if (!max) max = 1;
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const firstWeekday = start.getDay();
  const totalDays = Math.round((end - start) / 86400000) + 1;
  const numCols = Math.ceil((firstWeekday + totalDays) / 7);
  const cells = [];
  for (let col = 0; col < numCols; col++) {
    for (let row = 0; row < 7; row++) {
      const dayOffset = col * 7 + row - firstWeekday;
      if (dayOffset < 0 || dayOffset >= totalDays) {
        cells.push('<span class="w-hb-cell w-hb-empty"></span>');
        continue;
      }
      const d = new Date(year, 0, 1 + dayOffset);
      const count = dailyMap[isoYMD(d)] || 0;
      const intensity = count / max;
      const bg = count === 0
        ? 'var(--bg-elevated)'
        : `color-mix(in oklab, var(--accent) ${Math.round(30 + intensity * 70)}%, var(--bg-elevated))`;
      const delay = (row * 60) + (col * 10);
      cells.push(`<span class="w-hb-cell" style="background:${bg};animation-delay:${delay}ms"></span>`);
    }
  }
  return `
    <div class="w-hero-backdrop" aria-hidden="true">
      <div class="w-hero-backdrop-grid" style="grid-template-columns:repeat(${numCols}, 1fr)">${cells.join('')}</div>
    </div>`;
}

function bookendHtml(label, album) {
  return `
    <div class="w-bookend">
      <div class="w-bookend-label">${escHtml(label)}</div>
      <div class="w-bookend-card">
        ${coverHtml(album, 120, 5)}
        <div>
          <div class="w-fame-name">${albumTitleLinkHtml(album)}</div>
          <div class="w-fame-artist">${albumArtistLinkHtml(album)}</div>
          ${album.rating != null ? `<div class="w-fame-rating-inline">${album.rating}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function eyebrowLinkHtml(text, href) {
  return quietLinkHtml(text, href, 'w-eyebrow-link');
}

function getTimeTravelerReleaseLabel(album) {
  const spotifyReleaseIso = album?.spotify_release_date?.isoString;
  const spotifyReleaseDate = fmtSpotifyReleaseDate(spotifyReleaseIso);
  if (spotifyReleaseDate) {
    return `Released ${spotifyReleaseDate}`;
  }
  if (album?.release_year != null && album.release_year !== '') {
    return `Released ${album.release_year}`;
  }
  return 'Released';
}

function monthBarsHtml(months) {
  const max = Math.max(1, ...months.map(m => m.count));
  const MNAMES_W = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `<div class="w-months">${months.map((m, i) => {
    const pct = m.count > 0 ? (m.count / max) * 100 : 0;
    const hrs = m.hours != null && m.count > 0 ? fmtHoursShort(m.hours) : null;
    return `
      <div class="w-month-col">
        <div class="w-month-bar-track">
          ${m.count > 0 ? `<div class="w-month-val-abs" style="bottom:calc(${pct}% + 3px)"><div class="w-month-val-count">${m.count}</div></div>` : ''}
          ${m.count > 0 ? `<div class="w-month-bar" style="height:${pct}%"></div>` : '<div class="w-month-bar-zero"></div>'}
        </div>
        <div class="w-month-lab">${MNAMES_W[i]}</div>
        ${hrs ? `<div class="w-month-hours">${escHtml(hrs)}</div>` : ''}
      </div>`;
  }).join('')}</div>`;
}

function ratingDistBarsHtml(buckets, ratingStep = 10) {
  if (!buckets.length) return '';
  const labels = Array.from({ length: buckets.length }, (_, i) =>
    i === buckets.length - 1 ? 100 : i * ratingStep);
  const max = Math.max(1, ...buckets);
  return `<div class="w-rdist" style="grid-template-columns:repeat(${buckets.length}, 1fr)">${buckets.map((c, i) => {
    const pct = c > 0 ? (c / max) * 100 : 0;
    return `
      <div class="w-rdist-col">
        <div class="w-rdist-track">
          ${c > 0 ? `<div class="w-rdist-val" style="bottom:calc(${pct}% + 4px)">${c}</div>` : ''}
          ${c > 0 ? `<div class="w-rdist-bar" style="height:${pct}%"></div>` : '<div class="w-rdist-bar-zero"></div>'}
        </div>
        <div class="w-rdist-lab">${labels[i]}</div>
      </div>`;
  }).join('')}</div>`;
}

function ordinal(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function noteRankLabel(rank) {
  return rank === 1 ? 'Most notable' : `(${ordinal(rank)}) Most notable`;
}

function notableSlots(data) {
  const slotsById = new Map();

  function ensureSlot(entry) {
    if (!entry?.album) return null;
    const id = entry.album.id;
    if (slotsById.has(id)) return slotsById.get(id);
    const slot = {
      entry,
      hasScreed: false,
      hasNumero: false,
      noteRankLabels: [],
    };
    slotsById.set(id, slot);
    return slot;
  }

  const screedSlot = data.screed ? ensureSlot(data.screed) : null;
  if (screedSlot) screedSlot.hasScreed = true;

  const numeroSlot = data.numeroUno ? ensureSlot(data.numeroUno) : null;
  if (numeroSlot) numeroSlot.hasNumero = true;

  let standaloneNotableSlot = null;
  const rankedNotes = data.notes.slice().sort(compareNotableEntries);
  for (let i = 0; i < rankedNotes.length; i++) {
    const entry = rankedNotes[i];
    const rankLabel = noteRankLabel(i + 1);
    const existingSlot = slotsById.get(entry.album.id);
    if (existingSlot) {
      existingSlot.noteRankLabels.push(rankLabel);
      continue;
    }
    standaloneNotableSlot = ensureSlot(entry);
    standaloneNotableSlot.noteRankLabels.push(rankLabel);
    break;
  }

  const orderedSlots = [];
  if (screedSlot) orderedSlots.push(screedSlot);
  if (standaloneNotableSlot && !orderedSlots.includes(standaloneNotableSlot)) {
    orderedSlots.push(standaloneNotableSlot);
  }
  if (numeroSlot && !orderedSlots.includes(numeroSlot)) orderedSlots.push(numeroSlot);
  if (!orderedSlots.length && standaloneNotableSlot) orderedSlots.push(standaloneNotableSlot);

  return orderedSlots.map(slot => {
    const labels = [];
    if (slot.hasScreed) labels.push('Screed');
    if (slot.hasNumero) labels.push('Numero uno');
    labels.push(...slot.noteRankLabels);
    return {
      label: labels.join('\n'),
      entry: slot.entry,
    };
  }).filter(slot => slot.label);
}

function notableCardHtml({ label, entry }) {
  const { album, text } = entry;
  const dateISO = (album.listened_at || '').slice(0, 10);
  return `
    <div class="w-notable">
      <div class="w-notable-left">
        <div class="w-notable-label">${escHtml(label)}</div>
        ${coverHtml(album, 130, 6)}
        <div class="w-notable-chars">${text.length.toLocaleString()} characters</div>
        ${dateISO ? `<div class="w-notable-date">${escHtml(dateISO)}</div>` : ''}
      </div>
      <div class="w-notable-body">
        <div class="w-notable-meta">
          <div class="w-notable-name">${albumTitleLinkHtml(album)}</div>
          <div class="w-notable-artist">${albumArtistLinkHtml(album)}${album.release_year ? `<span class="w-notable-year"> (${album.release_year})</span>` : ''}</div>
          ${album.rating != null ? `<div class="w-notable-rating">${album.rating}</div>` : ''}
        </div>
        <blockquote class="w-notable-quote">
          <span class="w-notable-quot">&ldquo;</span>${renderNotesHtml(text)}<span class="w-notable-quot w-notable-quot-close">&rdquo;</span>
        </blockquote>
      </div>
    </div>`;
}

function tickerHtml(notes) {
  const doubled = notes.concat(notes);
  const chips = doubled.map(n => `
    <div class="w-ticker-chip">
      ${coverHtml(n.album, 36, 3)}
      <div class="w-ticker-chip-text">
        <span class="w-ticker-chip-quot">&ldquo;</span>${renderNotesHtml(n.text)}<span class="w-ticker-chip-quot">&rdquo;</span>
        <span class="w-ticker-chip-attr" style="margin-left:10px">${escHtml(n.album.album_name)}, ${escHtml(n.album.artist_name)}</span>
      </div>
    </div>`).join('');
  return `
    <div class="w-ticker-wrap" data-ticker>
      <div class="w-ticker-head">
        <span>More from your notes</span>
        <button class="w-notes-expand" data-action="expand-notes">See all ${notes.length} &darr;</button>
      </div>
      <div class="w-ticker-mask">
        <div class="w-ticker-track">${chips}</div>
      </div>
    </div>`;
}

function notesListHtml(notes) {
  const sorted = notes.slice().sort((a, b) => {
    const da = a.album.listened_at || a.album.planned_at || '';
    const db = b.album.listened_at || b.album.planned_at || '';
    return da.localeCompare(db)
      || compareTextAsc(a.album.created_at, b.album.created_at)
      || compareAlbumTitleAsc(a, b);
  });
  const rows = sorted.map(n => {
    const d = (n.album.listened_at || n.album.planned_at || '').slice(0, 10);
    return `
      <div class="w-notes-list-row">
        ${coverHtml(n.album, 44, 3)}
        <div class="w-notes-list-meta">
          <div class="w-notes-list-name">
            ${albumTitleLinkHtml(n.album)}
            <span class="w-notes-list-artist">${albumArtistLinkHtml(n.album)}</span>
            ${n.album.release_year ? `<span class="w-notes-list-year"> (${n.album.release_year})</span>` : ''}
          </div>
          <div class="w-notes-list-text">
            ${renderNotesHtml(n.text)}
            <span class="w-notes-list-tail"> (${n.text.length.toLocaleString()} characters${d ? ` on ${escHtml(d)}` : ''})</span>
          </div>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="w-notes-list" data-notes-list>
      <div class="w-notes-list-head">
        <span>All ${notes.length} notes from the year</span>
        <button class="w-notes-collapse" data-action="collapse-notes">Collapse &uarr;</button>
      </div>
      <div class="w-notes-list-body">${rows}</div>
    </div>`;
}

function shareCardHtml(year, data, shareName) {
  const trimmedShareName = typeof shareName === 'string' ? shareName.trim() : '';
  const ownerNameText = trimmedShareName ? `${escHtml(trimmedShareName)}'s` : '';
  const topByRating = data.topByRating.slice(0, 5).map((a, i) => `
    <div class="wsc-top-row">
      <span class="wsc-rank">${i + 1}</span>
      ${coverHtml(a, 28, 3)}
      <span class="wsc-name">${albumTitleLinkHtml(a)}</span>
      <span class="wsc-rating">${a.rating}</span>
    </div>`).join('');
  const topReleased = data.topReleasedThatYear.slice(0, 5).map((a, i) => `
    <div class="wsc-top-row">
      <span class="wsc-rank">${i + 1}</span>
      ${coverHtml(a, 28, 3)}
      <span class="wsc-name">${albumTitleLinkHtml(a)}</span>
      <span class="wsc-rating">${a.rating}</span>
    </div>`).join('');
  const keyStats = [
    `
      <div class="wsc-kstat">
        <div class="wsc-kstat-val">${data.total}</div>
        <div class="wsc-kstat-lab">albums</div>
      </div>`,
    `
      <div class="wsc-kstat">
        <div class="wsc-kstat-val">${Math.floor(data.hours)}</div>
        <div class="wsc-kstat-lab">hours</div>
      </div>`,
    `
      <div class="wsc-kstat">
        <div class="wsc-kstat-val">${data.totalWords.toLocaleString()}</div>
        <div class="wsc-kstat-lab">words written</div>
      </div>`,
    `
      <div class="wsc-kstat">
        <div class="wsc-kstat-val">${data.avgRating.toFixed(1)}</div>
        <div class="wsc-kstat-lab">avg rating</div>
      </div>`,
  ];
  const topArtist = data.topArtists[0] || null;
  const heroArtist = topArtist ? `
    <div class="wsc-hero-artist">
      <div class="wsc-hero-inner">
        ${artistAvatarHtml(topArtist, 80)}
        <div class="wsc-hero-artist-text">
          <div class="wsc-kstat-lab">top artist</div>
          <div class="wsc-hero-artist-name">${quietLinkHtml(topArtist.name, artistSpotifyHref(topArtist))}</div>
        </div>
      </div>
    </div>` : '';
  return `
    <div class="w-share-card">
      <div class="wsc-top">
        <div class="wsc-masthead">
          <div class="wsc-owner-name${ownerNameText ? '' : ' wsc-owner-name-empty'}">${ownerNameText}</div>
          <div class="wsc-owner-line"><span class="wsc-year-inline">${year}</span></div>
          <div class="wsc-brand-line">Trackspot Wrapped<span class="wsc-period">.</span></div>
        </div>
        ${heroArtist}
      </div>
      <div class="wsc-rule"></div>
      <div class="wsc-key-stats">
        ${keyStats.join('')}
      </div>
      <div class="wsc-lists">
        <div class="wsc-list">
          <div class="wsc-list-head">Top albums logged in ${year}</div>
          ${topByRating}
        </div>
        ${data.topReleasedThatYear.length > 0 ? `
          <div class="wsc-list">
            <div class="wsc-list-head">Top albums released in ${year}</div>
            ${topReleased}
          </div>` : ''}
      </div>
      <div class="wsc-foot">github.com/eao/trackspot</div>
  </div>`;
}

function lockedViewHtml({ year, yearsAvailable, albums }) {
  const yearBar = `<div class="w-year-bar">${yearCarouselHtml(year, yearsAvailable)}</div>`;
  const unlockDate = getWrappedUnlockDate(year);
  const countdown = getCountdownParts(unlockDate);

  return `
    <div class="wrapped wrapped-locked">
      ${yearBar}
      <section class="w-sec w-sec-hero w-sec-hero-locked">
        ${heroBackdropHtml(year, albums)}
        <div class="w-sec-content">
          <div class="w-eyebrow">Trackspot Wrapped ${year}</div>
          <div class="w-title-xl">This year's Wrapped is still under wraps.</div>
          <div class="w-sub">Turn on Early Wrapped in Settings &amp; More if you want to peek before the year ends.</div>
          <div class="w-unlock-countdown" aria-label="Countdown until Wrapped unlocks">
            ${countdownUnitHtml('days', countdown.days)}
            ${countdownUnitHtml('hours', countdown.hours)}
            ${countdownUnitHtml('minutes', countdown.minutes)}
            ${countdownUnitHtml('seconds', countdown.seconds)}
          </div>
          <div class="w-unlock-caption">until Wrapped unlocks</div>
          <div class="w-unlock-meta">Unlocks January 1, ${year + 1} at 00:00</div>
        </div>
      </section>
    </div>`;
}

function viewHtml({ year, yearsAvailable, data, albums, shareName, notesExpanded, animsOn, discordLoadedAt }) {
  const yearBar = `<div class="w-year-bar">${yearCarouselHtml(year, yearsAvailable)}</div>`;

  if (data.total === 0) {
    return `
      <div class="wrapped">
        ${yearBar}
        <div class="w-empty">
          <div class="w-eyebrow">No data</div>
          <div class="w-title-md">No completed albums in ${year}.</div>
        </div>
      </div>`;
  }

  const hero = `
    <section class="w-sec w-sec-hero">
      ${heroBackdropHtml(year, albums)}
      <div class="w-sec-content">
        <div class="w-eyebrow">Trackspot Wrapped ${year}</div>
        <div class="w-title-xl">You finished <span class="w-accent">${data.total}</span> albums this year.</div>
        <div class="w-sub">That's ${escHtml(fmtHoursDown(data.hours))} of listening, averaging ${data.avgRating.toFixed(1)} out of 100.</div>
        <div class="w-cover-wall">
          ${data.albums.slice(0, 20).map((a, i) => `
            <div class="w-wall-item" style="--i:${i}">${coverHtml(a, 100, 5, { fluid: true })}</div>
          `).join('')}
        </div>
      </div>
    </section>`;

  let bookends = '';
  if (data.firstListen || data.lastListen || data.oldestListened || data.newestListened) {
    const first = data.firstListen;
    const last = data.lastListen;
    const firstLastSec = (first || last) ? `
      <section class="w-sec w-sec-alt">
        <div class="w-sec-content">
          <div class="w-eyebrow">${eyebrowLinkHtml('The beginning', 'spotify:track:5xoMRan7YOKvYL6vueYugk')} and ${eyebrowLinkHtml('the end', 'spotify:track:6WMxH9twwIFfH3OVfs40lA')}</div>
          <div class="w-title-md">${year}'s bookends.</div>
          <div class="w-two-col">
            ${first ? bookendHtml(`First listen, ${fmtDate(first.listened_at)}`, first) : ''}
            ${last && last.id !== first?.id ? bookendHtml(`Most recent, ${fmtDate(last.listened_at)}`, last) : ''}
          </div>
        </div>
      </section>` : '';
    const oldest = data.oldestListened;
    const newest = data.newestListened;
    const travellerSec = (oldest || newest) ? `
      <section class="w-sec">
        <div class="w-sec-content">
          <div class="w-eyebrow">${eyebrowLinkHtml('Yesterday and today', 'spotify:track:37PSl0SD25vE0hFEJxpRir')}</div>
          <div class="w-title-md">The auld and the new.</div>
          <div class="w-two-col">
            ${oldest ? bookendHtml(getTimeTravelerReleaseLabel(oldest), oldest) : ''}
            ${newest && newest.id !== oldest?.id ? bookendHtml(getTimeTravelerReleaseLabel(newest), newest) : ''}
          </div>
        </div>
      </section>` : '';
    bookends = `<div class="w-group-alt">${firstLastSec}${travellerSec}</div>`;
  }

  const shapeRatingArtists = `
    <div class="w-group-alt">
      <section class="w-sec w-sec-alt">
        <div class="w-sec-content">
          <div class="w-eyebrow">${eyebrowLinkHtml('For the record', 'spotify:track:5rinOGUygOiBOW4m33IUiy')}</div>
          <div class="w-title-md">When you listened most.</div>
          ${monthBarsHtml(data.months)}
        </div>
      </section>
      ${data.total > 0 ? `
        <section class="w-sec">
          <div class="w-sec-content">
            <div class="w-eyebrow">${eyebrowLinkHtml('Hunting high and low', 'spotify:track:3HQVanEnLlPtywbJai0uiG')}</div>
            <div class="w-title-md">Your personal rollercoaster.</div>
            ${ratingDistBarsHtml(data.ratingBuckets, data.ratingStep || 10)}
          </div>
        </section>` : ''}
      ${data.topArtists.length > 0 ? `
        <section class="w-sec w-sec-alt">
          <div class="w-sec-content">
            <div class="w-eyebrow">${eyebrowLinkHtml('My idol', 'spotify:track:4zU8jbl3hDBzGuAci24t89')}</div>
            <div class="w-title-md">Who you pushed the most.</div>
            <div class="w-artists">
              ${data.topArtists.slice(0, 5).map((a, i) => `
                <div class="w-artist-row">
                  <div class="w-artist-rank">${String(i + 1).padStart(2, '0')}</div>
                  ${artistAvatarHtml(a, 46)}
                  <div class="w-artist-name">${quietLinkHtml(a.name, artistSpotifyHref(a))}</div>
                  <div class="w-artist-count">
                    <div>${a.count} <span>album${a.count === 1 ? '' : 's'}</span></div>
                    ${a.avgRating != null ? `<div class="w-artist-avg">${a.avgRating.toFixed(1)} avg.</div>` : ''}
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </section>` : ''}
    </div>`;

  const topAndReleases = `
    <div class="w-group-alt">
      <section class="w-sec">
        <div class="w-sec-content">
          <div class="w-eyebrow">${eyebrowLinkHtml('The peak', 'spotify:track:2hXPmiqKdXcbV0L1VKnTDN')}</div>
          <div class="w-title-md">Your auditory pantheon.</div>
          <div class="w-top10">
            ${data.topByRating.map((a, i) => `
              <div class="w-top10-row">
                <div class="w-top10-rank">${String(i + 1).padStart(2, '0')}</div>
                ${coverHtml(a, 56, 4)}
                <div class="w-top10-meta">
                  <div class="w-top10-name">${albumTitleLinkHtml(a)}</div>
                  <div class="w-top10-artist">${albumArtistLinkHtml(a)} <span class="w-top10-yr">(${a.release_year ?? ''})</span></div>
                </div>
                <div class="w-top10-rating">${a.rating}</div>
              </div>`).join('')}
          </div>
        </div>
      </section>
      <section class="w-sec w-sec-alt">
        <div class="w-sec-content">
          <div class="w-eyebrow">${eyebrowLinkHtml('Right now', 'spotify:track:58Q3FZFs1YXPpliWQB5kXB')}</div>
          <div class="w-title-md">${data.topReleasedThatYear.length > 0
            ? `Your top ${year} releases.`
            : `No ${year} releases logged yet.`}</div>
          ${data.topReleasedThatYear.length > 0 ? `
            <div class="w-fame-grid">
              ${data.topReleasedThatYear.slice(0, 8).map(a => `
                <div class="w-fame-card">
                  ${coverHtml(a, 160, 4, { fluid: true })}
                  <div class="w-fame-meta">
                    <div class="w-fame-rating">${a.rating}</div>
                    <div class="w-fame-name">${albumTitleLinkHtml(a)}</div>
                    <div class="w-fame-artist">${albumArtistLinkHtml(a)}</div>
                  </div>
                </div>`).join('')}
            </div>` : ''}
        </div>
      </section>
    </div>`;

  let notable = '';
  if (data.total > 0) {
    if (data.notes.length > 0) {
      const slots = notableSlots(data);
      const cards = slots.map(notableCardHtml).join('');
      const ticker = data.notes.length > 1
        ? (notesExpanded ? notesListHtml(data.notes) : tickerHtml(data.notes))
        : '';
      notable = `
        <div class="w-group-alt">
          <section class="w-sec">
            <div class="w-sec-content">
              <div class="w-eyebrow">${eyebrowLinkHtml('Shout', 'spotify:track:2gQaQUhDCNGfBVXTvxAmXQ')}</div>
              <div class="w-title-md">Let it all out.</div>
              <div class="w-notable-stack">${cards}</div>
              ${ticker}
            </div>
          </section>
        </div>`;
    } else {
      notable = `
        <div class="w-group-alt">
          <section class="w-sec">
            <div class="w-sec-content">
              <div class="w-eyebrow">${eyebrowLinkHtml('Shout', 'spotify:track:2gQaQUhDCNGfBVXTvxAmXQ')}</div>
              <div class="w-title-md">Let it all out.</div>
              <div class="w-notes-empty">(...It seems you didn't have much to say.)</div>
            </div>
          </section>
        </div>`;
    }
  }

  const share = `
    <div class="w-group-alt">
      <section class="w-sec w-sec-alt w-sec-share">
        <canvas class="w-snow-canvas" data-snow-canvas aria-hidden="true"></canvas>
        <div class="w-sec-content">
          <div class="w-share-block" data-share-export-root>
            <div class="w-eyebrow">${eyebrowLinkHtml("And here's to many more", 'spotify:track:4bmdIyjJLJlHPzYVW4vhJ2')}</div>
            <input class="w-name-input" data-share-name type="text" placeholder="Your name (optional)" value="${escHtml(shareName || '')}" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" aria-autocomplete="none">
            <div class="w-share-row">
              ${shareCardHtml(year, data, shareName)}
              <div class="w-spotty-wrap">
                <img class="w-spotty" src="/background-presets-secondary/Spotty.png" alt="Spotty">
              </div>
            </div>
            <div class="w-share-actions">
              <button class="w-export-btn-inline" data-action="export-share-card" type="button">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download-icon lucide-download" aria-hidden="true" focusable="false"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>
                <span data-share-action-label>Download share card</span>
              </button>
              <button class="w-export-btn-inline" data-action="copy-share-card" type="button">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-images-icon lucide-images" aria-hidden="true" focusable="false"><path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16"/><path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/><circle cx="13" cy="7" r="1" fill="currentColor"/><rect x="8" y="2" width="14" height="14" rx="2"/></svg>
                <span data-share-action-label>Copy share card to clipboard</span>
              </button>
              <button class="w-anim-toggle" data-action="toggle-anims" type="button">${animsOn ? 'Pause animations' : 'Resume animations'}</button>
            </div>
            <div class="w-export-status" data-share-export-status role="status" aria-live="polite"></div>
          </div>
          ${wrappedSpotifyPreviewHtml(year, data, discordLoadedAt)}
        </div>
      </section>
    </div>`;

  return `
    <div class="wrapped${animsOn ? '' : ' anims-off'}">
      ${yearBar}
      ${hero}
      ${bookends}
      ${shapeRatingArtists}
      ${topAndReleases}
      ${notable}
      ${share}
    </div>`;
}

function startSnow(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let flakes = [];
  let rafId = 0;
  let lastTime = 0;
  let running = false;
  const TARGET_MS = 1000 / 60;
  let flakeColor = 'rgba(255,255,255,1)';

  const readColor = () => {
    const v = getComputedStyle(canvas).getPropertyValue('--text-primary').trim();
    if (v) flakeColor = v;
  };
  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const resetFlake = (f, initial) => {
    f.x = Math.random() * (w + 200) - 20;
    f.y = initial ? Math.random() * h : -10 - Math.random() * 60;
    f.size = 2 + Math.random() * 4;
    f.speed = 40 + Math.random() * 50;
    f.drift = -20 - Math.random() * 40;
    f.opacity = 0.35 + Math.random() * 0.5;
  };
  const init = () => {
    resize();
    readColor();
    flakes = [];
    for (let i = 0; i < 60; i++) {
      const f = {};
      resetFlake(f, true);
      flakes.push(f);
    }
  };
  const step = t => {
    if (!running) return;
    if (document.hidden) return;
    const delta = t - lastTime;
    if (delta < TARGET_MS - 1) {
      rafId = requestAnimationFrame(step);
      return;
    }
    const dt = Math.min(delta / 1000, 0.1);
    lastTime = t;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = flakeColor;
    for (const f of flakes) {
      f.x += f.drift * dt;
      f.y += f.speed * dt;
      if (f.y > h + 10 || f.x < -20) resetFlake(f, false);
      ctx.globalAlpha = f.opacity;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(step);
  };

  init();
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  return {
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(step);
    },
    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      rafId = 0;
      ctx.clearRect(0, 0, w, h);
    },
    destroy() {
      this.stop();
      ro.disconnect();
    },
  };
}

export function renderWrappedView(container, { albums, year, yearsAvailable, onYearChange }) {
  let notesExpanded = false;
  let animsOn = true;
  let snowController = null;
  let countdownIntervalId = 0;
  let currentLockState = false;
  const discordLoadedAt = new Date();

  const syncSnow = () => {
    const canvas = container.querySelector('[data-snow-canvas]');
    if (!canvas) {
      if (snowController) {
        snowController.destroy();
        snowController = null;
      }
      return;
    }

    if (!snowController) {
      snowController = startSnow(canvas);
    }

    if (animsOn && !document.hidden) {
      snowController.start();
    } else {
      snowController.stop();
    }
  };

  const onVisibilityChange = () => {
    syncSnow();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const syncShareNameDom = () => {
    const shareName = state.wrappedName || '';
    const nameInput = container.querySelector('[data-share-name]');
    if (nameInput && document.activeElement !== nameInput && nameInput.value !== shareName) {
      nameInput.value = shareName;
    }

    const ownerLine = container.querySelector('.wsc-owner-line');
    if (!ownerLine) return;
    const masthead = ownerLine.closest('.wsc-masthead');
    const ownerName = masthead?.querySelector('.wsc-owner-name');
    if (!masthead) return;
    if (!ownerName) return;

    const trimmedShareName = shareName.trim();
    ownerName.textContent = trimmedShareName ? `${trimmedShareName}'s` : '';
    ownerName.classList.toggle('wsc-owner-name-empty', !trimmedShareName);
  };

  const onWrappedNameChange = () => {
    syncShareNameDom();
  };
  window.addEventListener(WRAPPED_NAME_EVENT, onWrappedNameChange);

  const stopCountdownLoop = () => {
    if (!countdownIntervalId) return;
    clearInterval(countdownIntervalId);
    countdownIntervalId = 0;
  };

  const syncCountdownDom = () => {
    const countdownRoot = container.querySelector('.w-unlock-countdown');
    if (!countdownRoot) return;

    const countdown = getCountdownParts(getWrappedUnlockDate(year));
    countdownRoot.querySelector('[data-countdown-unit="days"]')?.replaceChildren(String(countdown.days));
    countdownRoot.querySelector('[data-countdown-unit="hours"]')?.replaceChildren(pad(countdown.hours));
    countdownRoot.querySelector('[data-countdown-unit="minutes"]')?.replaceChildren(pad(countdown.minutes));
    countdownRoot.querySelector('[data-countdown-unit="seconds"]')?.replaceChildren(pad(countdown.seconds));
  };

  const syncTimedRefresh = () => {
    stopCountdownLoop();
    if (Number.parseInt(String(year ?? ''), 10) !== new Date().getFullYear() && !currentLockState) {
      return;
    }
    countdownIntervalId = setInterval(() => {
      const nextLockState = isWrappedLocked(year);
      if (nextLockState !== currentLockState) {
        rerender();
        return;
      }
      if (nextLockState) {
        syncCountdownDom();
        return;
      }
      if (Number.parseInt(String(year ?? ''), 10) !== new Date().getFullYear()) {
        stopCountdownLoop();
      }
    }, 1000);
  };

  const rerender = () => {
    if (snowController) {
      snowController.destroy();
      snowController = null;
    }
    currentLockState = isWrappedLocked(year);
    if (currentLockState) {
      container.innerHTML = lockedViewHtml({ year, yearsAvailable, albums });
    } else {
      const data = computeYear(albums, year);
      container.innerHTML = viewHtml({ year, yearsAvailable, data, albums, shareName: state.wrappedName, notesExpanded, animsOn, discordLoadedAt });
    }
    attach();
    syncTimedRefresh();
  };

  const attach = () => {
    container.querySelectorAll('.w-year-carousel .w-yc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const y = +btn.dataset.year;
        if (!Number.isFinite(y)) return;
        onYearChange(y);
      });
    });
    const nameInput = container.querySelector('[data-share-name]');
    if (nameInput) {
      const commitShareName = () => {
        void persistWrappedName(nameInput.value);
      };
      nameInput.addEventListener('input', e => {
        setWrappedName(e.target.value);
      });
      nameInput.addEventListener('change', commitShareName);
      nameInput.addEventListener('blur', commitShareName);
      nameInput.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commitShareName();
      });
    }
    const expandBtn = container.querySelector('[data-action="expand-notes"]');
    if (expandBtn) expandBtn.addEventListener('click', () => { notesExpanded = true; rerender(); });
    const collapseBtn = container.querySelector('[data-action="collapse-notes"]');
    if (collapseBtn) collapseBtn.addEventListener('click', () => { notesExpanded = false; rerender(); });

    const toggleBtn = container.querySelector('[data-action="toggle-anims"]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        animsOn = !animsOn;
        const wrapped = container.querySelector('.wrapped');
        if (wrapped) wrapped.classList.toggle('anims-off', !animsOn);
        toggleBtn.textContent = animsOn ? 'Pause animations' : 'Resume animations';
        syncSnow();
      });
    }

    const exportBtn = container.querySelector('[data-action="export-share-card"]');
    if (exportBtn) {
      exportBtn.addEventListener('click', event => {
        const button = event.currentTarget;
        const card = container.querySelector('.w-share-card');
        void exportWrappedShareCard({ card, year, button }).catch(() => {});
      });
    }

    const copyBtn = container.querySelector('[data-action="copy-share-card"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', event => {
        const button = event.currentTarget;
        const card = container.querySelector('.w-share-card');
        void copyWrappedShareCard({ card, button }).catch(() => {});
      });
    }

    container.querySelectorAll('[data-action="copy-discord-preview"]').forEach(btn => {
      btn.addEventListener('click', async event => {
        const button = event.currentTarget;
        const type = button.dataset.discordPreviewType === 'released' ? 'released' : 'top';
        const status = container.querySelector(`[data-discord-copy-status="${type}"]`);
        try {
          const data = computeYear(albums, year);
          const text = buildDiscordShareText({
            year,
            albums: getDiscordPreviewAlbums(data, type),
            type,
          });
          status?.classList.remove('w-discord-copy-status-error');
          if (status) status.textContent = '';
          if (typeof navigator.clipboard?.writeText !== 'function') {
            throw new Error('Clipboard text copy is not available in this browser.');
          }
          await navigator.clipboard.writeText(text);
          button.classList.add('w-discord-copy-btn-copied');
          setTimeout(() => {
            button.classList.remove('w-discord-copy-btn-copied');
          }, 2000);
        } catch (error) {
          if (status) {
            status.textContent = error?.message || 'Could not copy Discord text.';
            status.classList.add('w-discord-copy-status-error');
          }
        }
      });
    });

    syncSnow();
  };

  container._wrappedCleanup = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener(WRAPPED_NAME_EVENT, onWrappedNameChange);
    stopCountdownLoop();
    if (snowController) {
      snowController.destroy();
      snowController = null;
    }
  };

  rerender();
}
