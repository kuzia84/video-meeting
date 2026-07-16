import { createReadStream, ReadStream } from 'node:fs';
import { access, constants, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UPLOAD_DIR } from './storage.constants';

/** Owns every path built under UPLOAD_DIR; nothing else should join paths itself. */
@Injectable()
export class MeetingFileStorage {
  constructor(@Inject(UPLOAD_DIR) private readonly uploadDir: string) {}

  pathFor(storedName: string): string {
    return join(this.uploadDir, storedName);
  }

  /**
   * A row can outlive its bytes (wiped directory, restored DB dump), so existence is
   * checked up front: `createReadStream` would raise ENOENT inside the stream instead,
   * once 200 is already on the wire, and the client would see a truncated download
   * rather than an error.
   */
  async openReadStream(storedName: string): Promise<ReadStream> {
    const path = this.pathFor(storedName);
    try {
      await access(path, constants.R_OK);
    } catch {
      throw new NotFoundException('File content not found');
    }
    return createReadStream(path);
  }

  /** Best-effort removal: a missing file is already the desired end state. */
  async remove(storedName: string): Promise<void> {
    await unlink(this.pathFor(storedName)).catch(() => undefined);
  }
}
