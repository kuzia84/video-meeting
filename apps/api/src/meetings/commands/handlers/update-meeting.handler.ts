import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Meeting } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateMeetingCommand } from '../update-meeting.command';

@CommandHandler(UpdateMeetingCommand)
export class UpdateMeetingHandler implements ICommandHandler<UpdateMeetingCommand, Meeting> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateMeetingCommand): Promise<Meeting> {
    // Prisma drops an `undefined` filter instead of matching nothing, which here would
    // hand back some other meeting of this user's.
    if (typeof command.id !== 'string' || command.id === '') {
      throw new NotFoundException('Meeting not found');
    }

    // Read first — both to establish ownership (an unowned meeting is reported missing,
    // exactly like one that does not exist) and because the time rule below needs the
    // stored values a partial update leaves untouched.
    const existing = await this.prisma.meeting.findFirst({
      where: { id: command.id, userId: command.userId },
    });
    if (!existing) {
      throw new NotFoundException('Meeting not found');
    }

    const { title, description, startTime, endTime } = command.changes;

    // The rule is about the pair, so each side falls back to what is already stored:
    // moving only the end of a meeting still has to land after its existing start.
    const nextStart = startTime ? new Date(startTime) : existing.startTime;
    const nextEnd = endTime ? new Date(endTime) : existing.endTime;
    if (nextEnd <= nextStart) {
      throw new BadRequestException('endTime must be after startTime');
    }

    return this.prisma.meeting.update({
      where: { id: existing.id },
      data: {
        // `undefined` tells Prisma to leave a column alone; `description: null` clears it.
        title,
        description,
        startTime: startTime ? nextStart : undefined,
        endTime: endTime ? nextEnd : undefined,
      },
    });
  }
}
