import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';
import type { ApiResponse } from '@video-meetings/shared';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @SkipThrottle()
  getHealth(): ApiResponse<{ status: string }> {
    return this.appService.getHealth();
  }
}
