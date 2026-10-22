import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createApp } from '../server/app.mjs';
import { openDatabase } from '../server/database.mjs';
import { importSqlite } from '../server/import-sqlite.mjs';
import { createVercelHandler } from '../server/vercel-handler.mjs';

test(
  'PostgreSQL persists across function instances, rolls back writes, and refuses duplicate imports',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const schema = 'test_' + randomBytes(8).toString('hex');
    await pool.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const databaseUrl = url.toString();
    const dir = mkdtempSync(join(tmpdir(), 'qs-pg-'));
    const sourcePath = join(dir, 'source.sqlite');
    const source = await createApp({ dbPath: sourcePath, databaseUrl: null });
    await new Promise((resolve) => source.close(resolve));
    await source.databaseClosed;
    const db = await openDatabase({ databaseUrl });
    const first = createVercelHandler({
      config: () => ({ databaseUrl, production: true }),
    });
    const second = createVercelHandler({
      config: () => ({ databaseUrl, production: true }),
    });
    let count = 0;
    const http = createServer(async (req, res) => {
      // Vercel may parse the JSON body before invoking the function.
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        req.body = raw ? JSON.parse(raw) : {};
      }
      await (++count % 2 ? first : second)(req, res);
    });
    await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
      await new Promise((resolve) => http.close(resolve));
      await first.close();
      await second.close();
      await db.close();
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
      rmSync(dir, { recursive: true, force: true });
    });
    const counts = await importSqlite(db, sourcePath);
    assert.equal(counts.movies, 5);
    await assert.rejects(importSqlite(db, sourcePath), /empty destination/);
    await assert.rejects(
      db.scope(async () => {
        await db
          .prepare(
            "INSERT INTO theatres(name,city,address) VALUES('Rolled back','X','Y')",
          )
          .run();
        throw new Error('rollback test');
      }, true),
      /rollback test/,
    );
    assert.equal(
      await db.scope(
        async () =>
          (
            await db
              .prepare(
                "SELECT count(*) AS n FROM theatres WHERE name='Rolled back'",
              )
              .get()
          ).n,
      ),
      0,
    );
    const base = `http://127.0.0.1:${http.address().port}`;
    const request = (path, options = {}) =>
      fetch(`${base}/api/index?__route=${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
      });
    const registration = await request('register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cloud Customer',
        email: 'cloud@example.com',
        password: 'cloud-password-123',
      }),
    });
    assert.equal(registration.status, 200);
    const cookie = registration.headers.get('set-cookie').split(';')[0];
    assert.match(registration.headers.get('set-cookie'), /Secure/);
    assert.equal(
      (await (await request('me', { headers: { Cookie: cookie } })).json()).user
        .email,
      'cloud@example.com',
    );
    const shows = await (await request('shows&movie=1')).json();
    assert.ok(shows.length);
    const book = () =>
      request('bookings', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: JSON.stringify({ showId: shows[0].id, seats: ['A1'] }),
      });
    const results = await Promise.all([book(), book()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(
      (
        await (
          await request('bookings', { headers: { Cookie: cookie } })
        ).json()
      ).length,
      1,
    );
    assert.equal((await request('missing')).status, 404);
    // Both failed logins and successful auth requests count across instances.
    for (let i = 0; i < 19; i++)
      assert.equal(
        (
          await request('login', {
            method: 'POST',
            body: JSON.stringify({
              email: 'cloud@example.com',
              password: 'wrong-password-123',
            }),
          })
        ).status,
        401,
      );
    assert.equal(
      (await request('login', { method: 'POST', body: '{}' })).status,
      429,
    );
  },
);
