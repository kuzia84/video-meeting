import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateUserNameCommand } from '../update-user-name.command';
import { UpdateUserNameHandler } from './update-user-name.handler';

describe('UpdateUserNameHandler', () => {
  function makeHandler(update: jest.Mock) {
    const prisma = { user: { update } } as unknown as PrismaService;
    return new UpdateUserNameHandler(prisma);
  }

  it('updates only the name of the given user and returns the updated row', async () => {
    const update = jest.fn().mockImplementation(({ data }) => ({
      id: 'u1',
      email: 'a@b.com',
      name: data.name,
      avatarUrl: null,
      avatarColor: 'blue',
    }));
    const handler = makeHandler(update);

    const user = await handler.execute(new UpdateUserNameCommand('u1', 'Ада'));

    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'Ада' } });
    expect(user.name).toBe('Ада');
  });

  it('maps a missing user (P2025) to a 401 so the stale session is cleared', async () => {
    const update = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record to update not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    const handler = makeHandler(update);

    await expect(handler.execute(new UpdateUserNameCommand('gone', 'Ада'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rethrows unexpected errors untouched', async () => {
    const update = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = makeHandler(update);

    await expect(handler.execute(new UpdateUserNameCommand('u1', 'Ада'))).rejects.toThrow('boom');
  });
});
