import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterUserDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  // Max length 72: bcrypt only considers the first 72 bytes of the input,
  // so anything longer is silently truncated — reject it explicitly.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
