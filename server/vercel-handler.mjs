import { createApp } from './app.mjs';
export function createVercelHandler({
  config = () => ({
    databaseUrl: process.env.DATABASE_URL,
    production: true,
    origin: process.env.APP_ORIGIN || '',
  }),
  createApplication = createApp,
} = {}) {
  let application;
  const handler = async (req, res) => {
    const settings = config();
    if (!settings.databaseUrl) {
      res.writeHead(503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      return res.end(
        JSON.stringify({
          error:
            'Deployment needs DATABASE_URL. Connect a PostgreSQL database and redeploy.',
        }),
      );
    }
    const url = new URL(req.url, 'https://localhost');
    const route = req.query?.__route ?? url.searchParams.get('__route');
    if (route !== null) {
      url.pathname = '/api/' + route;
      url.searchParams.delete('__route');
      req.url = url.pathname + url.search;
    }
    try {
      application ||= createApplication(settings).catch((error) => {
        application = undefined;
        throw error;
      });
      const server = await application;
      await server.listeners('request')[0](req, res);
    } catch (error) {
      console.error('API initialization failed:', error.code || error.message);
      res.writeHead(503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          error:
            'Database connection failed. Check the deployment environment and database availability.',
        }),
      );
    }
  };
  handler.close = async () => {
    if (application) {
      const server = await application;
      await new Promise((resolve) => server.close(resolve));
      await server.databaseClosed;
      application = undefined;
    }
  };
  return handler;
}
