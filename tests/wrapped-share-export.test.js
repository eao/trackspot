import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyWrappedShareCard, exportWrappedShareCard, __private } from '../public/js/wrapped-share-export.js';

describe('wrapped share card export', () => {
  let originalHtmlToImage;
  let originalCreateObjectUrl;
  let originalRevokeObjectUrl;
  let originalClipboardDescriptor;
  let originalClipboardItem;
  let clickSpy;
  let clickedDownload;
  let renderedCanvas;

  function createExportCanvas(blob = new Blob(['png'], { type: 'image/png' })) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1000;
    canvas.toBlob = vi.fn(callback => callback(blob));
    return canvas;
  }

  beforeEach(() => {
    originalHtmlToImage = window.htmlToImage;
    originalCreateObjectUrl = URL.createObjectURL;
    originalRevokeObjectUrl = URL.revokeObjectURL;
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    originalClipboardItem = window.ClipboardItem;
    clickedDownload = '';

    renderedCanvas = createExportCanvas();
    window.htmlToImage = {
      toCanvas: vi.fn(async () => renderedCanvas),
    };
    URL.createObjectURL = vi.fn(() => 'blob:wrapped-card');
    URL.revokeObjectURL = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function mockClick() {
      clickedDownload = this.download;
    });
  });

  afterEach(() => {
    window.htmlToImage = originalHtmlToImage;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    } else {
      delete navigator.clipboard;
    }
    window.ClipboardItem = originalClipboardItem;
    clickSpy.mockRestore();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function renderExportFixture() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="w-share-card">Trackspot Wrapped</div>
      <button type="button">Download share card</button>
      <div data-share-export-status></div>
    `;
    document.body.appendChild(wrapper);
    const card = wrapper.querySelector('.w-share-card');
    card.getBoundingClientRect = () => ({
      width: 600,
      height: 500,
      top: 0,
      right: 600,
      bottom: 500,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    Object.defineProperty(card, 'offsetWidth', { value: 600, configurable: true });
    Object.defineProperty(card, 'offsetHeight', { value: 500, configurable: true });
    return {
      card,
      button: wrapper.querySelector('button'),
      status: wrapper.querySelector('[data-share-export-status]'),
    };
  }

  it('downloads the share card as a year-specific PNG', async () => {
    const { card, button } = renderExportFixture();
    const divider = document.createElement('div');
    divider.className = 'wsc-rule';
    card.appendChild(divider);

    await exportWrappedShareCard({ card, year: 2024, button });

    const renderOptions = window.htmlToImage.toCanvas.mock.calls[0][1];
    expect(window.htmlToImage.toCanvas).toHaveBeenCalledWith(card, expect.objectContaining({
      pixelRatio: 2,
      width: 600,
      height: 500,
      canvasWidth: 600,
      canvasHeight: 500,
      cacheBust: true,
      imagePlaceholder: expect.stringContaining('data:image/png;base64,'),
      style: expect.objectContaining({
        margin: '0',
        borderColor: 'transparent',
        borderTopColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: 'transparent',
      }),
    }));
    expect(renderOptions.filter).toBeUndefined();
    expect(divider.style.visibility).toBe('');
    expect(renderedCanvas.toBlob).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickedDownload).toBe('trackspot-wrapped-2024.png');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Download share card');
  });

  it('copies the share card PNG to the clipboard', async () => {
    const { card, status } = renderExportFixture();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Copy share card to clipboard';
    card.parentElement.insertBefore(button, status);
    const write = vi.fn(async () => {});
    class MockClipboardItem {
      constructor(items) {
        this.items = items;
      }
    }
    window.ClipboardItem = MockClipboardItem;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });

    await copyWrappedShareCard({ card, button });

    expect(window.htmlToImage.toCanvas).toHaveBeenCalledOnce();
    expect(renderedCanvas.toBlob).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith([expect.any(MockClipboardItem)]);
    const clipboardItem = write.mock.calls[0][0][0];
    expect(clipboardItem.items['image/png']).toBeInstanceOf(Blob);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Copy share card to clipboard');
    expect(status.textContent).toBe('Copied share card to clipboard.');
    expect(status.classList.contains('w-export-status-error')).toBe(false);
  });

  it('reports when image clipboard copying is unsupported', async () => {
    const { card, status } = renderExportFixture();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Copy share card to clipboard';
    card.parentElement.insertBefore(button, status);
    window.ClipboardItem = undefined;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: null,
    });

    await expect(copyWrappedShareCard({ card, button })).rejects.toThrow(
      'This browser cannot copy images to the clipboard.',
    );

    expect(window.htmlToImage.toCanvas).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Copy share card to clipboard');
    expect(status.textContent).toBe('This browser cannot copy images to the clipboard.');
    expect(status.classList.contains('w-export-status-error')).toBe(true);
  });

  it('uses integer border-box dimensions for stable Chrome export sizing', () => {
    const { card } = renderExportFixture();
    card.style.border = '1px solid rgb(45, 55, 72)';
    card.getBoundingClientRect = () => ({
      width: 600,
      height: 496,
      top: 0,
      right: 600,
      bottom: 496,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    Object.defineProperty(card, 'offsetWidth', { value: 600, configurable: true });
    Object.defineProperty(card, 'offsetHeight', { value: 496, configurable: true });
    Object.defineProperty(card, 'clientHeight', { value: 493.5, configurable: true });

    expect(__private.getRenderOptions(card)).toEqual(expect.objectContaining({
      width: 600,
      height: 495,
      canvasWidth: 600,
      canvasHeight: 495,
      pixelRatio: 2,
    }));
  });

  it('repaints the card border over the export to avoid browser edge clipping', () => {
    const { card } = renderExportFixture();
    card.style.border = '1px solid rgb(45, 55, 72)';
    card.style.borderTopLeftRadius = '14px';
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1000;
    canvas.getContext = vi.fn(() => context);

    const paint = __private.collectFramePaint(card);
    __private.repaintExportFrame(canvas, paint);

    expect(paint).toEqual(expect.objectContaining({
      borderWidth: 1,
      borderColor: 'rgb(45, 55, 72)',
      borderRadius: '14px',
    }));
    expect(context.strokeStyle).toBe('rgb(45, 55, 72)');
    expect(context.lineWidth).toBe(1);
    expect(context.stroke).toHaveBeenCalledOnce();
  });

  it('keeps a one-css-pixel card border visually light across browser canvas engines', () => {
    const { card } = renderExportFixture();
    card.style.border = '1px solid rgb(45, 55, 72)';
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1000;
    canvas.getContext = vi.fn(() => context);

    __private.repaintExportFrame(canvas, __private.collectFramePaint(card));

    expect(context.lineWidth).toBe(1);
  });

  it('repaints the share-card separator rule when browser capture drops it', () => {
    const { card } = renderExportFixture();
    card.style.border = '1px solid rgb(45, 55, 72)';
    const rule = document.createElement('div');
    rule.className = 'wsc-rule';
    rule.getBoundingClientRect = () => ({
      width: 600,
      height: 1,
      top: 142,
      right: 600,
      bottom: 143,
      left: 0,
      x: 0,
      y: 142,
      toJSON: () => {},
    });
    card.appendChild(rule);
    const gradient = { addColorStop: vi.fn() };
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      fillRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: [24, 31, 49, 255] })),
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1000;
    canvas.getContext = vi.fn(() => context);

    const paints = __private.collectRulePaints(card);
    __private.repaintExportRules(canvas, paints);

    expect(paints).toHaveLength(1);
    expect(paints[0]).toEqual(expect.objectContaining({
      color: 'rgb(45, 55, 72)',
    }));
    expect(context.createLinearGradient).toHaveBeenCalledWith(0, 0, 1200, 0);
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(45, 55, 72, 0)');
    expect(gradient.addColorStop).toHaveBeenCalledWith(0.2, 'rgb(45, 55, 72)');
    expect(gradient.addColorStop).toHaveBeenCalledWith(0.8, 'rgb(45, 55, 72)');
    expect(gradient.addColorStop).toHaveBeenCalledWith(1, 'rgba(45, 55, 72, 0)');
    expect(context.fillRect).toHaveBeenCalledWith(0, 284, 1200, 2);
  });

  it('fades repainted rules with transparent variants of their visible color', () => {
    expect(__private.transparentVariantOfColor('rgb(45, 55, 72)')).toBe('rgba(45, 55, 72, 0)');
    expect(__private.transparentVariantOfColor('rgba(45, 55, 72, 0.5)')).toBe('rgba(45, 55, 72, 0)');
    expect(__private.transparentVariantOfColor('rgb(45 55 72 / 50%)')).toBe('rgba(45, 55, 72, 0)');
    expect(__private.transparentVariantOfColor('#2d3748')).toBe('rgba(45, 55, 72, 0)');
  });

  it('does not repaint the separator rule when browser capture already drew it', () => {
    const { card } = renderExportFixture();
    card.style.border = '1px solid rgb(45, 55, 72)';
    const rule = document.createElement('div');
    rule.className = 'wsc-rule';
    rule.getBoundingClientRect = () => ({
      width: 600,
      height: 1,
      top: 142,
      right: 600,
      bottom: 143,
      left: 0,
      x: 0,
      y: 142,
      toJSON: () => {},
    });
    card.appendChild(rule);

    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      createLinearGradient: vi.fn(),
      fillRect: vi.fn(),
      getImageData: vi.fn((x, y) => ({
        data: y === 285 ? [45, 55, 72, 255] : [24, 31, 49, 255],
      })),
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1000;
    canvas.getContext = vi.fn(() => context);

    __private.repaintExportRules(canvas, __private.collectRulePaints(card));

    expect(context.createLinearGradient).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it('waits for pending images before rendering the card', async () => {
    const { card, button } = renderExportFixture();
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { value: false, configurable: true });
    card.appendChild(image);

    const exportPromise = exportWrappedShareCard({ card, year: 2024, button });
    await Promise.resolve();

    expect(window.htmlToImage.toCanvas).not.toHaveBeenCalled();

    image.dispatchEvent(new Event('load'));
    await exportPromise;

    expect(window.htmlToImage.toCanvas).toHaveBeenCalledOnce();
  });

  it('hides repaint-only separators during capture without removing them from layout', async () => {
    const { card } = renderExportFixture();
    const rule = document.createElement('div');
    rule.className = 'wsc-rule';
    rule.style.visibility = 'visible';
    card.appendChild(rule);
    let ruleVisibilityDuringCapture = '';
    window.htmlToImage.toCanvas = vi.fn(async () => {
      ruleVisibilityDuringCapture = rule.style.visibility;
      return renderedCanvas;
    });

    await exportWrappedShareCard({ card, year: 2024 });

    expect(ruleVisibilityDuringCapture).toBe('hidden');
    expect(rule.style.visibility).toBe('visible');
  });

  it('restores the button and reports an error when rendering returns no blob', async () => {
    const { card, button, status } = renderExportFixture();
    renderedCanvas.toBlob = vi.fn(callback => callback(null));

    await expect(exportWrappedShareCard({ card, year: 2024, button })).rejects.toThrow(
      'Share card export produced an empty image.',
    );

    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Download share card');
    expect(status.textContent).toBe('Share card export produced an empty image.');
    expect(status.classList.contains('w-export-status-error')).toBe(true);
  });

  it('repaints share-card images onto the export canvas with high-quality smoothing', async () => {
    const card = document.createElement('div');
    card.className = 'w-share-card';
    card.getBoundingClientRect = () => ({
      left: 10,
      top: 20,
      width: 100,
      height: 100,
      right: 110,
      bottom: 120,
      x: 10,
      y: 20,
      toJSON: () => {},
    });
    card.innerHTML = `
      <div class="wsc-top-row">
        <div class="ts-cover" style="border-radius:3px">
          <img class="cover-image" alt="" src="data:image/png;base64,test" style="object-fit:cover;object-position:50% 50%">
        </div>
      </div>
      <div class="wsc-hero-artist">
        <div class="w-artist-avatar" style="border-radius:50%">
          <img class="avatar-image" alt="" src="data:image/png;base64,test-avatar" style="object-fit:cover">
        </div>
      </div>
    `;
    const target = card.querySelector('.ts-cover');
    target.getBoundingClientRect = () => ({
      left: 20,
      top: 30,
      width: 28,
      height: 28,
      right: 48,
      bottom: 58,
      x: 20,
      y: 30,
      toJSON: () => {},
    });
    const avatarTarget = card.querySelector('.w-artist-avatar');
    avatarTarget.getBoundingClientRect = () => ({
      left: 60,
      top: 30,
      width: 40,
      height: 40,
      right: 100,
      bottom: 70,
      x: 60,
      y: 30,
      toJSON: () => {},
    });
    const image = card.querySelector('.cover-image');
    const avatarImage = card.querySelector('.avatar-image');
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 100, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 50, configurable: true });
    Object.defineProperty(avatarImage, 'complete', { value: true, configurable: true });
    Object.defineProperty(avatarImage, 'naturalWidth', { value: 120, configurable: true });
    Object.defineProperty(avatarImage, 'naturalHeight', { value: 120, configurable: true });

    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    canvas.getContext = vi.fn(() => context);

    const paints = __private.collectImagePaints(card);
    expect(paints).toHaveLength(2);
    await __private.repaintExportImages(canvas, paints);

    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
    expect(context.clip).toHaveBeenCalledTimes(2);
    const [drawnImage, sx, sy, sw, sh, dx, dy, dw, dh] = context.drawImage.mock.calls[0];
    expect(drawnImage).toBe(image);
    expect(sx).toBeCloseTo(25);
    expect(sy).toBeCloseTo(0);
    expect(sw).toBeCloseTo(50);
    expect(sh).toBeCloseTo(50);
    expect([dx, dy, dw, dh]).toEqual([20, 20, 56, 56]);

    const [
      drawnAvatarImage,
      avatarSx,
      avatarSy,
      avatarSw,
      avatarSh,
      avatarDx,
      avatarDy,
      avatarDw,
      avatarDh,
    ] = context.drawImage.mock.calls[1];
    expect(drawnAvatarImage).toBe(avatarImage);
    expect([avatarSx, avatarSy, avatarSw, avatarSh]).toEqual([0, 0, 120, 120]);
    expect([avatarDx, avatarDy, avatarDw, avatarDh]).toEqual([100, 20, 80, 80]);
  });
});
