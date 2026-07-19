import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { CreateUserHandler } from './commands/handlers/create-user.handler';
import { UpdateUserNameHandler } from './commands/handlers/update-user-name.handler';
import { GetUserByEmailHandler } from './queries/handlers/get-user-by-email.handler';
import { GetUserByIdHandler } from './queries/handlers/get-user-by-id.handler';
import { UsersController } from './users.controller';

// Owns all access to the `user` table. Its write/lookup operations are exposed
// only as CQRS command/query handlers (other modules interact through the bus).
// It also serves the user-facing profile route (GET /users/me), guarded by the
// JwtAuthGuard exported from AuthModule.
@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [UsersController],
  providers: [CreateUserHandler, UpdateUserNameHandler, GetUserByEmailHandler, GetUserByIdHandler],
})
export class UsersModule {}
