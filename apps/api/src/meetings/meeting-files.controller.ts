import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import { MeetingFile } from '@prisma/client';
import type { ApiResponse } from '@video-meetings/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadMeetingFileCommand } from './commands/upload-meeting-file.command';
import { MeetingOwnerGuard } from './guards/meeting-owner.guard';
import { MeetingFileResponse, toMeetingFileResponse } from './meeting-file.response';

@UseGuards(JwtAuthGuard, MeetingOwnerGuard)
@Controller('meetings/:meetingId/files')
export class MeetingFilesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('meetingId') meetingId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ApiResponse<MeetingFileResponse>> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Busboy hands originalname over as latin1, which mangles Cyrillic names.
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const created = await this.commandBus.execute<UploadMeetingFileCommand, MeetingFile>(
      new UploadMeetingFileCommand(
        meetingId,
        originalName,
        file.filename,
        file.size,
        file.mimetype,
      ),
    );
    return { success: true, message: 'File uploaded', data: toMeetingFileResponse(created) };
  }
}
