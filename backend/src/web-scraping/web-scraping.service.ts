import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUrlJobDto } from './dto/create-url-job.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ScrapedSiteSyncService } from '../explorer/scraped-site-sync.service';
import { TemplatesService } from '../templates/templates.service';

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8001';

@Injectable()
export class WebScrapingService {
  private readonly logger = new Logger(WebScrapingService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private siteSync: ScrapedSiteSyncService,
    private templates: TemplatesService,
  ) {}

  async createJob(dto: CreateUrlJobDto, userId: number) {
    // Resolve the table-extraction schema applied to every page of this crawl
    const columns = await this.templates.resolveColumns(dto.templateId, dto.columns);

    const job = await this.prisma.scrapingJob.create({
      data: {
        name: dto.name,
        createdById: userId,
        url: dto.url,
        targetCoins: [],
        attributes: [],
        mode: dto.mode as any,
        intervalSeconds: dto.intervalSeconds,
        status: 'ACTIVE',
        templateId: dto.templateId ?? null,
        tableColumns: columns ?? [],
      },
    });

    try {
      const response = await fetch(`${SCRAPER_URL}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          url: job.url,
          mode: job.mode,
          intervalSeconds: job.intervalSeconds,
        }),
      });

      if (!response.ok) {
        this.logger.warn(`FastAPI /scrape responded ${response.status} for job ${job.id}`);
      }
    } catch (err) {
      this.logger.error(`Failed to trigger FastAPI for job ${job.id}: ${err.message}`);
    }

    this.activityLogsService
      .logActivity(
        userId,
        'CREATE_JOB',
        `Created ${dto.mode} URL scraping job "${dto.name || 'Unnamed'}" → ${dto.url}`,
      )
      .catch(() => {});

    // Register the crawl as a SCRAPED_SITE asset so it appears in the explorer
    // immediately (pages are attached as they are crawled, via internal sync).
    this.siteSync.ensureSite(job.id).catch((err) =>
      this.logger.warn(`Failed to create site asset for job ${job.id}: ${err.message}`),
    );

    return job;
  }

  async findAllJobs(userId: number, role: string) {
    const where =
      role === 'ADMIN' || role === 'DECISION_MAKER'
        ? { url: { not: null } }
        : { createdById: userId, url: { not: null } };

    return this.prisma.scrapingJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { email: true } },
        _count: { select: { documents: true } },
      },
    });
  }

  async findJobById(id: number, userId: number, role: string) {
    const job = await this.prisma.scrapingJob.findUnique({
      where: { id },
      include: {
        createdBy: { select: { email: true } },
        documents: { orderBy: { scrapedAt: 'desc' }, take: 20 },
        _count: { select: { documents: true } },
      },
    });

    if (!job) throw new NotFoundException('Job not found');
    if (role !== 'ADMIN' && job.createdById !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return job;
  }

  async deleteJob(id: number, userId: number, role: string) {
    const job = await this.prisma.scrapingJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    if (role !== 'ADMIN' && job.createdById !== userId) {
      throw new ForbiddenException('You can only delete your own jobs');
    }

    await fetch(`${SCRAPER_URL}/scraper/jobs/${id}/stop`, { method: 'POST' }).catch(
      () => {},
    );

    this.activityLogsService
      .logActivity(userId, 'DELETE_JOB', `Deleted URL scraping job #${id}`)
      .catch(() => {});

    return this.prisma.scrapingJob.delete({ where: { id } });
  }

  async findDocumentsByJob(jobId: number, userId: number, role: string) {
    const job = await this.prisma.scrapingJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (role !== 'ADMIN' && job.createdById !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.scrapedDocument.findMany({
      where: { jobId },
      orderBy: { scrapedAt: 'desc' },
    });
  }

  async findDocumentById(id: number) {
    const doc = await this.prisma.scrapedDocument.findUnique({
      where: { id },
      include: { job: { select: { name: true, url: true, createdById: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
}
