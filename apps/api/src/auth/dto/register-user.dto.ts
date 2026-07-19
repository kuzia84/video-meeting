import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { IsPassword } from './password-rules';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterUserDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  // Same rules as password change — see IsPassword (min 8, max 72 for bcrypt's 72-byte cap).
  @IsPassword()
  password!: string;
}
