import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Trims before the length check, so a title of only spaces cannot pass @MinLength(1). */
const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMeetingDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;
}
