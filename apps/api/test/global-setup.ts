import { execFileSync } from 'node:child_process';
import { e2eDatabaseName, resolveE2eDatabaseUrl } from './e2e-database';

/**
 * Creates the e2e database (if it is not there yet) and brings it up to the current
 * migrations, once per run before any suite starts.
 *
 * `prisma migrate deploy` does both: it creates a missing database and applies every
 * migration, so nothing here has to know how to CREATE DATABASE.
 */
export default function globalSetup(): void {
  const databaseUrl = resolveE2eDatabaseUrl();

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    // Only this child sees the e2e URL; the parent's env stays as it was.
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  console.log(`\ne2e database ready: ${e2eDatabaseName(databaseUrl)}`);
}
