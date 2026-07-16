import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Runs before the multer interceptor, so a non-owner is rejected before any
 * bytes are written to disk. A meeting owned by someone else is reported as
 * missing — the same 404 as a meeting that does not exist.
 */
@Injectable()
export class MeetingOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const meetingId = request.params.meetingId;
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, userId },
      select: { id: true },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return true;
  }
}
