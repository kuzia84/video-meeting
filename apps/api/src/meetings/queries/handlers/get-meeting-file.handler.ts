import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetMeetingFileQuery } from '../get-meeting-file.query';

@QueryHandler(GetMeetingFileQuery)
export class GetMeetingFileHandler implements IQueryHandler<GetMeetingFileQuery, MeetingFile> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingFileQuery): Promise<MeetingFile> {
    // Prisma ignores an `undefined` filter rather than matching nothing, which would
    // turn a missing fileId into "hand back this meeting's first file".
    if (typeof query.fileId !== 'string' || query.fileId === '') {
      throw new NotFoundException('File not found');
    }

    // Filtering on meetingId too is what stops a file of another meeting from being
    // fetched by id — the guard only proves the caller owns the meeting in the path.
    const file = await this.prisma.meetingFile.findFirst({
      where: { id: query.fileId, meetingId: query.meetingId },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return file;
  }
}
