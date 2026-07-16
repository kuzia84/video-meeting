import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import { MeetingFile } from '@prisma/client';
import type { ApiResponse } from '@video-meetings/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MeetingFileStorage } from '../storage/meeting-file-storage.service';
import { UploadMeetingFileCommand } from './commands/upload-meeting-file.command';
import { decodeOriginalName } from './decode-original-name';
import { MeetingOwnerGuard } from './guards/meeting-owner.guard';
import { MeetingFileResponse, toMeetingFileResponse } from './meeting-file.response';
import { GetMeetingFileQuery } from './queries/get-meeting-file.query';
import { ListMeetingFilesQuery } from './queries/list-meeting-files.query';

@UseGuards(JwtAuthGuard, MeetingOwnerGuard)
@Controller('meetings/:meetingId/files')
export class MeetingFilesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly storage: MeetingFileStorage,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('meetingId') meetingId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ApiResponse<MeetingFileResponse>> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const created = await this.commandBus.execute<UploadMeetingFileCommand, MeetingFile>(
      new UploadMeetingFileCommand(
        meetingId,
        decodeOriginalName(file.originalname),
        file.filename,
        file.size,
        file.mimetype,
      ),
    );
    return { success: true, message: 'File uploaded', data: toMeetingFileResponse(created) };
  }

  @Get()
  async list(@Param('meetingId') meetingId: string): Promise<ApiResponse<MeetingFileResponse[]>> {
    const files = await this.queryBus.execute<ListMeetingFilesQuery, MeetingFile[]>(
      new ListMeetingFilesQuery(meetingId),
    );
    return { success: true, message: 'Meeting files', data: files.map(toMeetingFileResponse) };
  }

  @Get(':fileId')
  async download(
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
  ): Promise<StreamableFile> {
    const file = await this.queryBus.execute<GetMeetingFileQuery, MeetingFile>(
      new GetMeetingFileQuery(meetingId, fileId),
    );

    return new StreamableFile(await this.storage.openReadStream(file.storedName), {
      type: file.mimeType,
      length: file.size,
      // RFC 5987 form: a bare filename="…" is ASCII-only and would mangle a Cyrillic name.
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    });
  }
}
