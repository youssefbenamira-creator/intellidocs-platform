import { IsString, IsOptional, IsInt, IsIn, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString() @MinLength(1)
  name: string;
}

export class AddMemberDto {
  @IsInt()
  userId: number;

  @IsIn(['VIEWER', 'EDITOR', 'OWNER'])
  level: 'VIEWER' | 'EDITOR' | 'OWNER';
}

export class CreateFolderDto {
  @IsString()
  workspaceId: string;

  @IsOptional() @IsString()
  parentId?: string | null;

  @IsString() @MinLength(1)
  name: string;
}

export class RenameDto {
  @IsString() @MinLength(1)
  name: string;
}

export class MoveDto {
  @IsOptional() @IsString()
  parentId?: string | null;
}

export class CopyDto {
  @IsOptional() @IsString()
  parentId?: string | null;
}

export class GrantPermissionDto {
  @IsInt()
  userId: number;

  @IsIn(['VIEWER', 'EDITOR', 'OWNER'])
  level: 'VIEWER' | 'EDITOR' | 'OWNER';
}

export class CreatePublicLinkDto {
  @IsOptional() @IsString()
  password?: string;

  @IsOptional() @IsString()
  expiresAt?: string; // ISO date
}

export class CreateVersionDto {
  @IsOptional() @IsString()
  label?: string;

  @IsOptional() @IsInt()
  sizeBytes?: number;

  @IsOptional() @IsString()
  checksum?: string;

  @IsOptional() @IsString()
  storageRef?: string;
}
