import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Post,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from '@prisma/client';
import type { ApiResponse, UserProfile } from '@video-meetings/shared';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetUserByIdQuery } from '../queries/get-user-by-id.query';
import { toProfile } from '../to-profile';
import { AvatarSizeLimitFilter } from './avatar-size-limit.filter';
import { AvatarStorage } from './avatar-storage.service';
import { readAvatarImageType } from './avatar-content-type';
import { UploadAvatarCommand } from './upload-avatar.command';

@UseGuards(JwtAuthGuard)
@Controller('users/me/avatar')
export class AvatarController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly storage: AvatarStorage,
  ) {}

  // POST /users/me/avatar — replace the current user's avatar with an uploaded image.
  // Multer (configured in UsersModule) has already written the file and enforced the
  // 5 MB cap + extension/mimetype allowlist by the time this runs.
  @Post()
  @UseInterceptors(FileInterceptor('avatar'))
  @UseFilters(AvatarSizeLimitFilter)
  async upload(
    @CurrentUser() authUser: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ApiResponse<UserProfile>> {
    if (!file) {
      throw new BadRequestException('Файл аватара обязателен.');
    }

    // The real content check the allowlist cannot do — a PDF renamed to .png passes the
    // filter but fails here. On rejection the just-written file is removed and the
    // previous avatar is left untouched (the command never runs). The thrown error is a
    // 400 for a content mismatch; anything else (e.g. the file vanished — a programmer
    // error per readAvatarImageType's precondition) surfaces as 500, which is correct.
    try {
      await readAvatarImageType(file.path);
    } catch (error) {
      await this.storage.remove(file.filename);
      throw error;
    }

    const updated = await this.commandBus.execute<UploadAvatarCommand, User>(
      new UploadAvatarCommand(authUser.userId, file.filename),
    );
    return { success: true, message: 'Avatar updated', data: toProfile(updated) };
  }

  // GET /users/me/avatar — stream the current user's avatar bytes. Guarded like the rest,
  // so only an authenticated user gets it — the token lives in sessionStorage, so the
  // frontend fetches this as a blob with the Authorization header (a plain <img src> could
  // not carry it) and renders it via an object URL. Content-Type comes from the file's own
  // magic bytes; `nosniff` stops a browser second-guessing it. 404 when no avatar is set
  // or the bytes are gone; a valid token whose account was deleted → 401.
  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  async serve(@CurrentUser() authUser: AuthUser): Promise<StreamableFile> {
    const user = await this.queryBus.execute<GetUserByIdQuery, User | null>(
      new GetUserByIdQuery(authUser.userId),
    );
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!user.avatarUrl) {
      throw new NotFoundException('Avatar not set');
    }

    const { stream, contentType } = await this.storage.open(user.avatarUrl);
    return new StreamableFile(stream, { type: contentType });
  }
}
