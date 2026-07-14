import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthResult } from '../../auth.types';
import { TokenService } from '../../token.service';
import { RegisterCommand } from '../register.command';

const BCRYPT_ROUNDS = 10;

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand, AuthResult> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: RegisterCommand): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(command.password, BCRYPT_ROUNDS);
    try {
      const user = await this.prisma.user.create({
        data: { email: command.email, passwordHash },
      });
      return this.tokenService.issue(user.id, user.email);
    } catch (err) {
      // The unique constraint on email is the single source of truth for
      // duplicate detection — it is atomic and race-free, so no pre-check
      // query is needed.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }
}
