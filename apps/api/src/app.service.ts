import { Injectable } from '@nestjs/common';
import type { ApiResponse } from '@video-meetings/shared';

@Injectable()
export class AppService {
  getHealth(): ApiResponse<{ status: string }> {
    return {
      success: true,
      message: 'OK',
      data: { status: 'healthy' },
    };
  }
}
