import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentAccessService } from './document-access.service';

@Module({
  imports: [PrismaModule],
  providers: [DocumentAccessService],
  exports: [DocumentAccessService],
})
export class AccessModule {}
