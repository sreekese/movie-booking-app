import { AsyncLocalStorage } from 'node:async_hooks';
import { schema } from './postgres-schema.mjs';

// Keep the existing parameterized repository queries portable during migration.
// Only SQL written by this app passes through this adapter; values stay bound.
export function postgresSQL(sql) {
  let index = 0;
  sql = sql.replace(/'(''|[^'])*'|\?/g, (token) =>
    token === '?' ? `$${++index}` : token,
  );
  sql = sql.replace(
    /(\b(?:\w+\.)?\w+)\s*=\s*(\$\d+)\s+COLLATE NOCASE/gi,
    'lower($1)=lower($2)',
  );
  sql = sql
    .replace(
      /INTEGER PRIMARY KEY(?: AUTOINCREMENT)?/gi,
      'BIGSERIAL PRIMARY KEY',
    )
    .replace(/TEXT NOT NULL COLLATE NOCASE/gi, 'TEXT NOT NULL');
  if (/INSERT OR IGNORE/i.test(sql))
    sql =
      sql.replace(/INSERT OR IGNORE/i, 'INSERT') + ' ON CONFLICT DO NOTHING';
  return sql;
}
export async function openDatabase({ dbPath, databaseUrl } = {}) {
  if (!databaseUrl) {
    if (process.env.VERCEL)
      throw new Error(
        'DATABASE_URL is required on Vercel. Local SQLite cannot persist there.',
      );
    const [{ DatabaseSync }, { mkdirSync }, { dirname }] = await Promise.all([
      import('node:sqlite'),
      import('node:fs'),
      import('node:path'),
    ]);
    mkdirSync(dirname(dbPath), { recursive: true });
    const sqlite = new DatabaseSync(dbPath);
    let queue = Promise.resolve();
    return {
      dialect: 'sqlite',
      prepare: (sql) => sqlite.prepare(sql),
      exec: (sql) => sqlite.exec(sql),
      close: () => sqlite.close(),
      scope: async (fn) => {
        const before = queue;
        let release;
        queue = new Promise((resolve) => {
          release = resolve;
        });
        await before;
        try {
          return await fn();
        } finally {
          release();
        }
      },
    };
  }
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, Number); // IDs, counts and epoch milliseconds fit JS safe integers.
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  pool.on('error', (error) =>
    console.error('Database connection error:', error.code),
  );
  const context = new AsyncLocalStorage();
  const query = (sql, args) => {
    const state = context.getStore();
    if (!state)
      throw new Error(
        'Database statements require a request or migration scope.',
      );
    return state.client.query(sql, args);
  };
  const db = {
    dialect: 'postgres',
    prepare(sql) {
      return {
        async all(...args) {
          const state = context.getStore();
          const key = JSON.stringify([sql, args]);
          if (!state.cache.has(key))
            state.cache.set(
              key,
              query(postgresSQL(sql), args).then((result) => result.rows),
            );
          return await state.cache.get(key);
        },
        async get(...args) {
          return (await this.all(...args))[0];
        },
        async run(...args) {
          context.getStore().cache.clear();
          let statement = postgresSQL(sql);
          const generated =
            /^\s*INSERT\s+INTO\s+(users|movies|theatres|screens|audit_log)\b/i.test(
              statement,
            );
          if (generated) statement += ' RETURNING id';
          const result = await query(statement, args);
          return {
            changes: result.rowCount,
            lastInsertRowid: result.rows[0]?.id,
          };
        },
      };
    },
    async exec(sql) {
      const state = context.getStore();
      state.cache.clear();
      if (/^BEGIN/i.test(sql.trim())) {
        state.depth++;
        await query(`SAVEPOINT nested_${state.depth}`);
        return;
      }
      if (/^(COMMIT|ROLLBACK)$/i.test(sql.trim())) {
        const depth = state.depth--;
        await query(
          `${/^ROLLBACK/i.test(sql) ? 'ROLLBACK TO' : 'RELEASE'} SAVEPOINT nested_${depth}`,
        );
        return;
      }
      sql = sql.replace(/PRAGMA[^;]*;/gi, '');
      if (sql.trim()) await query(postgresSQL(sql));
    },
    async scope(fn, write = false) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (write)
          await client.query('SELECT pg_advisory_xact_lock(729041221)');
        const result = await context.run(
          { client, depth: 0, cache: new Map() },
          fn,
        );
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async resetSequences() {
      for (const table of [
        'users',
        'movies',
        'theatres',
        'screens',
        'audit_log',
      ])
        await query(
          `SELECT setval(pg_get_serial_sequence('${table}','id'),COALESCE((SELECT MAX(id) FROM ${table}),1),EXISTS(SELECT 1 FROM ${table}))`,
        );
    },
    close: () => pool.end(),
  };
  try {
    await db.scope(() => db.exec(schema), true);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return db;
}
