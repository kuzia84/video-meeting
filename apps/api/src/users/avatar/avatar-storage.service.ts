import { createReadStream, mkdirSync, ReadStream } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UPLOAD_DIR } from '../../storage/storage.constants';
import {
  AVATAR_CONTENT_HEAD_BYTES,
  AvatarImageType,
  detectAvatarImageType,
} from './avatar-content-type';

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

  /**
   * Opens a stored avatar for serving, returning both the byte stream and the content type
   * read back from the file's own magic bytes — the authoritative type, since no column
   * records it. A missing file, or bytes that no longer look like a supported image (the
   * file was corrupted or wiped), 404s here rather than letting `createReadStream` raise
   * ENOENT inside the stream once 200 is already on the wire — the same reasoning as
   * `MeetingFileStorage.open`. A tiny residual window remains — the file could be unlinked
   * between this check and the stream opening — but avatars are immutable (a replace writes
   * a new UUID and only unlinks the *previous* name), so it is as narrow as the meeting-file
   * case and left as accepted.
   */
  async open(storedName: string): Promise<{ stream: ReadStream; contentType: AvatarImageType }> {
    const path = this.pathFor(storedName);

    let handle;
    try {
      handle = await open(path, 'r');
    } catch {
      throw new NotFoundException('Avatar content not found');
    }
    let contentType: AvatarImageType | null;
    try {
      const head = Buffer.alloc(AVATAR_CONTENT_HEAD_BYTES);
      const { bytesRead } = await handle.read(head, 0, AVATAR_CONTENT_HEAD_BYTES, 0);
      contentType = detectAvatarImageType(head.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
    if (!contentType) {
      throw new NotFoundException('Avatar content not found');
    }

    return { stream: createReadStream(path), contentType };
  }

  /** Best-effort removal: a missing file is already the desired end state. */
  async remove(storedName: string): Promise<void> {
    await unlink(this.pathFor(storedName)).catch(() => undefined);
  }
}
