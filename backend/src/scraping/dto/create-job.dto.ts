import { IsString, IsArray, IsEnum, IsOptional, IsInt, Min, ArrayNotEmpty } from 'class-validator';

export enum ScrapingMode {
  ONE_TIME = 'ONE_TIME',
  CONTINUOUS = 'CONTINUOUS',
}

export class CreateJobDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  targetCoins: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  attributes: string[];

  @IsEnum(ScrapingMode)
  mode: ScrapingMode;

  @IsOptional()
  @IsInt()
  @Min(5)
  intervalSeconds?: number;
}
