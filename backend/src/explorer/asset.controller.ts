import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { AssetService } from './asset.service';
import { WorkspaceService } from './workspace.service';
import { PermissionService } from './permission.service';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateFolderDto, RenameDto, MoveDto, CopyDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetController {
  constructor(
    private readonly assets: AssetService,
    private readonly workspaces: WorkspaceService,
    private readonly perms: PermissionService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: any,
    @Query('parentId') parentId?: string,
    @Query('trashed') trashed?: string,
  ) {
    // Visibility is role-scoped inside the service (admin=all, expert=own+shared, DM=shared)
    return this.assets.listForUser(user, parentId ?? null, trashed === 'true');
  }

  @Get(':id')
  async getOne(@CurrentUser() user: any, @Param('id') id: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'VIEWER');
    return asset;
  }

  @Get(':id/breadcrumbs')
  async breadcrumbs(@CurrentUser() user: any, @Param('id') id: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'VIEWER');
    return this.assets.breadcrumbs(asset);
  }

  @Get(':id/activity')
  async activityLog(@CurrentUser() user: any, @Param('id') id: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'VIEWER');
    return this.activity.list(asset.workspaceId, asset.id);
  }

  @Post('folder')
  async createFolder(@CurrentUser() user: any, @Body() dto: CreateFolderDto) {
    await this.workspaces.assertAccess(user, dto.workspaceId);
    if (dto.parentId) {
      await this.perms.assert(user, await this.assets.get(dto.parentId), 'EDITOR');
    }
    return this.assets.createFolder(dto.workspaceId, user.id, dto.parentId ?? null, dto.name);
  }

  @Patch(':id')
  async rename(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RenameDto) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'EDITOR');
    return this.assets.rename(asset, user.id, dto.name);
  }

  @Post(':id/move')
  async move(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: MoveDto) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'EDITOR');
    if (dto.parentId) {
      await this.perms.assert(user, await this.assets.get(dto.parentId), 'EDITOR');
    }
    return this.assets.move(asset, user.id, dto.parentId ?? null);
  }

  @Post(':id/copy')
  async copy(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CopyDto) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'VIEWER');
    if (dto.parentId) {
      await this.perms.assert(user, await this.assets.get(dto.parentId), 'EDITOR');
    }
    return this.assets.copy(asset, user.id, dto.parentId ?? null);
  }

  @Delete(':id')
  async trash(@CurrentUser() user: any, @Param('id') id: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'EDITOR');
    return this.assets.trash(asset, user.id);
  }

  @Post(':id/restore')
  async restore(@CurrentUser() user: any, @Param('id') id: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'EDITOR');
    return this.assets.restore(asset, user.id);
  }

  @Delete(':id/purge')
  async purge(@CurrentUser() user: any, @Param('id') id: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'OWNER');
    return this.assets.purge(asset, user.id);
  }
}
