import { IsNotEmpty, IsString } from 'class-validator';
import { IsPassword } from './password-rules';

export class ChangePasswordDto {
  // The current password is only ever compared against the stored hash, so any non-empty
  // string is a valid submission — the rules that matter are applied to the new one.
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  // Same requirements as registration (issue #95) — the one shared rule via IsPassword.
  @IsPassword()
  newPassword!: string;
}
