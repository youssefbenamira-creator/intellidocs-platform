import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { ExplorerModule } from '../explorer/explorer.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [PrismaModule, ActivityLogsModule, ExplorerModule, TemplatesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
