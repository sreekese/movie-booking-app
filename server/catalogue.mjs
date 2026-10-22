import { theatreManagement } from './theatre-management.mjs';
import seedMovies from '../src/data/data.js';
import { randomBytes, scryptSync } from 'node:crypto';
export async function catalogue(db, now) {
  const fail = (status, message) => {
    throw Object.assign(new Error(message), {
      status,
    });
  };
  const transaction = async (fn) => {
    await db.exec('BEGIN IMMEDIATE');
    try {
      const value = await fn();
      await db.exec('COMMIT');
      return value;
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  };
  const movie = (row) =>
    row
      ? {
          ...JSON.parse(row.data),
          id: row.id,
          archived: !!row.archived,
        }
      : null;
  const getMovie = async (id) =>
    movie(await db.prepare('SELECT * FROM movies WHERE id=?').get(id));
  const listMovies = async (all = false) =>
    (
      await db
        .prepare(
          `SELECT * FROM movies ${all ? '' : 'WHERE archived=0'} ORDER BY id`,
        )
        .all()
    ).map(movie);
  const trailers = [
    'TcMBFSGVi1c',
    'JfVOs4VSpmA',
    'EXeTwQWrcwY',
    'zSWdZVtXT7E',
    'zAGVQLHvwOY',
  ];
  await transaction(async () => {
    await db.exec(`CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS movies(id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, actor_id INTEGER, action TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL);`);
    if (
      !(await db
        .prepare("SELECT 1 FROM migrations WHERE name='catalogue-v1'")
        .get())
    ) {
      await db.exec(
        "ALTER TABLE shows ADD COLUMN screen TEXT NOT NULL DEFAULT '1'; ALTER TABLE bookings ADD COLUMN snapshot TEXT;",
      );
      await db.prepare('UPDATE shows SET screen=CAST(movie_id AS TEXT)').run();
      const insert = db.prepare('INSERT INTO movies(id,data) VALUES(?,?)');
      for (const m of seedMovies)
        await insert.run(
          m.id,
          JSON.stringify({
            ...m,
            premiumPrice: 60,
            trailer: `https://www.youtube.com/watch?v=${trailers[m.id - 1]}`,
          }),
        );
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now());
      const start = new Date(`${today}T12:00:00+05:30`);
      const addShow = db.prepare(
        'INSERT OR IGNORE INTO shows(id,movie_id,date,time,starts_at,screen) VALUES(?,?,?,?,?,?)',
      );
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + d * 86400000)
          .toISOString()
          .slice(0, 10);
        for (const m of seedMovies)
          for (const [i, time] of m.showTimings.entries()) {
            const [, h, minute, period] = time.match(/(\d+):(\d+) (AM|PM)/);
            const hour = (Number(h) % 12) + (period === 'PM' ? 12 : 0);
            await addShow.run(
              `${m.id}-${date}-${i}`,
              m.id,
              date,
              time,
              new Date(
                `${date}T${String(hour).padStart(2, '0')}:${minute}:00+05:30`,
              ).toISOString(),
              String(m.id),
            );
          }
      }
      for (const b of await db
        .prepare(
          'SELECT b.id AS booking_id,s.* FROM bookings b JOIN shows s ON s.id=b.show_id',
        )
        .all()) {
        await db.prepare('UPDATE bookings SET snapshot=? WHERE id=?').run(
          JSON.stringify({
            movie: await getMovie(b.movie_id),
            date: b.date,
            time: b.time,
            starts_at: b.starts_at,
            screen: b.screen,
          }),
          b.booking_id,
        );
      }
      await db.prepare("INSERT INTO migrations VALUES('catalogue-v1')").run();
    }
  });
  await transaction(async () => {
    if (
      !(await db
        .prepare("SELECT 1 FROM migrations WHERE name='theatres-v1'")
        .get())
    ) {
      await db.exec(`CREATE TABLE theatres(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, city TEXT NOT NULL, address TEXT NOT NULL);
        INSERT INTO theatres(id,name,city,address) VALUES(1,'Quick Show Cinema','Demo location','Address not configured');
        ALTER TABLE shows ADD COLUMN theatre_id INTEGER REFERENCES theatres(id);
        UPDATE shows SET theatre_id=1;
        CREATE INDEX shows_theatre_screen ON shows(theatre_id,screen);`);
      for (const b of await db
        .prepare('SELECT id,snapshot FROM bookings')
        .all()) {
        const snapshot = JSON.parse(b.snapshot || '{}');
        snapshot.theatre = await db
          .prepare('SELECT * FROM theatres WHERE id=1')
          .get();
        await db
          .prepare('UPDATE bookings SET snapshot=? WHERE id=?')
          .run(JSON.stringify(snapshot), b.id);
      }
      await db.prepare("INSERT INTO migrations VALUES('theatres-v1')").run();
    }
  });
  const management = await theatreManagement(db, now);
  const listTheatres = async () =>
    await db.prepare('SELECT * FROM theatres ORDER BY name,id').all();
  const withTheatre = async (show) =>
    show
      ? {
          ...show,
          layout: JSON.parse(show.layout),
          theatre: await db
            .prepare('SELECT * FROM theatres WHERE id=?')
            .get(show.theatre_id),
        }
      : show;
  const audit = async (user, action, id) =>
    await db
      .prepare(
        'INSERT INTO audit_log(actor_id,action,entity_id,created_at) VALUES(?,?,?,?)',
      )
      .run(user.id, action, String(id), now().toISOString());
  function text(value, label, max = 120) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
      fail(400, `${label} is required (maximum ${max} characters).`);
    return value.trim();
  }
  function number(value, label, min, max, integer = false) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      fail(
        400,
        `${label} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max}.`,
      );
    return value;
  }
  function dateValue(value) {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
    )
      fail(400, 'Enter a valid date.');
    return value;
  }
  function url(value, label, optional = false) {
    if (optional && value === '') return '';
    try {
      const parsed = new URL(value);
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        value.length > 2000
      )
        throw new Error();
      return parsed.href;
    } catch {
      fail(400, `${label} must be a valid HTTPS URL.`);
    }
  }
  function validateMovie(input) {
    const duration = text(input.duration, 'Duration', 12);
    if (
      !/^(?:[0-5]h )?\d{1,3}m$/.test(duration) ||
      minutes({
        duration,
      }) < 1 ||
      minutes({
        duration,
      }) > 359 ||
      (duration.includes('h') &&
        Number(duration.split(' ')[1].slice(0, -1)) > 59)
    )
      fail(400, 'Duration must look like 2h 30m or 90m (maximum 5h 59m).');
    if (
      !Array.isArray(input.genre) ||
      !input.genre.length ||
      input.genre.length > 6
    )
      fail(400, 'Select between 1 and 6 genres.');
    return {
      title: text(input.title, 'Title'),
      genre: [...new Set(input.genre.map((g) => text(g, 'Genre', 30)))],
      language: text(input.language, 'Language', 40),
      duration,
      rating: number(input.rating, 'Rating', 0, 10),
      releaseDate: dateValue(input.releaseDate),
      certificate: text(input.certificate, 'Certificate', 12),
      price: number(input.price, 'Price', 1, 10000, true),
      premiumPrice: number(
        input.premiumPrice,
        'Premium surcharge',
        0,
        10000,
        true,
      ),
      poster: url(input.poster, 'Poster'),
      banner: url(input.banner, 'Banner'),
      trailer: url(input.trailer, 'Trailer', true),
      description: text(input.description, 'Description', 3000),
    };
  }
  function minutes(m) {
    const match = m.duration.match(/^(?:(\d+)h )?(\d+)m$/);
    return match ? Number(match[1] || 0) * 60 + Number(match[2]) : 180;
  }
  const showBookings = async (id) =>
    (
      await db
        .prepare('SELECT count(*) AS n FROM bookings WHERE show_id=?')
        .get(id)
    ).n;
  async function validateShow(input, existingId = '') {
    const m = await getMovie(
      number(input.movie_id, 'Movie ID', 1, Number.MAX_SAFE_INTEGER, true),
    );
    if (!m || m.archived) fail(400, 'Choose a published movie.');
    const date = dateValue(input.date);
    if (
      typeof input.time !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)
    )
      fail(400, 'Choose a valid showtime.');
    const starts_at = new Date(`${date}T${input.time}:00+05:30`).toISOString();
    if (starts_at <= now().toISOString())
      fail(400, 'Screenings must start in the future.');
    const theatre_id = number(
      input.theatre_id ?? 1,
      'Theatre ID',
      1,
      Number.MAX_SAFE_INTEGER,
      true,
    );
    if (
      !(await db.prepare('SELECT id FROM theatres WHERE id=?').get(theatre_id))
    )
      fail(400, 'Choose an existing theatre.');
    const screen = text(input.screen, 'Screen', 30);
    if (typeof input.active !== 'boolean')
      fail(400, 'Invalid screening status.');
    const end = Date.parse(starts_at) + (minutes(m) + 15) * 60000;
    if (input.active) {
      const existing = await db
        .prepare(
          'SELECT * FROM shows WHERE id<>? AND active=1 AND lower(screen)=lower(?) AND theatre_id=?',
        )
        .all(existingId, screen, theatre_id);
      for (const other of existing) {
        const otherMovie = await getMovie(other.movie_id);
        if (
          Date.parse(other.starts_at) < end &&
          Date.parse(other.starts_at) + (minutes(otherMovie) + 15) * 60000 >
            Date.parse(starts_at)
        )
          fail(
            409,
            'This screen already has a show at that time. Allow the film duration plus 15 minutes between shows.',
          );
      }
    }
    const [hour, minute] = input.time.split(':').map(Number);
    return {
      ...(await management.showLayout(theatre_id, screen)),
      theatre_id,
      movie_id: m.id,
      date,
      time: `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`,
      starts_at,
      screen,
      active: Number(input.active),
    };
  }
  async function adminAction(path, method, input, user) {
    return await transaction(async () => {
      await management.authorize(user, path, input);
      if (/^\/api\/admin\/screens(?:\/\d+)?$/.test(path))
        return await management.screenAction(path, method, input, user);
      const id = path.split('/')[4];
      if (
        path === '/api/admin/theatres' ||
        /^\/api\/admin\/theatres\/\d+$/.test(path)
      ) {
        const existing = id
          ? await db
              .prepare('SELECT * FROM theatres WHERE id=?')
              .get(Number(id))
          : null;
        if (id && !existing) fail(404, 'Theatre not found.');
        if (method === 'DELETE' && existing) {
          if (
            await db
              .prepare('SELECT 1 FROM shows WHERE theatre_id=? LIMIT 1')
              .get(existing.id)
          )
            fail(
              409,
              'Remove this theatre’s screenings first. Booking history must be retained.',
            );
          await db
            .prepare('DELETE FROM screens WHERE theatre_id=?')
            .run(existing.id);
          await db.prepare('DELETE FROM theatres WHERE id=?').run(existing.id);
          await audit(user, 'theatre.deleted', id);
          return {
            ok: true,
          };
        }
        if ((method === 'POST' && !id) || (method === 'PUT' && existing)) {
          const values = [
            text(input.name, 'Theatre name', 80),
            text(input.city, 'City', 80),
            text(input.address, 'Address', 240),
          ];
          const theatreId = existing
            ? existing.id
            : Number(
                (
                  await db
                    .prepare(
                      'INSERT INTO theatres(name,city,address) VALUES(?,?,?)',
                    )
                    .run(...values)
                ).lastInsertRowid,
              );
          if (existing)
            await db
              .prepare('UPDATE theatres SET name=?,city=?,address=? WHERE id=?')
              .run(...values, theatreId);
          await audit(
            user,
            existing ? 'theatre.updated' : 'theatre.created',
            theatreId,
          );
          return await db
            .prepare('SELECT * FROM theatres WHERE id=?')
            .get(theatreId);
        }
      }
      if (path === '/api/admin/movies' && method === 'POST') {
        const data = validateMovie(input);
        const result = await db
          .prepare('INSERT INTO movies(data) VALUES(?)')
          .run(JSON.stringify(data));
        await audit(user, 'movie.created', result.lastInsertRowid);
        return await getMovie(Number(result.lastInsertRowid));
      }
      if (/^\/api\/admin\/movies\/\d+$/.test(path)) {
        const m = await getMovie(Number(id));
        if (!m) fail(404, 'Movie not found.');
        if (method === 'PUT') {
          const data = validateMovie(input);
          if (
            data.duration !== m.duration &&
            (
              await db
                .prepare(
                  'SELECT count(*) AS n FROM shows WHERE movie_id=? AND starts_at>?',
                )
                .get(m.id, now().toISOString())
            ).n
          )
            fail(
              409,
              'Remove upcoming screenings before changing the film duration.',
            );
          await db
            .prepare('UPDATE movies SET data=? WHERE id=?')
            .run(JSON.stringify(data), m.id);
          await audit(user, 'movie.updated', id);
          return await getMovie(m.id);
        }
        if (method === 'PATCH') {
          if (typeof input.archived !== 'boolean')
            fail(400, 'Invalid archive status.');
          if (
            input.archived &&
            (
              await db
                .prepare(
                  "SELECT count(*) AS n FROM bookings b JOIN shows s ON s.id=b.show_id WHERE s.movie_id=? AND b.status='reserved' AND s.starts_at>?",
                )
                .get(m.id, now().toISOString())
            ).n
          )
            fail(
              409,
              'Cancel upcoming reservations before archiving this movie.',
            );
          await db
            .prepare('UPDATE movies SET archived=? WHERE id=?')
            .run(Number(input.archived), m.id);
          if (input.archived)
            await db
              .prepare('UPDATE shows SET active=0 WHERE movie_id=?')
              .run(m.id);
          await audit(
            user,
            input.archived ? 'movie.archived' : 'movie.restored',
            id,
          );
          return await getMovie(m.id);
        }
        if (method === 'DELETE') {
          if (
            (
              await db
                .prepare('SELECT count(*) AS n FROM shows WHERE movie_id=?')
                .get(m.id)
            ).n
          )
            fail(
              409,
              'Remove this movie’s screenings first, or archive the movie to retain history.',
            );
          await db.prepare('DELETE FROM favourites WHERE movie_id=?').run(m.id);
          await db.prepare('DELETE FROM movies WHERE id=?').run(m.id);
          await audit(user, 'movie.deleted', id);
          return {
            ok: true,
          };
        }
      }
      if (path === '/api/admin/shows' && method === 'POST') {
        const s = await validateShow(input);
        const showId = `show-${randomBytes(8).toString('hex')}`;
        await db
          .prepare(
            'INSERT INTO shows(id,movie_id,date,time,starts_at,screen,active,theatre_id,layout,layout_version) VALUES(?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            showId,
            s.movie_id,
            s.date,
            s.time,
            s.starts_at,
            s.screen,
            s.active,
            s.theatre_id,
            s.layout,
            s.layout_version,
          );
        await audit(user, 'show.created', showId);
        return {
          id: showId,
          ...s,
        };
      }
      if (/^\/api\/admin\/shows\/[^/]+$/.test(path)) {
        const s = await db.prepare('SELECT * FROM shows WHERE id=?').get(id);
        if (!s) fail(404, 'Screening not found.');
        if (method === 'PUT' || method === 'DELETE') {
          if (await showBookings(id))
            fail(
              409,
              'This screening has booking history. Cancel reservations or disable it instead; its details cannot be changed or deleted.',
            );
          if (method === 'DELETE') {
            await db.prepare('DELETE FROM shows WHERE id=?').run(id);
            await audit(user, 'show.deleted', id);
            return {
              ok: true,
            };
          }
          const value = await validateShow(input, id);
          await db
            .prepare(
              'UPDATE shows SET movie_id=?,date=?,time=?,starts_at=?,screen=?,active=?,theatre_id=?,layout=?,layout_version=? WHERE id=?',
            )
            .run(
              value.movie_id,
              value.date,
              value.time,
              value.starts_at,
              value.screen,
              value.active,
              value.theatre_id,
              value.layout,
              value.layout_version,
              id,
            );
          await audit(user, 'show.updated', id);
          return {
            id,
            ...value,
          };
        }
        if (method === 'PATCH') {
          if (typeof input.active !== 'boolean')
            fail(400, 'Invalid screening status.');
          if (
            !input.active &&
            (
              await db
                .prepare('SELECT count(*) AS n FROM seats WHERE show_id=?')
                .get(id)
            ).n
          )
            fail(409, 'A screening with reservations cannot be disabled.');
          if (input.active) {
            const localTime = new Date(Date.parse(s.starts_at) + 330 * 60000)
              .toISOString()
              .slice(11, 16);
            await validateShow(
              {
                ...s,
                time: localTime,
                active: true,
              },
              id,
            );
          }
          await db
            .prepare('UPDATE shows SET active=? WHERE id=?')
            .run(Number(input.active), id);
          await audit(
            user,
            input.active ? 'show.enabled' : 'show.disabled',
            id,
          );
          return {
            ok: true,
          };
        }
      }
      if (
        /^\/api\/admin\/bookings\/[^/]+\/cancel$/.test(path) &&
        method === 'POST'
      ) {
        const b = await db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
        if (!b) fail(404, 'Reservation not found.');
        await db
          .prepare("UPDATE bookings SET status='cancelled' WHERE id=?")
          .run(id);
        await db.prepare('DELETE FROM seats WHERE booking_id=?').run(id);
        await audit(user, 'booking.cancelled', id);
        return {
          ok: true,
        };
      }
      if (path === '/api/admin/users' && method === 'POST') {
        const name = text(input.name, 'Name', 80);
        const email = text(input.email, 'Email', 254).toLowerCase();
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !['customer', 'admin', 'theatre_admin'].includes(input.role)
        )
          fail(400, 'Enter a valid email and role.');
        if (
          typeof input.password !== 'string' ||
          input.password.length < 8 ||
          input.password.length > 128
        )
          fail(400, 'Password must be 8–128 characters.');
        if (await db.prepare('SELECT id FROM users WHERE email=?').get(email))
          fail(409, 'This email is already registered.');
        const salt = randomBytes(16).toString('hex');
        const result = await db
          .prepare(
            'INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',
          )
          .run(
            name,
            email,
            `${salt}:${scryptSync(input.password, salt, 64).toString('hex')}`,
            input.role,
          );
        await management.assignments(Number(result.lastInsertRowid), input);
        await audit(user, 'user.created', result.lastInsertRowid);
        return {
          id: Number(result.lastInsertRowid),
          name,
          email,
          role: input.role,
        };
      }
      if (/^\/api\/admin\/users\/\d+$/.test(path)) {
        const account = await db
          .prepare('SELECT id,role FROM users WHERE id=?')
          .get(Number(id));
        if (!account) fail(404, 'Account not found.');
        if (
          account.id === user.id &&
          (method === 'DELETE' || input.role !== 'admin')
        )
          fail(409, 'You cannot delete or demote your own admin account.');
        if (
          account.role === 'admin' &&
          (
            await db
              .prepare("SELECT count(*) AS n FROM users WHERE role='admin'")
              .get()
          ).n <= 1 &&
          (method === 'DELETE' || input.role !== 'admin')
        )
          fail(409, 'Keep at least one administrator.');
        if (method === 'PUT') {
          const name = text(input.name, 'Name', 80);
          const email = text(input.email, 'Email', 254).toLowerCase();
          if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            !['customer', 'admin', 'theatre_admin'].includes(input.role)
          )
            fail(400, 'Enter a valid email and role.');
          if (
            await db
              .prepare('SELECT id FROM users WHERE email=? AND id<>?')
              .get(email, account.id)
          )
            fail(409, 'This email is already registered.');
          await db
            .prepare('UPDATE users SET name=?,email=?,role=? WHERE id=?')
            .run(name, email, input.role, account.id);
          await management.assignments(account.id, input);
          if (input.role !== account.role)
            await db
              .prepare('DELETE FROM sessions WHERE user_id=?')
              .run(account.id);
          await audit(user, 'user.updated', id);
          return {
            ok: true,
          };
        }
        if (method === 'DELETE') {
          if (
            (
              await db
                .prepare('SELECT count(*) AS n FROM bookings WHERE user_id=?')
                .get(account.id)
            ).n
          )
            fail(
              409,
              'This customer has booking history and cannot be deleted.',
            );
          await db
            .prepare('DELETE FROM sessions WHERE user_id=?')
            .run(account.id);
          await db
            .prepare('DELETE FROM favourites WHERE user_id=?')
            .run(account.id);
          await db.prepare('DELETE FROM users WHERE id=?').run(account.id);
          await audit(user, 'user.deleted', id);
          return {
            ok: true,
          };
        }
      }
      fail(404, 'Admin endpoint not found.');
    });
  }
  return {
    getMovie,
    listMovies,
    adminAction,
    listTheatres,
    withTheatre,
    management,
  };
}
