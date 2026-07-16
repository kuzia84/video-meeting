import { ArgumentsHost, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import { Response } from 'express';
import { fileTooLargeMessage } from '../meeting-file-validation';

/**
 * Names the limit in the rejection, which the PRD requires and Nest does not do.
 *
 * Multer reports the cap as `MulterError('File too large')`, and `transformException`
 * in `@nestjs/platform-express` turns that into a `PayloadTooLargeException` carrying
 * that same bare string — the 100 MB never appears. Rewriting the body here is the only
 * place left: `fileFilter` runs before any byte is read and so cannot know the size.
 *
 * Bound to the upload route alone (`@UseFilters`), not globally: on that route multipart
 * is the only thing that can overflow, so every `PayloadTooLargeException` reaching it
 * is the file cap. Applied app-wide it would mislabel unrelated body-size errors.
 */
@Catch(PayloadTooLargeException)
export class UploadSizeLimitFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    // Rebuilt through the exception so the body keeps Nest's standard shape.
    const replacement = new PayloadTooLargeException(fileTooLargeMessage());
    const response = host.switchToHttp().getResponse<Response>();
    response.status(replacement.getStatus()).json(replacement.getResponse());
  }
}
