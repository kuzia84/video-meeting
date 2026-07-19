import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { ApiResponse } from '@video-meetings/shared';
import { AuthUser } from './auth.types';
import { AuthResult } from './auth.types';
import { ChangePasswordCommand } from './commands/change-password.command';
import { LoginCommand } from './commands/login.command';
import { RegisterCommand } from './commands/register.command';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('register')
  async register(@Body() dto: RegisterUserDto): Promise<ApiResponse<AuthResult>> {
    const result = await this.commandBus.execute<RegisterCommand, AuthResult>(
      new RegisterCommand(dto.email, dto.password),
    );
    return { success: true, message: 'Registered', data: result };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<ApiResponse<AuthResult>> {
    const result = await this.commandBus.execute<LoginCommand, AuthResult>(
      new LoginCommand(dto.email, dto.password),
    );
    return { success: true, message: 'Logged in', data: result };
  }

  // POST /auth/change-password — protected: only the signed-in user changes their own
  // password (the id comes from the verified JWT, never the body). 204 on success — the
  // current token stays valid, so there is nothing to return. Errors: 400 for a wrong
  // current password or a new password that fails the registration rules, 401 if the
  // account was deleted since the token was issued.
  @Post('change-password')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new ChangePasswordCommand(authUser.userId, dto.currentPassword, dto.newPassword),
    );
  }
}
