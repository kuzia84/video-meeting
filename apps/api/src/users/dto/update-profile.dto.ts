import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Trims before the length check, so a name of only spaces cannot pass @MinLength(1). */
const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * The PATCH /users/me body. Phase 3 edits only the display name, so `name` is the
 * single required field: a non-empty string once trimmed, capped so a pathological
 * value cannot be stored. Clearing the name back to empty is out of scope here — the
 * form always submits a name.
 */
export class UpdateProfileDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
