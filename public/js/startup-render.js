import { artUrl } from './utils.js';
import { waitForImageSetReady } from './image-ready.js';

export const STARTUP_ART_BATCH_LIMIT = 12;

export function selectStartupArtUrls(albums, options = {}) {
  const {
    limit = STARTUP_ART_BATCH_LIMIT,
    getArtUrl = album => artUrl(album.image_path),
  } = options;

  return [...new Set(
    albums
      .slice(0, limit)
      .map(getArtUrl)
      .filter(Boolean)
  )];
}

export async function preloadStartupAlbumArt(albums, options = {}) {
  const {
    waitForUrls = waitForImageSetReady,
    ...rest
  } = options;

  const urls = selectStartupArtUrls(albums, rest);
  await waitForUrls(urls);
  return urls;
}
