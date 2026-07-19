import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  AVATAR_CONTENT_HEAD_BYTES,
  detectAvatarImageType,
  readAvatarImageType,
} from './avatar-content-type';

// Minimal, real magic-byte prefixes for each supported format.
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP_HEAD = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]), // little-endian file size, value irrelevant here
  Buffer.from('WEBP', 'ascii'),
]);
// A PDF (`%PDF-`) — the "renamed to .png" attack the extension filter cannot catch.
const PDF_HEAD = Buffer.from('%PDF-1.7\n', 'ascii');

describe('detectAvatarImageType', () => {
  it('detects JPEG by its FF D8 FF magic', () => {
    expect(detectAvatarImageType(JPEG_HEAD)).toBe('image/jpeg');
  });

  it('detects PNG by its 8-byte signature', () => {
    expect(detectAvatarImageType(PNG_HEAD)).toBe('image/png');
  });

  it('detects WebP by RIFF….WEBP', () => {
    expect(detectAvatarImageType(WEBP_HEAD)).toBe('image/webp');
  });

  it('returns null for a PDF wearing an image extension', () => {
    expect(detectAvatarImageType(PDF_HEAD)).toBeNull();
  });

  it('returns null for a RIFF container that is not WEBP (e.g. WAV)', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
    ]);
    expect(detectAvatarImageType(wav)).toBeNull();
  });

  it('returns null for empty or too-short buffers rather than throwing', () => {
    expect(detectAvatarImageType(Buffer.alloc(0))).toBeNull();
    expect(detectAvatarImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectAvatarImageType(Buffer.from('RIFF', 'ascii'))).toBeNull();
  });

  it('reads at most the head bytes it needs', () => {
    // WebP needs the most (12); nothing here should require more.
    expect(AVATAR_CONTENT_HEAD_BYTES).toBeGreaterThanOrEqual(12);
  });
});

describe('readAvatarImageType', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'avatar-content-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeTemp(name: string, contents: Buffer): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, contents);
    return path;
  }

  it('returns the real type of a valid image on disk', async () => {
    const path = await writeTemp('ok.png', Buffer.concat([PNG_HEAD, Buffer.alloc(50)]));
    await expect(readAvatarImageType(path)).resolves.toBe('image/png');
  });

  it.each([
    ['ok.jpg', JPEG_HEAD, 'image/jpeg'],
    ['ok.webp', WEBP_HEAD, 'image/webp'],
  ])('reads %s from disk as %s', async (name, head, expected) => {
    const path = await writeTemp(name, Buffer.concat([head, Buffer.alloc(50)]));
    await expect(readAvatarImageType(path)).resolves.toBe(expected);
  });

  it('rejects a PDF renamed to .png with a clear, Russian message', async () => {
    const path = await writeTemp('fake.png', Buffer.concat([PDF_HEAD, Buffer.alloc(50)]));
    await expect(readAvatarImageType(path)).rejects.toBeInstanceOf(BadRequestException);
    await expect(readAvatarImageType(path)).rejects.toThrow(/изображени/i);
  });

  it('rejects a file shorter than any signature', async () => {
    const path = await writeTemp('tiny.png', Buffer.from([0x00]));
    await expect(readAvatarImageType(path)).rejects.toBeInstanceOf(BadRequestException);
  });
});
