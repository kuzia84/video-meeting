import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma, User } from '@prisma/client';
import { pickAvatarColorName } from '@video-meetings/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUserCommand } from '../create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, User> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateUserCommand): Promise<User> {
    try {
      return await this.prisma.user.create({
        // Every user gets a default-avatar colour at creation, so the circle
        // shown before any upload is stable from the first render.
        data: {
          email: command.email,
          passwordHash: command.passwordHash,
          avatarColor: pickAvatarColorName(),
        },
      });
    } catch (err) {
      // The unique constraint on email is the single source of truth for
      // duplicate detection — it is atomic and race-free, so no pre-check
      // query is needed.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // A plain object body is used as-is by Nest (not merged with the
        // default {statusCode,message,error} shape), so all three keys are
        // set explicitly. `field` lets API consumers map the error onto the
        // specific form field that conflicted, instead of inferring it from
        // the status code alone.
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'Этот email уже зарегистрирован',
          field: 'email',
        });
      }
      throw err;
    }
  }
}
