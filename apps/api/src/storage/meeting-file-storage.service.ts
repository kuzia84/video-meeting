import { createReadStream, ReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UPLOAD_DIR } from './storage.constants';

/** Owns every path built under UPLOAD_DIR; nothing else should join paths itself. */
@Injectable()
export class MeetingFileStorage {
  constructor(@Inject(UPLOAD_DIR) private readonly uploadDir: string) {}

  private pathFor(storedName: string): string {
    const resolved = join(this.uploadDir, storedName);
    const prefix = this.uploadDir.endsWith(sep) ? this.uploadDir : this.uploadDir + sep;
    if (!resolved.startsWith(prefix)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  /**
   * Opens a stored file, refusing anything that no longer matches what was uploaded.
   *
   * A row can outlive its bytes, whole or in part — a wiped directory, a DB dump
   * restored next to a stale volume, an interrupted copy. The file is therefore
   * measured before it is opened rather than streamed on trust:
   *   - a missing path 404s here, instead of `createReadStream` raising ENOENT inside
   *     the stream once 200 is already on the wire, which truncates the download;
   *   - a size that disagrees with `expectedSize` means the content is damaged. Stored
   *     files are immutable, so this can only be corruption — and serving it would hand
   *     the caller a silently broken file while claiming success.
   */
  async open(storedName: string, expectedSize: number): Promise<ReadStream> {
    const path = this.pathFor(storedName);

    let stats;
    try {
      stats = await stat(path);
    } catch {
      throw new NotFoundException('File content not found');
    }
    if (!stats.isFile() || stats.size !== expectedSize) {
      throw new NotFoundException('File content not found');
    }

    return createReadStream(path);
  }

  /** Best-effort removal: a missing file is already the desired end state. */
  async remove(storedName: string): Promise<void> {
    await unlink(this.pathFor(storedName)).catch(() => undefined);
  }

  /**
   * The one way anything is removed from disk — the upload handler's rollback, deleting
   * a file, and deleting a whole meeting all come through here, so the rules about how
   * that is done live in exactly one place.
   *
   * Best-effort per file and never throws: a file already gone is the end state we
   * wanted, and one unreadable path must not strand the rest. Returns how many were
   * actually unlinked so a caller can log a shortfall.
   */
  async removeAll(storedNames: readonly string[]): Promise<number> {
    const results = await Promise.all(
      storedNames.map((name) =>
        unlink(this.pathFor(name)).then(
          () => true,
          () => false,
        ),
      ),
    );
    return results.filter(Boolean).length;
  }
}
