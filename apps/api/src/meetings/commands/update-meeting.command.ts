export class UpdateMeetingCommand {
  constructor(
    public readonly userId: string,
    public readonly id: string,
    /** Each field: `undefined` means "leave alone". `description: null` clears it. */
    public readonly changes: {
      title?: string;
      description?: string | null;
      startTime?: string;
      endTime?: string;
    },
  ) {}
}
