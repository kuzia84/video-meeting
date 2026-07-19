import { ArgumentsHost, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import { Response } from 'express';
import { avatarTooLargeMessage } from './avatar-upload-validation';

/** The exact text multer reports its cap as; a 413 saying anything else is not the cap. */
const MULTER_FILE_TOO_LARGE = 'File too large';

/**
 * Names the 5 MB limit in the rejection, which Nest does not do on its own. Multer reports
 * the cap as `MulterError('File too large')`, and `transformException` turns that into a
 * `PayloadTooLargeException` carrying the same bare string — the limit never appears.
 * Bound to the avatar-upload route alone (`@UseFilters`), and it rewrites only multer's own
 * message, so a 413 raised by anything else is passed through untouched. Same shape as the
 * meeting-upload `UploadSizeLimitFilter`.
 */
@Catch(PayloadTooLargeException)
export class AvatarSizeLimitFilter implements ExceptionFilter {
  catch(exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const outgoing =
      exception.message === MULTER_FILE_TOO_LARGE
        ? new PayloadTooLargeException(avatarTooLargeMessage())
        : exception;

    const response = host.switchToHttp().getResponse<Response>();
    response.status(outgoing.getStatus()).json(outgoing.getResponse());
  }
}
