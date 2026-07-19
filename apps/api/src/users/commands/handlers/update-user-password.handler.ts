import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateUserPasswordCommand } from '../update-user-password.command';

// Writes a ready password hash to the user row. Users owns the `user` table; the hashing
// and the current-password check stay in Auth (see ChangePasswordHandler), which dispatches
// this. A `P2025` — the account was deleted since the token was issued — maps to 401, like
// the other single-field updates here.
@CommandHandler(UpdateUserPasswordCommand)
export class UpdateUserPasswordHandler implements ICommandHandler<UpdateUserPasswordCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateUserPasswordCommand): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: command.userId },
        data: { passwordHash: command.passwordHash },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
