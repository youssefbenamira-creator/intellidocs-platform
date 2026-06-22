import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccessModule } from '../access/access.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AssetService } from './asset.service';
import { WorkspaceService } from './workspace.service';
import { PermissionService } from './permission.service';
import { ActivityService } from './activity.service';
import { BackfillService } from './backfill.service';
import { ShareService } from './share.service';
import { VersionService } from './version.service';
import { AssetIndexSyncService } from './asset-index-sync.service';
import { ExplorerSearchService } from './explorer-search.service';
import { ScrapedSiteSyncService } from './scraped-site-sync.service';
import { AssetController } from './asset.controller';
import { WorkspaceController } from './workspace.controller';
import { ShareController, PublicShareController } from './share.controller';
import { VersionController } from './version.controller';
import { ExplorerSearchController } from './explorer-search.controller';
import { InternalSyncController } from './internal-sync.controller';

@Module({
  imports: [PrismaModule, NotificationsModule, AccessModule, ActivityLogsModule],
  controllers: [
    AssetController, WorkspaceController,
    ShareController, PublicShareController, VersionController,
    ExplorerSearchController, InternalSyncController,
  ],
  providers: [
    AssetService, WorkspaceService, PermissionService,
    ActivityService, BackfillService, ShareService, VersionService,
    AssetIndexSyncService, ExplorerSearchService, ScrapedSiteSyncService,
  ],
  // Exported so the upload/scrape pipelines can register assets + versions at ingest time
  exports: [AssetService, WorkspaceService, VersionService, ScrapedSiteSyncService],
})
export class ExplorerModule {}
