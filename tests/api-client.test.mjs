import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

test('API client returns JSON and preserves structured server errors', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  fetch.mock.mockImplementation(
    async () => new Response(JSON.stringify({ user: null })),
  );
  assert.deepEqual(await api('/me'), { user: null });
  fetch.mock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ error: 'Please sign in.' }), {
        status: 401,
      }),
  );
  await assert.rejects(api('/bookings'), {
    message: 'Please sign in.',
    status: 401,
  });
});

test('API client handles empty, HTML, malformed, and network responses without leaking JSON parser errors', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const [body, status] of [
    ['', 500],
    ['<html>Proxy error</html>', 502],
    ['{"user":', 200],
    ['', 200],
  ]) {
    fetch.mock.mockImplementation(async () => new Response(body, { status }));
    await assert.rejects(api('/me'), {
      message: /booking service is unavailable/,
      status,
    });
  }
  fetch.mock.mockImplementation(async () => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(api('/me'), { message: /Cannot connect/ });
  fetch.mock.mockImplementation(
    async () => new Response(null, { status: 204 }),
  );
  assert.equal(await api('/logout'), null);
});
