import { Controller, Get, UnauthorizedException, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { User } from '@prisma/client';
import type { ApiResponse, UserProfile } from '@video-meetings/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { GetUserByIdQuery } from './queries/get-user-by-id.query';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly queryBus: QueryBus) {}

  // GET /users/me — the profile of the current (JWT-identified) user.
  @Get('me')
  async me(@CurrentUser() authUser: AuthUser): Promise<ApiResponse<UserProfile>> {
    const user = await this.queryBus.execute<GetUserByIdQuery, User | null>(
      new GetUserByIdQuery(authUser.userId),
    );
    // Token is valid but the account behind it is gone (deleted since issuance):
    // treat the session as invalid so the client clears the token and re-logs in.
    if (!user) {
      throw new UnauthorizedException();
    }

    // Narrow the Prisma User to the public profile — passwordHash never leaves here.
    const data: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
    return { success: true, message: 'Profile', data };
  }
}
