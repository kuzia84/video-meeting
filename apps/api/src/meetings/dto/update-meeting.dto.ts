import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * A PATCH body: every field is optional, and the same rules as `CreateMeetingDto` apply
 * to whichever ones are present. The one rule that cannot live here is «endTime after
 * startTime» — with a partial update, either side may be coming from the stored row, so
 * only the handler can see both. See `UpdateMeetingHandler`.
 *
 * `@IsOptional()` skips validation for `null` as well as `undefined`, which is what lets
 * `description: null` clear the field while omitting it leaves it alone.
 */
export class UpdateMeetingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;
}
