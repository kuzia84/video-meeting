import { join } from 'node:path';

// Isolate uploads written by the e2e run from the dev/production upload directory.
// Set before the app (and its ConfigModule) loads: dotenv never overrides process.env.
process.env.UPLOAD_DIR = join(__dirname, '.uploads-e2e');
