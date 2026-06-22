import {
  Controller, Get, Post, Param, Body, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { VersionService } from './version.service';
import { AssetService } from './asset.service';
import { PermissionService } from './permission.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateVersionDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('assets')
export class VersionController {
  constructor(
    private readonly versions: VersionService,
    private readonly assets: AssetService,
    private readonly perms: PermissionService,
  ) {}

  @Get(':id/versions')
  async list(@CurrentUser() user: any, @Param('id') id: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'VIEWER');
    return this.versions.list(asset.id);
  }

  @Post(':id/versions')
  async create(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreateVersionDto) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'EDITOR');
    return this.versions.create(user, asset, dto);
  }

  @Post(':id/versions/:n/rollback')
  async rollback(@CurrentUser() user: any, @Param('id') id: string, @Param('n', ParseIntPipe) n: number) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'EDITOR');
    return this.versions.rollback(user, asset, n);
  }
}
