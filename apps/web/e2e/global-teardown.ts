import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Clears what this suite leaves in the dev database, after the whole run.
 *
 * These tests drive the running dev server, so unlike the API's e2e they cannot be given
 * their own database — the server reads its own `.env`, and the browser talks to it over
 * HTTP. So they clean up instead: every user they register carries the `e2e-` prefix the
 * script matches on, and the script also unlinks their uploads, which no cascade would.
 *
 * Run at teardown rather than per test on purpose — a test that fails leaves its data
 * for exactly as long as the run, and no longer.
 *
 * The script lives in apps/api because that is where Prisma and the upload directory are
 * known; giving this workspace a database dependency purely for cleanup would be worse.
 */
export default function globalTeardown(): void {
  try {
    const output = execFileSync('npm', ['run', 'db:clean-e2e', '-w', '@video-meetings/api'], {
      // Anchored to this file, not to process.cwd(): a run started from the repo root
      // (`npx playwright test --config apps/web/playwright.config.ts`) would otherwise
      // resolve '../..' to two levels above the repo, and the catch below would turn
      // that into a warning on a green run that cleaned nothing.
      cwd: join(__dirname, '..', '..', '..'),
      encoding: 'utf8',
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
    // The last lines are the script's own summary; the npm banner is noise.
    console.log(output.trim().split('\n').slice(-2).join('\n'));
  } catch (error) {
    // Never fail a green run over housekeeping: the tests passed, and the next run (or
    // `npm run db:clean-e2e`) will sweep whatever this missed.
    console.warn(
      `e2e cleanup did not run: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
