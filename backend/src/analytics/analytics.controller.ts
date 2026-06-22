import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  getOverview() {
    return this.analyticsService.getOverview();
  }

  @Post('topics')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DECISION_MAKER', 'EXPERT')
  getTopics(@Query('n_topics') nTopics?: string) {
    return this.analyticsService.getTopics(nTopics ? parseInt(nTopics, 10) : 8);
  }
}
