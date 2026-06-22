import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { ScrapingModule } from './scraping/scraping.module';
import { WebScrapingModule } from './web-scraping/web-scraping.module';
import { DocumentsModule } from './documents/documents.module';
import { SearchModule } from './search/search.module';
import { AssistantModule } from './assistant/assistant.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SharesModule } from './shares/shares.module';
import { ExplorerModule } from './explorer/explorer.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    PrismaModule, UsersModule, AuthModule, ActivityLogsModule,
    ScrapingModule, WebScrapingModule, DocumentsModule,
    SearchModule, AssistantModule, AnalyticsModule,
    NotificationsModule, SharesModule, ExplorerModule, TemplatesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
