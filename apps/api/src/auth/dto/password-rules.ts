import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt only considers the first 72 bytes of the input, so anything longer is silently
// truncated — reject it explicitly rather than accept a password whose tail is ignored.
export const PASSWORD_MAX_LENGTH = 72;

/**
 * The password rules, defined once so registration and password change enforce **the
 * same requirements** — issue #95 asks the new password to satisfy exactly what
 * registration does, and one shared decorator is what keeps them from drifting apart.
 */
export function IsPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH),
    MaxLength(PASSWORD_MAX_LENGTH),
  );
}
