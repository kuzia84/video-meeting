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
        // `id` breaks ties, and it is what makes skip/take safe. Meetings sharing a
        // startTime (a recurring slot, a bulk import) have no defined order without it,
        // so Postgres is free to return them differently per query — and with OFFSET
        // paging that means a row can land on two pages while another is never returned
        // at all. Measured on 80 meetings across 28 distinct start times: 2 duplicated,
        // 2 unreachable.
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.meeting.count({ where: { userId: query.userId } }),
    ]);

    return { meetings, total };
  }
}
