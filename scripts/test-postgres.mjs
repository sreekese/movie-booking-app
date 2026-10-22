import { spawnSync } from 'node:child_process';
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'Set TEST_DATABASE_URL to an expendable PostgreSQL database before running this suite.',
  );
const result = spawnSync(
  process.execPath,
  ['--test', 'tests/api.test.mjs', 'tests/postgres.test.mjs'],
  { stdio: 'inherit', env: process.env },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
