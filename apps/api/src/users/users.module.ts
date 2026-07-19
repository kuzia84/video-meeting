import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AuthModule } from '../auth/auth.module';
import { UPLOAD_DIR } from '../storage/storage.constants';
import { CreateUserHandler } from './commands/handlers/create-user.handler';
import { UpdateUserNameHandler } from './commands/handlers/update-user-name.handler';
import { AvatarController } from './avatar/avatar.controller';
import { AvatarStorage } from './avatar/avatar-storage.service';
import { avatarFileFilter, MULTER_AVATAR_SIZE_LIMIT } from './avatar/avatar-upload-validation';
import { UploadAvatarHandler } from './avatar/handlers/upload-avatar.handler';
import { GetUserByEmailHandler } from './queries/handlers/get-user-by-email.handler';
import { GetUserByIdHandler } from './queries/handlers/get-user-by-id.handler';
import { UsersController } from './users.controller';

// Owns all access to the `user` table. Its write/lookup operations are exposed
// only as CQRS command/query handlers (other modules interact through the bus).
// It also serves the user-facing profile routes (GET/PATCH /users/me) and avatar
// upload (POST /users/me/avatar), guarded by the JwtAuthGuard exported from AuthModule.
@Module({
  imports: [
    CqrsModule,
    AuthModule,
    // Avatar uploads: a single image, ≤ 5 MB, JPEG/PNG/WebP allowlist, written into the
    // avatars/ subdirectory of UPLOAD_DIR under a UUID name (the client originalname can
    // carry `../`). StorageModule is @Global, so UPLOAD_DIR needs no import here. The
    // destination is created here too because multer does not make its own.
    MulterModule.registerAsync({
      inject: [UPLOAD_DIR],
      // Destination comes from AvatarStorage's own rule (one place computes the path);
      // AvatarStorage creates the directory at startup, before any request can arrive.
      useFactory: (uploadDir: string) => ({
        storage: diskStorage({
          destination: AvatarStorage.directoryFor(uploadDir),
          filename: (_req, _file, cb) => cb(null, randomUUID()),
        }),
        fileFilter: avatarFileFilter,
        // See MULTER_AVATAR_SIZE_LIMIT: one byte past 5 MB, so exactly 5 MB passes.
        limits: { fileSize: MULTER_AVATAR_SIZE_LIMIT, files: 1 },
      }),
    }),
  ],
  controllers: [UsersController, AvatarController],
  providers: [
    CreateUserHandler,
    UpdateUserNameHandler,
    UploadAvatarHandler,
    AvatarStorage,
    GetUserByEmailHandler,
    GetUserByIdHandler,
  ],
})
export class UsersModule {}
