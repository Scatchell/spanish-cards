import path from 'node:path';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // The root .env is the single source of truth for dev ports: PORT is what
  // the API server binds, so the proxy follows it automatically. Real env
  // vars take priority, which is how the e2e suite points an isolated client
  // at its own API pair (see playwright.config.ts).
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '..'), '');
  const port = Number(env.CLIENT_PORT ?? 4101);
  const apiProxyTarget = env.API_PROXY_TARGET ?? `http://localhost:${env.PORT ?? 4102}`;

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port,
      allowedHosts: ['beast.home', 'localhost'],
      proxy: {
        '/api': apiProxyTarget,
      },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
