import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  stateMock,
  elMock,
  loadAlbumsMock,
  resetPaginationMock,
} = vi.hoisted(() => ({
  stateMock: {
    filters: {
      artist: '',
      artistMatchExact: false,
    },
  },
  elMock: {
    filterArtist: null,
    filterArtistExact: null,
  },
  loadAlbumsMock: vi.fn(),
  resetPaginationMock: vi.fn(),
}));

vi.mock('../public/js/state.js', () => ({
  state: stateMock,
  el: elMock,
}));

vi.mock('../public/js/utils.js', () => ({
  escHtml: value => String(value),
  getSafeExternalHref: value => {
    if (!value) return null;
    const raw = String(value).trim();
    return raw.startsWith('javascript:') ? null : raw;
  },
}));

vi.mock('../public/js/render.js', () => ({
  loadAlbums: loadAlbumsMock,
  resetPagination: resetPaginationMock,
}));

import { closeArtistPopover, renderArtistSpans } from '../public/js/artists.js';

describe('artist popover', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="filter-artist" />
      <input id="filter-artist-exact" type="checkbox" />
    `;

    stateMock.filters.artist = '';
    stateMock.filters.artistMatchExact = false;
    elMock.filterArtist = document.getElementById('filter-artist');
    elMock.filterArtistExact = document.getElementById('filter-artist-exact');

    loadAlbumsMock.mockReset();
    resetPaginationMock.mockReset();
    closeArtistPopover();
  });

  it('applies the exact artist filter immediately from the popover button', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      value: 800,
    });

    const wrap = renderArtistSpans([{ name: 'Hideki Taniuchi', id: 'artist-123' }]);
    document.body.appendChild(wrap);

    const chip = wrap.querySelector('.artist-chip');
    chip.getBoundingClientRect = () => ({
      top: 100,
      right: 260,
      bottom: 124,
      left: 200,
      width: 60,
      height: 24,
    });

    chip.click();
    document.querySelector('.artist-popover-btn[data-action="filter"]').click();

    expect(stateMock.filters.artist).toBe('Hideki Taniuchi');
    expect(stateMock.filters.artistMatchExact).toBe(true);
    expect(elMock.filterArtist.value).toBe('Hideki Taniuchi');
    expect(elMock.filterArtistExact.checked).toBe(true);
    expect(resetPaginationMock).toHaveBeenCalledTimes(1);
    expect(loadAlbumsMock).toHaveBeenCalledTimes(1);
  });

  it('does not render an artist link action for unsafe manual links', () => {
    const wrap = renderArtistSpans([{ name: 'Unsafe Artist', manual_link: 'javascript:alert(1)' }]);
    document.body.appendChild(wrap);

    const chip = wrap.querySelector('.artist-chip');
    chip.getBoundingClientRect = () => ({
      top: 100,
      right: 260,
      bottom: 124,
      left: 200,
      width: 60,
      height: 24,
    });

    chip.click();

    expect(document.querySelector('.artist-popover-btn[data-action="link"]')).toBeNull();
    expect(chip.dataset.artistLink).toBeUndefined();
  });
});
