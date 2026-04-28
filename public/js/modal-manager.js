// =============================================================================
// Shared modal stack, focus, and inert handling for standard app overlays.
// =============================================================================

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const modalStack = [];
const bodyStateSnapshots = new Map();
let isKeydownListenerAttached = false;

function isWelcomeTourActive() {
  return document.body.classList.contains('welcome-tour-active')
    || document.getElementById('welcome-tour-overlay') !== null;
}

function isUsableElement(element) {
  return element instanceof HTMLElement
    && !element.disabled
    && !element.closest('[hidden], .hidden')
    && element.getAttribute('aria-hidden') !== 'true'
    && element.tabIndex >= 0;
}

function getDialog(entry) {
  return entry.dialog
    || entry.overlay.querySelector('[role="dialog"], .modal')
    || entry.overlay;
}

function getFocusableElements(dialog) {
  return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(isUsableElement);
}

function rememberBodyChild(element) {
  if (bodyStateSnapshots.has(element)) return;
  bodyStateSnapshots.set(element, {
    inert: !!element.inert,
    ariaHidden: element.getAttribute('aria-hidden'),
  });
}

function restoreBodyChild(element, snapshot) {
  element.inert = snapshot.inert;
  if (snapshot.ariaHidden === null) {
    element.removeAttribute('aria-hidden');
  } else {
    element.setAttribute('aria-hidden', snapshot.ariaHidden);
  }
}

function restoreBodyState() {
  bodyStateSnapshots.forEach((snapshot, element) => {
    restoreBodyChild(element, snapshot);
  });
  bodyStateSnapshots.clear();
}

function syncStackZIndexes() {
  modalStack.forEach((entry, index) => {
    entry.overlay.style.zIndex = String(200 + (index * 5));
  });
}

function syncBodyInertness() {
  if (!modalStack.length || isWelcomeTourActive()) {
    restoreBodyState();
    return;
  }

  const top = modalStack.at(-1);
  Array.from(document.body.children).forEach(element => {
    rememberBodyChild(element);
    const snapshot = bodyStateSnapshots.get(element);
    if (element === top.overlay && snapshot) {
      restoreBodyChild(element, snapshot);
      return;
    }
    element.inert = true;
    element.setAttribute('aria-hidden', 'true');
  });
}

function focusEntry(entry) {
  if (isWelcomeTourActive()) return;
  const dialog = getDialog(entry);
  const initialFocus = typeof entry.initialFocus === 'function'
    ? entry.initialFocus()
    : entry.initialFocus;
  const target = isUsableElement(initialFocus)
    ? initialFocus
    : getFocusableElements(dialog)[0];

  window.setTimeout(() => {
    if (!modalStack.includes(entry) || isWelcomeTourActive()) return;
    if (isUsableElement(target)) {
      target.focus();
    } else if (dialog instanceof HTMLElement) {
      dialog.focus();
    }
  }, 0);
}

function focusOpener(entry) {
  if (isWelcomeTourActive()) return;
  const opener = entry.opener;
  if (opener instanceof HTMLElement && opener.isConnected && !opener.disabled) {
    opener.focus();
  }
}

function trapTab(event, entry) {
  const dialog = getDialog(entry);
  const focusable = getFocusableElements(dialog);
  if (!focusable.length) {
    event.preventDefault();
    if (dialog instanceof HTMLElement) dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  const active = document.activeElement;
  if (!dialog.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleManagedModalKeydown(event) {
  if (event.defaultPrevented || event.key !== 'Tab' || isWelcomeTourActive()) return;
  const top = modalStack.at(-1);
  if (!top) return;
  trapTab(event, top);
}

function ensureKeydownListener() {
  if (isKeydownListenerAttached) return;
  document.addEventListener('keydown', handleManagedModalKeydown, true);
  isKeydownListenerAttached = true;
}

function maybeRemoveKeydownListener() {
  if (modalStack.length || !isKeydownListenerAttached) return;
  document.removeEventListener('keydown', handleManagedModalKeydown, true);
  isKeydownListenerAttached = false;
}

export function openManagedModal(options = {}) {
  const { overlay } = options;
  if (!(overlay instanceof HTMLElement)) return false;

  const existingIndex = modalStack.findIndex(entry => entry.overlay === overlay);
  if (existingIndex !== -1) {
    modalStack.splice(existingIndex, 1);
  }

  modalStack.push({
    overlay,
    dialog: options.dialog ?? overlay.querySelector('[role="dialog"], .modal') ?? overlay,
    initialFocus: options.initialFocus ?? null,
    opener: options.opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
    onRequestClose: options.onRequestClose ?? null,
  });

  syncStackZIndexes();
  syncBodyInertness();
  ensureKeydownListener();
  focusEntry(modalStack.at(-1));
  return true;
}

export function closeManagedModal(overlay, options = {}) {
  const index = modalStack.findIndex(entry => entry.overlay === overlay);
  if (index === -1) return false;

  const [entry] = modalStack.splice(index, 1);
  entry.overlay.style.zIndex = '';
  syncStackZIndexes();
  syncBodyInertness();
  maybeRemoveKeydownListener();

  if (options.restoreFocus !== false) {
    focusOpener(entry);
  }
  return true;
}

export function requestCloseTopManagedModal() {
  const top = modalStack.at(-1);
  if (!top) return false;

  if (typeof top.onRequestClose === 'function') {
    const result = top.onRequestClose();
    return result !== false;
  }

  top.overlay.classList.add('hidden');
  closeManagedModal(top.overlay);
  return true;
}

export function isManagedModalOpen(overlay = null) {
  if (!overlay) return modalStack.length > 0;
  return modalStack.some(entry => entry.overlay === overlay);
}
