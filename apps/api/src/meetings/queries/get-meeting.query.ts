export class GetMeetingQuery {
  constructor(
    public readonly userId: string,
    public readonly id: string,
  ) {}
}
