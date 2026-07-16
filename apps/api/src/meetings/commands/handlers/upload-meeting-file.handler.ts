import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UPLOAD_DIR } from '../../../storage/storage.constants';
import { UploadMeetingFileCommand } from '../upload-meeting-file.command';

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<
  UploadMeetingFileCommand,
  MeetingFile
> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UPLOAD_DIR) private readonly uploadDir: string,
  ) {}

  async execute(command: UploadMeetingFileCommand): Promise<MeetingFile> {
    try {
      return await this.prisma.meetingFile.create({
        data: {
          meetingId: command.meetingId,
          originalName: command.originalName,
          storedName: command.storedName,
          size: command.size,
          mimeType: command.mimeType,
        },
      });
    } catch (error) {
      // Multer already wrote the file; without this it would outlive the failed row.
      await unlink(join(this.uploadDir, command.storedName)).catch(() => undefined);
      throw error;
    }
  }
}
