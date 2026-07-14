import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Meeting } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMeetingCommand } from '../create-meeting.command';

@CommandHandler(CreateMeetingCommand)
export class CreateMeetingHandler implements ICommandHandler<CreateMeetingCommand, Meeting> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateMeetingCommand): Promise<Meeting> {
    const startTime = new Date(command.startTime);
    const endTime = new Date(command.endTime);
    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be after startTime');
    }

    return this.prisma.meeting.create({
      data: {
        title: command.title,
        description: command.description,
        startTime,
        endTime,
        userId: command.userId,
      },
    });
  }
}
