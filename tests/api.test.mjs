import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

const instant = new Date('2026-10-11T00:00:00Z');
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'quickshow-'));
  const dbPath = join(dir, 'test.sqlite');
  let server;
  let base;
  async function start(options = {}) {
    server = createApp({ dbPath, now: () => instant, ...options });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  await start();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  const request = async (
    path,
    { method = 'GET', body, cookie, headers = {} } = {},
  ) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };
  const register = async (email = 'viewer@example.com') =>
    request('/register', {
      method: 'POST',
      body: { name: 'Movie Fan', email, password: 'correct-horse-123' },
    });
  return {
    request,
    register,
    restart: async (options) => {
      await new Promise((resolve) => server.close(resolve));
      await start(options);
    },
  };
}

test('accounts, validation, favourites, sessions, logout, and access control', async (t) => {
  const { request, register } = await setup(t);
  assert.equal((await request('/bookings')).status, 401);
  assert.equal(
    (
      await request('/register', {
        method: 'POST',
        body: { name: 'A', email: 'bad', password: 'short' },
      })
    ).status,
    400,
  );
  const account = await register();
  assert.equal(account.status, 200);
  assert.equal(account.data.user.role, 'customer');
  assert.equal(account.data.user.password, undefined);
  const cookie = account.cookie;
  assert.equal((await register()).status, 409);
  assert.equal((await request('/me', { cookie })).data.user.name, 'Movie Fan');
  assert.equal((await request('/admin', { cookie })).status, 403);
  assert.equal(
    (
      await request('/login', {
        method: 'POST',
        body: { email: 'viewer@example.com', password: 'incorrect-password' },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/login', {
        method: 'POST',
        body: { email: 'viewer@example.com', password: 'correct-horse-123' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request('/favourites', {
        method: 'POST',
        cookie,
        body: { movieId: 1, saved: true },
      })
    ).status,
    200,
  );
  assert.deepEqual((await request('/favourites', { cookie })).data, [1]);
  await request('/favourites', {
    method: 'POST',
    cookie,
    body: { movieId: 1, saved: false },
  });
  assert.deepEqual((await request('/favourites', { cookie })).data, []);
  assert.equal(
    (
      await request('/favourites', {
        method: 'POST',
        cookie,
        body: { movieId: 999, saved: true },
      })
    ).status,
    400,
  );
  await request('/logout', { method: 'POST', cookie });
  assert.equal((await request('/me', { cookie })).data.user, null);
});

test('reservations calculate trusted prices, reject conflicts, persist, isolate customers, and release seats', async (t) => {
  const { request, register, restart } = await setup(t);
  const cookie = (await register()).cookie;
  const other = (await register('other@example.com')).cookie;
  const shows = (await request('/shows?movie=1')).data;
  assert.equal(shows.length, 28);
  const showId = shows[0].id;
  assert.equal((await request('/shows/invalid')).status, 404);
  for (const seats of [
    [],
    ['Z1'],
    ['A0'],
    ['A13'],
    ['A1', 'A1'],
    Array.from({ length: 9 }, (_, i) => `A${i + 1}`),
  ]) {
    assert.equal(
      (
        await request('/bookings', {
          method: 'POST',
          cookie,
          body: { showId, seats },
        })
      ).status,
      400,
    );
  }
  const result = await request('/bookings', {
    method: 'POST',
    cookie,
    body: { showId, seats: ['A1', 'F1'], total: 1 },
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.total, 500);
  assert.equal(result.data.status, 'reserved');
  assert.equal(
    (
      await request('/bookings', {
        method: 'POST',
        cookie: other,
        body: { showId, seats: ['A1', 'A2'] },
      })
    ).status,
    409,
  );
  assert.deepEqual((await request(`/shows/${showId}`)).data.occupied.sort(), [
    'A1',
    'F1',
  ]);
  assert.equal((await request('/bookings', { cookie: other })).data.length, 0);
  assert.equal(
    (
      await request(`/bookings/${result.data.id}/cancel`, {
        method: 'POST',
        cookie: other,
      })
    ).status,
    404,
  );
  await restart();
  assert.equal(
    (await request('/bookings', { cookie })).data[0].id,
    result.data.id,
  );
  assert.equal(
    (
      await request(`/bookings/${result.data.id}/cancel`, {
        method: 'POST',
        cookie,
      })
    ).status,
    200,
  );
  assert.deepEqual((await request(`/shows/${showId}`)).data.occupied, []);
  assert.equal(
    (
      await request('/bookings', {
        method: 'POST',
        cookie: other,
        body: { showId, seats: ['A1'] },
      })
    ).status,
    201,
  );
});

test('simultaneous reservation requests cannot double-book a seat', async (t) => {
  const { request, register } = await setup(t);
  const a = (await register()).cookie;
  const b = (await register('second@example.com')).cookie;
  const showId = (await request('/shows?movie=2')).data[0].id;
  const results = await Promise.all(
    [a, b].map((cookie) =>
      request('/bookings', {
        method: 'POST',
        cookie,
        body: { showId, seats: ['C5'] },
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test('admin provisioning, show controls, and cross-origin request protection', async (t) => {
  const { request, register, restart } = await setup(t);
  const cookie = (await register()).cookie;
  await restart({ adminEmail: 'viewer@example.com' });
  const dashboard = await request('/admin', { cookie });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.users, 1);
  const showId = dashboard.data.shows[0].id;
  assert.equal(
    (
      await request(`/admin/shows/${showId}`, {
        method: 'PATCH',
        cookie,
        body: { active: false },
      })
    ).status,
    200,
  );
  assert.equal((await request(`/shows/${showId}`)).status, 404);
  assert.equal(
    (
      await request('/bookings', {
        method: 'POST',
        cookie,
        body: { showId, seats: ['B1'] },
      })
    ).status,
    400,
  );
  await request(`/admin/shows/${showId}`, {
    method: 'PATCH',
    cookie,
    body: { active: true },
  });
  await request('/bookings', {
    method: 'POST',
    cookie,
    body: { showId, seats: ['B1'] },
  });
  assert.equal(
    (
      await request(`/admin/shows/${showId}`, {
        method: 'PATCH',
        cookie,
        body: { active: false },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('/logout', {
        method: 'POST',
        cookie,
        headers: { Origin: 'https://untrusted.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/logout', {
        method: 'POST',
        cookie,
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      })
    ).status,
    403,
  );
});

test('past shows reject booking and cancellation; expired sessions cannot access bookings', async (t) => {
  const { request, register, restart } = await setup(t);
  const cookie = (await register()).cookie;
  const showId = (await request('/shows?movie=1')).data[0].id;
  const booking = (
    await request('/bookings', {
      method: 'POST',
      cookie,
      body: { showId, seats: ['A1'] },
    })
  ).data;
  await restart({ now: () => new Date('2026-10-12T00:00:00Z') });
  assert.equal((await request(`/shows/${showId}`)).status, 404);
  assert.equal(
    (
      await request('/bookings', {
        method: 'POST',
        cookie,
        body: { showId, seats: ['A2'] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/bookings/${booking.id}/cancel`, {
        method: 'POST',
        cookie,
      })
    ).status,
    400,
  );
  await restart({ now: () => new Date('2026-10-19T00:00:00Z') });
  assert.equal((await request('/bookings', { cookie })).status, 401);
});
