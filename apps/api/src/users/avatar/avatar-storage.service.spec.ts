import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AVATAR_SUBDIR, AvatarStorage } from './avatar-storage.service';

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
});
