import { createApp } from './app.mjs';
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3001);
const server = createApp({
  dbPath: process.env.DATABASE_PATH || 'server/data/quickshow.sqlite',
  production,
  adminEmail: process.env.ADMIN_EMAIL,
  origin: process.env.APP_ORIGIN,
});
server.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`Quick Show listening on port ${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)));
