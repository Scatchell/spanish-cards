import { defineConfig, devices } from '@playwright/test';

// E2E tests expect a migrated database: `npm run db:up && npm run migrate:up`.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4101',
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
      url: 'http://localhost:4100/api/me',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -w client',
      url: 'http://localhost:4101',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
