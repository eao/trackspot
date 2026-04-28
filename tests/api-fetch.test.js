import { afterEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

async function loadApiFetch() {
  vi.resetModules();
  const { apiFetch } = await import('../public/js/state.js');
  return apiFetch;
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('apiFetch', () => {
  it('preserves caller headers while adding JSON defaults for JSON bodies', async () => {
    const apiFetch = await loadApiFetch();
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true }));

    await apiFetch('/api/example', {
      method: 'POST',
      headers: { 'X-Trackspot-Test': 'yes' },
      body: JSON.stringify({ name: 'Album' }),
    });

    const [, request] = globalThis.fetch.mock.calls[0];
    expect(request.headers.get('Accept')).toBe('application/json');
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(request.headers.get('X-Trackspot-Test')).toBe('yes');
  });

  it('does not set Content-Type for FormData bodies', async () => {
    const apiFetch = await loadApiFetch();
    const form = new FormData();
    form.append('name', 'Album');
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true }));

    await apiFetch('/api/upload', {
      method: 'POST',
      body: form,
    });

    const [, request] = globalThis.fetch.mock.calls[0];
    expect(request.headers.get('Accept')).toBe('application/json');
    expect(request.headers.has('Content-Type')).toBe(false);
  });

  it('throws Error objects with status and data for JSON API errors', async () => {
    const apiFetch = await loadApiFetch();
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { error: 'Validation failed.', field: 'rating' },
      { status: 422, statusText: 'Unprocessable Entity' },
    ));

    let thrown;
    try {
      await apiFetch('/api/example');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({
      message: 'Validation failed.',
      status: 422,
      data: { error: 'Validation failed.', field: 'rating' },
    });
  });

  it('surfaces non-JSON responses with a useful error', async () => {
    const apiFetch = await loadApiFetch();
    globalThis.fetch = vi.fn(async () => new Response('<!doctype html>', {
      status: 404,
      statusText: 'Not Found',
      headers: { 'Content-Type': 'text/html' },
    }));

    let thrown;
    try {
      await apiFetch('/api/not-a-route');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({
      message: 'Request failed with a non-JSON response (404).',
      status: 404,
      data: '<!doctype html>',
    });
  });
});
