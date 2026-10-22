import { randomBytes, scryptSync } from 'node:crypto';
import { openDatabase } from '../server/database.mjs';
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Set ADMIN_EMAIL to the administrator email address.');
if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL to the hosted database.');
const db = await openDatabase({ databaseUrl: process.env.DATABASE_URL });
try {
  await db.scope(async () => {
    const existing = await db
      .prepare('SELECT id FROM users WHERE email=?')
      .get(email);
    if (existing) {
      await db
        .prepare("UPDATE users SET role='admin' WHERE id=?")
        .run(existing.id);
      await db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
    } else {
      const password = process.env.ADMIN_PASSWORD;
      if (!password || password.length < 12 || password.length > 128)
        throw new Error(
          'For a new admin, set ADMIN_PASSWORD to a 12–128 character password.',
        );
      const salt = randomBytes(16).toString('hex');
      await db
        .prepare(
          "INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')",
        )
        .run(
          process.env.ADMIN_NAME || 'Cinema Administrator',
          email,
          `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
        );
    }
  }, true);
  console.log(
    'Administrator provisioned. Existing passwords were not changed. Remove ADMIN_PASSWORD from your local environment.',
  );
} finally {
  await db.close();
}
