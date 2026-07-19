import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { AVATAR_SUBDIR, AvatarStorage } from './avatar-storage.service';

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('AvatarStorage', () => {
  let base: string;
  let storage: AvatarStorage;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'avatar-storage-'));
    storage = new AvatarStorage(base);
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('keeps avatars in a subdirectory so the meeting-file orphan sweep never sees them', () => {
    // The sweep reads only top-level files of UPLOAD_DIR; a subdirectory entry is skipped
    // by its isFile() check, so avatar bytes are safe from it.
    expect(storage.directory).toBe(join(base, AVATAR_SUBDIR));
  });

  it('creates its directory on construction (multer does not make its destination)', () => {
    expect(existsSync(join(base, AVATAR_SUBDIR))).toBe(true);
  });

  it('removes a stored file', async () => {
    const path = join(storage.directory, 'abc');
    await writeFile(path, 'bytes');
    await storage.remove('abc');
    await expect(stat(path)).rejects.toThrow();
  });

  it('is a no-op (never throws) when removing a file that is already gone', async () => {
    await expect(storage.remove('does-not-exist')).resolves.toBeUndefined();
  });

  it('opens a stored avatar, returning the bytes and the content type from its magic bytes', async () => {
    const body = Buffer.concat([PNG_HEAD, Buffer.alloc(32, 7)]);
    await writeFile(join(storage.directory, 'pic'), body);

    const { stream, contentType } = await storage.open('pic');

    expect(contentType).toBe('image/png');
    expect(await drain(stream)).toEqual(body);
  });

  it('404s when the avatar file is missing', async () => {
    await expect(storage.open('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the stored bytes are no longer a supported image (corruption)', async () => {
    await writeFile(join(storage.directory, 'broken'), Buffer.from('not an image at all'));
    await expect(storage.open('broken')).rejects.toBeInstanceOf(NotFoundException);
  });
});
