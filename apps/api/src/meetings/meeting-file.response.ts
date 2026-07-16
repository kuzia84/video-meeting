import { MeetingFile } from '@prisma/client';

/** Client-facing file metadata: `storedName` stays internal to the server. */
export interface MeetingFileResponse {
  id: string;
  meetingId: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: Date;
}

export function toMeetingFileResponse(file: MeetingFile): MeetingFileResponse {
  return {
    id: file.id,
    meetingId: file.meetingId,
    originalName: file.originalName,
    size: file.size,
    mimeType: file.mimeType,
    createdAt: file.createdAt,
  };
}
