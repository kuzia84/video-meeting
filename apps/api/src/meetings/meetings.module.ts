import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { CreateMeetingHandler } from './commands/handlers/create-meeting.handler';
import { MeetingsController } from './meetings.controller';

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingsController],
  providers: [CreateMeetingHandler],
})
export class MeetingsModule {}
