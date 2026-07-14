import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { ApiResponse } from '@video-meetings/shared';
import { AuthService } from './auth.service';
import { AuthResult } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterUserDto): Promise<ApiResponse<AuthResult>> {
    const result = await this.authService.register(dto);
    return { success: true, message: 'Registered', data: result };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<ApiResponse<AuthResult>> {
    const result = await this.authService.login(dto);
    return { success: true, message: 'Logged in', data: result };
  }
}
