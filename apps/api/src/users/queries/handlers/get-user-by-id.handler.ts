import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetUserByIdQuery } from '../get-user-by-id.query';

// Looks up a user by id — the primitive behind "the current user", where the
// caller passes the id from the verified JWT. Returns the full User (including
// passwordHash) as an internal cross-handler contract; callers serializing it
// over HTTP must narrow it (see UsersController → UserProfile).
@QueryHandler(GetUserByIdQuery)
export class GetUserByIdHandler implements IQueryHandler<GetUserByIdQuery, User | null> {
  constructor(private readonly prisma: PrismaService) {}

  execute(query: GetUserByIdQuery): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: query.id } });
  }
}
