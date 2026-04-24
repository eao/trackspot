import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styleCss = readFileSync(resolve(process.cwd(), 'public', 'style.css'), 'utf8');
const albumGridBlock = styleCss.match(/\.album-grid\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const normalizedAlbumGridBlock = albumGridBlock.replace(/\s+/g, ' ').trim();

describe('album grid css', () => {
  it('keeps grid mode at a minimum of two cards per row', () => {
    expect(styleCss).toContain('--album-grid-gap: 16px;');
    expect(styleCss).toContain('--album-grid-gap-phone: 10px;');
    expect(styleCss).toContain('--album-grid-card-min-width: 150px;');
    expect(styleCss).toContain('--app-content-padding-inline: 24px;');
    expect(styleCss).toContain('--app-content-padding-inline-phone: 12px;');
    expect(normalizedAlbumGridBlock).toContain('gap: var(--album-grid-gap);');
    expect(normalizedAlbumGridBlock).toContain(
      'grid-template-columns: repeat(auto-fill, minmax(min(var(--album-grid-card-min-width), calc((100% - var(--album-grid-gap)) / 2)), 1fr));',
    );
  });

  it('tightens grid gutters and gaps in phone-width grid mode', () => {
    expect(styleCss).toContain('padding: 20px var(--app-content-padding-inline);');
    expect(styleCss).toContain('body.page-collection.collection-view-grid.list-layout-final-stage {');
    expect(styleCss).toContain('--album-grid-gap: var(--album-grid-gap-phone);');
    expect(styleCss).toContain('--app-content-padding-inline: var(--app-content-padding-inline-phone);');
  });
});
