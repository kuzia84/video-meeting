import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Meeting } from '@prisma/client';
import type { ApiResponse, PaginatedResponse } from '@video-meetings/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CreateMeetingCommand } from './commands/create-meeting.command';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { ListMeetingsDto } from './dto/list-meetings.dto';
import { GetMeetingQuery } from './queries/get-meeting.query';
import { ListMeetingsQuery } from './queries/list-meetings.query';
import { ListMeetingsResult } from './queries/handlers/list-meetings.handler';

@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMeetingDto,
  ): Promise<ApiResponse<Meeting>> {
    const data = await this.commandBus.execute<CreateMeetingCommand, Meeting>(
      new CreateMeetingCommand(user.userId, dto.title, dto.startTime, dto.endTime, dto.description),
    );
    return { success: true, message: 'Meeting created', data };
  }

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMeetingsDto,
  ): Promise<PaginatedResponse<Meeting>> {
    const { meetings, total } = await this.queryBus.execute<ListMeetingsQuery, ListMeetingsResult>(
      new ListMeetingsQuery(user.userId, query.page, query.limit),
    );
    return {
      success: true,
      message: 'Meetings',
      data: meetings,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ApiResponse<Meeting>> {
    const data = await this.queryBus.execute<GetMeetingQuery, Meeting>(
      new GetMeetingQuery(user.userId, id),
    );
    return { success: true, message: 'Meeting', data };
  }
}
