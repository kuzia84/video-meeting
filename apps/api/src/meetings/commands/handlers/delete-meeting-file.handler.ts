import { Logger, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { MeetingFileStorage } from '../../../storage/meeting-file-storage.service';
import { DeleteMeetingFileCommand } from '../delete-meeting-file.command';

@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<DeleteMeetingFileCommand, void> {
  private readonly logger = new Logger(DeleteMeetingFileHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MeetingFileStorage,
  ) {}

  async execute(command: DeleteMeetingFileCommand): Promise<void> {
    // Prisma ignores an `undefined` filter rather than matching nothing.
    if (!command.meetingId || !command.fileId) {
      throw new NotFoundException('File not found');
    }

    // Filters on the meeting *and* its owner: the file must belong to this meeting, and
    // the meeting to this user. Anything else is reported as missing, never as forbidden.
    const file = await this.prisma.meetingFile.findFirst({
      where: {
        id: command.fileId,
        meetingId: command.meetingId,
        meeting: { userId: command.userId },
      },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Row first, then bytes. The reverse order fails badly: if the row survived a
    // successful unlink, the meeting would list a file that downloads 404s. This way the
    // worst case is bytes nobody references — wasted space, nothing broken.
    await this.prisma.meetingFile.delete({ where: { id: file.id } });

    const removed = await this.storage.removeAll([file.storedName]);
    if (removed === 0) {
      // Deliberately not an error: the row is gone, which is what the caller asked for.
      // But it leaves disk to reclaim, so it must not pass silently.
      this.logger.warn(`Deleted file ${file.id} but its bytes remain at ${file.storedName}`);
    }
  }
}
