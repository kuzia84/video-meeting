import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from '@prisma/client';
import type { ApiResponse, UserProfile } from '@video-meetings/shared';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
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
    // previous avatar is left untouched (the command never runs).
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
}
