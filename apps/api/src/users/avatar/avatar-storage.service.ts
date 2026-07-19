import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { UPLOAD_DIR } from '../../storage/storage.constants';

/**
 * Avatars live in this subdirectory of UPLOAD_DIR, apart from meeting files. Two reasons:
 * they belong to a different owner (the user, not a meeting), and — load-bearing — the
 * meeting-file orphan sweep (`scripts/clean-e2e.ts`) reads only the *top-level* files of
 * UPLOAD_DIR and deletes any not referenced by a `MeetingFile` row. An avatar sitting
 * beside meeting files would look exactly like such an orphan and be swept after an hour;
 * a subdirectory is skipped by the sweep's `isFile()` check, so the bytes stay put.
 */
export const AVATAR_SUBDIR = 'avatars';

/**
 * Owns every path built under the avatars directory — the single place avatar bytes are
 * written to, read from and removed, mirroring `MeetingFileStorage` for the avatar space.
 * `pathFor` is private on purpose: the only ways in are `open`/`remove`.
 */
@Injectable()
export class AvatarStorage {
  private readonly dir: string;

  /**
   * The avatars directory for a given UPLOAD_DIR. Static so the module's multer factory
   * derives multer's write destination from the same rule this service uses for
   * remove/cleanup — one place computes the path, so the two can never drift.
   */
  static directoryFor(uploadDir: string): string {
    return join(uploadDir, AVATAR_SUBDIR);
  }

  constructor(@Inject(UPLOAD_DIR) uploadDir: string) {
    this.dir = AvatarStorage.directoryFor(uploadDir);
    // Multer does not create its destination, so make it once at startup.
    mkdirSync(this.dir, { recursive: true });
  }

  /** The directory multer writes avatar uploads into. */
  get directory(): string {
    return this.dir;
  }

  private pathFor(storedName: string): string {
    return join(this.dir, storedName);
  }

  /** Best-effort removal: a missing file is already the desired end state. */
  async remove(storedName: string): Promise<void> {
    await unlink(this.pathFor(storedName)).catch(() => undefined);
  }
}
