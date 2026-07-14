import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Meeting } from '@prisma/client';
import type { ApiResponse } from '@video-meetings/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CreateMeetingCommand } from './commands/create-meeting.command';
import { CreateMeetingDto } from './dto/create-meeting.dto';

@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly commandBus: CommandBus) {}

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
}
