import { readdir, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';

// Loaded explicitly: PrismaClient reads .env by itself, so the database half of this
// script would honour configuration while the disk half silently ignored UPLOAD_DIR and
// cleaned the default directory instead.
loadDotenv();

/**
 * Reclaims what test runs leave in the *dev* database and upload directory.
 *
 * Two different kinds of litter, and they need different handling:
 *
 * 1. **Browser e2e accounts.** Those tests drive the running dev server, so their users,
 *    meetings and files land in the dev database — and their uploads in the dev
 *    directory. They only ever add, never delete. (The API e2e run has its own database
 *    and cleans up after itself; it is not the source of this.)
 *
 * 2. **Orphaned bytes.** Deleting a user cascades to meetings and file rows but **not**
 *    to the files on disk — nothing in Postgres knows the directory exists. Any row
 *    removed without going through the API's delete handlers strands its bytes forever.
 *
 * Safe to run at any time, and it is not test-only plumbing: (2) is the only way to
 * reclaim bytes whose rows are already gone.
 */
const prisma = new PrismaClient();

/** Matches what `apps/web/e2e/support.ts` registers, and nothing a person would type. */
const E2E_EMAIL_PREFIX = 'e2e-';

/**
 * Multer writes a file *before* the handler creates its row, so a file with no row may
 * simply be an upload in flight. Anything younger than this is left alone rather than
 * deleted out from under a request that is still running.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Mirrors `resolveUploadDir` in src/storage/storage.module.ts — the app's own rule. */
function uploadDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (!configured) return join(process.cwd(), 'uploads');
  return isAbsolute(configured) ? configured : join(process.cwd(), configured);
}

/** Deletes the e2e accounts, taking their bytes with them — the cascade would not. */
async function removeE2eAccounts(dir: string): Promise<{ users: number; files: number }> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: E2E_EMAIL_PREFIX } },
    select: { id: true, meetings: { select: { files: { select: { storedName: true } } } } },
  });
  if (users.length === 0) return { users: 0, files: 0 };

  // Read the names first: once the rows go, nothing points at the files any more.
  const storedNames = users.flatMap((user) =>
    user.meetings.flatMap((meeting) => meeting.files.map((file) => file.storedName)),
  );

  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });

  let removed = 0;
  for (const name of storedNames) {
    try {
      await unlink(join(dir, name));
      removed += 1;
    } catch {
      // Already gone is the end state we wanted.
    }
  }
  return { users: users.length, files: removed };
}

/** Sweeps files no row references — the residue of any row deleted outside the API. */
async function removeOrphans(dir: string): Promise<{ files: number; bytes: number }> {
  const rows = await prisma.meetingFile.findMany({ select: { storedName: true } });
  const referenced = new Set(rows.map((row) => row.storedName));

  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { files: 0, bytes: 0 };
  }

  let files = 0;
  let bytes = 0;
  const now = Date.now();
  for (const name of names) {
    if (referenced.has(name)) continue;
    const path = join(dir, name);
    const stats = await stat(path).catch(() => null);
    if (!stats?.isFile()) continue;
    // Young and unreferenced most likely means "being uploaded right now".
    if (now - stats.mtimeMs < ORPHAN_MIN_AGE_MS) continue;

    try {
      await unlink(path);
      files += 1;
      bytes += stats.size;
    } catch {
      // Locked or already gone; the next run will pick it up.
    }
  }
  return { files, bytes };
}

async function main(): Promise<void> {
  const dir = uploadDir();
  const accounts = await removeE2eAccounts(dir);
  const orphans = await removeOrphans(dir);

  console.log(
    `Removed ${accounts.users} e2e account(s) and ${accounts.files} of their file(s).\n` +
      `Swept ${orphans.files} orphaned file(s), reclaiming ${(orphans.bytes / 1048576).toFixed(1)} MB ` +
      `from ${dir}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
