import {
  Controller, Get, Post, Delete,
  Param, Body, ParseIntPipe, Query,
  UseGuards,
} from '@nestjs/common';
import { SharesService } from './shares.service';
import { CreateShareDto } from './dto/create-share.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('shares')
export class SharesController {
  constructor(private readonly svc: SharesService) {}

  // ADMIN shares a document with one or more users
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateShareDto, @CurrentUser() user: any) {
    return this.svc.createShares(user.id, dto);
  }

  // Current user's received shares (EXPERT or DECISION_MAKER)
  @Get('received')
  received(@CurrentUser() user: any) {
    return this.svc.getReceivedShares(user.id);
  }

  // ADMIN: all shares across the platform
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('all')
  all() {
    return this.svc.getAllShares();
  }

  // ADMIN: users available to share with
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('users')
  users() {
    return this.svc.getShareableUsers();
  }

  // ADMIN: existing shares for a specific document
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('document')
  documentShares(
    @Query('id', ParseIntPipe) id: number,
    @Query('type') type: string,
  ) {
    return this.svc.getDocumentShares(id, type);
  }

  // ADMIN: revoke a share
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  revoke(@Param('id', ParseIntPipe) id: number) {
    return this.svc.revokeShare(id);
  }
}
