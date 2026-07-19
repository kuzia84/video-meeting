import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AvatarStorage } from '../avatar-storage.service';
import { UploadAvatarCommand } from '../upload-avatar.command';
import { UploadAvatarHandler } from './upload-avatar.handler';

describe('UploadAvatarHandler', () => {
  function make(overrides: { findUnique?: jest.Mock; update?: jest.Mock; remove?: jest.Mock }) {
    const findUnique = overrides.findUnique ?? jest.fn();
    const update = overrides.update ?? jest.fn();
    const remove = overrides.remove ?? jest.fn().mockResolvedValue(undefined);
    const prisma = { user: { findUnique, update } } as unknown as PrismaService;
    const storage = { remove } as unknown as AvatarStorage;
    return { handler: new UploadAvatarHandler(prisma, storage), findUnique, update, remove };
  }

  it('updates the link to the new file, then removes the previous one — in that order', async () => {
    const calls: string[] = [];
    const findUnique = jest.fn().mockResolvedValue({ id: 'u1', avatarUrl: 'old-file' });
    const update = jest.fn().mockImplementation(({ data }) => {
      calls.push('update');
      return {
        id: 'u1',
        email: 'a@b.com',
        name: null,
        avatarUrl: data.avatarUrl,
        avatarColor: 'blue',
      };
    });
    const remove = jest.fn().mockImplementation(() => {
      calls.push('remove');
      return Promise.resolve();
    });
    const { handler } = make({ findUnique, update, remove });

    const user = await handler.execute(new UploadAvatarCommand('u1', 'new-file'));

    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { avatarUrl: 'new-file' } });
    expect(remove).toHaveBeenCalledWith('old-file');
    // The link must be updated before the old bytes go, so a crash between them strands a
    // reclaimable orphan rather than leaving a live link to a deleted file.
    expect(calls).toEqual(['update', 'remove']);
    expect(user.avatarUrl).toBe('new-file');
  });

  it('does not remove anything when the user had no previous avatar', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'u1', avatarUrl: null });
    const update = jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: null,
      avatarUrl: 'new-file',
      avatarColor: 'blue',
    });
    const { handler, remove } = make({ findUnique, update });

    await handler.execute(new UploadAvatarCommand('u1', 'new-file'));

    expect(remove).not.toHaveBeenCalled();
  });

  it('removes the just-written file and 401s when the account is gone', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const { handler, update, remove } = make({ findUnique });

    await expect(
      handler.execute(new UploadAvatarCommand('gone', 'new-file')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // The upload must not outlive the failed request, and no link was changed.
    expect(remove).toHaveBeenCalledWith('new-file');
    expect(update).not.toHaveBeenCalled();
  });

  it('removes the just-written file and 401s when the update hits a deleted row', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'u1', avatarUrl: 'old-file' });
    const update = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record to update not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    const { handler, remove } = make({ findUnique, update });

    await expect(handler.execute(new UploadAvatarCommand('u1', 'new-file'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // The new bytes are cleaned up; the previous avatar is left untouched.
    expect(remove).toHaveBeenCalledWith('new-file');
    expect(remove).not.toHaveBeenCalledWith('old-file');
  });
});
