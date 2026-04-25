import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');

function getAttributeValue(selector, attribute) {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  return doc.querySelector(selector)?.getAttribute(attribute) ?? null;
}

describe('index.html boot assets', () => {
  it('uses root-relative asset URLs so path-based deep links can load the app', () => {
    const stylesheetHref = getAttributeValue('link[rel="stylesheet"]', 'href');
    const appModuleSrc = getAttributeValue('script[type="module"]', 'src');

    expect(stylesheetHref).toBe('/style.css');
    expect(appModuleSrc).toBe('/js/app.js');
    expect(indexHtml).not.toContain('href="style.css"');
    expect(indexHtml).not.toContain('src="js/app.js"');
  });

  it('resolves boot assets from nested path routes back to the site root', () => {
    expect(new URL('/style.css', 'http://localhost:1060/stats').pathname).toBe('/style.css');
    expect(new URL('/js/app.js', 'http://localhost:1060/wrapped/2025').pathname).toBe('/js/app.js');
    expect(new URL('/style.css', 'http://localhost:1060/collection/grid').pathname).toBe('/style.css');
  });
});
