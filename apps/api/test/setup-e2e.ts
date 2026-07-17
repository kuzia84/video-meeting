import { join } from 'node:path';
import { resolveE2eDatabaseUrl } from './e2e-database';

/** Also asserted by the file-upload suite before it wipes the directory. */
export const ISOLATED_UPLOAD_DIR_NAME = '.uploads-e2e';

// Isolate uploads written by the e2e run from the dev/production upload directory.
// Set before the app (and its ConfigModule) loads: dotenv never overrides process.env.
process.env.UPLOAD_DIR = join(__dirname, ISOLATED_UPLOAD_DIR_NAME);

// Same idea, for the database: the suites clear `user` and `meeting` wholesale, so they
// get their own. Set before ConfigModule reads .env — dotenv leaves an already-set var
// alone, so this wins. Without it, a test run would delete the dev data, including the
// `npm run db:seed` account. global-setup.ts has already created and migrated it.
process.env.DATABASE_URL = resolveE2eDatabaseUrl();
