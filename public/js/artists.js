// =============================================================================
// Artist name chips with click-for-popover.
// =============================================================================

import { state, el } from './state.js';
import { escHtml } from './utils.js';
import { loadAlbums, resetPagination } from './render.js';

// ---------------------------------------------------------------------------
// Artist name chips
// ---------------------------------------------------------------------------
// Returns a <span> containing individual artist name chips separated by commas.
// Each chip opens a popover on click.

export function renderArtistSpans(artists, manualLink = null) {
  const wrap = document.createElement('span');
  wrap.className = 'artist-chips';

  const list = Array.isArray(artists) ? artists : [];

  list.forEach((a, i) => {
    const name   = typeof a === 'string' ? a : a.name;
    const id     = typeof a === 'object' ? a.id : null;
    const link   = typeof a === 'object' ? (a.manual_link || manualLink || null) : manualLink;
    const chipEl = document.createElement('span');
    chipEl.className = 'artist-chip';
    chipEl.textContent = name;
    chipEl.dataset.artistName = name;
    if (id) chipEl.dataset.artistId = id;
    if (link) chipEl.dataset.artistLink = link;

    chipEl.addEventListener('click', e => {
      e.stopPropagation();
      if (_popoverAnchor === chipEl) {
        closeArtistPopover();
      } else {
        openArtistPopover(chipEl, name, id, link);
      }
    });

    wrap.appendChild(chipEl);

    if (i < list.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'artist-separator';
      sep.textContent = ', ';
      wrap.appendChild(sep);
    }
  });

  return wrap;
}

// ---------------------------------------------------------------------------
// Artist popover
// ---------------------------------------------------------------------------

let _popoverEl = null;
let _popoverOutsideHandler = null;
let _popoverAnchor = null;
let _popoverViewportHandler = null;

function positionArtistPopover(pop, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  const gap = 4;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;

  let top = rect.bottom + gap;
  let left = rect.left;

  if (viewportWidth > 0) {
    const maxLeft = viewportWidth - popRect.width - 8;
    left = Math.min(Math.max(left, 8), Math.max(maxLeft, 8));
  }

  if (viewportHeight > 0 && (top + popRect.height) > (viewportHeight - 8)) {
    top = rect.top - popRect.height - gap;
  }
  if (viewportHeight > 0) {
    const maxTop = viewportHeight - popRect.height - 8;
    top = Math.min(Math.max(top, 8), Math.max(maxTop, 8));
  }

  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

function openArtistPopover(anchorEl, artistName, artistId, artistLink) {
  closeArtistPopover();

  const pop = document.createElement('div');
  pop.className = 'artist-popover';
  pop.innerHTML = `
    <span class="artist-popover-name">${escHtml(artistName)}</span>
    <div class="artist-popover-actions">
      <button class="artist-popover-btn" data-action="filter" title="Filter by this artist">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        Filter
      </button>
      ${artistLink ? `
      <button class="artist-popover-btn" data-action="link" title="Open artist link">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        </svg>
        Link
      </button>` : artistId ? `
      <button class="artist-popover-btn" data-action="spotify" title="Open in Spotify">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
        Spotify
      </button>` : ''}
    </div>
  `;

  pop.style.visibility = 'hidden';
  document.body.appendChild(pop);
  _popoverEl = pop;
  _popoverAnchor = anchorEl;

  positionArtistPopover(pop, anchorEl);
  pop.style.visibility = '';

  // Button actions.
  pop.querySelectorAll('.artist-popover-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'filter') {
        // Set artist filter to exact match and update sidebar input.
        state.filters.artist = artistName;
        state.filters.artistMatchExact = true;
        el.filterArtist.value = artistName;
        el.filterArtistExact.checked = true;
        resetPagination();
        loadAlbums();
      } else if (action === 'link') {
        window.open(artistLink, '_blank', 'noopener,noreferrer');
      } else if (action === 'spotify') {
        window.location.href = `spotify:artist:${artistId}`;
      }
      closeArtistPopover();
    });
  });

  // Close on outside click (deferred so this click doesn't immediately close it).
  _popoverOutsideHandler = e => {
    if (!pop.contains(e.target)) closeArtistPopover();
  };
  setTimeout(() => document.addEventListener('click', _popoverOutsideHandler), 0);

  _popoverViewportHandler = () => closeArtistPopover();
  window.addEventListener('resize', _popoverViewportHandler);
  window.addEventListener('scroll', _popoverViewportHandler, true);
}

export function closeArtistPopover() {
  const hadPopover = !!_popoverEl;
  if (_popoverEl) {
    _popoverEl.remove();
    _popoverEl = null;
    _popoverAnchor = null;
  }
  if (_popoverOutsideHandler) {
    document.removeEventListener('click', _popoverOutsideHandler);
    _popoverOutsideHandler = null;
  }
  if (_popoverViewportHandler) {
    window.removeEventListener('resize', _popoverViewportHandler);
    window.removeEventListener('scroll', _popoverViewportHandler, true);
    _popoverViewportHandler = null;
  }
  return hadPopover;
}
