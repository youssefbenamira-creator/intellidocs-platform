import { IsString, IsUrl, IsEnum, IsOptional, IsInt, Min } from 'class-validator';

export enum JobMode {
  ONE_TIME = 'ONE_TIME',
  CONTINUOUS = 'CONTINUOUS',
}

export class CreateUrlJobDto {
  @IsUrl({}, { message: 'url must be a valid URL' })
  url: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsEnum(JobMode)
  mode: JobMode;

  @IsOptional()
  @IsInt()
  @Min(5)
  intervalSeconds?: number;

  // Table-extraction schema for the scraped pages (template or manual columns)
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  columns?: string[];
}
