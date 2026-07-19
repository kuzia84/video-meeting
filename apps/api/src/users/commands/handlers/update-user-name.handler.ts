import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateUserNameCommand } from '../update-user-name.command';

// Sets the display name of the current user. The id comes from the verified JWT,
// so the only expected failure is that the account was deleted since the token
// was issued — mapped to 401 (like GET /users/me) so the client clears the stale
// session and re-logs in, rather than a 500.
@CommandHandler(UpdateUserNameCommand)
export class UpdateUserNameHandler implements ICommandHandler<UpdateUserNameCommand, User> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateUserNameCommand): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: command.userId },
        data: { name: command.name },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
