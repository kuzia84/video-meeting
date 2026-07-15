import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CreateUserHandler } from './commands/handlers/create-user.handler';
import { GetUserByEmailHandler } from './queries/handlers/get-user-by-email.handler';

// Owns all access to the `user` table. Exposes its operations only as CQRS
// command/query handlers (CreateUserCommand, GetUserByEmailQuery) — other
// modules interact through the bus, never by injecting a service from here.
// No controller yet: user-facing HTTP endpoints (profile, etc.) come later.
@Module({
  imports: [CqrsModule],
  providers: [CreateUserHandler, GetUserByEmailHandler],
})
export class UsersModule {}
