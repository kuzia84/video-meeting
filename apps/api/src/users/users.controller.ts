import { Body, Controller, Get, Patch, UnauthorizedException, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { User } from '@prisma/client';
import type { ApiResponse, UserProfile } from '@video-meetings/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/auth.types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserNameCommand } from './commands/update-user-name.command';
import { GetUserByIdQuery } from './queries/get-user-by-id.query';

// Narrows the Prisma User to the public profile — passwordHash never leaves here.
function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    avatarColor: user.avatarColor,
  };
}

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

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

    return { success: true, message: 'Profile', data: toProfile(user) };
  }

  // PATCH /users/me — edit the current user's profile. Phase 3 sets the display
  // name; the updated profile is returned so the client refreshes header + avatar
  // letter without a reload.
  @Patch('me')
  async update(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApiResponse<UserProfile>> {
    const user = await this.commandBus.execute<UpdateUserNameCommand, User>(
      new UpdateUserNameCommand(authUser.userId, dto.name),
    );
    return { success: true, message: 'Profile updated', data: toProfile(user) };
  }
}
