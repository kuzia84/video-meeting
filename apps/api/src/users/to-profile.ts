import { User } from '@prisma/client';
import type { UserProfile } from '@video-meetings/shared';

/** Narrows the Prisma User to the public profile — passwordHash never leaves here. */
export function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    avatarColor: user.avatarColor,
  };
}
