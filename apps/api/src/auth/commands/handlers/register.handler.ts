import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserCommand } from '../../../users/commands/create-user.command';
import { AuthResult } from '../../auth.types';
import { TokenService } from '../../token.service';
import { RegisterCommand } from '../register.command';

const BCRYPT_ROUNDS = 10;

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand, AuthResult> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: RegisterCommand): Promise<AuthResult> {
    // Password hashing is an auth concern; the Users module receives a ready
    // passwordHash and stays unaware of bcrypt. Duplicate-email handling (409)
    // lives in CreateUserHandler where the write happens, and propagates back
    // through the bus unchanged.
    const passwordHash = await bcrypt.hash(command.password, BCRYPT_ROUNDS);
    const user = await this.commandBus.execute<CreateUserCommand, User>(
      new CreateUserCommand(command.email, passwordHash),
    );
    return this.tokenService.issue(user.id, user.email);
  }
}
