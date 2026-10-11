import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import movies from '../src/data/data.js';

export function createApp({
  dbPath = 'server/data/quickshow.sqlite',
  production = false,
  adminEmail = '',
  origin = '',
  now = () => new Date(),
} = {}) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer');
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS favourites(user_id INTEGER REFERENCES users(id), movie_id INTEGER, PRIMARY KEY(user_id,movie_id));
    CREATE TABLE IF NOT EXISTS shows(id TEXT PRIMARY KEY, movie_id INTEGER NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, starts_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), show_id TEXT REFERENCES shows(id), seats TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'reserved', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS seats(show_id TEXT REFERENCES shows(id), seat TEXT, booking_id TEXT REFERENCES bookings(id), PRIMARY KEY(show_id,seat));`);
  const attempts = new Map();
  const publicUser = (u) =>
    u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null;
  function seedShows() {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now());
    const start = new Date(`${today}T12:00:00+05:30`);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO shows(id,movie_id,date,time,starts_at) VALUES(?,?,?,?,?)',
    );
    for (let day = 0; day < 7; day++) {
      const date = new Date(start.getTime() + day * 86400000)
        .toISOString()
        .slice(0, 10);
      for (const movie of movies)
        for (const [index, time] of movie.showTimings.entries()) {
          const [, h, m, period] = time.match(/(\d+):(\d+) (AM|PM)/);
          const hour = (Number(h) % 12) + (period === 'PM' ? 12 : 0);
          insert.run(
            `${movie.id}-${date}-${index}`,
            movie.id,
            date,
            time,
            new Date(
              `${date}T${String(hour).padStart(2, '0')}:${m}:00+05:30`,
            ).toISOString(),
          );
        }
    }
  }
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  const getShow = (id) => db.prepare('SELECT * FROM shows WHERE id=?').get(id);
  const getBookings = (userId) =>
    db
      .prepare(
        `SELECT b.*, s.movie_id, s.date, s.time, s.starts_at, u.name, u.email FROM bookings b JOIN shows s ON s.id=b.show_id JOIN users u ON u.id=b.user_id ${userId ? 'WHERE b.user_id=?' : ''} ORDER BY b.created_at DESC`,
      )
      .all(...(userId ? [userId] : []))
      .map((b) => ({
        ...b,
        seats: JSON.parse(b.seats),
        movie: movies.find((m) => m.id === b.movie_id),
      }));
  async function body(req) {
    let data = '';
    for await (const chunk of req) {
      data += chunk;
      if (Buffer.byteLength(data) > 16384) fail(413, 'Request too large.');
    }
    try {
      const parsed = JSON.parse(data || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        fail(400, 'Invalid request.');
      return parsed;
    } catch {
      fail(400, 'Invalid JSON request.');
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' https://image.tmdb.org data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    const json = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (!path.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method))
          fail(405, 'Method not allowed.');
        const root = resolve('dist');
        let file = resolve(root, `.${decodeURIComponent(path)}`);
        if (!file.startsWith(`${root}/`) && file !== root)
          fail(404, 'Not found.');
        if (!existsSync(file) || !statSync(file).isFile())
          file = resolve(root, 'index.html');
        if (!existsSync(file))
          fail(404, 'Build the frontend first with npm run build.');
        const types = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.ico': 'image/x-icon',
        };
        res.writeHead(200, {
          'Content-Type': types[extname(file)] || 'application/octet-stream',
          'Cache-Control': file.includes('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        });
        return res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers['sec-fetch-site'] === 'cross-site')
          fail(403, 'Cross-site request blocked.');
        if (
          req.headers.origin &&
          req.headers.origin !==
            (origin || `${production ? 'https' : 'http'}://${req.headers.host}`)
        )
          fail(403, 'Invalid request origin.');
        if (req.headers['content-type']?.split(';')[0] !== 'application/json')
          fail(415, 'Use application/json.');
      }
      seedShows();
      const rawToken =
        req.headers.cookie
          ?.split(';')
          .map((x) => x.trim())
          .find((x) => x.startsWith('qs_session='))
          ?.slice(11) || '';
      const token = createHash('sha256').update(rawToken).digest('hex');
      const user = db
        .prepare(
          'SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',
        )
        .get(token, now().getTime());
      const requireUser = () => {
        if (!user) fail(401, 'Please sign in to continue.');
      };
      const requireAdmin = () => {
        requireUser();
        if (user.role !== 'admin') fail(403, 'Administrator access required.');
      };
      if (path === '/api/health' && req.method === 'GET')
        return json(200, { status: 'ok' });
      if (path === '/api/me' && req.method === 'GET')
        return json(200, { user: publicUser(user) });
      if (
        ['/api/register', '/api/login'].includes(path) &&
        req.method === 'POST'
      ) {
        const key = req.socket.remoteAddress;
        const rate = attempts.get(key) || { count: 0, until: 0 };
        if (rate.until < now().getTime()) {
          rate.count = 0;
          rate.until = now().getTime() + 900000;
        }
        if (++rate.count > 20)
          fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
        attempts.set(key, rate);
        const input = await body(req);
        const email =
          typeof input.email === 'string'
            ? input.email.trim().toLowerCase()
            : '';
        const password = input.password;
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254 ||
          typeof password !== 'string' ||
          password.length < 8 ||
          password.length > 128
        )
          fail(400, 'Enter a valid email and a password of 8–128 characters.');
        let account = db
          .prepare('SELECT * FROM users WHERE email=?')
          .get(email);
        if (path === '/api/register') {
          const name = typeof input.name === 'string' ? input.name.trim() : '';
          if (name.length < 2 || name.length > 80)
            fail(400, 'Name must be 2–80 characters.');
          if (account) fail(409, 'An account with this email already exists.');
          const salt = randomBytes(16).toString('hex');
          db.prepare(
            'INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',
          ).run(
            name,
            email,
            `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
            'customer',
          );
          account = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        } else {
          const [salt, hash] = (
            account?.password || `${'0'.repeat(32)}:${'0'.repeat(128)}`
          ).split(':');
          const valid = timingSafeEqual(
            Buffer.from(hash, 'hex'),
            scryptSync(password, salt, 64),
          );
          if (!account || !valid) fail(401, 'Email or password is incorrect.');
        }
        // Admin access is provisioned only for existing accounts at server startup.
        const secret = randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(
          now().getTime(),
        );
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
          createHash('sha256').update(secret).digest('hex'),
          account.id,
          now().getTime() + 604800000,
        );
        res.setHeader(
          'Set-Cookie',
          `qs_session=${secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${production ? '; Secure' : ''}`,
        );
        return json(200, { user: publicUser(account) });
      }
      if (path === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(token);
        res.setHeader(
          'Set-Cookie',
          'qs_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
        );
        return json(200, { ok: true });
      }
      if (path === '/api/movies' && req.method === 'GET')
        return json(200, movies);
      if (path === '/api/shows' && req.method === 'GET')
        return json(
          200,
          db
            .prepare(
              'SELECT * FROM shows WHERE movie_id=? AND active=1 AND starts_at>? ORDER BY starts_at',
            )
            .all(Number(url.searchParams.get('movie')), now().toISOString()),
        );
      if (path.startsWith('/api/shows/') && req.method === 'GET') {
        const show = getShow(path.split('/')[3]);
        if (!show || !show.active || show.starts_at <= now().toISOString())
          fail(404, 'This screening is no longer available.');
        return json(200, {
          ...show,
          movie: movies.find((m) => m.id === show.movie_id),
          occupied: db
            .prepare('SELECT seat FROM seats WHERE show_id=?')
            .all(show.id)
            .map((s) => s.seat),
        });
      }
      if (path === '/api/favourites') {
        requireUser();
        if (req.method === 'GET')
          return json(
            200,
            db
              .prepare('SELECT movie_id FROM favourites WHERE user_id=?')
              .all(user.id)
              .map((f) => f.movie_id),
          );
        if (req.method === 'POST') {
          const { movieId, saved } = await body(req);
          if (
            !movies.some((m) => m.id === movieId) ||
            typeof saved !== 'boolean'
          )
            fail(400, 'Invalid favourite.');
          if (saved)
            db.prepare('INSERT OR IGNORE INTO favourites VALUES(?,?)').run(
              user.id,
              movieId,
            );
          else
            db.prepare(
              'DELETE FROM favourites WHERE user_id=? AND movie_id=?',
            ).run(user.id, movieId);
          return json(200, { ok: true });
        }
      }
      if (path === '/api/bookings') {
        requireUser();
        if (req.method === 'GET') return json(200, getBookings(user.id));
        if (req.method === 'POST') {
          const { showId, seats } = await body(req);
          if (
            typeof showId !== 'string' ||
            !Array.isArray(seats) ||
            !seats.length ||
            seats.length > 8 ||
            new Set(seats).size !== seats.length ||
            seats.some(
              (s) =>
                typeof s !== 'string' || !/^[A-H](?:[1-9]|10|11|12)$/.test(s),
            )
          )
            fail(400, 'Select between 1 and 8 valid, unique seats.');
          const show = getShow(showId);
          if (!show || !show.active || show.starts_at <= now().toISOString())
            fail(400, 'This screening is no longer available.');
          const movie = movies.find((m) => m.id === show.movie_id);
          const total = seats.reduce(
            (sum, seat) => sum + movie.price + (seat[0] >= 'F' ? 60 : 0),
            0,
          );
          const id = `QS-${randomBytes(6).toString('hex').toUpperCase()}`;
          db.exec('BEGIN IMMEDIATE');
          try {
            const occupied = db
              .prepare('SELECT seat FROM seats WHERE show_id=?')
              .all(showId)
              .map((s) => s.seat);
            if (seats.some((s) => occupied.includes(s)))
              fail(
                409,
                'One or more seats were just reserved. Please choose again.',
              );
            db.prepare(
              'INSERT INTO bookings(id,user_id,show_id,seats,total,created_at) VALUES(?,?,?,?,?,?)',
            ).run(
              id,
              user.id,
              showId,
              JSON.stringify([...seats].sort()),
              total,
              now().toISOString(),
            );
            const insert = db.prepare('INSERT INTO seats VALUES(?,?,?)');
            for (const seat of seats) insert.run(showId, seat, id);
            db.exec('COMMIT');
          } catch (error) {
            db.exec('ROLLBACK');
            throw error;
          }
          return json(
            201,
            getBookings(user.id).find((b) => b.id === id),
          );
        }
      }
      if (
        /^\/api\/bookings\/[^/]+\/cancel$/.test(path) &&
        req.method === 'POST'
      ) {
        requireUser();
        const booking = db
          .prepare(
            'SELECT b.*,s.starts_at FROM bookings b JOIN shows s ON s.id=b.show_id WHERE b.id=? AND b.user_id=?',
          )
          .get(path.split('/')[3], user.id);
        if (!booking) fail(404, 'Reservation not found.');
        if (booking.starts_at <= now().toISOString())
          fail(400, 'This screening has already started.');
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(
            booking.id,
          );
          db.prepare('DELETE FROM seats WHERE booking_id=?').run(booking.id);
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
        return json(200, { ok: true });
      }
      if (path === '/api/admin' && req.method === 'GET') {
        requireAdmin();
        return json(200, {
          bookings: getBookings(),
          shows: db
            .prepare(
              'SELECT s.*, (SELECT count(*) FROM seats WHERE show_id=s.id) AS occupied FROM shows s WHERE starts_at>? ORDER BY starts_at',
            )
            .all(now().toISOString()),
          users: db.prepare('SELECT count(*) AS count FROM users').get().count,
        });
      }
      if (/^\/api\/admin\/shows\/[^/]+$/.test(path) && req.method === 'PATCH') {
        requireAdmin();
        const { active } = await body(req);
        const id = path.split('/')[4];
        if (typeof active !== 'boolean' || !getShow(id))
          fail(400, 'Invalid screening.');
        if (
          !active &&
          db
            .prepare('SELECT count(*) AS count FROM seats WHERE show_id=?')
            .get(id).count
        )
          fail(409, 'A screening with reservations cannot be disabled.');
        db.prepare('UPDATE shows SET active=? WHERE id=?').run(
          Number(active),
          id,
        );
        return json(200, { ok: true });
      }
      fail(404, 'Endpoint not found.');
    } catch (error) {
      if (!error.status) console.error(error);
      json(error.status || 500, {
        error: error.status
          ? error.message
          : 'Something went wrong. Please try again.',
      });
    }
  });
  if (adminEmail)
    db.prepare("UPDATE users SET role='admin' WHERE email=?").run(
      adminEmail.trim().toLowerCase(),
    );
  server.on('close', () => db.close());
  return server;
}
