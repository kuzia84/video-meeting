import { config as loadDotenv } from 'dotenv';

/**
 * The e2e suites clear `user` and `meeting` wholesale between tests, and several of them
 * assert on global counts (`meetingFile.count() === 0`) — both only make sense on a
 * database that belongs to the run alone.
 *
 * So the run gets its own: the same Postgres instance, a different database. The dev one
 * (and the `npm run db:seed` account in it) is never touched, and the wholesale cleanup
 * stays honest instead of being weakened into "delete only what looks like ours".
 */
const E2E_DATABASE_SUFFIX = '_e2e';

/** Derives the e2e database URL from the dev one — same server, name + `_e2e`. */
export function toE2eDatabaseUrl(devUrl: string): string {
  const url = new URL(devUrl);
  // pathname is "/video_meetings"; the leading slash stays.
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${E2E_DATABASE_SUFFIX}`;
  return url.toString();
}

export function e2eDatabaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

/**
 * Reads apps/api/.env the way the app would, then points at the e2e database. dotenv
 * never overrides an already-set variable, so an explicit DATABASE_URL in the
 * environment still wins as the base to derive from.
 */
export function resolveE2eDatabaseUrl(): string {
  loadDotenv();
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    throw new Error('DATABASE_URL is not set — is apps/api/.env present?');
  }
  return toE2eDatabaseUrl(devUrl);
}

/**
 * Refuses to let a suite that wipes tables run against anything but the e2e database.
 * The isolation is only worth as much as this check: without it, a specs file run through
 * a config without `setupFiles` would happily delete every user in the dev database.
 */
export function assertE2eDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.endsWith(E2E_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${url || '(unset)'}", not the e2e database ` +
        `(expected a name ending in "${E2E_DATABASE_SUFFIX}"). This suite deletes every user ` +
        `and meeting it can see. Is test/setup-e2e.ts wired up via setupFiles?`,
    );
  }
}
