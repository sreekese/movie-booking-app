import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';

const dbPath = process.env.DATABASE_PATH || 'server/data/quickshow.sqlite';
if (existsSync(dbPath)) {
  const backupDir = join(dirname(resolve(dbPath)), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(
    backupDir,
    `quickshow-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`,
  );
  const source = new DatabaseSync(dbPath, { readOnly: true });
  try {
    source.prepare('VACUUM INTO ?').run(backupPath);
  } finally {
    source.close();
  }
  console.log(`Database backup created: ${backupPath}`);
}
const server = createApp({ dbPath, adminEmail: process.env.ADMIN_EMAIL });
await new Promise((resolve) => server.close(resolve));
console.log('Database migration complete. Existing records retained.');
