import { existsSync } from 'node:fs';
export const importTables = {
  users: ['id', 'name', 'email', 'password', 'role'],
  movies: ['id', 'data', 'archived'],
  theatres: ['id', 'name', 'city', 'address'],
  shows: [
    'id',
    'movie_id',
    'date',
    'time',
    'starts_at',
    'active',
    'screen',
    'theatre_id',
    'layout',
    'layout_version',
  ],
  bookings: [
    'id',
    'user_id',
    'show_id',
    'seats',
    'total',
    'status',
    'created_at',
    'snapshot',
  ],
  seats: ['show_id', 'seat', 'booking_id'],
  favourites: ['user_id', 'movie_id'],
  audit_log: ['id', 'actor_id', 'action', 'entity_id', 'created_at'],
  theatre_admins: ['user_id', 'theatre_id'],
  screens: ['id', 'theatre_id', 'name', 'layout', 'version'],
};
export async function importSqlite(db, sourcePath) {
  if (db.dialect !== 'postgres')
    throw new Error('Import target must be PostgreSQL.');
  if (!existsSync(sourcePath))
    throw new Error('Source SQLite file does not exist.');
  const { DatabaseSync } = await import('node:sqlite');
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    source.exec('BEGIN');
    if (
      !source
        .prepare("SELECT 1 FROM migrations WHERE name='screen-access-v1'")
        .get()
    )
      throw new Error(
        'Upgrade and back up the source first with DATABASE_URL unset: npm run db:migrate.',
      );
    return await db.scope(async () => {
      for (const table of [...Object.keys(importTables), 'sessions'])
        if ((await db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n)
          throw new Error(
            'Import requires an empty destination. Existing data was not changed.',
          );
      const counts = {};
      for (const [table, columns] of Object.entries(importTables)) {
        const rows = source
          .prepare(`SELECT ${columns.join(',')} FROM ${table}`)
          .all();
        for (const row of rows)
          await db
            .prepare(
              `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
            )
            .run(...columns.map((c) => row[c]));
        counts[table] = rows.length;
        if (
          (await db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n !==
          rows.length
        )
          throw new Error(`Row-count mismatch in ${table}.`);
      }
      await db.resetSequences();
      return counts;
    }, true);
  } finally {
    source.close();
  }
}
