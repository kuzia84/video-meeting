import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListMeetingFilesQuery } from '../list-meeting-files.query';

/** Ownership of the meeting is already established by `MeetingOwnerGuard`. */
@QueryHandler(ListMeetingFilesQuery)
export class ListMeetingFilesHandler implements IQueryHandler<
  ListMeetingFilesQuery,
  MeetingFile[]
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListMeetingFilesQuery): Promise<MeetingFile[]> {
    // Prisma drops an `undefined` filter instead of matching nothing, which here would
    // widen the query from "this meeting's files" to every file in the database.
    if (typeof query.meetingId !== 'string' || query.meetingId === '') {
      throw new NotFoundException('Meeting not found');
    }

    return this.prisma.meetingFile.findMany({
      where: { meetingId: query.meetingId },
      // `id` breaks ties: uploads within the same millisecond would otherwise order
      // arbitrarily, making the list (and the tests over it) unstable.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
}
