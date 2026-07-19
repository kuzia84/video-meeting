import { createReadStream, mkdirSync, ReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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

  constructor(@Inject(UPLOAD_DIR) uploadDir: string) {
    this.dir = join(uploadDir, AVATAR_SUBDIR);
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

  /**
   * Opens a stored avatar, refusing anything that no longer matches what was written —
   * same reasoning as `MeetingFileStorage.open`: a missing path 404s here rather than
   * raising ENOENT inside the stream once 200 is on the wire.
   */
  async open(storedName: string): Promise<ReadStream> {
    const path = this.pathFor(storedName);
    let stats;
    try {
      stats = await stat(path);
    } catch {
      throw new NotFoundException('Avatar content not found');
    }
    if (!stats.isFile()) {
      throw new NotFoundException('Avatar content not found');
    }
    return createReadStream(path);
  }

  /** Best-effort removal: a missing file is already the desired end state. */
  async remove(storedName: string): Promise<void> {
    await unlink(this.pathFor(storedName)).catch(() => undefined);
  }
}
