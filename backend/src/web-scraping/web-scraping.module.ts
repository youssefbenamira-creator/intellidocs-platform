import { Module } from '@nestjs/common';
import { WebScrapingService } from './web-scraping.service';
import { WebScrapingController } from './web-scraping.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { ExplorerModule } from '../explorer/explorer.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [PrismaModule, ActivityLogsModule, ExplorerModule, TemplatesModule],
  controllers: [WebScrapingController],
  providers: [WebScrapingService],
})
export class WebScrapingModule {}
