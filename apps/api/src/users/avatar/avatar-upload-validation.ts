import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';

const MAX_AVATAR_MB = 5;

/** The largest avatar that is still accepted. A file of exactly this size must pass. */
export const MAX_AVATAR_BYTES = MAX_AVATAR_MB * 1024 * 1024;

/**
 * What to hand multer as `limits.fileSize` — one byte past the largest legal file, not
 * the limit itself. Busboy trips when the byte count *reaches* `fileSize`
 * (`if (fileSize === fileSizeLimit) … emit('limit')`), so passing `MAX_AVATAR_BYTES`
 * verbatim would reject a file of exactly 5 MB while the message promises 5 MB is fine.
 * Same reasoning (and the same `+ 1`) as `MULTER_FILE_SIZE_LIMIT` for meeting files.
 */
export const MULTER_AVATAR_SIZE_LIMIT = MAX_AVATAR_BYTES + 1;

/** The image formats the PRD accepts for an avatar. */
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Declared types tolerated for those extensions. Narrower than the meeting-file list on
 * purpose: a browser file picker reliably reports `image/jpeg|png|webp`, so there is no
 * need to wave through `application/octet-stream` here. This is still only hygiene —
 * `mimetype` and the extension are both client-written; the real content check (magic
 * bytes) is a separate, later step, not this filter.
 */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ALLOWED_LIST = 'JPEG, PNG, WebP';

export function avatarTooLargeMessage(): string {
  return `Файл слишком большой. Максимальный размер — ${MAX_AVATAR_MB} МБ.`;
}

function unsupportedTypeMessage(reason: string): string {
  return `Тип файла не поддерживается: ${reason}. Разрешены: ${ALLOWED_LIST}.`;
}

/**
 * Rejects unsupported files before multer writes a single byte. The extension is read
 * from the raw `originalname` — for these formats the extension is ASCII, so busboy's
 * latin1 decode of a non-ASCII base name (`фото.png`) cannot corrupt it.
 */
export function avatarFileFilter(
  _req: unknown,
  file: { originalname: string; mimetype: string },
  cb: (error: Error | null, acceptFile: boolean) => void,
): void {
  const extension = extname(file.originalname).toLowerCase();

  if (extension === '') {
    return cb(new BadRequestException(unsupportedTypeMessage('у файла нет расширения')), false);
  }
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return cb(new BadRequestException(unsupportedTypeMessage(extension)), false);
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return cb(new BadRequestException(unsupportedTypeMessage(file.mimetype)), false);
  }

  cb(null, true);
}
