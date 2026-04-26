// =============================================================================
// Sidebar filters, dropdowns, complex statuses, U-buttons, view controls.
// =============================================================================

import {
  state, el, apiFetch,
  STATUS_LABELS, STATUS_FILTER_LABELS, IMPORT_TYPE_FILTER_LABELS,
  TYPE_FILTER_KEYS, TYPE_FILTER_LABELS,
  SORT_FIELD_LABELS, SORT_SVG_UP, SORT_SVG_DOWN,
  RATED_FILTER_ICONS,
  normalizeSortState,
  LS_U_BUTTONS, LS_U_BUTTONS_ENABLED_LIST,
  LS_U_BUTTONS_ENABLED_GRID, LS_SIDEBAR_COLLAPSED_LIST,
  LS_SIDEBAR_COLLAPSED_GRID, LS_DEBUG_CONTROLS, FILTER_PRESET_KEY,
  DEFAULT_COMPLEX_STATUSES, U_BUTTON_DEFS,
} from './state.js';
import { applyAlbumFilters } from './filter-utils.js';
import { loadAlbums, render, resetPagination } from './render.js';
import { openEditModal } from './modal.js';
import { shouldAnimateGridSidebarToggle } from './sidebar-layout.js';
import { shouldHideSidebarImmediatelyOnViewSwitch } from './view-switch.js';
import { syncAppShellLayout } from './app-shell.js';
import { patchPreferences } from './preferences.js';
import {
  openSettings, closeSettings, openPersonalization, closePersonalization, generateCsv,
  downloadFullBackup, downloadDbBackup, downloadEssentialBackup, mergeBackup, restoreBackup,
  handleBulkRefetchArt, setDebugMode, resetAllSettings, setUButtons,
} from './settings.js';

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------
// Applies the current filter state to the full albums array.
// All filtering is done client-side since the full dataset is always loaded.

export function applyFilters(albums) {
  return applyAlbumFilters(albums, state.filters, state.complexStatuses);
}

function getCurrentCollectionView() {
  return state.navigation?.collectionView || state.view || 'list';
}

function syncCollectionViewButtons(view) {
  const page = state.navigation?.page || 'collection';
  if (page !== 'collection') return;
  el.btnViewList?.classList.toggle('active', view === 'list');
  el.btnViewGrid?.classList.toggle('active', view === 'grid');
  el.btnStats?.classList.remove('active');
  el.btnWrapped?.classList.remove('active');
}

function ensureSidebarVisibleForCollection(sidebarEl) {
  if (!(sidebarEl instanceof Element)) return;
  sidebarEl.classList.remove('startup-hidden');
  sidebarEl.style.visibility = '';
}

// ---------------------------------------------------------------------------
// Status dropdown rendering
// ---------------------------------------------------------------------------

export function renderStatusDropdown() {
  const dd = el.filterStatusDropdown;
  dd.innerHTML = '';

  [
    { value: 'completed', label: 'Completed' },
    { value: 'dropped',   label: 'Dropped' },
    { value: 'planned',   label: 'Planned' },
  ].forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'status-filter-option';
    btn.dataset.value = s.value;
    btn.textContent = s.label;
    btn.classList.toggle('active', s.value === state.filters.statusFilter);
    dd.appendChild(btn);
  });

  if (state.complexStatuses.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'status-filter-sep';
    dd.appendChild(sep);

    state.complexStatuses.forEach(cs => {
      const btn = document.createElement('button');
      btn.className = 'status-filter-option';
      btn.dataset.value = cs.id;
      btn.textContent = cs.name;
      btn.classList.toggle('active', cs.id === state.filters.statusFilter);
      dd.appendChild(btn);
    });
  }
}

export function updateStatusFilterBtn() {
  const cs = state.complexStatuses.find(c => c.id === state.filters.statusFilter);
  el.filterStatusBtn.textContent = cs
    ? cs.name
    : (STATUS_FILTER_LABELS[state.filters.statusFilter] ?? state.filters.statusFilter);
  el.filterStatusDropdown.querySelectorAll('.status-filter-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.value === state.filters.statusFilter);
  });
}

export function renderImportTypeDropdown() {
  const dd = el.filterImportTypeDropdown;
  dd.innerHTML = '';

  [
    { value: 'spotify', label: 'Spotify' },
    { value: 'manual',  label: 'Manual' },
  ].forEach(option => {
    const btn = document.createElement('button');
    btn.className = 'import-type-filter-option';
    btn.dataset.value = option.value;
    btn.textContent = option.label;
    btn.classList.toggle('active', option.value === state.filters.importTypeFilter);
    dd.appendChild(btn);
  });

  const sep = document.createElement('div');
  sep.className = 'status-filter-sep';
  dd.appendChild(sep);

  const allBtn = document.createElement('button');
  allBtn.className = 'import-type-filter-option';
  allBtn.dataset.value = 'all';
  allBtn.textContent = 'All';
  allBtn.classList.toggle('active', state.filters.importTypeFilter === 'all');
  dd.appendChild(allBtn);
}

export function updateImportTypeFilterBtn() {
  const value = state.filters.importTypeFilter || 'all';
  el.filterImportTypeBtn.textContent = IMPORT_TYPE_FILTER_LABELS[value] ?? value;
  el.filterImportTypeDropdown.querySelectorAll('.import-type-filter-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.value === value);
  });
}

export function updateTypeFilterBtn() {
  const active = TYPE_FILTER_KEYS.filter(k => state.filters[k]);
  const allOn = active.length === TYPE_FILTER_KEYS.length;
  el.filterTypeBtn.textContent = allOn ? 'All' : active.length === 0 ? 'None' : active.map(k => TYPE_FILTER_LABELS[k]).join(', ');
  el.filterTypeDropdown.querySelectorAll('.type-filter-option[data-type]').forEach(opt => {
    if (opt.dataset.type === 'all') return;
    opt.classList.toggle('active', state.filters[opt.dataset.type]);
  });
}

// ---------------------------------------------------------------------------
// Complex status management
// ---------------------------------------------------------------------------

export function loadComplexStatuses() {
  return state.complexStatuses.length
    ? state.complexStatuses.map(cs => ({
      ...cs,
      statuses: [...cs.statuses],
      includedWithApp: !!cs.includedWithApp,
    }))
    : DEFAULT_COMPLEX_STATUSES.map(cs => ({
      ...cs,
      statuses: [...cs.statuses],
      includedWithApp: !!cs.includedWithApp,
    }));
}

export function saveComplexStatuses() {
  return patchPreferences({
    complexStatuses: state.complexStatuses,
  }).catch(error => {
    console.error('Failed to save complex statuses:', error);
    return null;
  });
}

export function genComplexStatusId() {
  return 'cs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function canDeleteComplexStatus(status) {
  return !status?.includedWithApp;
}

// Checks that the two built-in complex statuses exist and have correct contents.
// Removes any that are wrong and re-inserts correct versions at the front.
// Returns the ID of the default filter ('cs_listened').
export function resetComplexStatuses() {
  const listenedStatuses = ['completed', 'dropped'];
  const allStatuses      = ['completed', 'dropped', 'planned'];

  const setsEqual = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

  const goodListened = state.complexStatuses.find(
    cs => cs.id === 'cs_listened' && setsEqual(cs.statuses, listenedStatuses)
  );
  const goodAll = state.complexStatuses.find(
    cs => cs.id === 'cs_all' && setsEqual(cs.statuses, allStatuses)
  );

  if (!goodListened || !goodAll) {
    // Remove any stale versions of the defaults.
    state.complexStatuses = state.complexStatuses.filter(
      cs => cs.id !== 'cs_listened' && cs.id !== 'cs_all'
    );
    // Re-insert correct defaults at the front, in order.
    if (!goodAll)      state.complexStatuses.unshift({ id: 'cs_all',      name: 'All',      statuses: allStatuses });
    if (!goodListened) state.complexStatuses.unshift({ id: 'cs_listened', name: 'Listened', statuses: listenedStatuses });
    saveComplexStatuses();
  }

  return 'cs_listened';
}

// Renders the complex status list in the settings modal.
export function renderComplexStatusList() {
  const list = document.getElementById('complex-status-list');
  if (!list) return;
  list.innerHTML = '';

  state.complexStatuses.forEach((cs, index) => {
    const item = document.createElement('div');
    item.className = 'complex-status-item';
    item.dataset.index = index;
    item.draggable = true;

    const dragHandle = document.createElement('span');
    dragHandle.className = 'complex-status-drag-handle';
    dragHandle.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2.5" r="1.3"/><circle cx="7" cy="2.5" r="1.3"/><circle cx="3" cy="7" r="1.3"/><circle cx="7" cy="7" r="1.3"/><circle cx="3" cy="11.5" r="1.3"/><circle cx="7" cy="11.5" r="1.3"/></svg>`;

    const nameEl = document.createElement('span');
    nameEl.className = 'complex-status-name';
    nameEl.textContent = cs.name;

    const badgesEl = document.createElement('span');
    badgesEl.className = 'complex-status-badges';
    cs.statuses.forEach(s => {
      const badge = document.createElement('span');
      badge.className = 'complex-status-badge';
      badge.textContent = STATUS_LABELS[s] ?? s;
      badgesEl.appendChild(badge);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-icon complex-status-delete';
    delBtn.dataset.id = cs.id;
    delBtn.title = canDeleteComplexStatus(cs) ? 'Delete' : 'Built-in filters cannot be deleted.';
    delBtn.disabled = !canDeleteComplexStatus(cs);
    delBtn.setAttribute('aria-label', delBtn.title);
    delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

    item.appendChild(dragHandle);
    item.appendChild(nameEl);
    item.appendChild(badgesEl);
    item.appendChild(delBtn);
    list.appendChild(item);
  });
}

let _complexDragSrcIdx = null;

// Sets up event listeners for the complex status manager in settings.
// Called once at init — the DOM elements persist for the page lifetime.
export function initComplexStatuses() {
  const list      = document.getElementById('complex-status-list');
  const form      = document.getElementById('complex-status-form');
  const btnReset  = document.getElementById('btn-reset-complex-statuses');
  const nameInput = document.getElementById('complex-status-name-input');
  const togglesCt = document.getElementById('complex-status-toggles');
  const btnAdd    = document.getElementById('btn-add-complex-status');
  const btnCancel = document.getElementById('btn-complex-cancel');
  const btnSave   = document.getElementById('btn-complex-save');

  const TRUE_STATUSES = ['completed', 'dropped', 'planned'];
  let selectedStatuses = new Set();

  function showForm() {
    selectedStatuses = new Set();
    nameInput.value = '';
    togglesCt.innerHTML = '';
    TRUE_STATUSES.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn complex-status-toggle';
      btn.dataset.status = s;
      btn.textContent = STATUS_LABELS[s];
      btn.addEventListener('click', () => {
        if (selectedStatuses.has(s)) {
          selectedStatuses.delete(s);
          btn.classList.remove('active');
        } else {
          selectedStatuses.add(s);
          btn.classList.add('active');
        }
      });
      togglesCt.appendChild(btn);
    });
    form.classList.remove('hidden');
    btnAdd.classList.add('hidden');
    nameInput.focus();
  }

  function hideForm() {
    form.classList.add('hidden');
    btnAdd.classList.remove('hidden');
  }

  btnAdd.addEventListener('click', showForm);
  btnCancel.addEventListener('click', hideForm);

  btnReset.addEventListener('click', async () => {
    // Wipe all non-default complex statuses and restore defaults.
    state.complexStatuses = DEFAULT_COMPLEX_STATUSES.map(cs => ({ ...cs, statuses: [...cs.statuses] }));
    renderComplexStatusList();
    renderStatusDropdown();
    updateStatusFilterBtn();
    if (!state.complexStatuses.find(cs => cs.id === state.filters.statusFilter) &&
        !STATUS_FILTER_LABELS[state.filters.statusFilter]) {
      state.filters.statusFilter = 'cs_listened';
      updateStatusFilterBtn();
    }
    await saveComplexStatuses();
    hideForm();
    await loadAlbums();
  });

  btnSave.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    if (selectedStatuses.size === 0) return;
    state.complexStatuses.push({ id: genComplexStatusId(), name, statuses: [...selectedStatuses], includedWithApp: false });
    renderComplexStatusList();
    renderStatusDropdown();
    updateStatusFilterBtn();
    await saveComplexStatuses();
    hideForm();
  });

  // Delete via event delegation.
  list.addEventListener('click', async e => {
    const btn = e.target.closest('.complex-status-delete');
    if (!btn) return;
    const id = btn.dataset.id;
    const targetStatus = state.complexStatuses.find(cs => cs.id === id);
    if (!canDeleteComplexStatus(targetStatus)) return;
    let changedActiveFilter = false;
    state.complexStatuses = state.complexStatuses.filter(cs => cs.id !== id);
    if (state.filters.statusFilter === id) {
      state.filters.statusFilter = 'completed'; // first true status
      updateStatusFilterBtn();
      changedActiveFilter = true;
    }
    renderComplexStatusList();
    renderStatusDropdown();
    await saveComplexStatuses();
    if (changedActiveFilter) {
      await loadAlbums();
    }
  });

  // Drag and drop reordering.
  list.addEventListener('dragstart', e => {
    const item = e.target.closest('.complex-status-item');
    if (!item) return;
    _complexDragSrcIdx = parseInt(item.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => item.classList.add('dragging'), 0);
  });

  list.addEventListener('dragend', () => {
    list.querySelectorAll('.dragging, .drag-over').forEach(n => n.classList.remove('dragging', 'drag-over'));
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    const item = e.target.closest('.complex-status-item');
    list.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'));
    if (item && parseInt(item.dataset.index) !== _complexDragSrcIdx) {
      item.classList.add('drag-over');
    }
  });

  list.addEventListener('dragleave', e => {
    if (!list.contains(e.relatedTarget)) {
      list.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'));
    }
  });

  list.addEventListener('drop', async e => {
    e.preventDefault();
    const item = e.target.closest('.complex-status-item');
    if (!item) return;
    const dropIdx = parseInt(item.dataset.index);
    if (_complexDragSrcIdx === null || _complexDragSrcIdx === dropIdx) return;
    const [moved] = state.complexStatuses.splice(_complexDragSrcIdx, 1);
    state.complexStatuses.splice(dropIdx, 0, moved);
    _complexDragSrcIdx = null;
    renderComplexStatusList();
    renderStatusDropdown();
    updateStatusFilterBtn();
    await saveComplexStatuses();
  });
}

// ---------------------------------------------------------------------------
// U-shaped button management
// ---------------------------------------------------------------------------

export function loadUButtons() {
  try {
    const stored = localStorage.getItem(LS_U_BUTTONS);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge stored order/enabled state with canonical defs, appending any new ones.
      const result = parsed.filter(b => U_BUTTON_DEFS.some(d => d.id === b.id));
      U_BUTTON_DEFS.forEach(def => {
        if (!result.find(b => b.id === def.id)) result.push({ id: def.id, enabled: true });
      });
      return result;
    }
  } catch {
    /* ignore */
  }
  return U_BUTTON_DEFS.map(d => ({ id: d.id, enabled: true }));
}

export function saveUButtons() {
  localStorage.setItem(LS_U_BUTTONS, JSON.stringify(state.uButtons));
}

// Re-renders the U-button bar DOM to match state.uButtons order/enabled.
export function renderUButtonBar() {
  const uButtonsEl = document.getElementById('u-buttons');
  const visibleEls = [];

  // Reorder and show/hide buttons to match state.
  state.uButtons.forEach(b => {
    const btnEl = b.id === 'sidebar'         ? el.uBtnSidebar :
                  b.id === 'status-filter'   ? el.uBtnStatusFilter :
                  b.id === 'sort'            ? el.uBtnSort :
                  b.id === 'sort-order'      ? el.uBtnSortOrder :
                  b.id === 'restore-filters' ? el.uBtnRestoreFilters : null;
    if (!btnEl) return;
    btnEl.classList.toggle('hidden', !b.enabled);
    uButtonsEl.appendChild(btnEl); // moves to end, establishing order
    if (b.enabled) visibleEls.push(btnEl);
  });

  // Assign shared-border and corner classes based on visible position.
  visibleEls.forEach((btnEl, i) => {
    btnEl.classList.toggle('u-btn-not-first', i > 0);
    btnEl.classList.toggle('u-btn-last', i === visibleEls.length - 1);
  });

  // Reveal the bar now that it's been fully initialized (hidden in HTML to
  // prevent a flash of wrong order/state before the module script runs).
  // On the first render, play the slide-in animation instead of popping in.
  const isFirstRender = uButtonsEl.style.visibility === 'hidden';
  uButtonsEl.style.visibility = '';
  if (isFirstRender && document.body.classList.contains('u-buttons-enabled')) {
    uButtonsEl.classList.add('slide-in');
    uButtonsEl.addEventListener('animationend', () => uButtonsEl.classList.remove('slide-in'), { once: true });
  }
}

// Re-renders the U-button settings list.
export function renderUButtonList() {
  const list = el.uButtonList;
  if (!list) return;
  list.innerHTML = '';

  state.uButtons.forEach((b, index) => {
    const def = U_BUTTON_DEFS.find(d => d.id === b.id);
    if (!def) return;

    const item = document.createElement('div');
    item.className = 'u-button-item';
    item.dataset.index = index;
    item.draggable = true;

    const dragHandle = document.createElement('span');
    dragHandle.className = 'u-button-drag-handle';
    dragHandle.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2.5" r="1.3"/><circle cx="7" cy="2.5" r="1.3"/><circle cx="3" cy="7" r="1.3"/><circle cx="7" cy="7" r="1.3"/><circle cx="3" cy="11.5" r="1.3"/><circle cx="7" cy="11.5" r="1.3"/></svg>`;

    const labelEl = document.createElement('span');
    labelEl.className = 'u-button-item-label';
    labelEl.textContent = def.label;

    const toggle = document.createElement('label');
    toggle.className = 'settings-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = b.enabled;
    checkbox.addEventListener('change', () => {
      state.uButtons[index].enabled = checkbox.checked;
      saveUButtons();
      renderUButtonBar();
    });
    const track = document.createElement('span');
    track.className = 'settings-toggle-track';
    toggle.appendChild(checkbox);
    toggle.appendChild(track);

    item.appendChild(dragHandle);
    item.appendChild(labelEl);
    item.appendChild(toggle);
    list.appendChild(item);
  });
}

let _uBtnDragSrcIdx = null;

export function initUButtons() {
  const list = el.uButtonList;
  if (!list) return;

  list.addEventListener('dragstart', e => {
    const item = e.target.closest('.u-button-item');
    if (!item) return;
    _uBtnDragSrcIdx = parseInt(item.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => item.classList.add('dragging'), 0);
  });

  list.addEventListener('dragend', () => {
    list.querySelectorAll('.dragging, .drag-over').forEach(n => n.classList.remove('dragging', 'drag-over'));
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    const item = e.target.closest('.u-button-item');
    list.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'));
    if (item && parseInt(item.dataset.index) !== _uBtnDragSrcIdx) {
      item.classList.add('drag-over');
    }
  });

  list.addEventListener('dragleave', e => {
    if (!list.contains(e.relatedTarget)) {
      list.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'));
    }
  });

  list.addEventListener('drop', e => {
    e.preventDefault();
    const item = e.target.closest('.u-button-item');
    if (!item) return;
    const dropIdx = parseInt(item.dataset.index);
    if (_uBtnDragSrcIdx === null || _uBtnDragSrcIdx === dropIdx) return;
    const [moved] = state.uButtons.splice(_uBtnDragSrcIdx, 1);
    state.uButtons.splice(dropIdx, 0, moved);
    _uBtnDragSrcIdx = null;
    saveUButtons();
    renderUButtonList();
    renderUButtonBar();
  });
}

// ---------------------------------------------------------------------------
// Sort & filter button updates
// ---------------------------------------------------------------------------

export function updateSortFieldBtn() {
  el.sortFieldBtn.textContent = SORT_FIELD_LABELS[state.sort.field] ?? state.sort.field;
  el.sortFieldDropdown.querySelectorAll('.sort-field-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.value === state.sort.field);
  });
}

export function updateRatedFilterBtn() {
  el.filterRatedBtn.innerHTML = RATED_FILTER_ICONS[state.filters.ratedFilter];
}

export function updateSortOrderBtn() {
  const svg   = state.sort.order === 'asc' ? SORT_SVG_UP : SORT_SVG_DOWN;
  const title = state.sort.order === 'asc' ? 'Ascending (click to switch)' : 'Descending (click to switch)';
  el.sortOrder.innerHTML     = svg;
  el.sortOrder.title         = title;
  el.uBtnSortOrder.innerHTML = svg;
  el.uBtnSortOrder.title     = title;
}

export function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  syncAppShellLayout();
  saveSidebarState();
}

export function toggleSidebarCollapsed() {
  clearSidebarMotionState();
  const nextCollapsed = !document.body.classList.contains('sidebar-collapsed');
  setSidebarCollapsed(nextCollapsed);
  return nextCollapsed;
}

// ---------------------------------------------------------------------------
// Grid sidebar FLIP animation
// ---------------------------------------------------------------------------
// When toggling the sidebar in grid view, we use a FLIP (First-Last-Invert-
// Play) animation so cards glide smoothly between their old and new grid
// positions instead of snapping. Cards that change rows get extra flair —
// they scale down, arc outward, and sweep into their destination like items
// on a conveyor belt.

function cancelElementAnimations(element) {
  if (!(element instanceof Element)) return;
  element.getAnimations().forEach(animation => animation.cancel());
}

let activeSidebarAnimation = null;

function clearSidebarMotionState(sidebarEl = document.querySelector('.sidebar')) {
  if (activeSidebarAnimation) {
    activeSidebarAnimation.cancel();
    activeSidebarAnimation = null;
  }

  if (sidebarEl instanceof Element) {
    cancelElementAnimations(sidebarEl);
    sidebarEl.style.transition = '';
  }
}

function trackSidebarAnimation(sidebarEl, animation) {
  activeSidebarAnimation = animation;

  animation.finished.then(() => {
    if (activeSidebarAnimation !== animation) return;
    activeSidebarAnimation = null;
    sidebarEl.style.transition = '';
    animation.cancel();
  }).catch(() => {
    if (activeSidebarAnimation === animation) {
      activeSidebarAnimation = null;
    }
    sidebarEl.style.transition = '';
  });
}

export function animateGridSidebarToggle() {
  const cards = Array.from(el.viewGrid.querySelectorAll('.album-card'));
  if (!shouldAnimateGridSidebarToggle({
    reserveSidebarSpace: state.reserveSidebarSpace,
    cardCount: cards.length,
  })) {
    toggleSidebarCollapsed();
    return;
  }

  const nextCollapsed = !document.body.classList.contains('sidebar-collapsed');
  const sidebarEl = document.querySelector('.sidebar');
  clearSidebarMotionState(sidebarEl);

  // --- FIRST: snapshot current positions ---
  const first = new Map();
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    first.set(card, { x: r.left, y: r.top, w: r.width, h: r.height });
  }

  // Interrupt any prior FLIP/sidebar animations before measuring the new end
  // state, otherwise old and new transforms can briefly stack on spam-click.
  cards.forEach(cancelElementAnimations);

  // --- Apply layout change ---
  setSidebarCollapsed(nextCollapsed);
  // Force layout so we can read the new positions.
  void el.viewGrid.offsetWidth;

  // --- LAST: snapshot new positions ---
  const last = new Map();
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    last.set(card, { x: r.left, y: r.top, w: r.width, h: r.height });
  }

  const isNowCollapsed = nextCollapsed;

  // --- INVERT + PLAY ---
  const duration = 1000;
  const rowChangeDuration = duration + 0;
  const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

  // Animate the sidebar with JS using the same easing/duration as the cards,
  // so its right edge tracks the left edge of the top-left card in lockstep.
  // Exclude transform from the CSS transition first so it doesn't fight the
  // JS transform animation. Keep the other transitions available for tour
  // steps that reveal/hide the quick actions toolbar at the same time.
  if (sidebarEl instanceof Element) {
    sidebarEl.style.transition = 'padding-top 0.25s ease, top 0.25s ease, opacity 0.15s ease';
    const animation = sidebarEl.animate(
      isNowCollapsed
        ? [{ transform: 'translateX(0)' },        { transform: 'translateX(-100%)' }]
        : [{ transform: 'translateX(-100%)' },     { transform: 'translateX(0)' }],
      { duration, easing, fill: 'both' }
    );
    trackSidebarAnimation(sidebarEl, animation);
  }

  for (const card of cards) {
    const f = first.get(card);
    const l = last.get(card);

    const dx = f.x - l.x;
    const dy = f.y - l.y;
    // Uniform scale based on width only. Using separate sw/sh (f.w/l.w and
    // f.h/l.h) produces a non-uniform scale because the card's info section
    // has a fixed height that doesn't scale with width, making sh slightly
    // closer to 1 than sw and distorting the square art.
    const sw = f.w / l.w;

    // CSS scale() transforms from the element center (transform-origin: 50% 50%).
    // qx/qy compensate for the visual edge shift caused by scaling from center.
    // qy uses l.h and sw (not f.h-l.h) to match the uniform scale axis.
    const qx = (f.w - l.w) / 2;
    const qy = l.h / 2 * (sw - 1);

    // Did this card change rows?
    const rowChanged = Math.abs(dy) > f.h * 0.5;

    card.animate([
      { transform: `translate(${dx + qx}px, ${dy + qy}px) scale(${sw})` },
      { transform: 'translate(0, 0) scale(1, 1)' },
    ], {
      duration: rowChanged ? rowChangeDuration : duration,
      easing,
      fill: 'both',
    });
  }
}

export function toggleSidebarForCurrentView() {
  if (getCurrentCollectionView() === 'grid') {
    animateGridSidebarToggle();
    return;
  }

  toggleSidebarCollapsed();
}

// ---------------------------------------------------------------------------
// View toggle (list / grid)
// ---------------------------------------------------------------------------

export function applyCollectionViewState(view, options = {}) {
  const {
    load = true,
    suppressTransitions = false,
    preservePage = false,
  } = options;

  const sidebarEl = document.querySelector('.sidebar');
  clearSidebarMotionState(sidebarEl);
  ensureSidebarVisibleForCollection(sidebarEl);
  const previousView = getCurrentCollectionView();
  const wasSidebarCollapsed = document.body.classList.contains('sidebar-collapsed');
  if (state.navigation) {
    state.navigation.collectionView = view;
  }
  state.view = view;
  if (!preservePage) {
    resetPagination();
  }
  syncCollectionViewButtons(view);

  document.body.classList.toggle('collection-view-grid', view === 'grid');
  document.body.classList.toggle('view-grid', view === 'grid');

  const uKey = view === 'grid' ? LS_U_BUTTONS_ENABLED_GRID : LS_U_BUTTONS_ENABLED_LIST;
  const defaultOn = false;
  setUButtons(localStorage.getItem(uKey) === null ? defaultOn : localStorage.getItem(uKey) !== '0');

  const sKey = view === 'grid' ? LS_SIDEBAR_COLLAPSED_GRID : LS_SIDEBAR_COLLAPSED_LIST;
  const defaultCollapsed = view === 'grid';
  const stored = localStorage.getItem(sKey);
  const nextSidebarCollapsed = stored === null ? defaultCollapsed : stored === '1';
  const shouldHideImmediately = shouldHideSidebarImmediatelyOnViewSwitch({
    previousView,
    nextView: view,
    wasSidebarCollapsed,
    nextSidebarCollapsed,
  });

  let immediateSidebarEl = null;
  let contentEl = null;
  const disableTransitions = suppressTransitions || shouldHideImmediately;
  if (disableTransitions) {
    immediateSidebarEl = sidebarEl;
    contentEl = document.querySelector('.content');
    if (immediateSidebarEl instanceof Element) {
      immediateSidebarEl.style.transition = 'none';
    }
    if (contentEl instanceof Element) {
      contentEl.style.transition = 'none';
    }
  }

  document.body.classList.toggle('sidebar-collapsed', nextSidebarCollapsed);
  syncAppShellLayout();

  if (immediateSidebarEl instanceof Element) {
    void immediateSidebarEl.offsetWidth;
    requestAnimationFrame(() => {
      immediateSidebarEl.style.transition = '';
    });
  }
  if (contentEl instanceof Element) {
    void contentEl.offsetWidth;
    requestAnimationFrame(() => {
      contentEl.style.transition = '';
    });
  }

  render();
  if (load) {
    loadAlbums({ preservePage });
  }
}

export function setView(view) {
  if (state.navigation) {
    state.navigation.page = 'collection';
  }
  applyCollectionViewState(view, { suppressTransitions: true });
}

export function saveSidebarState() {
  const collapsed = document.body.classList.contains('sidebar-collapsed');
  const key = getCurrentCollectionView() === 'grid' ? LS_SIDEBAR_COLLAPSED_GRID : LS_SIDEBAR_COLLAPSED_LIST;
  localStorage.setItem(key, collapsed ? '1' : '0');
}

// ---------------------------------------------------------------------------
// Filter preset save / restore
// ---------------------------------------------------------------------------

export function updateRestoreBtn() {
  const hasPreset = !!localStorage.getItem(FILTER_PRESET_KEY);
  el.btnRestoreFilters.disabled = !hasPreset;
  el.uBtnRestoreFilters.disabled = !hasPreset;
  // Keep aria state in sync but don't fight the hidden class managed by renderUButtonBar.
}

export function getDefaultFilterPreset(statusFilter = 'cs_listened') {
  return {
    filters: {
      search: '',
      artist: '',
      artistMatchExact: false,
      year: '',
      ratingMin: '',
      ratingMax: '',
      statusFilter,
      importTypeFilter: 'all',
      ratedFilter: 'both',
      typeAlbum: true,
      typeEP: true,
      typeSingle: true,
      typeCompilation: true,
      typeOther: true,
    },
    sort: {
      field: 'date_listened_planned',
      order: 'desc',
    },
  };
}

export function saveSpecificFilterPreset(filters, sort) {
  const normalizedSort = normalizeSortState(sort);
  localStorage.setItem(FILTER_PRESET_KEY, JSON.stringify({
    filters: { ...filters },
    sort: normalizedSort,
  }));
  updateRestoreBtn();
}

export function saveDefaultFilterPreset(statusFilter = 'cs_listened') {
  const preset = getDefaultFilterPreset(statusFilter);
  saveSpecificFilterPreset(preset.filters, preset.sort);
}

export function applyFilterState(filters, sort) {
  state.filters = { ...getDefaultFilterPreset(state.filters.statusFilter).filters, ...filters };
  state.sort    = normalizeSortState(sort);
  resetPagination();

  // Guard against a saved statusFilter that no longer exists.
  if (!state.complexStatuses.find(cs => cs.id === state.filters.statusFilter) &&
      !STATUS_FILTER_LABELS[state.filters.statusFilter]) {
    state.filters.statusFilter = 'completed';
  }
  if (!IMPORT_TYPE_FILTER_LABELS[state.filters.importTypeFilter]) {
    state.filters.importTypeFilter = 'all';
  }

  el.filterSearch.value            = state.filters.search;
  el.filterArtist.value            = state.filters.artist;
  el.filterArtistExact.checked     = state.filters.artistMatchExact;
  el.filterYear.value              = state.filters.year;
  el.filterRatingMin.value         = state.filters.ratingMin;
  el.filterRatingMax.value         = state.filters.ratingMax;
  updateStatusFilterBtn();
  updateImportTypeFilterBtn();
  updateRatedFilterBtn();
  updateTypeFilterBtn();
  updateSortFieldBtn();
  updateSortOrderBtn();

  loadAlbums();
}

export function syncFilterControlsFromState() {
  el.filterSearch.value = state.filters.search;
  el.filterArtist.value = state.filters.artist;
  el.filterArtistExact.checked = state.filters.artistMatchExact;
  el.filterYear.value = state.filters.year;
  el.filterRatingMin.value = state.filters.ratingMin;
  el.filterRatingMax.value = state.filters.ratingMax;
}

export function saveFilterPreset() {
  saveSpecificFilterPreset(state.filters, state.sort);
}

export function restoreFilterPreset() {
  const raw = localStorage.getItem(FILTER_PRESET_KEY);
  if (!raw) return;
  try {
    const { filters, sort } = JSON.parse(raw);
    applyFilterState(filters, sort);
    saveSpecificFilterPreset(filters, state.sort);
  } catch {
    /* corrupted — ignore */
  }
}

// ---------------------------------------------------------------------------
// Sidebar filter & sort event handlers
// ---------------------------------------------------------------------------
// Each input updates state.filters or state.sort, then reloads the matching
// page from the server.

export function initSidebarEvents() {
  function reloadWithPaginationReset() {
    resetPagination();
    loadAlbums();
  }

  el.filterSearch.addEventListener('input', e => {
    state.filters.search = e.target.value.trim();
    reloadWithPaginationReset();
  });

  el.filterArtist.addEventListener('input', e => {
    state.filters.artist = e.target.value.trim();
    state.filters.artistMatchExact = false; // manual typing → back to substring match
    el.filterArtistExact.checked = false;
    reloadWithPaginationReset();
  });

  el.filterArtistExact.addEventListener('change', e => {
    state.filters.artistMatchExact = e.target.checked;
    reloadWithPaginationReset();
  });

  el.filterYear.addEventListener('input', e => {
    state.filters.year = e.target.value.trim();
    reloadWithPaginationReset();
  });

  el.filterRatingMin.addEventListener('input', e => {
    state.filters.ratingMin = e.target.value.trim();
    reloadWithPaginationReset();
  });

  el.filterRatingMax.addEventListener('input', e => {
    state.filters.ratingMax = e.target.value.trim();
    reloadWithPaginationReset();
  });

  function closeSidebarDropdowns(...except) {
    if (!except.includes(el.filterStatusDropdown)) closeStatusDropdown();
    if (!except.includes(el.filterImportTypeDropdown)) closeImportTypeDropdown();
    if (!except.includes(el.sortFieldDropdown)) closeSortDropdown();
    [el.filterRatedDropdown, el.filterTypeDropdown]
      .filter(d => !except.includes(d))
      .forEach(d => d.classList.add('hidden'));
  }

  function closeStatusDropdown() {
    el.filterStatusDropdown.classList.add('hidden');
    // Restore dropdown to sidebar if it was teleported to body.
    if (el.filterStatusDropdown.parentElement !== el.filterStatusWrap) {
      el.filterStatusDropdown.style.position = '';
      el.filterStatusDropdown.style.top      = '';
      el.filterStatusDropdown.style.left     = '';
      el.filterStatusWrap.appendChild(el.filterStatusDropdown);
    }
  }

  function openStatusDropdown(anchorEl) {
    const isHidden = el.filterStatusDropdown.classList.contains('hidden');
    if (!isHidden) { closeStatusDropdown(); return; }
    closeSidebarDropdowns(el.filterStatusDropdown);
    el.filterStatusDropdown.classList.remove('drop-up');

    if (anchorEl === el.filterStatusBtn) {
      // Normal sidebar positioning (absolute, anchored via CSS).
      el.filterStatusDropdown.classList.remove('hidden');
      const rect = el.filterStatusDropdown.getBoundingClientRect();
      const spaceBelow = window.innerHeight - el.filterStatusBtn.getBoundingClientRect().bottom;
      el.filterStatusDropdown.classList.toggle('drop-up', rect.height > spaceBelow);
    } else {
      // Toolbar anchor: teleport to body so sidebar's CSS transform doesn't affect fixed positioning.
      document.body.appendChild(el.filterStatusDropdown);
      el.filterStatusDropdown.style.position = 'fixed';
      el.filterStatusDropdown.classList.remove('hidden');
      const btnRect = anchorEl.getBoundingClientRect();
      const ddRect  = el.filterStatusDropdown.getBoundingClientRect();
      const spaceBelow = window.innerHeight - btnRect.bottom;
      const top  = spaceBelow >= ddRect.height ? btnRect.bottom + 4 : btnRect.top - ddRect.height - 4;
      el.filterStatusDropdown.style.top  = top + 'px';
      el.filterStatusDropdown.style.left = btnRect.left + 'px';
    }
  }

  el.filterStatusBtn.addEventListener('click', e => {
    e.stopPropagation();
    openStatusDropdown(el.filterStatusBtn);
  });

  el.filterStatusDropdown.addEventListener('click', e => {
    const opt = e.target.closest('.status-filter-option');
    if (!opt) return;
    state.filters.statusFilter = opt.dataset.value;
    closeStatusDropdown();
    updateStatusFilterBtn();
    reloadWithPaginationReset();
  });

  document.addEventListener('click', () => { closeStatusDropdown(); });

  function closeImportTypeDropdown() {
    el.filterImportTypeDropdown.classList.add('hidden');
    if (el.filterImportTypeDropdown.parentElement !== el.filterImportTypeWrap) {
      el.filterImportTypeDropdown.style.position = '';
      el.filterImportTypeDropdown.style.top      = '';
      el.filterImportTypeDropdown.style.left     = '';
      el.filterImportTypeWrap.appendChild(el.filterImportTypeDropdown);
    }
  }

  function openImportTypeDropdown() {
    const isHidden = el.filterImportTypeDropdown.classList.contains('hidden');
    if (!isHidden) { closeImportTypeDropdown(); return; }
    closeSidebarDropdowns(el.filterImportTypeDropdown);
    el.filterImportTypeDropdown.classList.remove('drop-up', 'hidden');
    const rect = el.filterImportTypeDropdown.getBoundingClientRect();
    const spaceBelow = window.innerHeight - el.filterImportTypeBtn.getBoundingClientRect().bottom;
    el.filterImportTypeDropdown.classList.toggle('drop-up', rect.height > spaceBelow);
  }

  el.filterImportTypeBtn.addEventListener('click', e => {
    e.stopPropagation();
    openImportTypeDropdown();
  });

  el.filterImportTypeDropdown.addEventListener('click', e => {
    const opt = e.target.closest('.import-type-filter-option');
    if (!opt) return;
    state.filters.importTypeFilter = opt.dataset.value;
    closeImportTypeDropdown();
    updateImportTypeFilterBtn();
    reloadWithPaginationReset();
  });

  document.addEventListener('click', () => { closeImportTypeDropdown(); });

  el.filterRatedBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isHidden = el.filterRatedDropdown.classList.contains('hidden');
    if (isHidden) {
      closeSidebarDropdowns(el.filterRatedDropdown);
      el.filterRatedDropdown.classList.remove('hidden');
      const btnRect = el.filterRatedBtn.getBoundingClientRect();
      const ddRect  = el.filterRatedDropdown.getBoundingClientRect();
      const spaceBelow = window.innerHeight - btnRect.bottom;
      if (ddRect.height > spaceBelow) {
        el.filterRatedDropdown.style.top    = (btnRect.top - ddRect.height - 4) + 'px';
      } else {
        el.filterRatedDropdown.style.top    = (btnRect.bottom + 4) + 'px';
      }
      el.filterRatedDropdown.style.left = (btnRect.right - ddRect.width) + 'px';
    } else {
      el.filterRatedDropdown.classList.add('hidden');
    }
  });

  el.filterRatedDropdown.addEventListener('click', e => {
    const opt = e.target.closest('.rated-filter-option');
    if (!opt) return;
    state.filters.ratedFilter = opt.dataset.value;
    el.filterRatedDropdown.classList.add('hidden');
    updateRatedFilterBtn();
    reloadWithPaginationReset();
  });

  document.addEventListener('click', () => {
    el.filterRatedDropdown.classList.add('hidden');
  });

  el.filterTypeBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isHidden = el.filterTypeDropdown.classList.contains('hidden');
    if (isHidden) {
      closeSidebarDropdowns(el.filterTypeDropdown);
      el.filterTypeDropdown.classList.remove('hidden');
      const rect = el.filterTypeDropdown.getBoundingClientRect();
      const spaceBelow = window.innerHeight - el.filterTypeBtn.getBoundingClientRect().bottom;
      el.filterTypeDropdown.classList.toggle('drop-up', rect.height > spaceBelow);
    } else {
      el.filterTypeDropdown.classList.add('hidden');
    }
  });

  el.filterTypeDropdown.addEventListener('click', e => {
    e.stopPropagation();
    const opt = e.target.closest('.type-filter-option');
    if (!opt) return;
    const type = opt.dataset.type;
    if (type === 'all') {
      const allOn = ['typeAlbum','typeEP','typeSingle','typeCompilation','typeOther'].every(k => state.filters[k]);
      ['typeAlbum','typeEP','typeSingle','typeCompilation','typeOther'].forEach(k => { state.filters[k] = !allOn; });
    } else {
      state.filters[type] = !state.filters[type];
    }
    updateTypeFilterBtn();
    reloadWithPaginationReset();
  });

  document.addEventListener('click', () => { el.filterTypeDropdown.classList.add('hidden'); });

  function closeSortDropdown() {
    el.sortFieldDropdown.classList.add('hidden');
    if (el.sortFieldDropdown.parentElement !== el.sortFieldWrap) {
      el.sortFieldDropdown.style.position = '';
      el.sortFieldDropdown.style.top      = '';
      el.sortFieldDropdown.style.left     = '';
      el.sortFieldWrap.appendChild(el.sortFieldDropdown);
    }
  }

  function openSortDropdown(anchorEl) {
    const isHidden = el.sortFieldDropdown.classList.contains('hidden');
    if (!isHidden) { closeSortDropdown(); return; }
    closeSidebarDropdowns(el.sortFieldDropdown);
    el.sortFieldDropdown.classList.remove('drop-up');

    if (anchorEl === el.sortFieldBtn) {
      el.sortFieldDropdown.classList.remove('hidden');
      const rect = el.sortFieldDropdown.getBoundingClientRect();
      const spaceBelow = window.innerHeight - el.sortFieldBtn.getBoundingClientRect().bottom;
      el.sortFieldDropdown.classList.toggle('drop-up', rect.height > spaceBelow);
    } else {
      document.body.appendChild(el.sortFieldDropdown);
      el.sortFieldDropdown.style.position = 'fixed';
      el.sortFieldDropdown.classList.remove('hidden');
      const btnRect = anchorEl.getBoundingClientRect();
      const ddRect  = el.sortFieldDropdown.getBoundingClientRect();
      const spaceBelow = window.innerHeight - btnRect.bottom;
      const top = spaceBelow >= ddRect.height ? btnRect.bottom + 4 : btnRect.top - ddRect.height - 4;
      el.sortFieldDropdown.style.top  = top + 'px';
      el.sortFieldDropdown.style.left = btnRect.left + 'px';
    }
  }

  el.sortFieldBtn.addEventListener('click', e => {
    e.stopPropagation();
    openSortDropdown(el.sortFieldBtn);
  });

  el.sortFieldDropdown.addEventListener('click', e => {
    const opt = e.target.closest('.sort-field-option');
    if (!opt) return;
    state.sort.field = opt.dataset.value;
    closeSortDropdown();
    updateSortFieldBtn();
    resetPagination();
    loadAlbums();
  });

  document.addEventListener('click', () => { closeSortDropdown(); });

  // Sort order is now a toggle button (↓ desc / ↑ asc).
  el.sortOrder.addEventListener('click', () => {
    state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
    updateSortOrderBtn();
    resetPagination();
    loadAlbums();
  });

  el.btnPersonalization.addEventListener('click', () => openPersonalization());
  el.personalizationClose.addEventListener('click', closePersonalization);
  el.btnPersonalizationClose.addEventListener('click', closePersonalization);
  el.personalizationOverlay.addEventListener('click', e => {
    if (e.target === el.personalizationOverlay) closePersonalization();
  });

  el.btnSettings.addEventListener('click', () => openSettings());
  el.settingsClose.addEventListener('click', closeSettings);
  el.btnSettingsClose.addEventListener('click', closeSettings);
  el.settingsOverlay.addEventListener('click', e => {
    if (e.target === el.settingsOverlay) closeSettings();
  });
  el.btnDownloadCsv.addEventListener('click', generateCsv);
  el.btnDownloadBackup.addEventListener('click', downloadFullBackup);
  el.btnDownloadBackupDb.addEventListener('click', downloadDbBackup);
  el.btnDownloadBackupEssential.addEventListener('click', downloadEssentialBackup);
  el.btnMergeBackup.addEventListener('click', mergeBackup);
  el.btnRestoreBackup.addEventListener('click', restoreBackup);
  el.btnBulkRefetchArt.addEventListener('click', handleBulkRefetchArt);

  el.btnResetAllSettings.addEventListener('click', resetAllSettings);

  el.toggleDebugControls.addEventListener('change', e => {
    setDebugMode(e.target.checked);
    localStorage.setItem(LS_DEBUG_CONTROLS, e.target.checked ? '1' : '0');
  });

  el.btnToggleUButtons.addEventListener('click', () => {
    const enabled = !document.body.classList.contains('u-buttons-enabled');
    const key = getCurrentCollectionView() === 'grid' ? LS_U_BUTTONS_ENABLED_GRID : LS_U_BUTTONS_ENABLED_LIST;
    setUButtons(enabled);
    localStorage.setItem(key, enabled ? '1' : '0');
  });

  el.uBtnSidebar.addEventListener('click', () => {
    toggleSidebarForCurrentView();
  });

  el.uBtnStatusFilter.addEventListener('click', e => {
    e.stopPropagation();
    openStatusDropdown(el.uBtnStatusFilter);
  });

  el.uBtnSort.addEventListener('click', e => {
    e.stopPropagation();
    openSortDropdown(el.uBtnSort);
  });

  el.uBtnSortOrder.addEventListener('click', () => {
    state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
    updateSortOrderBtn();
    resetPagination();
    loadAlbums();
  });

  el.uBtnRestoreFilters.addEventListener('click', restoreFilterPreset);

  el.btnRefetchArt.addEventListener('click', () => {
    import('./modal-art.js').then(m => m.handleRefetchArt());
  });
  el.btnDeleteArt.addEventListener('click', () => {
    import('./modal-art.js').then(m => m.handleDeleteArt());
  });
  el.btnRandomArt.addEventListener('click', () => {
    import('./modal-art.js').then(m => m.handleRandomArt());
  });
  el.btnArtRefetchCancel.addEventListener('click', () => {
    el.artRefetchPreview.classList.add('hidden');
    // Clean up temp file server-side.
    const newPath = el.btnArtRefetchReplace.dataset.newPath;
    if (newPath) apiFetch('/api/albums/discard-temp-art', { method: 'POST', body: JSON.stringify({ path: newPath }) }).catch(() => {});
  });
  el.btnArtRefetchReplace.addEventListener('click', () => {
    import('./modal-art.js').then(m => m.handleArtRefetchReplace());
  });

  el.btnClearFilters.addEventListener('click', () => {
    const defaultStatusFilter = resetComplexStatuses();
    const defaultPreset = getDefaultFilterPreset(defaultStatusFilter);
    saveSpecificFilterPreset(defaultPreset.filters, defaultPreset.sort);
    renderStatusDropdown();
    applyFilterState(defaultPreset.filters, defaultPreset.sort);
  });

  el.btnSaveFilters.addEventListener('click', saveFilterPreset);
  el.btnRestoreFilters.addEventListener('click', restoreFilterPreset);
}

// ---------------------------------------------------------------------------
// List & grid click delegation
// ---------------------------------------------------------------------------

export function initListEvents() {
  // Click handling is now done per-row in renderList directly.
  // This function is kept for future use.
}

export function initGridEvents() {
  el.viewGrid.addEventListener('click', e => {
    if (e.target.closest('.artist-chip')) return; // handled by chip's own listener
    const card = e.target.closest('.album-card');
    if (card) openEditModal(parseInt(card.dataset.id, 10));
  });
}
