import { artUrl } from './utils.js';

const ALBUM_ART_PRELOAD_MAX_ENTRIES = 300;
const albumArtPreloadCache = new Map();

function rememberAlbumArtPreload(url, value) {
  if (!url) return;
  if (albumArtPreloadCache.has(url)) {
    albumArtPreloadCache.delete(url);
  }
  albumArtPreloadCache.set(url, value);
  while (albumArtPreloadCache.size > ALBUM_ART_PRELOAD_MAX_ENTRIES) {
    albumArtPreloadCache.delete(albumArtPreloadCache.keys().next().value);
  }
}

export function clearAlbumArtPreloadCache() {
  albumArtPreloadCache.clear();
}

export function selectAlbumArtPreloadUrls(albums, options = {}) {
  const {
    limit = Number.POSITIVE_INFINITY,
    getArtUrl = album => artUrl(album.image_path),
  } = options;

  const urls = [];
  const seen = new Set();
  const max = Number.isFinite(limit) ? Math.max(0, limit) : Number.POSITIVE_INFINITY;

  for (const album of Array.isArray(albums) ? albums : []) {
    if (urls.length >= max) break;
    const url = getArtUrl(album);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

export function preloadAlbumArtUrls(urls, options = {}) {
  const {
    imageFactory = () => new Image(),
  } = options;
  const selectedUrls = [...new Set((Array.isArray(urls) ? urls : []).filter(Boolean))];

  if (typeof imageFactory !== 'function') return selectedUrls;

  selectedUrls.forEach(url => {
    if (albumArtPreloadCache.has(url)) return;

    try {
      const img = imageFactory();
      if (!img) return;

      rememberAlbumArtPreload(url, img);
      img.decoding = 'async';
      img.loading = 'eager';
      if ('fetchPriority' in img) {
        img.fetchPriority = 'low';
      }

      const settle = ready => {
        if (albumArtPreloadCache.get(url) === img) {
          rememberAlbumArtPreload(url, ready);
        }
      };

      img.onload = () => settle(true);
      img.onerror = () => settle(false);
      img.src = url;

      if (typeof img.decode === 'function') {
        Promise.resolve(img.decode()).then(
          () => settle(true),
          () => settle(false),
        );
      }
    } catch {
      rememberAlbumArtPreload(url, false);
    }
  });

  return selectedUrls;
}

export function preloadAlbumArt(albums, options = {}) {
  const urls = selectAlbumArtPreloadUrls(albums, options);
  return preloadAlbumArtUrls(urls, options);
}
