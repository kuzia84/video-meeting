import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Meeting } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListMeetingsQuery } from '../list-meetings.query';

export interface ListMeetingsResult {
  meetings: Meeting[];
  total: number;
}

@QueryHandler(ListMeetingsQuery)
export class ListMeetingsHandler implements IQueryHandler<ListMeetingsQuery, ListMeetingsResult> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListMeetingsQuery): Promise<ListMeetingsResult> {
    const [meetings, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where: { userId: query.userId },
        orderBy: { startTime: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.meeting.count({ where: { userId: query.userId } }),
    ]);

    return { meetings, total };
  }
}
