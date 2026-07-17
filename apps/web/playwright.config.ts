import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001';

/**
 * Browser e2e for apps/web. Distinct from the Playwright MCP server described in
 * docs/architecture/frontend-ui.md: that one drives a browser by hand to eyeball
 * layout, this runs committed tests unattended.
 *
 * Both servers are started here, because these tests exercise the real stack —
 * the frontend talks to the real API, which talks to the real Postgres. Postgres
 * itself must already be up (`npm run db:up` from the repo root).
 */
export default defineConfig({
  testDir: './e2e',
  // These tests write to the *dev* database (they drive the dev server, which reads its
  // own .env), so unlike the API's e2e they cannot be handed their own. They clean up
  // after themselves instead — including the uploads, which no cascade would remove.
  globalTeardown: './e2e/global-teardown.ts',
  // The API serializes writes against one database; parallel workers would race
  // on shared state for no real gain at this suite's size.
  workers: 1,
  fullyParallel: false,
  // A stray `test.only` silently shrinks the suite to one test — in CI that must fail.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    // Pinned so assertions on rendered dates mean the same thing everywhere. The app
    // formats times in the browser's zone, so without this a developer in UTC+3 and a
    // CI box in UTC disagree about what "09:00 UTC" reads as, and whoever wrote the
    // test wins by accident.
    timezoneId: 'UTC',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -w @video-meetings/api',
      // /health, not /: the API has no route at the root and answers 404 there, which
      // reads as "not up" — reuseExistingServer would miss a running API and try to
      // start a second one on the same port.
      url: `${API_URL}/health`,
      // Locally the dev servers are usually already running; in CI always start clean.
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: '../..',
      stdout: 'pipe',
    },
    {
      command: 'npm run dev -w @video-meetings/web',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: '../..',
      stdout: 'pipe',
    },
  ],
});
