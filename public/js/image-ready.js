export const IMAGE_READY_TIMEOUT_MS = 2500;

export function waitForImageReady(src, options = {}) {
  const {
    timeoutMs = IMAGE_READY_TIMEOUT_MS,
    imageFactory = () => new Image(),
  } = options;

  if (!src) return Promise.resolve(false);

  return new Promise(resolve => {
    const img = imageFactory();
    let settled = false;

    const finish = ready => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(ready);
    };

    const handleLoad = () => {
      if (typeof img.decode === 'function') {
        Promise.resolve(img.decode()).catch(() => {}).finally(() => finish(true));
        return;
      }
      finish(true);
    };

    const handleError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);

    img.onload = handleLoad;
    img.onerror = handleError;
    img.src = src;

    if (img.complete) {
      if (img.naturalWidth > 0) handleLoad();
      else handleError();
    }
  });
}

export async function waitForImageSetReady(urls, options = {}) {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  await Promise.all(uniqueUrls.map(url => waitForImageReady(url, options)));
  return uniqueUrls;
}
