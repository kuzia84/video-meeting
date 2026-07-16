import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { decodeOriginalName } from './decode-original-name';

export const MAX_UPLOAD_MB = 100;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** The formats the PRD accepts: audio and video recordings of a meeting. */
export const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.mp4']);

/**
 * Declared types tolerated for those extensions. Deliberately broad — clients disagree
 * on what to send for these formats (`audio/x-wav` vs `audio/wave`, `audio/x-m4a` vs
 * `audio/mp4`), and some send `application/octet-stream` for anything they cannot name.
 * Rejecting those would refuse legitimate recordings.
 *
 * This list is hygiene, not security: `mimetype` is simply a header the client writes,
 * so it is the **extension** that does the real filtering here, and it is client-controlled
 * too. Neither is a content check — see the type section of the research doc. That is an
 * accepted compromise: the PRD puts antivirus out of scope, uploads are never executed,
 * and only the owner can read them back.
 */
export const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'video/mp4',
  'application/octet-stream',
]);

const ALLOWED_LIST = 'mp3, wav, m4a, mp4';

export function fileTooLargeMessage(): string {
  return `Файл слишком большой. Максимальный размер — ${MAX_UPLOAD_MB} МБ.`;
}

export function unsupportedTypeMessage(reason: string): string {
  return `Тип файла не поддерживается: ${reason}. Разрешены: ${ALLOWED_LIST}.`;
}

/**
 * Rejects unsupported files before multer writes a single byte — a `ParseFilePipe`
 * validator would only run once the whole file is already on disk.
 */
export function meetingFileFilter(
  _req: unknown,
  file: { originalname: string; mimetype: string },
  cb: (error: Error | null, acceptFile: boolean) => void,
): void {
  const extension = extname(decodeOriginalName(file.originalname)).toLowerCase();

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
