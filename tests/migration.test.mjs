import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('upgrade backs up a legacy database and preserves existing accounts, bookings, seats, and disabled shows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quickshow-upgrade-'));
  const dbPath = join(dir, 'legacy.sqlite');
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer');
      CREATE TABLE shows(id TEXT PRIMARY KEY, movie_id INTEGER NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, starts_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE bookings(id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), show_id TEXT REFERENCES shows(id), seats TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'reserved', created_at TEXT NOT NULL);
      CREATE TABLE seats(show_id TEXT REFERENCES shows(id), seat TEXT, booking_id TEXT REFERENCES bookings(id), PRIMARY KEY(show_id,seat));
      INSERT INTO users VALUES(1,'Legacy Viewer','legacy@example.com','existing-hash','customer');
      INSERT INTO shows VALUES('legacy-show',1,'2026-10-11','10:00 AM','2026-10-11T04:30:00.000Z',0);
      INSERT INTO bookings VALUES('QS-LEGACY',1,'legacy-show','["A1"]',220,'reserved','2026-10-10T00:00:00.000Z');
      INSERT INTO seats VALUES('legacy-show','A1','QS-LEGACY');
    `);
    legacy.close();
    execFileSync(process.execPath, ['scripts/migrate.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL: '',
        DATABASE_PATH: dbPath,
        ADMIN_EMAIL: 'legacy@example.com',
      },
      stdio: 'pipe',
    });
    const db = new DatabaseSync(dbPath);
    const booking = db
      .prepare('SELECT * FROM bookings WHERE id=?')
      .get('QS-LEGACY');
    const snapshot = JSON.parse(booking.snapshot);
    assert.equal(snapshot.movie.title, 'Avengers: Endgame');
    assert.equal(snapshot.date, '2026-10-11');
    assert.equal(snapshot.screen, '1');
    assert.equal(booking.total, 220);
    assert.equal(db.prepare('SELECT count(*) AS n FROM seats').get().n, 1);
    assert.equal(
      db.prepare('SELECT active FROM shows WHERE id=?').get('legacy-show')
        .active,
      0,
    );
    assert.equal(
      db.prepare('SELECT role FROM users WHERE id=1').get().role,
      'admin',
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM movies').get().n, 5);
    const count = db.prepare('SELECT count(*) AS n FROM shows').get().n;
    db.close();
    const backups = readdirSync(join(dir, 'backups'));
    assert.equal(backups.length, 1);
    const backup = new DatabaseSync(join(dir, 'backups', backups[0]), {
      readOnly: true,
    });
    assert.equal(
      backup.prepare('SELECT count(*) AS n FROM bookings').get().n,
      1,
    );
    assert.equal(
      backup
        .prepare("SELECT name FROM sqlite_master WHERE name='movies'")
        .get(),
      undefined,
    );
    backup.close();
    execFileSync(process.execPath, ['scripts/migrate.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL: '',
        DATABASE_PATH: dbPath,
        ADMIN_EMAIL: '',
      },
      stdio: 'pipe',
    });
    const reopened = new DatabaseSync(dbPath, { readOnly: true });
    assert.equal(
      reopened.prepare('SELECT count(*) AS n FROM shows').get().n,
      count,
    );
    assert.equal(
      reopened.prepare('PRAGMA integrity_check').get().integrity_check,
      'ok',
    );
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
