import { join } from 'node:path';

/** Also asserted by the file-upload suite before it wipes the directory. */
export const ISOLATED_UPLOAD_DIR_NAME = '.uploads-e2e';

// Isolate uploads written by the e2e run from the dev/production upload directory.
// Set before the app (and its ConfigModule) loads: dotenv never overrides process.env.
process.env.UPLOAD_DIR = join(__dirname, ISOLATED_UPLOAD_DIR_NAME);
