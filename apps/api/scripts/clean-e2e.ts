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

/** Mirrors `AVATAR_SUBDIR` in src/users/avatar/avatar-storage.service.ts. */
const AVATAR_SUBDIR = 'avatars';

/** Deletes the e2e accounts, taking their bytes with them — the cascade would not. */
async function removeE2eAccounts(dir: string): Promise<{ users: number; files: number }> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: E2E_EMAIL_PREFIX } },
    select: {
      id: true,
      avatarUrl: true,
      meetings: { select: { files: { select: { storedName: true } } } },
    },
  });
  if (users.length === 0) return { users: 0, files: 0 };

  // Read the names first: once the rows go, nothing points at the files any more.
  const storedNames = users.flatMap((user) =>
    user.meetings.flatMap((meeting) => meeting.files.map((file) => file.storedName)),
  );
  // Avatars live in their own subdirectory, so their paths are built differently. The
  // orphan sweep never touches that subdirectory (it scans only top-level files), so
  // this is the only thing that reclaims an e2e account's avatar bytes.
  const avatarPaths = users
    .map((user) => user.avatarUrl)
    .filter((name): name is string => Boolean(name))
    .map((name) => join(dir, AVATAR_SUBDIR, name));

  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });

  let removed = 0;
  for (const path of [...storedNames.map((name) => join(dir, name)), ...avatarPaths]) {
    try {
      await unlink(path);
      removed += 1;
    } catch {
      // Already gone is the end state we wanted.
    }
  }
  return { users: users.length, files: removed };
}

/**
 * Sweeps files no row references — the residue of any row deleted outside the API, plus
 * an avatar orphaned by a concurrent replace (two uploads racing leave one file the link
 * no longer points at). Meeting files sit top-level in `dir`; avatars sit in the
 * `avatars/` subdirectory and are referenced by `user.avatarUrl`, so each space is swept
 * against its own set of referenced names.
 */
async function removeOrphans(dir: string): Promise<{ files: number; bytes: number }> {
  const fileRows = await prisma.meetingFile.findMany({ select: { storedName: true } });
  const avatarRows = await prisma.user.findMany({
    where: { avatarUrl: { not: null } },
    select: { avatarUrl: true },
  });

  let files = 0;
  let bytes = 0;
  const now = Date.now();

  async function sweep(directory: string, referenced: Set<string>): Promise<void> {
    let names: string[];
    try {
      names = await readdir(directory);
    } catch {
      return;
    }
    for (const name of names) {
      if (referenced.has(name)) continue;
      const path = join(directory, name);
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
  }

  await sweep(dir, new Set(fileRows.map((row) => row.storedName)));
  await sweep(
    join(dir, AVATAR_SUBDIR),
    new Set(avatarRows.map((row) => row.avatarUrl).filter((name): name is string => Boolean(name))),
  );

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
