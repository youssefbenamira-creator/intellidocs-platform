import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetService } from './asset.service';
import { WorkspaceService } from './workspace.service';

/**
 * One-shot (idempotent) import of pre-existing documents into the unified asset
 * model. Each user gets a default workspace; uploaded docs become FILE assets,
 * URL scraping jobs become SCRAPED_SITE roots with SCRAPED_PAGE children.
 * Safe to run repeatedly — anything already linked (assetId set) is skipped.
 */
@Injectable()
export class BackfillService {
  private readonly logger = new Logger(BackfillService.name);

  constructor(
    private prisma: PrismaService,
    private assets: AssetService,
    private workspaces: WorkspaceService,
  ) {}

  async run() {
    const result = { uploaded: 0, sites: 0, pages: 0 };

    // 1. Uploaded documents → FILE assets
    const uploaded = await this.prisma.uploadedDocument.findMany({ where: { assetId: null } });
    for (const doc of uploaded) {
      const ws = await this.workspaces.getOrCreateDefault(doc.uploadedById);
      const asset = await this.assets.createAsset({
        workspaceId: ws.id,
        ownerId: doc.uploadedById,
        parentId: null,
        type: 'FILE',
        name: doc.title || doc.filename,
        mimeType: doc.mimeType,
        sizeBytes: doc.fileSize,
        metadata: { uploadedDocumentId: doc.id, ref: `uploaded:${doc.id}` },
      });
      await this.prisma.uploadedDocument.update({ where: { id: doc.id }, data: { assetId: asset.id } });
      result.uploaded++;
    }

    // 2. URL scraping jobs → SCRAPED_SITE roots, their documents → SCRAPED_PAGE children
    const jobs = await this.prisma.scrapingJob.findMany({
      where: { assetId: null, url: { not: null } },
      include: { documents: true },
    });
    for (const job of jobs) {
      const ws = await this.workspaces.getOrCreateDefault(job.createdById);
      const site = await this.assets.createAsset({
        workspaceId: ws.id,
        ownerId: job.createdById,
        parentId: null,
        type: 'SCRAPED_SITE',
        name: job.name || job.url || `Crawl #${job.id}`,
        metadata: { scrapingJobId: job.id, seedUrl: job.url, pageCount: job.documents.length },
      });
      await this.prisma.scrapingJob.update({ where: { id: job.id }, data: { assetId: site.id } });
      result.sites++;

      for (const page of job.documents) {
        if (page.assetId) continue;
        const pageAsset = await this.assets.createAsset({
          workspaceId: ws.id,
          ownerId: job.createdById,
          parentId: site.id,
          type: 'SCRAPED_PAGE',
          name: page.title || page.url,
          metadata: { scrapedDocumentId: page.id, url: page.url, ref: `scraped:${page.id}` },
        });
        await this.prisma.scrapedDocument.update({ where: { id: page.id }, data: { assetId: pageAsset.id } });
        result.pages++;
      }
    }

    // 3. Orphan scraped documents whose job was already linked but pages were not
    const orphanPages = await this.prisma.scrapedDocument.findMany({
      where: { assetId: null, job: { assetId: { not: null } } },
      include: { job: true },
    });
    for (const page of orphanPages) {
      const site = await this.prisma.asset.findUnique({ where: { id: page.job.assetId! } });
      if (!site) continue;
      const pageAsset = await this.assets.createAsset({
        workspaceId: site.workspaceId,
        ownerId: site.ownerId,
        parentId: site.id,
        type: 'SCRAPED_PAGE',
        name: page.title || page.url,
        metadata: { scrapedDocumentId: page.id, url: page.url, ref: `scraped:${page.id}` },
      });
      await this.prisma.scrapedDocument.update({ where: { id: page.id }, data: { assetId: pageAsset.id } });
      result.pages++;
    }

    this.logger.log(`Backfill complete: ${JSON.stringify(result)}`);
    return result;
  }
}
