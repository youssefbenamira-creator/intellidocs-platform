import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ExplorerSearchService } from './explorer-search.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('explorer')
export class ExplorerSearchController {
  constructor(private readonly search: ExplorerSearchService) {}

  @Get('users')
  users() {
    return this.search.listShareableUsers();
  }

  @Get('search')
  run(
    @CurrentUser() user: any,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('owner') owner?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tags') tags?: string,
    @Query('semantic') semantic?: string,
  ) {
    return this.search.search(user, {
      q,
      type,
      ownerId: owner ? parseInt(owner, 10) : undefined,
      from,
      to,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      semantic: semantic === 'true',
    });
  }
}
