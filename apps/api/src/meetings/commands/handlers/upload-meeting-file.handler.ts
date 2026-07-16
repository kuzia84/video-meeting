import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MeetingFileStorage } from '../../../storage/meeting-file-storage.service';
import { UploadMeetingFileCommand } from '../upload-meeting-file.command';

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<
  UploadMeetingFileCommand,
  MeetingFile
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MeetingFileStorage,
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
      await this.storage.remove(command.storedName);
      throw error;
    }
  }
}
