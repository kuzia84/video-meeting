import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Meeting, Prisma } from '@prisma/client';
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

    // Nothing to change: skip the write rather than round-tripping to Postgres to set
    // every column to what it already holds.
    if ([title, description, startTime, endTime].every((value) => value === undefined)) {
      return existing;
    }

    // Presence, not truthiness: `undefined` is exactly Prisma's "leave this column
    // alone" signal, which the update below relies on. Testing truthiness would lean on
    // @IsDateString elsewhere rejecting '' to stay correct.
    // The rule is about the pair, so each side falls back to what is already stored:
    // moving only the end of a meeting still has to land after its existing start.
    const nextStart = startTime !== undefined ? new Date(startTime) : existing.startTime;
    const nextEnd = endTime !== undefined ? new Date(endTime) : existing.endTime;
    if (nextEnd <= nextStart) {
      throw new BadRequestException('endTime must be after startTime');
    }

    try {
      return await this.prisma.meeting.update({
        where: { id: existing.id },
        data: {
          // `undefined` leaves a column alone; `description: null` clears it.
          title,
          description,
          startTime: startTime !== undefined ? nextStart : undefined,
          endTime: endTime !== undefined ? nextEnd : undefined,
        },
      });
    } catch (error) {
      // The row can vanish between the read above and this write — a second tab deleting
      // the meeting mid-edit. That is the same "not there" the read reports as 404, not
      // a 500, which is what an unhandled Prisma error would become.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Meeting not found');
      }
      throw error;
    }
  }
}
