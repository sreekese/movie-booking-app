// Vite handles frontend hot reload. Do not wrap this process in node --watch:
// Vite's generated modules can trigger restarts during browser startup.
import { createServer } from 'vite';
import { createApp } from '../server/app.mjs';

const port = Number(process.env.PORT || 3001);
const api = createApp({
  dbPath: process.env.DATABASE_PATH || 'server/data/quickshow.sqlite',
  adminEmail: process.env.ADMIN_EMAIL,
  origin: process.env.APP_ORIGIN,
});
let vite;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await vite?.close();
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
try {
  await new Promise((resolve, reject) => {
    api.once('error', reject);
    api.listen(port, process.env.HOST || '127.0.0.1', resolve);
  });
  console.log(`Booking API ready on port ${port}`);
  vite = await createServer();
  await vite.listen();
  vite.printUrls();
} catch (error) {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Stop the separate API server before running npm run dev, or use npm run dev:client with your existing API server.`
      : error.message,
  );
  await stop(1);
}
