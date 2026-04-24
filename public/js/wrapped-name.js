import { state, el } from './state.js';
import { patchPreferences } from './preferences.js';

export const WRAPPED_NAME_EVENT = 'trackspot:wrapped-name-changed';

function normalizeWrappedName(value) {
  return typeof value === 'string' ? value : '';
}

export function syncWrappedNameSettingsInput() {
  if (!el.inputWrappedName) return;
  const nextValue = normalizeWrappedName(state.wrappedName);
  if (el.inputWrappedName.value !== nextValue) {
    el.inputWrappedName.value = nextValue;
  }
}

export function setWrappedName(value, options = {}) {
  const { syncInput = true, notify = true } = options;
  state.wrappedName = normalizeWrappedName(value);
  if (syncInput) syncWrappedNameSettingsInput();
  if (notify) {
    window.dispatchEvent(new CustomEvent(WRAPPED_NAME_EVENT, {
      detail: { value: state.wrappedName },
    }));
  }
  return state.wrappedName;
}

export function persistWrappedName(value = state.wrappedName) {
  const normalized = normalizeWrappedName(value);
  if (state.wrappedName !== normalized) {
    setWrappedName(normalized);
  }
  return patchPreferences({
    wrappedName: normalized,
  }).catch(error => {
    console.error('Failed to save Wrapped name:', error);
    return null;
  });
}
