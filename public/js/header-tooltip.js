import { state, el } from './state.js';

export function syncHeaderTooltip() {
  if (!el.headerTooltip) return;
  const totalMs = state.albumListMeta?.trackedListenedMs ?? 0;
  const hours = Math.floor(totalMs / 3_600_000);
  el.headerTooltip.textContent = `Tracking ${hours} ${hours === 1 ? 'hour' : 'hours'} of music!`;
}
