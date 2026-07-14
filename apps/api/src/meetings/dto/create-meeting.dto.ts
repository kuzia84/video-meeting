import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMeetingDto {
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
