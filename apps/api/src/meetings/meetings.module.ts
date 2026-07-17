import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AuthModule } from '../auth/auth.module';
import { UPLOAD_DIR } from '../storage/storage.constants';
import { CreateMeetingHandler } from './commands/handlers/create-meeting.handler';
import { UpdateMeetingHandler } from './commands/handlers/update-meeting.handler';
import { UploadMeetingFileHandler } from './commands/handlers/upload-meeting-file.handler';
import { MeetingFilesController } from './meeting-files.controller';
import { meetingFileFilter, MULTER_FILE_SIZE_LIMIT } from './meeting-file-validation';
import { MeetingsController } from './meetings.controller';
import { GetMeetingFileHandler } from './queries/handlers/get-meeting-file.handler';
import { GetMeetingHandler } from './queries/handlers/get-meeting.handler';
import { ListMeetingFilesHandler } from './queries/handlers/list-meeting-files.handler';
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
        fileFilter: meetingFileFilter,
        // fileSize is what actually enforces the cap: it tears the stream down at the
        // limit, whereas a ParseFilePipe validator would only run once all 101 MB are
        // already written. See docs/meeting-file-upload-research.md. The value is one
        // byte past the largest legal file on purpose — see MULTER_FILE_SIZE_LIMIT.
        limits: { fileSize: MULTER_FILE_SIZE_LIMIT, files: 1 },
      }),
    }),
  ],
  controllers: [MeetingsController, MeetingFilesController],
  providers: [
    CreateMeetingHandler,
    UpdateMeetingHandler,
    ListMeetingsHandler,
    GetMeetingHandler,
    UploadMeetingFileHandler,
    ListMeetingFilesHandler,
    GetMeetingFileHandler,
  ],
})
export class MeetingsModule {}
