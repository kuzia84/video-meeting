export class CreateMeetingCommand {
  constructor(
    public readonly userId: string,
    public readonly title: string,
    public readonly startTime: string,
    public readonly endTime: string,
    public readonly description?: string,
  ) {}
}
