import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
const stateSource = readFileSync(resolve(process.cwd(), 'public', 'js', 'state.js'), 'utf8');

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

  it('bootstraps grid sidebar state from the grid storage key before modules load', () => {
    expect(indexHtml).toContain("var _sKey=_cv==='grid'?'ts_sidebarCollapsedGrid':'ts_sidebarCollapsedList'");
    expect(indexHtml).toContain("if(_s===null&&_cv==='grid') _s='1'");
    expect(indexHtml).toContain("document.body.classList.add('collection-view-grid','view-grid')");
  });
});

describe('index.html DOM contract', () => {
  it('contains every literal element ID referenced by state.js', () => {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
    const intentionallyOptionalIds = new Set([
      'page-mode-grid',
      'page-desc-grid',
      'page-suggested-grid',
      'page-custom-wrap-grid',
      'page-custom-grid',
      'btn-page-custom-grid-up',
      'btn-page-custom-grid-down',
    ]);
    const ids = [...stateSource.matchAll(/document\.getElementById\('([^']+)'\)/g)]
      .map(match => match[1]);

    expect(ids.length).toBeGreaterThan(0);
    const missingIds = ids.filter(id => !doc.getElementById(id) && !intentionallyOptionalIds.has(id));

    expect(missingIds).toEqual([]);
  });

  it('contains every literal selector queried by state.js', () => {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
    const selectors = [...stateSource.matchAll(/document\.querySelector\('([^']+)'\)/g)]
      .map(match => match[1]);

    expect(selectors).toEqual([
      '.status-filter-wrap',
      '.import-type-filter-wrap',
      '.sort-field-wrap',
    ]);
    const missingSelectors = selectors.filter(selector => !doc.querySelector(selector));

    expect(missingSelectors).toEqual([]);
  });
});
