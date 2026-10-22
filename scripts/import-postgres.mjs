import { openDatabase } from '../server/database.mjs';
import { importSqlite } from '../server/import-sqlite.mjs';
if (!process.env.DATABASE_URL)
  throw new Error(
    'Set DATABASE_URL to the target PostgreSQL connection string.',
  );
const source =
  process.argv[2] ||
  process.env.DATABASE_PATH ||
  'server/data/quickshow.sqlite';
const db = await openDatabase({ databaseUrl: process.env.DATABASE_URL });
try {
  console.log('Imported rows:', await importSqlite(db, source));
  console.log(
    'Import complete. The source was not modified. Users must sign in again.',
  );
} finally {
  await db.close();
}
