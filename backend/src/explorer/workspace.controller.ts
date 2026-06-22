import {
  Controller, Get, Post, Body, Param, UseGuards,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { BackfillService } from './backfill.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateWorkspaceDto, AddMemberDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspaceController {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly backfill: BackfillService,
  ) {}

  @Get()
  async list(@CurrentUser() user: any) {
    // Guarantee the caller always has at least their default workspace
    await this.workspaces.getOrCreateDefault(user.id);
    return this.workspaces.listForUser(user.id);
  }

  @Get('default')
  default(@CurrentUser() user: any) {
    return this.workspaces.getOrCreateDefault(user.id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, dto.name);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.workspaces.addMember(user, id, dto.userId, dto.level);
  }

  // ADMIN-only: import existing uploaded/scraped documents into the asset model
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('backfill')
  runBackfill() {
    return this.backfill.run();
  }
}
