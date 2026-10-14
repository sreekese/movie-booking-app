export const defaultLayout = {
  position: 'front',
  rows: [...'ABCDEFGH'].map((label, i) => ({
    label,
    count: 12,
    premium: i >= 5,
    aisle: 6,
  })),
  blocked: [],
  accessible: [],
};
export function layoutSeats(layout) {
  return layout.rows
    .flatMap((row) =>
      Array.from({ length: row.count }, (_, i) => ({
        id: `${row.label}${i + 1}`,
        premium: row.premium,
      })),
    )
    .filter((s) => !layout.blocked.includes(s.id));
}
export function theatreManagement(db, now) {
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    if (
      !db
        .prepare("SELECT 1 FROM migrations WHERE name='screen-access-v1'")
        .get()
    ) {
      db.exec(`CREATE TABLE theatre_admins(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, theatre_id INTEGER REFERENCES theatres(id) ON DELETE CASCADE, PRIMARY KEY(user_id,theatre_id));
      CREATE TABLE screens(id INTEGER PRIMARY KEY, theatre_id INTEGER NOT NULL REFERENCES theatres(id), name TEXT NOT NULL COLLATE NOCASE, layout TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, UNIQUE(theatre_id,name));
      ALTER TABLE shows ADD COLUMN layout TEXT;
      ALTER TABLE shows ADD COLUMN layout_version INTEGER NOT NULL DEFAULT 1;`);
      for (const s of db
        .prepare('SELECT DISTINCT theatre_id,screen FROM shows')
        .all())
        db.prepare(
          'INSERT OR IGNORE INTO screens(theatre_id,name,layout) VALUES(?,?,?)',
        ).run(s.theatre_id, s.screen, JSON.stringify(defaultLayout));
      db.prepare('UPDATE shows SET layout=?').run(
        JSON.stringify(defaultLayout),
      );
      db.prepare("INSERT INTO migrations VALUES('screen-access-v1')").run();
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const assigned = (user) =>
    db
      .prepare('SELECT theatre_id FROM theatre_admins WHERE user_id=?')
      .all(user.id)
      .map((t) => t.theatre_id);
  const canManage = (user, id) =>
    user.role === 'admin' ||
    (user.role === 'theatre_admin' && assigned(user).includes(Number(id)));
  function authorize(user, path, input) {
    if (user.role === 'admin') return;
    if (user.role !== 'theatre_admin')
      fail(403, 'Administrator access required.');
    const [, , , resource, id] = path.split('/');
    let theatreId;
    if (resource === 'shows') {
      if (id)
        theatreId = db
          .prepare('SELECT theatre_id FROM shows WHERE id=?')
          .get(id)?.theatre_id;
      else theatreId = input.theatre_id;
      if (input.theatre_id !== undefined && !canManage(user, input.theatre_id))
        fail(403, 'This theatre is not assigned to you.');
    } else if (resource === 'screens')
      theatreId = id
        ? db
            .prepare('SELECT theatre_id FROM screens WHERE id=?')
            .get(Number(id))?.theatre_id
        : input.theatre_id;
    else if (resource === 'bookings')
      theatreId = db
        .prepare(
          'SELECT s.theatre_id FROM bookings b JOIN shows s ON s.id=b.show_id WHERE b.id=?',
        )
        .get(id)?.theatre_id;
    else
      fail(
        403,
        'Only a super admin can manage shared movies, theatres, or accounts.',
      );
    if (!canManage(user, theatreId))
      fail(403, 'This theatre is not assigned to you.');
  }
  function assignments(id, input) {
    const ids = input.role === 'theatre_admin' ? input.theatre_ids : [];
    if (
      !Array.isArray(ids) ||
      (input.role === 'theatre_admin' && !ids.length) ||
      ids.some(
        (t) =>
          !Number.isInteger(t) ||
          !db.prepare('SELECT 1 FROM theatres WHERE id=?').get(t),
      )
    )
      fail(400, 'Assign at least one valid theatre to a theatre admin.');
    const before = assigned({ id })
      .sort((a, b) => a - b)
      .join(',');
    const after = [...new Set(ids)].sort((a, b) => a - b).join(',');
    db.prepare('DELETE FROM theatre_admins WHERE user_id=?').run(id);
    for (const t of new Set(ids))
      db.prepare('INSERT INTO theatre_admins VALUES(?,?)').run(id, t);
    if (before !== after)
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  }
  function validateLayout(layout) {
    if (
      !layout ||
      !Array.isArray(layout.rows) ||
      !layout.rows.length ||
      layout.rows.length > 26
    )
      fail(400, 'Use 1–26 seat rows.');
    if (
      layout.position !== undefined &&
      !['front', 'back'].includes(layout.position)
    )
      fail(400, 'Choose a valid screen position.');
    const labels = new Set();
    for (const row of layout.rows) {
      if (
        !row ||
        typeof row.label !== 'string' ||
        !/^[A-Z]$/.test(row.label) ||
        labels.has(row.label) ||
        !Number.isInteger(row.count) ||
        row.count < 1 ||
        row.count > 30 ||
        typeof row.premium !== 'boolean'
      )
        fail(
          400,
          'Rows need unique letters, 1–30 seats, and a valid aisle position (0 for none).',
        );
      const aisles = row.aisles ?? (row.aisle === 0 ? [] : [row.aisle]);
      if (
        !Array.isArray(aisles) ||
        new Set(aisles).size !== aisles.length ||
        aisles.some(
          (position) =>
            !Number.isInteger(position) ||
            position < 1 ||
            position >= row.count,
        )
      )
        fail(
          400,
          'Aisles must be unique seat numbers between 1 and the second-last seat.',
        );
      if (row.gapAfter !== undefined && ![0, 16, 32, 48].includes(row.gapAfter))
        fail(400, 'Choose a valid gap after the row.');
      if (
        row.category !== undefined &&
        (typeof row.category !== 'string' ||
          !row.category.trim() ||
          row.category.trim().length > 30)
      )
        fail(400, 'Seat category must be 1–30 characters.');
      if (
        row.price !== undefined &&
        row.price !== null &&
        (!Number.isInteger(row.price) || row.price < 1 || row.price > 10000)
      )
        fail(
          400,
          'Seat price must be a whole number between 1 and 10000, or blank for movie pricing.',
        );
      labels.add(row.label);
    }
    const all = layout.rows.flatMap((r) =>
      Array.from({ length: r.count }, (_, i) => `${r.label}${i + 1}`),
    );
    for (const key of ['blocked', 'accessible'])
      if (
        !Array.isArray(layout[key]) ||
        new Set(layout[key]).size !== layout[key].length ||
        layout[key].some((s) => !all.includes(s))
      )
        fail(400, 'Blocked and accessible seats must exist in the layout.');
    if (
      !layoutSeats(layout).length ||
      layout.accessible.some((s) => layout.blocked.includes(s))
    )
      fail(
        400,
        'Keep at least one available seat; accessible seats cannot be blocked.',
      );
    return {
      ...(layout.position ? { position: layout.position } : {}),
      rows: layout.rows.map(
        ({
          label,
          count,
          premium,
          aisle,
          aisles,
          gapAfter,
          category,
          price,
        }) => ({
          label,
          count,
          premium,
          ...(category !== undefined ? { category: category.trim() } : {}),
          ...(price !== undefined ? { price } : {}),
          ...(gapAfter !== undefined ? { gapAfter } : {}),
          ...(aisles !== undefined
            ? { aisles: [...aisles].sort((a, b) => a - b) }
            : { aisle }),
        }),
      ),
      blocked: layout.blocked,
      accessible: layout.accessible,
    };
  }
  const screens = () =>
    db
      .prepare('SELECT * FROM screens ORDER BY theatre_id,name')
      .all()
      .map((s) => ({ ...s, layout: JSON.parse(s.layout) }));
  function screenAction(path, method, input, user) {
    let updatedShows = 0;
    let preservedShows = 0;
    const id = Number(path.split('/')[4]);
    const existing = id
      ? db.prepare('SELECT * FROM screens WHERE id=?').get(id)
      : null;
    if (id && !existing) fail(404, 'Screen not found.');
    if (method === 'DELETE' && existing) {
      if (
        db
          .prepare(
            'SELECT 1 FROM shows WHERE theatre_id=? AND screen=? COLLATE NOCASE',
          )
          .get(existing.theatre_id, existing.name)
      )
        fail(409, 'This screen has screenings. Retain it to preserve history.');
      db.prepare('DELETE FROM screens WHERE id=?').run(id);
    } else if ((method === 'POST' && !id) || (method === 'PUT' && existing)) {
      const theatreId = existing?.theatre_id ?? input.theatre_id;
      if (
        !Number.isInteger(theatreId) ||
        !db.prepare('SELECT 1 FROM theatres WHERE id=?').get(theatreId)
      )
        fail(400, 'Choose a valid theatre.');
      const name =
        existing?.name ??
        (typeof input.name === 'string' ? input.name.trim() : '');
      if (typeof name !== 'string' || !name || name.length > 30)
        fail(400, 'Screen name must be 1–30 characters.');
      if (
        !existing &&
        db
          .prepare(
            'SELECT 1 FROM screens WHERE theatre_id=? AND name=? COLLATE NOCASE',
          )
          .get(theatreId, name)
      )
        fail(409, 'This screen already exists.');
      const layout = JSON.stringify(validateLayout(input.layout));
      if (existing)
        db.prepare(
          'UPDATE screens SET layout=?,version=version+1 WHERE id=?',
        ).run(layout, id);
      else
        db.prepare(
          'INSERT INTO screens(theatre_id,name,layout) VALUES(?,?,?)',
        ).run(theatreId, name, layout);
      if (existing) {
        updatedShows = db
          .prepare(
            `UPDATE shows SET layout=?,layout_version=? WHERE theatre_id=? AND screen=? COLLATE NOCASE AND starts_at>? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.show_id=shows.id)`,
          )
          .run(
            layout,
            existing.version + 1,
            theatreId,
            name,
            now().toISOString(),
          ).changes;
        preservedShows = db
          .prepare(
            `SELECT count(*) AS n FROM shows s WHERE theatre_id=? AND screen=? COLLATE NOCASE AND starts_at>? AND EXISTS(SELECT 1 FROM bookings b WHERE b.show_id=s.id)`,
          )
          .get(theatreId, name, now().toISOString()).n;
      }
    } else fail(405, 'Method not allowed.');
    db.prepare(
      'INSERT INTO audit_log(actor_id,action,entity_id,created_at) VALUES(?,?,?,?)',
    ).run(
      user.id,
      `screen.${method === 'POST' ? 'created' : method === 'PUT' ? 'updated' : 'deleted'}`,
      String(id || input.name),
      now().toISOString(),
    );
    return { ok: true, updatedShows, preservedShows };
  }
  function showLayout(theatreId, name) {
    let screen = db
      .prepare(
        'SELECT * FROM screens WHERE theatre_id=? AND name=? COLLATE NOCASE',
      )
      .get(theatreId, name);
    // Compatibility for existing API clients: a new screen starts with the legacy layout.
    if (!screen) {
      db.prepare(
        'INSERT INTO screens(theatre_id,name,layout) VALUES(?,?,?)',
      ).run(theatreId, name, JSON.stringify(defaultLayout));
      screen = db
        .prepare(
          'SELECT * FROM screens WHERE theatre_id=? AND name=? COLLATE NOCASE',
        )
        .get(theatreId, name);
    }
    return { layout: screen.layout, layout_version: screen.version };
  }
  return {
    assigned,
    canManage,
    authorize,
    assignments,
    screens,
    screenAction,
    showLayout,
  };
}
