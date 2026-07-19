import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { UpdateUserPasswordCommand } from '../../../users/commands/update-user-password.command';
import { ChangePasswordCommand } from '../change-password.command';
import { ChangePasswordHandler } from './change-password.handler';

describe('ChangePasswordHandler', () => {
  const currentHash = bcrypt.hashSync('OldPassword1!', 10);

  function make(user: unknown) {
    const execute = jest.fn().mockResolvedValue(user); // QueryBus.execute → the user
    const dispatch = jest.fn().mockResolvedValue(undefined); // CommandBus.execute
    const queryBus = { execute } as unknown as QueryBus;
    const commandBus = { execute: dispatch } as unknown as CommandBus;
    return { handler: new ChangePasswordHandler(queryBus, commandBus), execute, dispatch };
  }

  it('verifies the current password, hashes the new one, and dispatches the update', async () => {
    const { handler, dispatch } = make({ id: 'u1', passwordHash: currentHash });

    await handler.execute(new ChangePasswordCommand('u1', 'OldPassword1!', 'NewPassword2!'));

    expect(dispatch).toHaveBeenCalledTimes(1);
    const command = dispatch.mock.calls[0][0] as UpdateUserPasswordCommand;
    expect(command).toBeInstanceOf(UpdateUserPasswordCommand);
    expect(command.userId).toBe('u1');
    // A real hash of the new password — not the plaintext, and not the old hash.
    expect(command.passwordHash).not.toBe('NewPassword2!');
    expect(command.passwordHash).not.toBe(currentHash);
    expect(await bcrypt.compare('NewPassword2!', command.passwordHash)).toBe(true);
  });

  it('rejects a wrong current password with 400 and does not change anything', async () => {
    const { handler, dispatch } = make({ id: 'u1', passwordHash: currentHash });

    await expect(
      handler.execute(new ChangePasswordCommand('u1', 'WrongPassword!', 'NewPassword2!')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('401s when the account is gone', async () => {
    const { handler, dispatch } = make(null);

    await expect(
      handler.execute(new ChangePasswordCommand('gone', 'OldPassword1!', 'NewPassword2!')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
