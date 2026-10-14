import { seatPrice } from '../src/utils/seatCategory.js';
import { layoutSeats } from './theatre-management.mjs';
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
import { catalogue } from './catalogue.mjs';

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
  const {
    getMovie,
    listMovies,
    adminAction,
    listTheatres,
    withTheatre,
    management,
  } = catalogue(db, now);
  const attempts = new Map();
  const publicUser = (u) =>
    u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null;
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  const getShow = (id) =>
    withTheatre(db.prepare('SELECT * FROM shows WHERE id=?').get(id));
  const getBookings = (userId) =>
    db
      .prepare(
        `SELECT b.*, s.movie_id, s.date, s.time, s.starts_at, s.screen, s.theatre_id, u.name, u.email FROM bookings b JOIN shows s ON s.id=b.show_id JOIN users u ON u.id=b.user_id ${userId ? 'WHERE b.user_id=?' : ''} ORDER BY b.created_at DESC`,
      )
      .all(...(userId ? [userId] : []))
      .map((b) => ({
        ...b,
        seats: JSON.parse(b.seats),
        movie: getMovie(b.movie_id),
        ...(b.snapshot ? JSON.parse(b.snapshot) : {}),
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
      "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
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
        if (!['admin', 'theatre_admin'].includes(user.role))
          fail(403, 'Administrator access required.');
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
      if (path === '/api/theatres' && req.method === 'GET')
        return json(200, listTheatres());
      if (path === '/api/movies' && req.method === 'GET')
        return json(
          200,
          listMovies().map((movie) => ({
            ...movie,
            theatres: db
              .prepare(
                `SELECT DISTINCT t.* FROM theatres t JOIN shows s ON s.theatre_id=t.id WHERE s.movie_id=? AND s.active=1 AND s.starts_at>? ORDER BY t.name,t.id`,
              )
              .all(movie.id, now().toISOString()),
          })),
        );
      if (path === '/api/shows' && req.method === 'GET')
        return json(
          200,
          db
            .prepare(
              'SELECT s.* FROM shows s JOIN movies m ON m.id=s.movie_id WHERE s.movie_id=? AND s.active=1 AND m.archived=0 AND s.starts_at>? ORDER BY s.starts_at',
            )
            .all(Number(url.searchParams.get('movie')), now().toISOString())
            .map(withTheatre),
        );
      if (path.startsWith('/api/shows/') && req.method === 'GET') {
        const show = getShow(path.split('/')[3]);
        if (
          !show ||
          !show.active ||
          getMovie(show.movie_id)?.archived ||
          show.starts_at <= now().toISOString()
        )
          fail(404, 'This screening is no longer available.');
        return json(200, {
          ...show,
          movie: getMovie(show.movie_id),
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
            !Number.isInteger(movieId) ||
            !getMovie(movieId) ||
            getMovie(movieId).archived ||
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
          const { showId, seats, expectedTotal, expectedLayoutVersion } =
            await body(req);
          if (
            typeof showId !== 'string' ||
            !Array.isArray(seats) ||
            !seats.length ||
            seats.length > 8 ||
            new Set(seats).size !== seats.length ||
            seats.some(
              (s) =>
                typeof s !== 'string' ||
                !/^[A-Z](?:[1-9]|[12][0-9]|30)$/.test(s),
            )
          )
            fail(400, 'Select between 1 and 8 valid, unique seats.');
          const show = getShow(showId);
          if (
            !show ||
            !show.active ||
            getMovie(show.movie_id)?.archived ||
            show.starts_at <= now().toISOString()
          )
            fail(400, 'This screening is no longer available.');
          const movie = getMovie(show.movie_id);
          if (!movie || movie.archived)
            fail(400, 'This movie is no longer available.');
          if (
            expectedLayoutVersion !== undefined &&
            expectedLayoutVersion !== show.layout_version
          )
            fail(
              409,
              'The seating layout changed. Review your seats and reserve again.',
            );
          const availableSeats = layoutSeats(show.layout);
          if (seats.some((id) => !availableSeats.some((s) => s.id === id)))
            fail(400, 'Select valid, available seats from this screen layout.');
          const total = seats.reduce(
            (sum, seat) =>
              sum +
              seatPrice(
                show.layout.rows.find((r) => r.label === seat[0]),
                movie,
              ),
            0,
          );
          if (expectedTotal !== undefined && expectedTotal !== total)
            fail(
              409,
              'The ticket price has changed. Review the updated total and reserve again.',
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
              'INSERT INTO bookings(id,user_id,show_id,seats,total,created_at,snapshot) VALUES(?,?,?,?,?,?,?)',
            ).run(
              id,
              user.id,
              showId,
              JSON.stringify([...seats].sort()),
              total,
              now().toISOString(),
              JSON.stringify({
                movie,
                date: show.date,
                time: show.time,
                starts_at: show.starts_at,
                screen: show.screen,
                theatre: show.theatre,
                layout: show.layout,
                layout_version: show.layout_version,
              }),
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
      if (path.startsWith('/api/admin')) {
        requireAdmin();
        if (path === '/api/admin' && req.method === 'GET') {
          const theatres = listTheatres().filter((t) =>
            management.canManage(user, t.id),
          );
          const shows = db
            .prepare(
              'SELECT s.*, (SELECT count(*) FROM seats WHERE show_id=s.id) AS occupied, (SELECT count(*) FROM bookings WHERE show_id=s.id) AS booking_count FROM shows s ORDER BY starts_at DESC',
            )
            .all()
            .filter((s) => management.canManage(user, s.theatre_id))
            .map(withTheatre)
            .map((s) => ({ ...s, capacity: layoutSeats(s.layout).length }));
          const bookings = getBookings().filter((b) =>
            management.canManage(user, b.theatre_id),
          );
          const stats = theatres.map((t) => {
            const screenings = shows.filter((s) => s.theatre_id === t.id);
            const reservations = bookings.filter((b) => b.theatre_id === t.id);
            const active = reservations.filter((b) => b.status === 'reserved');
            const capacity = screenings.reduce((n, s) => n + s.capacity, 0);
            const occupied = active.reduce((n, b) => n + b.seats.length, 0);
            return {
              theatre_id: t.id,
              name: t.name,
              screenings: screenings.length,
              upcoming: screenings.filter(
                (s) => s.active && s.starts_at > now().toISOString(),
              ).length,
              reservations: active.length,
              cancellations: reservations.filter(
                (b) => b.status === 'cancelled',
              ).length,
              seats: occupied,
              capacity,
              occupancy: capacity
                ? Math.round((occupied / capacity) * 1000) / 10
                : 0,
              value: active.reduce((n, b) => n + b.total, 0),
            };
          });
          return json(200, {
            movies: listMovies(user.role === 'admin'),
            theatres,
            shows,
            bookings,
            stats,
            screens: management
              .screens()
              .filter((s) => management.canManage(user, s.theatre_id)),
            users:
              user.role === 'admin'
                ? db.prepare('SELECT count(*) AS n FROM users').get().n
                : new Set(bookings.map((b) => b.user_id)).size,
            customers:
              user.role === 'admin'
                ? db
                    .prepare(
                      'SELECT u.id,u.name,u.email,u.role,(SELECT count(*) FROM bookings WHERE user_id=u.id) AS booking_count FROM users u ORDER BY u.id DESC',
                    )
                    .all()
                    .map((u) => ({ ...u, theatre_ids: management.assigned(u) }))
                : [],
            audit:
              user.role === 'admin'
                ? db
                    .prepare(
                      'SELECT a.*,u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100',
                    )
                    .all()
                : [],
          });
        }
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method))
          return json(
            req.method === 'POST' ? 201 : 200,
            adminAction(path, req.method, await body(req), user),
          );
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
