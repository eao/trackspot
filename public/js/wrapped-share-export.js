const HTML_TO_IMAGE_SCRIPT_SRC = '/vendor/html-to-image/html-to-image.js';
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const EXPORT_SCALE = 2;
const REPAINT_IMAGE_SELECTOR = '.wsc-top-row .ts-cover > img, .wsc-hero-artist .w-artist-avatar > img';
const REPAINT_RULE_SELECTOR = '.wsc-rule';

let htmlToImageLoadPromise = null;

function getHtmlToImage() {
  const htmlToImage = window.htmlToImage;
  if (htmlToImage && typeof htmlToImage.toCanvas === 'function') return htmlToImage;
  return null;
}

function loadHtmlToImage() {
  const loaded = getHtmlToImage();
  if (loaded) return Promise.resolve(loaded);

  if (htmlToImageLoadPromise) return htmlToImageLoadPromise;

  htmlToImageLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${HTML_TO_IMAGE_SCRIPT_SRC}"]`);
    const script = existingScript || document.createElement('script');

    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const onLoad = () => {
      cleanup();
      const htmlToImage = getHtmlToImage();
      if (htmlToImage) {
        resolve(htmlToImage);
      } else {
        reject(new Error('Share card export library loaded, but was unavailable.'));
      }
    };
    const onError = () => {
      cleanup();
      htmlToImageLoadPromise = null;
      reject(new Error('Share card export library could not be loaded.'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existingScript) {
      script.src = HTML_TO_IMAGE_SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return htmlToImageLoadPromise;
}

function waitForImage(image) {
  if (image.complete) return Promise.resolve();
  return new Promise(resolve => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', resolve, { once: true });
  });
}

async function waitForExportAssets(card) {
  if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    await document.fonts.ready;
  }
  await Promise.all(Array.from(card.querySelectorAll('img')).map(waitForImage));
}

function getExportStatusElement(button) {
  const root = button?.closest?.('[data-share-export-root], .w-share-block') || button?.parentElement;
  return root?.querySelector('[data-share-export-status]') || null;
}

function setStatus(button, message, isError = false) {
  const status = getExportStatusElement(button);
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('w-export-status-error', isError);
}

function getButtonLabel(button) {
  return button?.querySelector?.('[data-share-action-label]')?.textContent ?? button?.textContent ?? '';
}

function setButtonLabel(button, label) {
  const labelElement = button?.querySelector?.('[data-share-action-label]');
  if (labelElement) {
    labelElement.textContent = label;
    return;
  }
  if (button) button.textContent = label;
}

function downloadBlob(blob, fileName) {
  if (!blob) throw new Error('Share card export produced an empty image.');
  if (typeof URL.createObjectURL !== 'function') {
    throw new Error('This browser cannot prepare the share card download.');
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getClipboardImageWriter() {
  const ClipboardItemCtor = window.ClipboardItem;
  const write = navigator.clipboard?.write;
  if (typeof ClipboardItemCtor !== 'function' || typeof write !== 'function') {
    throw new Error('This browser cannot copy images to the clipboard.');
  }
  return { ClipboardItemCtor, write: write.bind(navigator.clipboard) };
}

async function copyBlobToClipboard(blob) {
  if (!blob) throw new Error('Share card export produced an empty image.');
  const { ClipboardItemCtor, write } = getClipboardImageWriter();
  await write([new ClipboardItemCtor({ 'image/png': blob })]);
}

function getExportSize(card) {
  const rect = getRect(card);
  const width = Math.max(1, card?.offsetWidth || Math.round(rect?.width || 0));
  const measuredHeight = card?.clientHeight
    ? card.clientHeight
      + parseCssPx(getStyleValue(card, 'border-top-width', '0'))
      + parseCssPx(getStyleValue(card, 'border-bottom-width', '0'))
    : rect?.height || card?.offsetHeight || 0;
  const height = Math.max(1, Math.floor(measuredHeight));
  return { width, height };
}

function getRenderOptions(card) {
  const { width, height } = getExportSize(card);
  return {
    pixelRatio: EXPORT_SCALE,
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    cacheBust: true,
    imagePlaceholder: TRANSPARENT_PIXEL,
    style: {
      margin: '0',
      borderColor: 'transparent',
      borderTopColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: 'transparent',
    },
  };
}

async function withTemporarilyHiddenExportNodes(card, callback) {
  const hiddenNodes = Array.from(card.querySelectorAll(REPAINT_RULE_SELECTOR));
  const previousVisibility = hiddenNodes.map(node => ({
    node,
    value: node.style.getPropertyValue('visibility'),
    priority: node.style.getPropertyPriority('visibility'),
  }));

  hiddenNodes.forEach(node => {
    node.style.setProperty('visibility', 'hidden');
  });

  try {
    return await callback();
  } finally {
    previousVisibility.forEach(({ node, value, priority }) => {
      if (value) {
        node.style.setProperty('visibility', value, priority);
      } else {
        node.style.removeProperty('visibility');
      }
    });
  }
}

function canvasToPngBlob(canvas) {
  if (!canvas) throw new Error('Share card export produced an empty image.');
  if (typeof canvas.toBlob !== 'function') {
    throw new Error('This browser cannot prepare the share card image.');
  }

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(resolve, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

async function renderWrappedShareCardBlob(card) {
  await waitForExportAssets(card);
  const htmlToImage = await loadHtmlToImage();
  const imagePaints = collectImagePaints(card);
  const framePaint = collectFramePaint(card);
  const rulePaints = collectRulePaints(card);
  const canvas = await withTemporarilyHiddenExportNodes(
    card,
    () => htmlToImage.toCanvas(card, getRenderOptions(card)),
  );
  await repaintExportImages(canvas, imagePaints);
  repaintExportRules(canvas, rulePaints);
  repaintExportFrame(canvas, framePaint);
  return canvasToPngBlob(canvas);
}

function getRect(element) {
  const rect = element?.getBoundingClientRect?.();
  const width = rect?.width || 0;
  const height = rect?.height || 0;
  if (!(width > 0) || !(height > 0)) return null;
  return {
    left: rect.left,
    top: rect.top,
    width,
    height,
  };
}

function getStyleValue(element, property, fallback = '') {
  const style = window.getComputedStyle?.(element);
  const propertyName = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return style?.getPropertyValue?.(property) || style?.[propertyName] || fallback;
}

function isDrawableImageUrl(src) {
  if (!src) return false;
  if (/^(data|blob):/i.test(src)) return true;

  try {
    const url = new URL(src, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', reject, { once: true });
    image.src = src;
  });
}

async function fetchDrawableImage(src) {
  if (typeof fetch !== 'function') return null;

  try {
    const response = await fetch(src, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(blob);
      } catch {
        // Fall back to an HTMLImageElement decode below.
      }
    }
    const dataUrl = await blobToDataUrl(blob);
    return await loadImage(dataUrl);
  } catch {
    return null;
  }
}

async function getDrawableImage(image) {
  const src = image.currentSrc || image.src;
  if (!src) return null;
  if (/^(data|blob):/i.test(src)) return image;
  return await fetchDrawableImage(src) || (isDrawableImageUrl(src) ? image : null);
}

function parsePositionPart(value, startKeyword, endKeyword) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'center') return 0.5;
  if (normalized === startKeyword) return 0;
  if (normalized === endKeyword) return 1;
  if (normalized.endsWith('%')) {
    const percent = Number.parseFloat(normalized);
    return Number.isFinite(percent) ? Math.min(1, Math.max(0, percent / 100)) : 0.5;
  }
  return 0.5;
}

function parseObjectPosition(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  const x = parsePositionPart(parts[0], 'left', 'right');
  const y = parsePositionPart(parts[1] || parts[0], 'top', 'bottom');
  return { x, y };
}

function getImageSourceRect(image, targetRect, objectFit, objectPosition) {
  const sourceWidth = image.naturalWidth || image.videoWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.videoHeight || image.height || 0;
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;

  if (objectFit !== 'cover') {
    return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
  }

  const scale = Math.max(targetRect.width / sourceWidth, targetRect.height / sourceHeight);
  const sw = targetRect.width / scale;
  const sh = targetRect.height / scale;
  const position = parseObjectPosition(objectPosition);
  const sx = (sourceWidth - sw) * position.x;
  const sy = (sourceHeight - sh) * position.y;
  return { sx, sy, sw, sh };
}

function parseRadius(value, width, height) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === '0px') return 0;
  if (normalized.endsWith('%')) {
    const percent = Number.parseFloat(normalized);
    return Number.isFinite(percent) ? Math.min(width, height) * percent / 100 : 0;
  }
  const px = Number.parseFloat(normalized);
  return Number.isFinite(px) ? px : 0;
}

function parseCssPx(value) {
  const px = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(px) ? px : 0;
}

function isTransparentColor(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'transparent' || normalized === 'rgba(0, 0, 0, 0)') return true;
  const rgba = normalized.match(/^rgba?\((.+)\)$/);
  if (!rgba) return false;
  const alphaSlash = rgba[1].match(/\/\s*([.\d]+%?)\s*$/);
  if (alphaSlash) {
    const alpha = Number.parseFloat(alphaSlash[1]);
    return Number.isFinite(alpha) && alpha <= 0;
  }
  const parts = rgba[1].split(',').map(part => part.trim());
  if (parts.length < 4) return false;
  const alpha = Number.parseFloat(parts[3]);
  return Number.isFinite(alpha) && alpha <= 0;
}

function extractVisibleCssColor(value) {
  const matches = String(value || '').match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b|transparent/gi) || [];
  return matches.find(color => !isTransparentColor(color)) || '';
}

function colorDistance(a, b) {
  if (!a || !b) return 0;
  const alphaA = a.length > 3 ? a[3] : 255;
  const alphaB = b.length > 3 ? b[3] : 255;
  return Math.abs(a[0] - b[0])
    + Math.abs(a[1] - b[1])
    + Math.abs(a[2] - b[2])
    + Math.abs(alphaA - alphaB);
}

function transparentVariantOfColor(color) {
  const normalized = String(color || '').trim();
  const rgbMatch = normalized.match(/^rgba?\((.+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .replace(/\s*\/\s*[\d.]+%?\s*$/, '')
      .split(',')
      .map(part => part.trim());

    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, 0)`;
    }

    const spaceParts = rgbMatch[1]
      .replace(/\s*\/\s*[\d.]+%?\s*$/, '')
      .trim()
      .split(/\s+/);
    if (spaceParts.length >= 3) {
      return `rgba(${spaceParts[0]}, ${spaceParts[1]}, ${spaceParts[2]}, 0)`;
    }
  }

  const hexMatch = normalized.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const value = hexMatch[1];
    const expand = part => part.length === 1 ? `${part}${part}` : part;
    const channels = value.length <= 4
      ? [value[0], value[1], value[2]].map(expand)
      : [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)];
    const [r, g, b] = channels.map(channel => Number.parseInt(channel, 16));
    if ([r, g, b].every(Number.isFinite)) {
      return `rgba(${r}, ${g}, ${b}, 0)`;
    }
  }

  return 'rgba(0, 0, 0, 0)';
}

function addRoundedRectPath(context, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();

  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, r);
    return;
  }

  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function prepareImageSmoothing(context) {
  context.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in context) context.imageSmoothingQuality = 'high';
}

function drawImageWithHighQualityResampling(context, image, source, dx, dy, dw, dh) {
  prepareImageSmoothing(context);

  const sourceWidth = Math.max(1, Math.round(source.sw));
  const sourceHeight = Math.max(1, Math.round(source.sh));
  const targetWidth = Math.max(1, Math.round(dw));
  const targetHeight = Math.max(1, Math.round(dh));

  if (sourceWidth <= targetWidth * 2 && sourceHeight <= targetHeight * 2) {
    context.drawImage(image, source.sx, source.sy, source.sw, source.sh, dx, dy, dw, dh);
    return;
  }

  let currentCanvas = createCanvas(sourceWidth, sourceHeight);
  let currentContext = currentCanvas.getContext?.('2d');
  if (!currentContext) {
    context.drawImage(image, source.sx, source.sy, source.sw, source.sh, dx, dy, dw, dh);
    return;
  }

  prepareImageSmoothing(currentContext);
  currentContext.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, sourceWidth, sourceHeight);

  while (currentCanvas.width > targetWidth * 2 || currentCanvas.height > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.round(currentCanvas.width / 2));
    const nextHeight = Math.max(targetHeight, Math.round(currentCanvas.height / 2));
    const nextCanvas = createCanvas(nextWidth, nextHeight);
    const nextContext = nextCanvas.getContext?.('2d');
    if (!nextContext) break;

    prepareImageSmoothing(nextContext);
    nextContext.drawImage(currentCanvas, 0, 0, currentCanvas.width, currentCanvas.height, 0, 0, nextWidth, nextHeight);
    currentCanvas = nextCanvas;
  }

  context.drawImage(currentCanvas, 0, 0, currentCanvas.width, currentCanvas.height, dx, dy, dw, dh);
}

function collectImagePaints(card) {
  const cardRect = getRect(card);
  if (!cardRect) return [];
  const exportSize = getExportSize(card);

  return Array.from(card.querySelectorAll(REPAINT_IMAGE_SELECTOR))
    .map(image => {
      const target = image.parentElement || image;
      const targetRect = getRect(target);
      if (!targetRect) return null;

      return {
        image,
        targetRect,
        cardRect,
        exportSize,
        objectFit: getStyleValue(image, 'object-fit', 'fill') || 'fill',
        objectPosition: getStyleValue(image, 'object-position', '50% 50%') || '50% 50%',
        borderRadius: getStyleValue(target, 'border-top-left-radius', '0') || '0',
      };
    })
    .filter(Boolean);
}

function collectFramePaint(card) {
  const cardRect = getRect(card);
  if (!cardRect) return null;

  const borderWidth = parseCssPx(getStyleValue(card, 'border-top-width', '0'));
  const borderColor = getStyleValue(card, 'border-top-color', 'transparent') || 'transparent';
  if (!(borderWidth > 0) || borderColor === 'transparent' || borderColor === 'rgba(0, 0, 0, 0)') {
    return null;
  }

  return {
    cardRect,
    exportSize: getExportSize(card),
    borderWidth,
    borderColor,
    borderRadius: getStyleValue(card, 'border-top-left-radius', '0') || '0',
  };
}

function collectRulePaints(card) {
  const cardRect = getRect(card);
  if (!cardRect) return [];

  const exportSize = getExportSize(card);
  const fallbackColor = getStyleValue(card, 'border-top-color', '') || '';
  return Array.from(card.querySelectorAll(REPAINT_RULE_SELECTOR))
    .map(rule => {
      const ruleRect = getRect(rule);
      if (!ruleRect || !(ruleRect.width > 0) || !(ruleRect.height > 0)) return null;

      const color = extractVisibleCssColor(getStyleValue(rule, 'background-image', ''))
        || extractVisibleCssColor(getStyleValue(rule, 'background-color', ''))
        || fallbackColor;
      if (isTransparentColor(color)) return null;

      return {
        cardRect,
        exportSize,
        ruleRect,
        color,
      };
    })
    .filter(Boolean);
}

async function repaintExportImages(canvas, paints) {
  if (!canvas || !paints.length) return canvas;

  const context = canvas.getContext?.('2d');
  if (!context) return canvas;

  for (const paint of paints) {
    const image = await getDrawableImage(paint.image);
    if (!image) continue;

    const source = getImageSourceRect(image, paint.targetRect, paint.objectFit, paint.objectPosition);
    if (!source) continue;

    const scaleX = canvas.width / (paint.exportSize?.width || paint.cardRect.width);
    const scaleY = canvas.height / (paint.exportSize?.height || paint.cardRect.height);
    const dx = (paint.targetRect.left - paint.cardRect.left) * scaleX;
    const dy = (paint.targetRect.top - paint.cardRect.top) * scaleY;
    const dw = paint.targetRect.width * scaleX;
    const dh = paint.targetRect.height * scaleY;
    const radius = parseRadius(paint.borderRadius, paint.targetRect.width, paint.targetRect.height)
      * Math.min(scaleX, scaleY);

    context.save();
    try {
      addRoundedRectPath(context, dx, dy, dw, dh, radius);
      context.clip();
      drawImageWithHighQualityResampling(context, image, source, dx, dy, dw, dh);
    } catch {
      // If an individual image cannot be drawn, keep the html-to-image version.
    } finally {
      context.restore();
      if (image !== paint.image && typeof image.close === 'function') image.close();
    }
  }

  return canvas;
}

function repaintExportFrame(canvas, paint) {
  if (!canvas || !paint) return canvas;

  const context = canvas.getContext?.('2d');
  if (!context) return canvas;

  const scaleWidth = paint.exportSize?.width || paint.cardRect.width;
  const scaleHeight = paint.exportSize?.height || paint.cardRect.height;
  const scale = Math.min(canvas.width / scaleWidth, canvas.height / scaleHeight);
  const scaledLineWidth = paint.borderWidth * scale;
  const lineWidth = paint.borderWidth <= 1
    ? 1
    : Math.max(1, scaledLineWidth);
  const inset = lineWidth / 2;
  const radius = Math.max(0, parseRadius(paint.borderRadius, paint.cardRect.width, paint.cardRect.height) * scale - inset);

  context.save();
  try {
    context.strokeStyle = paint.borderColor;
    context.lineWidth = lineWidth;
    addRoundedRectPath(
      context,
      inset,
      inset,
      Math.max(0, canvas.width - lineWidth),
      Math.max(0, canvas.height - lineWidth),
      radius,
    );
    context.stroke();
  } catch {
    // Keep the html-to-image frame if the canvas renderer cannot repaint it.
  } finally {
    context.restore();
  }

  return canvas;
}

function canvasPixel(context, x, y) {
  try {
    const data = context.getImageData(Math.round(x), Math.round(y), 1, 1)?.data;
    return data ? [data[0], data[1], data[2], data[3]] : null;
  } catch {
    return null;
  }
}

function isRuleAlreadyPainted(context, x, y, width, height) {
  if (typeof context.getImageData !== 'function') return false;

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const verticalOffset = Math.max(3, height * 3);
  const center = canvasPixel(context, centerX, centerY);
  const above = canvasPixel(context, centerX, Math.max(0, centerY - verticalOffset));
  const below = canvasPixel(context, centerX, centerY + verticalOffset);
  if (!center || !above || !below) return false;

  const backgroundDistance = Math.max(colorDistance(center, above), colorDistance(center, below));
  return backgroundDistance >= 6;
}

function repaintExportRules(canvas, paints) {
  if (!canvas || !paints.length) return canvas;

  const context = canvas.getContext?.('2d');
  if (!context) return canvas;

  for (const paint of paints) {
    const scale = Math.min(
      canvas.width / (paint.exportSize?.width || paint.cardRect.width),
      canvas.height / (paint.exportSize?.height || paint.cardRect.height),
    );
    const x = (paint.ruleRect.left - paint.cardRect.left) * scale;
    const y = (paint.ruleRect.top - paint.cardRect.top) * scale;
    const width = paint.ruleRect.width * scale;
    const height = Math.max(1, paint.ruleRect.height * scale);
    if (isRuleAlreadyPainted(context, x, y, width, height)) continue;

    context.save();
    try {
      const transparentColor = transparentVariantOfColor(paint.color);
      const gradient = context.createLinearGradient(x, 0, x + width, 0);
      gradient.addColorStop(0, transparentColor);
      gradient.addColorStop(0.2, paint.color);
      gradient.addColorStop(0.8, paint.color);
      gradient.addColorStop(1, transparentColor);
      context.fillStyle = gradient;
      context.fillRect(x, y, width, height);
    } catch {
      // Keep the html-to-image rule if the canvas renderer cannot repaint it.
    } finally {
      context.restore();
    }
  }

  return canvas;
}

export async function exportWrappedShareCard({ card, year, button } = {}) {
  if (!card) throw new Error('Share card could not be found.');

  const previousText = getButtonLabel(button);
  if (button) {
    button.disabled = true;
    setButtonLabel(button, 'Downloading...');
  }
  setStatus(button, '');

  try {
    const blob = await renderWrappedShareCardBlob(card);
    downloadBlob(blob, `trackspot-wrapped-${year}.png`);
  } catch (error) {
    setStatus(button, error?.message || 'Share card export failed.', true);
    throw error;
  } finally {
    if (button) {
      button.disabled = false;
      setButtonLabel(button, previousText || 'Download share card');
    }
  }
}

export async function copyWrappedShareCard({ card, button } = {}) {
  if (!card) throw new Error('Share card could not be found.');

  const previousText = getButtonLabel(button);
  if (button) {
    button.disabled = true;
    setButtonLabel(button, 'Copying...');
  }
  setStatus(button, '');

  try {
    getClipboardImageWriter();
    const blob = await renderWrappedShareCardBlob(card);
    await copyBlobToClipboard(blob);
    setStatus(button, 'Copied share card to clipboard.');
  } catch (error) {
    setStatus(button, error?.message || 'Share card copy failed.', true);
    throw error;
  } finally {
    if (button) {
      button.disabled = false;
      setButtonLabel(button, previousText || 'Copy share card to clipboard');
    }
  }
}

export const __private = {
  waitForExportAssets,
  loadHtmlToImage,
  getRenderOptions,
  getExportSize,
  collectImagePaints,
  collectFramePaint,
  collectRulePaints,
  repaintExportImages,
  repaintExportFrame,
  repaintExportRules,
  getImageSourceRect,
  canvasToPngBlob,
  copyBlobToClipboard,
  renderWrappedShareCardBlob,
  getButtonLabel,
  setButtonLabel,
  withTemporarilyHiddenExportNodes,
  transparentVariantOfColor,
};
