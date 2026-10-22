import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeImage } from '../server/uploads.mjs';
import { postgresSQL } from '../server/database.mjs';
import { createVercelHandler } from '../server/vercel-handler.mjs';
import { readFileSync } from 'node:fs';

test('PostgreSQL adapter binds values and translates known SQLite query forms', () => {
  assert.equal(
    postgresSQL(
      "SELECT '?' AS literal FROM screens WHERE name=? COLLATE NOCASE",
    ),
    "SELECT '?' AS literal FROM screens WHERE lower(name)=lower($1)",
  );
  assert.equal(
    postgresSQL('INSERT OR IGNORE INTO favourites VALUES(?,?)'),
    'INSERT INTO favourites VALUES($1,$2) ON CONFLICT DO NOTHING',
  );
});
test('image uploads reject SVG, incorrect MIME types, and oversized images', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(
    decodeImage({ data: png.toString('base64'), contentType: 'image/png' })
      .extension,
    'png',
  );
  assert.throws(
    () =>
      decodeImage({
        data: Buffer.from('<svg/>').toString('base64'),
        contentType: 'image/svg+xml',
      }),
    { status: 400 },
  );
  assert.throws(
    () =>
      decodeImage({ data: png.toString('base64'), contentType: 'image/jpeg' }),
    { status: 400 },
  );
  assert.throws(
    () =>
      decodeImage({
        data: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64'),
        contentType: 'image/png',
      }),
    { status: 400 },
  );
});
test('Vercel function fails clearly when storage is not configured and retains API routes', async () => {
  let status, body;
  const res = {
    writeHead(value) {
      status = value;
    },
    end(value) {
      body = JSON.parse(value);
    },
  };
  await createVercelHandler({ config: () => ({}) })(
    { url: '/api/health' },
    res,
  );
  assert.equal(status, 503);
  assert.match(body.error, /DATABASE_URL/);
  let called = 0,
    received;
  const handler = createVercelHandler({
    config: () => ({ databaseUrl: 'test' }),
    createApplication: async () => {
      called++;
      return {
        listeners: () => [
          async (req) => {
            received = req.url;
          },
        ],
      };
    },
  });
  await handler({ url: '/api/index?__route=shows&movie=1' }, res);
  assert.equal(received, '/api/shows?movie=1');
  await handler(
    { url: '/api/index?__route=admin/bookings/QS-123/cancel' },
    res,
  );
  assert.equal(received, '/api/admin/bookings/QS-123/cancel');
  assert.equal(called, 1);
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(config.rewrites[0].source, '/api/:path*');
  assert.equal(config.rewrites[1].destination, '/index.html');
});
