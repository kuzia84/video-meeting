export class UpdateUserPasswordCommand {
  constructor(
    public readonly userId: string,
    /** A ready bcrypt hash — Users is unaware of bcrypt, as with CreateUserCommand. */
    public readonly passwordHash: string,
  ) {}
}
