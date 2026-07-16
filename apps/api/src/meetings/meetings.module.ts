import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AuthModule } from '../auth/auth.module';
import { UPLOAD_DIR } from '../storage/storage.constants';
import { CreateMeetingHandler } from './commands/handlers/create-meeting.handler';
import { UploadMeetingFileHandler } from './commands/handlers/upload-meeting-file.handler';
import { MeetingFilesController } from './meeting-files.controller';
import { MeetingsController } from './meetings.controller';
import { GetMeetingHandler } from './queries/handlers/get-meeting.handler';
import { ListMeetingsHandler } from './queries/handlers/list-meetings.handler';

@Module({
  imports: [
    CqrsModule,
    AuthModule,
    // StorageModule is @Global and imported in AppModule, so UPLOAD_DIR needs no import here.
    MulterModule.registerAsync({
      inject: [UPLOAD_DIR],
      useFactory: (uploadDir: string) => ({
        storage: diskStorage({
          destination: uploadDir,
          // originalname comes from the client and may carry `../` — the disk name is ours.
          filename: (_req, _file, cb) => cb(null, randomUUID()),
        }),
        limits: { files: 1 },
      }),
    }),
  ],
  controllers: [MeetingsController, MeetingFilesController],
  providers: [
    CreateMeetingHandler,
    ListMeetingsHandler,
    GetMeetingHandler,
    UploadMeetingFileHandler,
  ],
})
export class MeetingsModule {}
