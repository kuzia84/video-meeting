export class UploadMeetingFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly originalName: string,
    public readonly storedName: string,
    public readonly size: number,
    public readonly mimeType: string,
  ) {}
}
