// =============================================================================
// Header title helpers.
// =============================================================================

import { el } from './state.js';

export function syncHeaderTitleText() {
  if (!el.headerTitleText || !el.headerTitle) return;
  const baseTitle = el.headerTitle.dataset.baseTitle || 'Trackspot';
  const period = document.createElement('span');
  period.className = 'header-title-period';
  period.textContent = '.';
  period.setAttribute('aria-hidden', 'true');
  el.headerTitleText.replaceChildren(document.createTextNode(baseTitle), period);
}

export function setHeaderTitleBase(baseTitle = 'Trackspot') {
  if (!el.headerTitle) return;
  el.headerTitle.dataset.baseTitle = String(baseTitle || 'Trackspot');
  syncHeaderTitleText();
}
