import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AvatarStorage } from '../avatar-storage.service';
import { UploadAvatarCommand } from '../upload-avatar.command';

/**
 * Points the user at a newly uploaded avatar and reclaims the previous one.
 *
 * Multer has already written the new file when this runs (content was validated in the
 * controller). The order is deliberate and matches the deletion rule used elsewhere:
 * **update the link first, then delete the previous file.** A crash between the two then
 * strands the old bytes (a reclaimable orphan) rather than leaving the user's link
 * pointing at a file that is already gone. On any failure to update — the account was
 * deleted since the token was issued — the just-written file is removed so a rejected
 * upload never outlives its request, and the previous avatar is left untouched.
 */
@CommandHandler(UploadAvatarCommand)
export class UploadAvatarHandler implements ICommandHandler<UploadAvatarCommand, User> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AvatarStorage,
  ) {}

  async execute(command: UploadAvatarCommand): Promise<User> {
    const current = await this.prisma.user.findUnique({ where: { id: command.userId } });
    if (!current) {
      await this.storage.remove(command.storedName);
      throw new UnauthorizedException();
    }

    let updated: User;
    try {
      updated = await this.prisma.user.update({
        where: { id: command.userId },
        data: { avatarUrl: command.storedName },
      });
    } catch (error) {
      await this.storage.remove(command.storedName);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new UnauthorizedException();
      }
      throw error;
    }

    // Link now points at the new file; the old bytes are safe to reclaim. Best-effort,
    // and only when there was a previous file distinct from the new one.
    if (current.avatarUrl && current.avatarUrl !== command.storedName) {
      await this.storage.remove(current.avatarUrl);
    }

    return updated;
  }
}
