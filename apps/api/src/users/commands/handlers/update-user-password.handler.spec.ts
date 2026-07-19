import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateUserPasswordCommand } from '../update-user-password.command';
import { UpdateUserPasswordHandler } from './update-user-password.handler';

describe('UpdateUserPasswordHandler', () => {
  function makeHandler(update: jest.Mock) {
    const prisma = { user: { update } } as unknown as PrismaService;
    return new UpdateUserPasswordHandler(prisma);
  }

  it('writes only the passwordHash of the given user', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'u1' });
    const handler = makeHandler(update);

    await handler.execute(new UpdateUserPasswordCommand('u1', 'new-hash'));

    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: 'new-hash' },
    });
  });

  it('maps a missing user (P2025) to a 401', async () => {
    const update = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record to update not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    const handler = makeHandler(update);

    await expect(
      handler.execute(new UpdateUserPasswordCommand('gone', 'new-hash')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rethrows unexpected errors untouched', async () => {
    const update = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = makeHandler(update);

    await expect(handler.execute(new UpdateUserPasswordCommand('u1', 'new-hash'))).rejects.toThrow(
      'boom',
    );
  });
});
