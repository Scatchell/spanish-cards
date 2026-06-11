import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Overridable so the e2e suite can run an isolated client + API pair
// (see playwright.config.ts) without touching the dev servers.
const port = Number(process.env.CLIENT_PORT ?? 4101);
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4100';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port,
    allowedHosts: ["beast.home","localhost"],
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
