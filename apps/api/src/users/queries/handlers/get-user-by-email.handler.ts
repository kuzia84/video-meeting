import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetUserByEmailQuery } from '../get-user-by-email.query';

@QueryHandler(GetUserByEmailQuery)
export class GetUserByEmailHandler implements IQueryHandler<GetUserByEmailQuery, User | null> {
  constructor(private readonly prisma: PrismaService) {}

  // Returns the full user (including passwordHash) — this is an internal
  // cross-handler contract consumed by the auth login flow to verify the
  // password; it is never serialized to an HTTP response.
  execute(query: GetUserByEmailQuery): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: query.email } });
  }
}
