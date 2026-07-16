import { ArgumentsHost, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import { Response } from 'express';
import { fileTooLargeMessage } from '../meeting-file-validation';

/** The exact text multer reports its cap as; a 413 saying anything else is not the cap. */
const MULTER_FILE_TOO_LARGE = 'File too large';

/**
 * Names the limit in the rejection, which the PRD requires and Nest does not do.
 *
 * Multer reports the cap as `MulterError('File too large')`, and `transformException`
 * in `@nestjs/platform-express` turns that into a `PayloadTooLargeException` carrying
 * that same bare string — the 100 MB never appears. Rewriting the body here is the only
 * place left: `fileFilter` runs before any byte is read and so cannot know the size.
 *
 * Bound to the upload route alone (`@UseFilters`), never globally. It also rewrites only
 * multer's own message: a 413 raised by anything else — a JSON body added to this route
 * later, a proxy-level limit — is passed through as it came, rather than being relabelled
 * as the file being too large.
 */
@Catch(PayloadTooLargeException)
export class UploadSizeLimitFilter implements ExceptionFilter {
  catch(exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const outgoing =
      exception.message === MULTER_FILE_TOO_LARGE
        ? // Rebuilt through the exception so the body keeps Nest's standard shape.
          new PayloadTooLargeException(fileTooLargeMessage())
        : exception;

    const response = host.switchToHttp().getResponse<Response>();
    response.status(outgoing.getStatus()).json(outgoing.getResponse());
  }
}
