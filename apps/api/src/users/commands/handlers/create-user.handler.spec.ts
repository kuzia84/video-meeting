import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AVATAR_COLOR_NAMES } from '@video-meetings/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUserCommand } from '../create-user.command';
import { CreateUserHandler } from './create-user.handler';

describe('CreateUserHandler', () => {
  function makeHandler(create: jest.Mock) {
    const prisma = { user: { create } } as unknown as PrismaService;
    return new CreateUserHandler(prisma);
  }

  it('assigns a default-avatar colour from the palette on create', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({
      id: 'u1',
      ...data,
    }));
    const handler = makeHandler(create);

    await handler.execute(new CreateUserCommand('a@b.com', 'hash'));

    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0];
    expect(data).toMatchObject({ email: 'a@b.com', passwordHash: 'hash' });
    expect(AVATAR_COLOR_NAMES).toContain(data.avatarColor);
  });

  it('translates a duplicate-email violation into a 409 conflict', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const handler = makeHandler(create);

    await expect(handler.execute(new CreateUserCommand('a@b.com', 'hash'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
