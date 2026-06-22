import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Asset } from '@prisma/client';
import { AssetService } from './asset.service';
import { WorkspaceService } from './workspace.service';
import { VersionService } from './version.service';

/**
 * Mirrors a URL scraping job into the explorer as a SCRAPED_SITE root with one
 * SCRAPED_PAGE child per crawled URL. Re-crawling the same URL appends a new
 * version to the existing page asset instead of creating a duplicate.
 */
@Injectable()
export class ScrapedSiteSyncService {
  private readonly logger = new Logger(ScrapedSiteSyncService.name);

  constructor(
    private prisma: PrismaService,
    private assets: AssetService,
    private workspaces: WorkspaceService,
    private versions: VersionService,
  ) {}

  /** Ensure the SCRAPED_SITE asset for a job exists; create + link it if not. */
  async ensureSite(jobId: number): Promise<Asset> {
    const job = await this.prisma.scrapingJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Scraping job not found');
    if (job.assetId) {
      const existing = await this.prisma.asset.findUnique({ where: { id: job.assetId } });
      if (existing) return existing;
    }
    const ws = await this.workspaces.getOrCreateDefault(job.createdById);
    const site = await this.assets.createAsset({
      workspaceId: ws.id,
      ownerId: job.createdById,
      parentId: null,
      type: 'SCRAPED_SITE',
      name: job.name || job.url || `Crawl #${job.id}`,
      metadata: { scrapingJobId: job.id, seedUrl: job.url, pageCount: 0 },
    });
    await this.prisma.scrapingJob.update({ where: { id: job.id }, data: { assetId: site.id } });
    return site;
  }

  /** Create/version page assets for every not-yet-linked document of a job. */
  async syncPages(jobId: number) {
    const site = await this.ensureSite(jobId);
    const actor = { id: site.ownerId, role: 'EXPERT' };
    const docs = await this.prisma.scrapedDocument.findMany({
      where: { jobId, assetId: null },
      orderBy: { scrapedAt: 'asc' },
    });

    let created = 0;
    let versioned = 0;
    for (const doc of docs) {
      // Same URL already crawled under this site? → treat as a re-crawl (new version)
      const existing = await this.prisma.asset.findFirst({
        where: { parentId: site.id, type: 'SCRAPED_PAGE', metadata: { path: ['url'], equals: doc.url } },
      });

      if (existing) {
        await this.versions.create(actor, existing, {
          label: `Re-crawl ${doc.scrapedAt.toISOString().slice(0, 10)}`,
          metadata: { scrapedDocumentId: doc.id },
        });
        await this.prisma.asset.update({
          where: { id: existing.id },
          data: {
            metadata: {
              ...((existing.metadata as object) ?? {}),
              ref: `scraped:${doc.id}`,
              scrapedDocumentId: doc.id,
              url: doc.url,
            },
          },
        });
        // The page's canonical detail row is the latest crawl. assetId is unique,
        // so move the link from the previous crawl to this one; older crawls
        // remain in the DB as version history.
        await this.prisma.scrapedDocument.updateMany({
          where: { assetId: existing.id },
          data: { assetId: null },
        });
        await this.prisma.scrapedDocument.update({ where: { id: doc.id }, data: { assetId: existing.id } });
        versioned++;
      } else {
        const page = await this.assets.createAsset({
          workspaceId: site.workspaceId,
          ownerId: site.ownerId,
          parentId: site.id,
          type: 'SCRAPED_PAGE',
          name: doc.title || doc.url,
          metadata: { scrapedDocumentId: doc.id, url: doc.url, ref: `scraped:${doc.id}` },
        });
        await this.versions.create(actor, page, {
          label: 'Initial crawl',
          metadata: { scrapedDocumentId: doc.id },
        });
        await this.prisma.scrapedDocument.update({ where: { id: doc.id }, data: { assetId: page.id } });
        created++;
      }
    }

    const pageCount = await this.prisma.asset.count({
      where: { parentId: site.id, type: 'SCRAPED_PAGE' },
    });
    await this.prisma.asset.update({
      where: { id: site.id },
      data: { metadata: { ...((site.metadata as object) ?? {}), pageCount } },
    });

    this.logger.log(`Synced job ${jobId}: ${created} new page(s), ${versioned} re-crawl version(s)`);
    return { site: site.id, created, versioned };
  }
}
