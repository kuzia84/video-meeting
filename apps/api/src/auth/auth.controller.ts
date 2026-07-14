import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { ApiResponse } from '@video-meetings/shared';
import { AuthResult } from './auth.types';
import { LoginCommand } from './commands/login.command';
import { RegisterCommand } from './commands/register.command';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';

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
}
