import { IsString, IsOptional, IsArray, MinLength } from 'class-validator';

export class CreateTemplateDto {
  @IsString() @MinLength(1)
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsArray() @IsString({ each: true })
  columns: string[];

  @IsOptional() @IsString()
  workspaceId?: string;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  columns?: string[];
}
