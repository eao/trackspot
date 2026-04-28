// =============================================================================
// Stats (analytical) dashboard view. Port of the design's analytical.jsx.
// =============================================================================

import { isoDate, parseDateValue } from './stats-compute.js';
import { getPreferredAlbumArtUrl, normalizeCssHexColor } from './utils.js';

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function fmtNum(n) {
  if (n == null || !isFinite(n)) return '?';
  if (Math.abs(n) >= 1000) return n.toLocaleString();
  return String(Math.round(n));
}
function fmtShortDate(iso) {
  if (!iso) return '';
  const d = parseDateValue(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtRelative(iso, today) {
  if (!iso) return '';
  const date = parseDateValue(iso);
  const todayDate = parseDateValue(today);
  if (!date || !todayDate) return '';
  const d = (todayDate - date) / 86400000;
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  if (d < 30) return `${Math.round(d)}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}
function fmtWholeHours(h) {
  if (h == null || !isFinite(h)) return '?';
  return Math.max(0, Math.floor(h)).toLocaleString();
}

function coverHtml(album, size = 64, rounded = 4) {
  const src = getPreferredAlbumArtUrl(album);
  const dark = normalizeCssHexColor(album.dominant_color_dark, '#334155');
  const light = normalizeCssHexColor(album.dominant_color_light, '#94a3b8');
  const id = Number(album.id) || 0;
  const seed = (id * 2654435761) >>> 0;
  const angle = seed % 360;
  const style = [
    `width:${size}px`,
    `height:${size}px`,
    `border-radius:${rounded}px`,
    `background:linear-gradient(${angle}deg, ${light}, ${dark})`,
  ].join(';');
  if (src) {
    return `<div class="ts-cover" style="${style}"><img src="${escHtml(src)}" alt="" loading="lazy"></div>`;
  }
  const initials = (album.album_name || '?')
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const initSize = Math.max(10, size * 0.28);
  return `<div class="ts-cover" style="${style}"><div class="ts-cover-initials" style="font-size:${initSize}px">${escHtml(initials)}</div></div>`;
}

const SPOTIFY_URI_RE = /^spotify:(track|album|artist|playlist):([A-Za-z0-9]+)$/i;
const SPOTIFY_WEB_URL_RE = /^https:\/\/open\.spotify\.com\/(track|album|artist|playlist)\/([A-Za-z0-9]+)(?:[/?#].*)?$/i;

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

function quietLinkHtml(text, href) {
  const label = escHtml(text);
  if (!href) return label;
  return `<a class="stats-quiet-link" href="${escHtml(href)}">${label}</a>`;
}

function topArtistSearchLinkHtml(name) {
  const label = escHtml(name);
  return `<a class="stats-quiet-link stats-top-artist-link" href="/collection/list" data-artist-name="${label}">${label}</a>`;
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

function fameMetaHtml(album) {
  return `
    <div class="fame-meta">
      <div class="fame-name">${quietLinkHtml(album.album_name, albumSpotifyHref(album))}</div>
      <div class="fame-artist">${quietLinkHtml(album.artist_name, albumArtistSpotifyHref(album))}</div>
    </div>`;
}

function rtPath(x, y, w, h, r) {
  if (w <= 0 || h <= 0) return null;
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

const MNAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function cardHtml({ title, subtitle, body, span }) {
  const cls = `a-card${span ? ` a-card-span-${span}` : ''}`;
  return `
    <div class="${cls}">
      <div class="a-card-head">
        <div class="a-card-title">${escHtml(title)}</div>
        ${subtitle ? `<div class="a-card-sub">${escHtml(subtitle)}</div>` : ''}
      </div>
      <div class="a-card-body">${body}</div>
    </div>`;
}

function heroHtml(stats) {
  const items = [
    { num: fmtNum(stats.total), label: 'albums tracked' },
    { num: fmtNum(stats.counts.completed), label: 'completed', accent: true },
    { num: fmtNum(stats.counts.planned), label: 'in backlog' },
    { num: fmtWholeHours(stats.totalHours), label: 'hours listened' },
  ];
  const cells = items.map(s => `
    <div class="a-hero-stat">
      <div class="a-hero-num${s.accent ? ' a-hero-accent' : ''}">${escHtml(s.num)}</div>
      <div class="a-hero-label">${escHtml(s.label)}</div>
    </div>`).join('');
  return `<div class="a-card a-card-span-6 a-hero"><div class="a-hero-stats">${cells}</div></div>`;
}

function statusRingHtml(stats) {
  const { planned, completed, dropped } = stats.counts;
  const total = planned + completed + dropped || 1;
  const r = 62;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = [
    { label: 'Planned', val: planned, color: 'var(--accent)' },
    { label: 'Completed', val: completed, color: 'var(--success)' },
    { label: 'Dropped', val: dropped, color: 'var(--danger)' },
  ];
  const svgSegs = segs.map(s => {
    const len = (s.val / total) * c;
    const el = `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${s.color}" stroke-width="20" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)" />`;
    offset += len;
    return el;
  }).join('');
  const legend = segs.map(s => `
    <div class="ring-leg-row">
      <span class="ring-leg-sw" style="background:${s.color}"></span>
      <span class="ring-leg-lab">${escHtml(s.label)}</span>
      <span class="ring-leg-val">${fmtNum(s.val)}</span>
    </div>`).join('');
  const body = `
    <div class="ring-wrap">
      <svg viewBox="0 0 160 160" width="160" height="160">
        <circle cx="80" cy="80" r="${r}" fill="none" stroke="var(--bg-elevated)" stroke-width="20" />
        ${svgSegs}
        <text x="80" y="78" text-anchor="middle" fill="var(--text-primary)" font-size="28" font-weight="700">${Math.round((completed / total) * 100)}%</text>
        <text x="80" y="96" text-anchor="middle" fill="var(--text-muted)" font-size="11" letter-spacing="0.08em">DONE</text>
      </svg>
      <div class="ring-legend">${legend}</div>
    </div>`;
  return cardHtml({ title: 'Status', subtitle: 'How the library is split', body });
}

function paceHtml(stats) {
  const body = `
    <div class="pace-split">
      <div class="pace-num-block">
        <div class="big-stat-num">${(stats.rate30 * 7).toFixed(1)}</div>
        <div class="big-stat-unit">last 30 days</div>
      </div>
      <div class="pace-num-block pace-num-muted">
        <div class="big-stat-num">${(stats.rate90 * 7).toFixed(1)}</div>
        <div class="big-stat-unit">last 90 days</div>
      </div>
    </div>`;
  return cardHtml({ title: 'Listening pace', subtitle: 'Completions per week', body });
}

function streakHtml(stats) {
  const body = `
    <div class="streak-row">
      <div class="streak-item">
        <div class="streak-num">${stats.currentStreak}</div>
        <div class="streak-lab">current streak</div>
      </div>
      <div class="streak-item">
        <div class="streak-num">${stats.longestStreak}</div>
        <div class="streak-lab">longest streak</div>
      </div>
      <div class="streak-item">
        <div class="streak-num">${stats.activeDays30}<span class="streak-denom">/30</span></div>
        <div class="streak-lab">active, last 30 days</div>
      </div>
    </div>`;
  return cardHtml({ title: 'Consistency', subtitle: 'Days you finished something', body });
}

function topArtistsHtml(stats) {
  const list = stats.topArtists.slice(0, 8);
  const max = list[0]?.total || 1;
  const rows = list.map(a => `
    <div class="topart-row">
      <div class="topart-rank">${fmtNum(a.total)}</div>
      <div class="topart-mid">
        <div class="topart-name">${topArtistSearchLinkHtml(a.name)}</div>
        <div class="topart-bar">
          <div class="topart-bar-done" style="width:${((a.completed || 0) / max) * 100}%"></div>
          <div class="topart-bar-plan" style="width:${((a.planned || 0) / max) * 100}%"></div>
          <div class="topart-bar-drop" style="width:${((a.dropped || 0) / max) * 100}%"></div>
        </div>
      </div>
      <div class="topart-rating">${a.avgRating != null ? Math.round(a.avgRating) : ''}</div>
    </div>`).join('');
  return cardHtml({
    title: 'Top artists',
    subtitle: 'By albums tracked',
    span: 3,
    body: `<div class="topart">${rows}</div>`,
  });
}

function decadesHtml(stats) {
  const data = stats.decades.filter(d => d.decade >= 1960);
  if (!data.length) return '';
  const max = Math.max(1, ...data.map(d => d.total));
  const rows = data.map(d => `
    <div class="dec-row">
      <div class="dec-label">${d.decade}s</div>
      <div class="dec-bar-wrap">
        <div class="dec-bar dec-bar-c" style="width:${((d.completed || 0) / max) * 100}%"></div>
        <div class="dec-bar dec-bar-p" style="width:${((d.planned || 0) / max) * 100}%"></div>
        <div class="dec-bar dec-bar-d" style="width:${((d.dropped || 0) / max) * 100}%"></div>
      </div>
      <div class="dec-val">${d.total}</div>
    </div>`).join('');
  return cardHtml({
    title: 'Eras',
    subtitle: 'Library by release decade',
    span: 3,
    body: `<div class="decades">${rows}</div>`,
  });
}

function timelineHtml(stats) {
  const data = stats.monthly;
  if (!data.length) return '';
  const max = Math.max(1, ...data.map(d => d.count));
  const W = 720, H = 200, PT = 24, PB = 34, PL = 24, PR = 24;
  const barAreaH = H - PT - PB;
  const barTotalW = W - PL - PR;
  const barW = barTotalW / data.length;
  const ZERO_H = 3;

  const gridLines = [0.25, 0.5, 0.75, 1].map(f =>
    `<line x1="${PL}" x2="${W - PR}" y1="${PT + barAreaH * (1 - f)}" y2="${PT + barAreaH * (1 - f)}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="2 3" />`
  ).join('');

  const bars = data.map((d, i) => {
    const bH = d.count > 0 ? (barAreaH * d.count) / max : ZERO_H;
    const bY = PT + barAreaH - bH;
    const bX = PL + i * barW;
    const bW = Math.max(2, barW - 2);
    const bXc = bX + 1;
    const [yr, mo] = d.month.split('-');
    const moIdx = +mo - 1;
    const isJan = moIdx === 0;
    const labelX = PL + i * barW + barW / 2;
    const barEl = d.count > 0
      ? `<path d="${rtPath(bXc, bY, bW, bH, 2)}" fill="var(--accent)" />`
      : `<rect x="${bXc}" y="${PT + barAreaH - ZERO_H}" width="${bW}" height="${ZERO_H}" fill="var(--bg-elevated)" />`;
    const countTxt = d.count > 0
      ? `<text x="${labelX}" y="${bY - 3}" font-size="9" fill="var(--text-secondary)" text-anchor="middle">${d.count}</text>`
      : '';
    const yearTxt = isJan
      ? `<text x="${labelX}" y="${H - 3}" font-size="9" fill="var(--accent)" text-anchor="middle" font-weight="600">${yr}</text>`
      : '';
    return `<g>
      ${barEl}
      ${countTxt}
      <line x1="${labelX}" y1="${H - PB + 2}" x2="${labelX}" y2="${H - PB + 5}" stroke="var(--border)" stroke-width="1" />
      <text x="${labelX}" y="${H - PB + 14}" font-size="9" fill="var(--text-secondary)" text-anchor="middle">${MNAMES[moIdx]}</text>
      ${yearTxt}
    </g>`;
  }).join('');

  const body = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${gridLines}${bars}</svg>`;
  return cardHtml({
    title: 'Completed per month',
    subtitle: `${data.length} months tracked`,
    span: 6,
    body,
  });
}

function heatmapHtml(stats) {
  const today = stats.today;
  const cells = [];
  const max = Math.max(1, ...Object.values(stats.dailyMap));
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const iso = isoDate(d);
    const count = stats.dailyMap[iso] || 0;
    cells.push({ iso, count, intensity: count / max });
  }
  const cellHtml = cells.map(c => {
    const bg = c.count === 0
      ? 'var(--bg-elevated)'
      : `color-mix(in oklab, var(--accent) ${Math.round(20 + c.intensity * 76)}%, var(--bg-elevated))`;
    const tip = c.count > 0 ? `data-tip="${c.count} on ${c.iso}"` : '';
    return `<div class="heat-cell" ${tip} style="background:${bg}"></div>`;
  }).join('');
  const legendCells = [20, 40, 60, 80, 96].map(a =>
    `<span class="heat-cell" style="background:color-mix(in oklab, var(--accent) ${a}%, var(--bg-elevated))"></span>`
  ).join('');
  const body = `
    <div class="heatmap">${cellHtml}</div>
    <div class="heat-legend">
      <span>0</span>
      <span class="heat-cell" style="background:var(--bg-elevated)"></span>
      <span style="color:var(--text-muted); font-size:10px; margin:0 4px">vs</span>
      ${legendCells}
      <span>more</span>
    </div>`;
  return cardHtml({
    title: 'Year in listening',
    subtitle: 'Each square is a day (last 365)',
    span: 6,
    body,
  });
}

function ratingDistHtml(stats) {
  const buckets = stats.ratingBuckets || [];
  if (!buckets.length) return '';
  const labels = stats.ratingBucketLabels || buckets.map((_, i) => i * 10);
  const max = Math.max(1, ...buckets);
  const n = buckets.length;
  const cols = buckets.map((b, i) => {
    const pct = b > 0 ? (b / max) * 100 : 0;
    const val = b > 0 ? `<div class="rdist-val" style="bottom:calc(${pct}% + 3px)">${b}</div>` : '';
    const bar = `<div class="rdist-bar" style="height:${b > 0 ? pct + '%' : '3px'};background:${b > 0 ? 'var(--accent)' : 'var(--bg-elevated)'}"></div>`;
    return `<div class="rdist-col"><div class="rdist-bar-track">${val}${bar}</div><div class="rdist-lab">${labels[i]}</div></div>`;
  }).join('');
  const body = `<div class="rdist" style="grid-template-columns:repeat(${n}, 1fr)">${cols}</div>`;
  return cardHtml({
    title: 'Rating distribution',
    subtitle: `Average ${(stats.avgRating || 0).toFixed(1)} / 100 (visualized with ${n} thresholds)`,
    span: 6,
    body,
  });
}

function topRatedHtml(stats) {
  const list = stats.topRated.slice(0, 5);
  if (!list.length) return cardHtml({ title: 'Your dearest', subtitle: 'Everything that makes you whole', body: '<div class="empty-state-inner">No rated albums yet.</div>' });
  const rows = list.map(a => `
    <div class="fame-row">
      ${coverHtml(a, 40, 3)}
      ${fameMetaHtml(a)}
      <div class="fame-rating">${a.rating}</div>
    </div>`).join('');
  return cardHtml({
    title: 'Your dearest',
    subtitle: 'Everything that makes you whole',
    body: `<div class="fame-list">${rows}</div>`,
  });
}

function oldestBacklogHtml(stats) {
  const list = stats.oldestBacklog.slice(0, 5);
  if (!list.length) {
    return cardHtml({
      title: 'Crouched at the starting line',
      subtitle: 'Longest in your backlog',
      body: '<div class="empty-state-inner">Your backlog is empty.</div>',
    });
  }
  const rows = list.map(a => `
    <div class="fame-row">
      ${coverHtml(a, 36, 3)}
      ${fameMetaHtml(a)}
      <div class="fame-waiting">${escHtml(fmtRelative(a.planned_at || a.created_at, stats.today))}</div>
    </div>`).join('');
  return cardHtml({
    title: 'Crouched at the starting line',
    subtitle: 'Longest in your backlog',
    body: `<div class="fame-list">${rows}</div>`,
  });
}

function finallyGotAroundHtml(stats) {
  const list = stats.gaps.slice(0, 5);
  if (!list.length) {
    return cardHtml({
      title: 'Home at last',
      subtitle: 'Longest planned to completed gap',
      body: `<div class="empty-state-inner">${
        stats.hasPlannedAt
          ? 'No completed albums have a planned_at timestamp.'
          : 'Needs planned_at timestamps on completed items to calculate.'
      }</div>`,
    });
  }
  const rows = list.map(g => `
    <div class="fame-row">
      ${coverHtml(g.album, 40, 3)}
      ${fameMetaHtml(g.album)}
      <div class="fame-waiting">${g.days}d</div>
    </div>`).join('');
  return cardHtml({
    title: 'Home at last',
    subtitle: 'Longest planned to completed gap',
    body: `<div class="fame-list">${rows}</div>`,
  });
}

function recentFinishedHtml(stats) {
  const list = stats.recentFinished.slice(0, 16);
  if (!list.length) return '';
  const items = list.map(a => `
    <div class="recent-item" title="${escHtml(a.album_name)} by ${escHtml(a.artist_name)}">
      ${coverHtml(a, 84, 4)}
      ${a.rating != null ? `<div class="recent-rating">${a.rating}</div>` : ''}
      <div class="recent-date">${escHtml(fmtShortDate(a.listened_at))}</div>
    </div>`).join('');
  return cardHtml({
    title: 'Recently finished',
    span: 6,
    body: `<div class="recent-strip">${items}</div>`,
  });
}

export function renderStatsView(container, stats) {
  container.innerHTML = `
    <div class="analytical">
      <div class="a-grid">
        ${heroHtml(stats)}
        ${statusRingHtml(stats)}
        ${paceHtml(stats)}
        ${streakHtml(stats)}
        ${topArtistsHtml(stats)}
        ${decadesHtml(stats)}
        ${timelineHtml(stats)}
        ${heatmapHtml(stats)}
        ${ratingDistHtml(stats)}
        ${oldestBacklogHtml(stats)}
        ${finallyGotAroundHtml(stats)}
        ${topRatedHtml(stats)}
        ${recentFinishedHtml(stats)}
      </div>
    </div>`;

  const cleanupFns = [];

  const onTopArtistClick = event => {
    const link = event.target instanceof Element
      ? event.target.closest('.stats-top-artist-link')
      : null;
    if (!(link instanceof Element) || !container.contains(link)) return;

    event.preventDefault();
    const artistName = link.getAttribute('data-artist-name')?.trim();
    if (!artistName) return;

    window.dispatchEvent(new CustomEvent('stats:open-top-artist', {
      detail: { artistName },
    }));
  };

  container.addEventListener('click', onTopArtistClick);
  cleanupFns.push(() => container.removeEventListener('click', onTopArtistClick));

  // Heatmap tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'heat-tooltip';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);
  const heatmap = container.querySelector('.heatmap');
  if (heatmap) {
    const onMove = e => {
      const target = e.target;
      if (!(target instanceof Element) || !target.classList.contains('heat-cell') || !target.dataset.tip) {
        tooltip.style.display = 'none';
        return;
      }
      const rect = target.getBoundingClientRect();
      tooltip.textContent = target.dataset.tip;
      tooltip.style.left = `${rect.left + rect.width / 2}px`;
      tooltip.style.top = `${rect.top - 6}px`;
      tooltip.style.display = 'block';
    };
    const onLeave = () => { tooltip.style.display = 'none'; };
    heatmap.addEventListener('mouseover', onMove);
    heatmap.addEventListener('mouseleave', onLeave);
    cleanupFns.push(() => {
      heatmap.removeEventListener('mouseover', onMove);
      heatmap.removeEventListener('mouseleave', onLeave);
      tooltip.remove();
    });
  } else {
    cleanupFns.push(() => tooltip.remove());
  }

  container._statsCleanup = () => {
    while (cleanupFns.length) {
      const cleanup = cleanupFns.pop();
      cleanup?.();
    }
  };
}

export function cleanupStatsView(container) {
  if (container && container._statsCleanup) {
    container._statsCleanup();
    container._statsCleanup = null;
  }
}
