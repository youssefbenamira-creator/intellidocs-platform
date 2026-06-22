import { IsString, IsArray, IsEnum, IsOptional, IsInt, Min } from 'class-validator';

export enum ScrapingStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export class UpdateJobDto {
  @IsOptional()
  @IsEnum(ScrapingStatus)
  status?: ScrapingStatus;

  @IsOptional()
  @IsInt()
  @Min(5)
  intervalSeconds?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetCoins?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attributes?: string[];
}
