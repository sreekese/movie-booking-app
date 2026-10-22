import { openDatabase } from '../server/database.mjs';
import { importSqlite } from '../server/import-sqlite.mjs';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

const instant = new Date('2026-10-11T00:00:00Z');
async function setup(t, appOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'quickshow-'));
  const dbPath = join(dir, 'test.sqlite');
  let databaseUrl = null;
  let adminPool;
  let schema;
  if (process.env.TEST_DATABASE_URL) {
    schema = 'test_' + randomBytes(8).toString('hex');
    adminPool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    databaseUrl = url.toString();
    const seed = await createApp({
      dbPath,
      databaseUrl: null,
      now: () => instant,
    });
    await new Promise((resolve) => seed.close(resolve));
    await seed.databaseClosed;
    const db = await openDatabase({ databaseUrl });
    try {
      await importSqlite(db, dbPath);
    } finally {
      await db.close();
    }
  }
  let server;
  let base;
  async function start(options = {}) {
    server = await createApp({
      dbPath,
      databaseUrl,
      now: () => instant,
      ...appOptions,
      ...options,
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  await start();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await server.databaseClosed;
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
      await adminPool.end();
    }
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
      await server.databaseClosed;
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

test('admin catalogue CRUD persists, validates input, preserves tickets, and audits changes', async (t) => {
  const { request, register, restart } = await setup(t);
  const admin = (await register()).cookie;
  const customer = (await register('customer@example.com')).cookie;
  await restart({ adminEmail: 'viewer@example.com' });
  const original = (await request('/movies')).data[0];
  const input = {
    ...original,
    title: 'A New Film',
    duration: '90m',
    premiumPrice: 80,
  };
  assert.equal(
    (
      await request('/admin/movies', {
        method: 'POST',
        cookie: customer,
        body: input,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/admin/movies', {
        method: 'POST',
        cookie: admin,
        body: { ...input, poster: 'javascript:alert(1)' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/admin/movies', {
        method: 'POST',
        cookie: admin,
        body: { ...input, price: -1 },
      })
    ).status,
    400,
  );
  const created = await request('/admin/movies', {
    method: 'POST',
    cookie: admin,
    body: input,
  });
  assert.equal(created.status, 201);
  const movieId = created.data.id;
  const screening = {
    movie_id: movieId,
    screen: 'Studio A',
    date: '2026-10-12',
    time: '14:00',
    active: true,
  };
  const show = await request('/admin/shows', {
    method: 'POST',
    cookie: admin,
    body: screening,
  });
  assert.equal(show.status, 201);
  const showId = show.data.id;
  assert.equal(
    (
      await request('/admin/shows', {
        method: 'POST',
        cookie: admin,
        body: { ...screening, time: '15:30' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('/admin/shows', {
        method: 'POST',
        cookie: admin,
        body: { ...screening, date: '2026-02-30' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/bookings', {
        method: 'POST',
        cookie: customer,
        body: { showId, seats: ['F1'], expectedTotal: 1 },
      })
    ).status,
    409,
  );
  const reservation = await request('/bookings', {
    method: 'POST',
    cookie: customer,
    body: { showId, seats: ['F1'] },
  });
  assert.equal(reservation.status, 201);
  assert.equal(reservation.data.total, input.price + 80);
  assert.equal(reservation.data.screen, 'Studio A');
  assert.equal(
    (
      await request(`/admin/shows/${showId}`, {
        method: 'DELETE',
        cookie: admin,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/admin/shows/${showId}`, {
        method: 'PUT',
        cookie: admin,
        body: { ...screening, time: '17:00' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/admin/movies/${movieId}`, {
        method: 'PATCH',
        cookie: admin,
        body: { archived: true },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/admin/movies/${movieId}`, {
        method: 'PUT',
        cookie: admin,
        body: { ...input, title: 'Edited Film', price: 400 },
      })
    ).status,
    200,
  );
  const ticket = (await request('/bookings', { cookie: customer })).data[0];
  assert.equal(ticket.movie.title, 'A New Film');
  assert.equal(ticket.total, input.price + 80);
  assert.equal(
    (
      await request(`/admin/bookings/${reservation.data.id}/cancel`, {
        method: 'POST',
        cookie: admin,
      })
    ).status,
    201,
  );
  assert.deepEqual((await request(`/shows/${showId}`)).data.occupied, []);
  assert.equal(
    (
      await request(`/admin/movies/${movieId}`, {
        method: 'PATCH',
        cookie: admin,
        body: { archived: true },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request('/movies')).data.some((m) => m.id === movieId),
    false,
  );
  assert.equal((await request(`/shows/${showId}`)).status, 404);
  assert.equal(
    (
      await request(`/admin/movies/${movieId}`, {
        method: 'DELETE',
        cookie: admin,
      })
    ).status,
    409,
  );
  const disposable = (
    await request('/admin/movies', {
      method: 'POST',
      cookie: admin,
      body: { ...input, title: 'Disposable' },
    })
  ).data;
  const disposableShow = (
    await request('/admin/shows', {
      method: 'POST',
      cookie: admin,
      body: { ...screening, movie_id: disposable.id, screen: 'Studio B' },
    })
  ).data;
  assert.equal(
    (
      await request(`/admin/shows/${disposableShow.id}`, {
        method: 'PUT',
        cookie: admin,
        body: {
          ...screening,
          movie_id: disposable.id,
          screen: 'Studio B',
          time: '18:00',
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/admin/shows/${disposableShow.id}`, {
        method: 'DELETE',
        cookie: admin,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/admin/movies/${disposable.id}`, {
        method: 'DELETE',
        cookie: admin,
      })
    ).status,
    200,
  );
  const initial = (await request('/shows?movie=1')).data[0];
  await request(`/admin/shows/${initial.id}`, {
    method: 'DELETE',
    cookie: admin,
  });
  await restart();
  const dashboard = (await request('/admin', { cookie: admin })).data;
  assert.equal(
    dashboard.movies.find((m) => m.id === movieId).title,
    'Edited Film',
  );
  assert.equal(
    dashboard.shows.some((s) => s.id === initial.id),
    false,
  );
  assert.equal(
    dashboard.movies.some((m) => m.id === disposable.id),
    false,
  );
  assert.ok(dashboard.audit.some((a) => a.action === 'movie.deleted'));
});

test('admin account management protects self access, booking history, and private credentials', async (t) => {
  const { request, register, restart } = await setup(t);
  const admin = (await register()).cookie;
  await restart({ adminEmail: 'viewer@example.com' });
  const userData = {
    name: 'Managed Customer',
    email: 'managed@example.com',
    role: 'customer',
    password: 'managed-password-123',
  };
  const created = await request('/admin/users', {
    method: 'POST',
    cookie: admin,
    body: userData,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.password, undefined);
  assert.equal(
    (
      await request('/admin/users', {
        method: 'POST',
        cookie: admin,
        body: userData,
      })
    ).status,
    409,
  );
  const id = created.data.id;
  const login = await request('/login', { method: 'POST', body: userData });
  assert.equal(login.status, 200);
  assert.equal(
    (
      await request(`/admin/users/${id}`, {
        method: 'PUT',
        cookie: admin,
        body: { ...userData, role: 'admin' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request('/me', { cookie: login.cookie })).data.user,
    null,
  );
  const dashboard = (await request('/admin', { cookie: admin })).data;
  assert.ok(dashboard.customers.every((u) => !('password' in u)));
  const self = dashboard.customers.find(
    (u) => u.email === 'viewer@example.com',
  );
  assert.equal(
    (
      await request(`/admin/users/${self.id}`, {
        method: 'DELETE',
        cookie: admin,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/admin/users/${self.id}`, {
        method: 'PUT',
        cookie: admin,
        body: { ...self, role: 'customer' },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`/admin/users/${id}`, { method: 'DELETE', cookie: admin }))
      .status,
    200,
  );
});

test('multiple theatres isolate screen conflicts and preserve booking venue snapshots', async (t) => {
  const { request, register, restart } = await setup(t);
  await register('operator@example.com');
  await restart({ adminEmail: 'operator@example.com' });
  const login = await request('/login', {
    method: 'POST',
    body: { email: 'operator@example.com', password: 'correct-horse-123' },
  });
  const cookie = login.cookie;
  const customer = await register('guest@example.com');
  const venue = {
    name: 'City Cinema',
    city: 'Kochi',
    address: '12 Main Street',
  };
  assert.equal(
    (
      await request('/admin/theatres', {
        method: 'POST',
        cookie: customer.cookie,
        body: venue,
      })
    ).status,
    403,
  );
  const theatre = await request('/admin/theatres', {
    method: 'POST',
    cookie,
    body: venue,
  });
  assert.equal(theatre.status, 201);
  const show = {
    movie_id: 1,
    date: '2026-11-01',
    time: '12:00',
    screen: '1',
    active: true,
    theatre_id: theatre.data.id,
  };
  const first = await request('/admin/shows', {
    method: 'POST',
    cookie,
    body: show,
  });
  assert.equal(first.status, 201);
  assert.equal(
    (await request('/admin/shows', { method: 'POST', cookie, body: show }))
      .status,
    409,
  );
  assert.equal(
    (
      await request('/admin/shows', {
        method: 'POST',
        cookie,
        body: { ...show, theatre_id: 1 },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request('/admin/shows', {
        method: 'POST',
        cookie,
        body: { ...show, theatre_id: 9999 },
      })
    ).status,
    400,
  );
  const publicShow = await request(`/shows/${first.data.id}`);
  assert.equal(publicShow.data.theatre.name, venue.name);
  const movieVenues = (await request('/movies')).data.find(
    (m) => m.id === 1,
  ).theatres;
  assert.ok(
    movieVenues.some((t) => t.id === theatre.data.id && t.name === venue.name),
  );
  assert.equal(movieVenues.filter((t) => t.id === theatre.data.id).length, 1);
  await request(`/admin/shows/${first.data.id}`, {
    method: 'PATCH',
    cookie,
    body: { active: false },
  });
  assert.ok(
    !(await request('/movies')).data
      .find((m) => m.id === 1)
      .theatres.some((t) => t.id === theatre.data.id),
  );
  await request(`/admin/shows/${first.data.id}`, {
    method: 'PATCH',
    cookie,
    body: { active: true },
  });

  const booking = await request('/bookings', {
    method: 'POST',
    cookie: customer.cookie,
    body: { showId: first.data.id, seats: ['A1'] },
  });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  assert.equal(
    (
      await request(`/admin/theatres/${theatre.data.id}`, {
        method: 'DELETE',
        cookie,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/admin/theatres/${theatre.data.id}`, {
        method: 'PUT',
        cookie,
        body: { ...venue, name: 'Renamed Cinema' },
      })
    ).status,
    200,
  );
  const bookings = await request('/bookings', { cookie: customer.cookie });
  assert.equal(bookings.data[0].theatre.name, venue.name);
  await restart();
  assert.equal(
    (await request(`/shows/${first.data.id}`)).data.theatre.name,
    'Renamed Cinema',
  );
  assert.equal((await request('/theatres')).data.length, 2);
});

test('theatre admins are scoped and screen layout versions preserve booking seats and pricing', async (t) => {
  const { request, register, restart } = await setup(t);
  await register('owner@example.com');
  await restart({ adminEmail: 'owner@example.com' });
  const login = (email) =>
    request('/login', {
      method: 'POST',
      body: { email, password: 'correct-horse-123' },
    });
  const owner = (await login('owner@example.com')).cookie;
  const customer = (await register('customer@example.com')).cookie;
  const venue = (
    await request('/admin/theatres', {
      method: 'POST',
      cookie: owner,
      body: { name: 'Other Cinema', city: 'Kochi', address: 'Cinema Street' },
    })
  ).data;
  const manager = (
    await request('/admin/users', {
      method: 'POST',
      cookie: owner,
      body: {
        name: 'Theatre Manager',
        email: 'manager@example.com',
        password: 'correct-horse-123',
        role: 'theatre_admin',
        theatre_ids: [venue.id],
      },
    })
  ).data;
  let cookie = (await login('manager@example.com')).cookie;
  const layout = {
    rows: [
      { label: 'A', count: 4, premium: true, aisles: [1, 3], gapAfter: 48 },
      { label: 'Z', count: 3, premium: false, aisle: 0 },
    ],
    blocked: ['A4'],
    accessible: ['Z1'],
  };
  assert.equal(
    (
      await request('/admin/screens', {
        method: 'POST',
        cookie,
        body: { theatre_id: 1, name: 'Forbidden', layout },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/admin/screens', {
        method: 'POST',
        cookie,
        body: { theatre_id: venue.id, name: 'Studio', layout },
      })
    ).status,
    201,
  );
  const dashboard = (await request('/admin', { cookie })).data;
  assert.deepEqual(
    dashboard.theatres.map((t) => t.id),
    [venue.id],
  );
  assert.equal(dashboard.customers.length, 0);
  assert.equal(dashboard.audit.length, 0);
  assert.equal(dashboard.shows.length, 0);
  assert.equal(
    (await request('/admin/users', { method: 'POST', cookie, body: {} }))
      .status,
    403,
  );
  assert.equal(
    (await request('/admin/movies/1', { method: 'DELETE', cookie })).status,
    403,
  );
  assert.equal(
    (await request(`/admin/theatres/${venue.id}`, { method: 'DELETE', cookie }))
      .status,
    403,
  );
  const input = {
    theatre_id: venue.id,
    movie_id: 1,
    screen: 'Studio',
    date: '2026-11-03',
    time: '12:00',
    active: true,
  };
  const show = (
    await request('/admin/shows', { method: 'POST', cookie, body: input })
  ).data;
  assert.equal(
    (
      await request('/admin/shows', {
        method: 'POST',
        cookie,
        body: { ...input, theatre_id: 1 },
      })
    ).status,
    403,
  );
  const foreign = (
    await request('/admin/shows', {
      method: 'POST',
      cookie: owner,
      body: { ...input, theatre_id: 1 },
    })
  ).data;
  for (const method of ['PUT', 'PATCH', 'DELETE'])
    assert.equal(
      (
        await request(`/admin/shows/${foreign.id}`, {
          method,
          cookie,
          body: { ...input, active: false },
        })
      ).status,
      403,
    );
  const reserve = (showId, seats) =>
    request('/bookings', {
      method: 'POST',
      cookie: customer,
      body: { showId, seats },
    });
  assert.equal((await reserve(show.id, ['A4'])).status, 400);
  assert.equal((await reserve(show.id, ['H1'])).status, 400);
  const booked = await reserve(show.id, ['A1', 'Z1']);
  assert.equal(booked.status, 201);
  assert.equal(booked.data.total, 500);
  assert.deepEqual(booked.data.layout, layout);
  const foreignBooking = (await reserve(foreign.id, ['A1'])).data;
  assert.equal(
    (
      await request(`/admin/bookings/${foreignBooking.id}/cancel`, {
        method: 'POST',
        cookie,
      })
    ).status,
    403,
  );
  const screen = dashboard.screens[0];
  for (const gapAfter of [-1, 17, 100, '48', null]) {
    assert.equal(
      (
        await request(`/admin/screens/${screen.id}`, {
          method: 'PUT',
          cookie,
          body: {
            layout: {
              ...layout,
              rows: layout.rows.map((row) => ({ ...row, gapAfter })),
            },
          },
        })
      ).status,
      400,
    );
  }

  for (const aisles of [[1, 1], [0], [4], ['2'], [1.5]]) {
    assert.equal(
      (
        await request(`/admin/screens/${screen.id}`, {
          method: 'PUT',
          cookie,
          body: {
            layout: {
              ...layout,
              rows: [{ label: 'A', count: 4, premium: false, aisles }],
            },
          },
        })
      ).status,
      400,
    );
  }

  const newLayout = {
    ...layout,
    rows: [{ label: 'B', count: 2, premium: false, aisle: 0 }],
    blocked: [],
    accessible: [],
  };
  assert.equal(
    (
      await request(`/admin/screens/${screen.id}`, {
        method: 'PUT',
        cookie,
        body: { layout: newLayout },
      })
    ).status,
    200,
  );
  assert.deepEqual((await request(`/shows/${show.id}`)).data.layout, layout);
  const next = (
    await request('/admin/shows', {
      method: 'POST',
      cookie,
      body: { ...input, time: '18:00' },
    })
  ).data;
  assert.deepEqual((await request(`/shows/${next.id}`)).data.layout, newLayout);
  assert.equal((await reserve(next.id, ['A1'])).status, 400);
  assert.equal((await reserve(next.id, ['B1'])).status, 201);
  const stats = (await request('/admin', { cookie })).data;
  assert.ok(stats.bookings.every((b) => b.theatre_id === venue.id));
  assert.equal(stats.stats[0].seats, 3);
  assert.equal(stats.stats[0].capacity, 8);
  assert.equal(stats.stats[0].value, 720);
  assert.equal(
    (
      await request(`/admin/bookings/${booked.data.id}/cancel`, {
        method: 'POST',
        cookie,
      })
    ).status,
    201,
  );
  assert.equal(
    (await request('/admin', { cookie })).data.stats[0].cancellations,
    1,
  );
  await request(`/admin/users/${manager.id}`, {
    method: 'PUT',
    cookie: owner,
    body: {
      name: 'Theatre Manager',
      email: 'manager@example.com',
      role: 'theatre_admin',
      theatre_ids: [1],
    },
  });
  assert.equal((await request('/admin', { cookie })).status, 401);
  cookie = (await login('manager@example.com')).cookie;
  assert.equal(
    (
      await request(`/admin/screens/${screen.id}`, {
        method: 'PUT',
        cookie,
        body: { layout },
      })
    ).status,
    403,
  );
  await restart();
  assert.deepEqual((await request(`/shows/${show.id}`)).data.layout, layout);
});

test('saving categories updates unbooked upcoming shows, validates prices and rejects stale layout reservations', async (t) => {
  const { request, register, restart } = await setup(t);
  await register('layout-owner@example.com');
  await restart({ adminEmail: 'layout-owner@example.com' });
  const cookie = (
    await request('/login', {
      method: 'POST',
      body: {
        email: 'layout-owner@example.com',
        password: 'correct-horse-123',
      },
    })
  ).cookie;
  const customer = (await register('layout-viewer@example.com')).cookie;
  const input = {
    theatre_id: 1,
    movie_id: 1,
    screen: 'Category Studio',
    date: '2026-11-04',
    time: '12:00',
    active: true,
  };
  const show = (
    await request('/admin/shows', { method: 'POST', cookie, body: input })
  ).data;
  const screen = (await request('/admin', { cookie })).data.screens.find(
    (s) => s.name === input.screen,
  );
  const layout = {
    rows: [
      {
        label: 'A',
        count: 4,
        premium: false,
        aisles: [2],
        category: 'Sofa',
        price: 450,
      },
      {
        label: 'B',
        count: 4,
        premium: false,
        aisles: [2],
        category: 'Sofa',
        price: 450,
      },
    ],
    blocked: [],
    accessible: [],
  };
  for (const price of [0, -1, 1.5, 10001, '450'])
    assert.equal(
      (
        await request(`/admin/screens/${screen.id}`, {
          method: 'PUT',
          cookie,
          body: { layout: { ...layout, rows: [{ ...layout.rows[0], price }] } },
        })
      ).status,
      400,
    );
  const saved = await request(`/admin/screens/${screen.id}`, {
    method: 'PUT',
    cookie,
    body: { layout },
  });
  assert.equal(saved.data.updatedShows, 1);
  assert.equal(saved.data.preservedShows, 0);
  assert.deepEqual((await request(`/shows/${show.id}`)).data.layout, layout);
  assert.equal(
    (
      await request('/bookings', {
        method: 'POST',
        cookie: customer,
        body: { showId: show.id, seats: ['A1'], expectedLayoutVersion: 1 },
      })
    ).status,
    409,
  );
  const booking = await request('/bookings', {
    method: 'POST',
    cookie: customer,
    body: {
      showId: show.id,
      seats: ['A1', 'B1'],
      expectedLayoutVersion: 2,
      expectedTotal: 900,
    },
  });
  assert.equal(booking.status, 201);
  assert.equal(booking.data.total, 900);
  const changed = await request(`/admin/screens/${screen.id}`, {
    method: 'PUT',
    cookie,
    body: { layout: { ...layout, rows: [{ ...layout.rows[0], price: 600 }] } },
  });
  assert.equal(changed.data.updatedShows, 0);
  assert.equal(changed.data.preservedShows, 1);
  assert.deepEqual((await request(`/shows/${show.id}`)).data.layout, layout);
});

test('only super admins can upload movie images; uploads persist hosted URLs', async (t) => {
  let stored = 0;
  const { request, register, restart } = await setup(t, {
    storeImage: async (input) => {
      stored++;
      assert.equal(input.contentType, 'image/png');
      return {
        url: 'https://example.public.blob.vercel-storage.com/poster.png',
      };
    },
  });
  assert.equal(
    (await request('/admin/uploads', { method: 'POST', body: {} })).status,
    401,
  );
  const viewer = await register();
  assert.equal(
    (
      await request('/admin/uploads', {
        method: 'POST',
        cookie: viewer.cookie,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(stored, 0);
  await restart({ adminEmail: 'viewer@example.com' });
  const login = await request('/login', {
    method: 'POST',
    body: { email: 'viewer@example.com', password: 'correct-horse-123' },
  });
  const result = await request('/admin/uploads', {
    method: 'POST',
    cookie: login.cookie,
    body: { contentType: 'image/png', data: 'test' },
  });
  assert.equal(result.status, 201);
  assert.match(result.data.url, /blob.vercel-storage.com/);
  assert.equal(stored, 1);
});
