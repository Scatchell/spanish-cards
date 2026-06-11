import { defineConfig, devices } from '@playwright/test';

// E2E runs against an isolated stack: its own database (created and migrated
// by e2e/global-setup.ts) and its own server ports, so dev data and dev
// servers (4100/4101) are never touched. Requires postgres: `npm run db:up`.
const API_PORT = 4102;
const CLIENT_PORT = 4103;
export const E2E_DATABASE_URL =
  'postgres://spanish_cards:spanish_cards@localhost:5434/spanish_cards_test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  // All tests share one database and the training tests wipe the deck, so
  // files must not run concurrently.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
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
      url: `http://localhost:${API_PORT}/api/me`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
      },
    },
    {
      command: 'npm run dev -w client',
      url: `http://localhost:${CLIENT_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: {
        CLIENT_PORT: String(CLIENT_PORT),
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
