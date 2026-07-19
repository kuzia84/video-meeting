import { open } from 'node:fs/promises';
import { BadRequestException } from '@nestjs/common';

export type AvatarImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * How many leading bytes to read to identify any supported format. WebP needs the most:
 * `RIFF` (0..4) plus `WEBP` (8..12).
 */
export const AVATAR_CONTENT_HEAD_BYTES = 12;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Identifies a supported image purely from its leading bytes — the actual content, not
 * the client-supplied extension or `Content-Type`. Returns `null` for anything that is
 * not a JPEG, PNG or WebP (including a too-short buffer), so a caller decides how to
 * report it rather than this pure function throwing.
 *
 * Signatures: JPEG starts `FF D8 FF`; PNG is its fixed 8-byte signature; WebP is a RIFF
 * container whose form tag at offset 8 is `WEBP` (a plain `RIFF` could equally be a WAV,
 * which is why the form tag is checked, not just `RIFF`).
 */
export function detectAvatarImageType(head: Buffer): AvatarImageType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  if (head.length >= 8 && head.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (
    head.length >= 12 &&
    head.toString('ascii', 0, 4) === 'RIFF' &&
    head.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** What the user reads when the bytes are not a supported image. */
export function avatarContentMismatchMessage(): string {
  return 'Содержимое файла не является изображением JPEG, PNG или WebP.';
}

/**
 * Reads a file's leading bytes and confirms they really are a supported image, throwing a
 * clear (Russian) `BadRequestException` otherwise. This is the check the extension/mimetype
 * filter cannot do: those inspect only client-supplied labels, so a PDF renamed to `.png`
 * with `Content-Type: image/png` sails past the filter and is caught only here.
 *
 * Only the head is read — the file may be up to the size cap, and the signature lives at
 * the front — so this stays cheap regardless of file size.
 */
export async function readAvatarImageType(path: string): Promise<AvatarImageType> {
  const handle = await open(path, 'r');
  try {
    const head = Buffer.alloc(AVATAR_CONTENT_HEAD_BYTES);
    const { bytesRead } = await handle.read(head, 0, AVATAR_CONTENT_HEAD_BYTES, 0);
    const type = detectAvatarImageType(head.subarray(0, bytesRead));
    if (!type) {
      throw new BadRequestException(avatarContentMismatchMessage());
    }
    return type;
  } finally {
    await handle.close();
  }
}
