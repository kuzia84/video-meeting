import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UpdateUserPasswordCommand } from '../../../users/commands/update-user-password.command';
import { GetUserByIdQuery } from '../../../users/queries/get-user-by-id.query';
import { BCRYPT_ROUNDS } from '../../bcrypt.constants';
import { ChangePasswordCommand } from '../change-password.command';

/**
 * Changes the signed-in user's password. Mirrors the register/login split: the
 * current-password check and the hashing are Auth's concern, while the write goes to the
 * Users module over the bus (`UpdateUserPasswordCommand`) — Users stays unaware of bcrypt.
 *
 * The user must prove they know the current password, so this reads the row (by the id
 * from the verified JWT), compares, and only then hashes the new password with the same
 * cost as registration and dispatches the update. A wrong current password is a `400`
 * carrying `field: 'currentPassword'` so the form can pin the message to that input; a
 * missing account is a `401`.
 */
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand, void> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const user = await this.queryBus.execute<GetUserByIdQuery, User | null>(
      new GetUserByIdQuery(command.userId),
    );
    if (!user) {
      throw new UnauthorizedException();
    }

    const currentMatches = await bcrypt.compare(command.currentPassword, user.passwordHash);
    if (!currentMatches) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Неверный текущий пароль',
        field: 'currentPassword',
      });
    }

    const passwordHash = await bcrypt.hash(command.newPassword, BCRYPT_ROUNDS);
    await this.commandBus.execute(new UpdateUserPasswordCommand(command.userId, passwordHash));
  }
}
