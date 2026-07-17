import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Meeting } from '@prisma/client';
import type { ApiResponse, PaginatedResponse } from '@video-meetings/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CreateMeetingCommand } from './commands/create-meeting.command';
import { DeleteMeetingCommand } from './commands/delete-meeting.command';
import { UpdateMeetingCommand } from './commands/update-meeting.command';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { ListMeetingsDto } from './dto/list-meetings.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
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

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
  ): Promise<ApiResponse<Meeting>> {
    // Spelled out rather than passing `dto` through: a command is a plain value object,
    // and handing the class-validator instance to the bus would drag the HTTP layer's
    // shape into the handler. See «DTO ≠ Command» in docs/architecture/cqrs.md.
    const data = await this.commandBus.execute<UpdateMeetingCommand, Meeting>(
      new UpdateMeetingCommand(user.userId, id, {
        title: dto.title,
        description: dto.description,
        startTime: dto.startTime,
        endTime: dto.endTime,
      }),
    );
    return { success: true, message: 'Meeting updated', data };
  }

  @Delete(':id')
  // 204: the meeting is gone, so there is nothing left to return.
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.commandBus.execute<DeleteMeetingCommand, void>(
      new DeleteMeetingCommand(user.userId, id),
    );
  }
}
