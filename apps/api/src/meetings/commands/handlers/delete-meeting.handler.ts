import { Logger, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { MeetingFileStorage } from '../../../storage/meeting-file-storage.service';
import { DeleteMeetingCommand } from '../delete-meeting.command';

@CommandHandler(DeleteMeetingCommand)
export class DeleteMeetingHandler implements ICommandHandler<DeleteMeetingCommand, void> {
  private readonly logger = new Logger(DeleteMeetingHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MeetingFileStorage,
  ) {}

  async execute(command: DeleteMeetingCommand): Promise<void> {
    if (!command.id) {
      throw new NotFoundException('Meeting not found');
    }

    // The file rows go with the meeting by cascade, but their bytes do not — the schema
    // has always said so. Read the names before the delete, or they are unreachable
    // afterwards and the disk keeps them forever.
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: command.id, userId: command.userId },
      select: { id: true, files: { select: { storedName: true } } },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Rows first, then bytes — same order as deleting a single file, and for the same
    // reason: a failure here should cost disk space, not leave rows pointing at nothing.
    await this.prisma.meeting.delete({ where: { id: meeting.id } });

    const storedNames = meeting.files.map((file) => file.storedName);
    const removed = await this.storage.removeAll(storedNames);
    if (removed < storedNames.length) {
      this.logger.warn(
        `Deleted meeting ${meeting.id}, but ${storedNames.length - removed} of ` +
          `${storedNames.length} file(s) remain on disk`,
      );
    }
  }
}
