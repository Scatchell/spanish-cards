import { defineConfig, devices } from '@playwright/test';
import { E2E_API_PORT, E2E_CLIENT_PORT, E2E_DATABASE_URL } from './e2e/env.js';

// E2E runs against an isolated stack: its own database (created and migrated
// by e2e/global-setup.ts) and its own server ports, so dev data and dev
// servers (4101/4102) are never touched.

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  // All tests share one database and the training tests wipe the deck, so
  // files must not run concurrently.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${E2E_CLIENT_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w server',
      url: `http://localhost:${E2E_API_PORT}/api/me`,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        PORT: String(E2E_API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
      },
    },
    {
      command: 'npm run dev -w client',
      url: `http://localhost:${E2E_CLIENT_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: {
        CLIENT_PORT: String(E2E_CLIENT_PORT),
        API_PROXY_TARGET: `http://localhost:${E2E_API_PORT}`,
      },
    },
  ],
});
