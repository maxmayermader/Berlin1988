import { defineConfig, devices } from '@playwright/test';

/**
 * Two-browser proof of Phase 1 Success Criterion 1: create a game and
 * receive a unique join code, second browser enters it and lands in the
 * same lobby. webServer starts the full local stack (next dev + partykit
 * dev) via the root `dev` script, so this needs no separate manual step.
 */
export default defineConfig({
  testDir: 'apps/web/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
