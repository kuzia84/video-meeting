export class DeleteMeetingCommand {
  constructor(
    public readonly userId: string,
    public readonly id: string,
  ) {}
}
