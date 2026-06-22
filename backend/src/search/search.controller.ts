import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  query(
    @Query('q') q: string,
    @CurrentUser() user: any,
    @Query('limit') limit = '10',
    @Query('type') type = 'all',
  ) {
    if (!q?.trim()) return { results: [] };
    return this.searchService.query(
      q.trim(), Math.min(parseInt(limit, 10) || 10, 50), type, user,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('reindex')
  reindex() {
    return this.searchService.reindex();
  }
}
