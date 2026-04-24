import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('sort state normalization', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('maps stale year sort state to release_date', async () => {
    const { normalizeSortState } = await import('../public/js/state.js');

    expect(normalizeSortState({ field: 'year', order: 'asc' })).toEqual({
      field: 'release_date',
      order: 'asc',
    });
  });

  it('falls back to the default sort for unknown fields', async () => {
    const { normalizeSortState } = await import('../public/js/state.js');

    expect(normalizeSortState({ field: 'not-real', order: 'desc' })).toEqual({
      field: 'date_listened_planned',
      order: 'desc',
    });
  });
});
