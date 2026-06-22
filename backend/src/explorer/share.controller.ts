import {
  Controller, Get, Post, Delete,
  Param, Body, ParseIntPipe, UseGuards, Headers, Query,
} from '@nestjs/common';
import { ShareService } from './share.service';
import { AssetService } from './asset.service';
import { PermissionService } from './permission.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GrantPermissionDto, CreatePublicLinkDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('assets')
export class ShareController {
  constructor(
    private readonly shares: ShareService,
    private readonly assets: AssetService,
    private readonly perms: PermissionService,
  ) {}

  @Get(':id/permissions')
  async list(@CurrentUser() user: any, @Param('id') id: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'VIEWER');
    return this.shares.listPermissions(asset.id);
  }

  @Post(':id/permissions')
  async grant(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: GrantPermissionDto) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'OWNER');
    return this.shares.grant(user, asset, dto.userId, dto.level);
  }

  @Delete(':id/permissions/:userId')
  async revoke(@CurrentUser() user: any, @Param('id') id: string, @Param('userId', ParseIntPipe) userId: number) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'OWNER');
    return this.shares.revoke(user, asset, userId);
  }

  @Get(':id/public-links')
  async listLinks(@CurrentUser() user: any, @Param('id') id: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'OWNER');
    return this.shares.listPublicLinks(asset.id);
  }

  @Post(':id/public-links')
  async createLink(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreatePublicLinkDto) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'OWNER');
    return this.shares.createPublicLink(user, asset, dto);
  }

  @Delete(':id/public-links/:shareId')
  async revokeLink(@CurrentUser() user: any, @Param('id') id: string, @Param('shareId') shareId: string) {
    const asset = await this.assets.get(id);
    await this.perms.assert(user, asset, 'OWNER');
    return this.shares.revokePublicLink(user, asset, shareId);
  }
}

/** Unauthenticated endpoint for resolving public share links. */
@Controller('public')
export class PublicShareController {
  constructor(private readonly shares: ShareService) {}

  @Get(':token')
  resolve(
    @Param('token') token: string,
    @Headers('x-share-password') headerPw?: string,
    @Query('password') queryPw?: string,
  ) {
    return this.shares.resolvePublic(token, headerPw || queryPw);
  }
}
