import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthResult } from '../../auth.types';
import { TokenService } from '../../token.service';
import { LoginCommand } from '../login.command';

// A valid bcrypt hash to compare against when the email is unknown, so a
// login attempt for a non-existent user costs the same time as one for an
// existing user — otherwise response latency leaks whether an email is
// registered (timing-based user enumeration).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-attack-mitigation', 10);

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, AuthResult> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: LoginCommand): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: command.email },
    });

    const passwordMatches = await bcrypt.compare(
      command.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.tokenService.issue(user.id, user.email);
  }
}
