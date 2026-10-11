import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = process.env.PORT || env.PORT || 3001;
  const host = process.env.HOST || env.HOST || '127.0.0.1';
  const proxyHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
  const proxy = {
    '/api': {
      target: `http://${proxyHost.includes(':') ? `[${proxyHost}]` : proxyHost}:${port}`,
      changeOrigin: false,
    },
  };
  return {
    plugins: [react(), tailwindcss()],
    server: { proxy },
    preview: { proxy },
  };
});
