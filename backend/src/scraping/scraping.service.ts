import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8001';

@Injectable()
export class ScrapingService {
  private readonly logger = new Logger(ScrapingService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async createJob(dto: CreateJobDto, userId: number) {
    const job = await this.prisma.scrapingJob.create({
      data: {
        name: dto.name,
        createdById: userId,
        targetCoins: dto.targetCoins,
        attributes: dto.attributes,
        mode: dto.mode as any,
        intervalSeconds: dto.intervalSeconds,
        status: 'ACTIVE',
      },
    });

    // Trigger scraping on FastAPI microservice
    try {
      const response = await fetch(`${SCRAPER_URL}/scraper/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          targetCoins: job.targetCoins,
          attributes: job.attributes,
          mode: job.mode,
          intervalSeconds: job.intervalSeconds,
        }),
      });

      if (!response.ok) {
        this.logger.warn(`FastAPI responded with ${response.status} for job ${job.id}`);
      }
    } catch (err) {
      this.logger.error(`Failed to trigger FastAPI for job ${job.id}: ${err.message}`);
    }

    this.activityLogsService.logActivity(
      userId,
      'CREATE_JOB',
      `Launched ${dto.mode} scraping job "${dto.name || 'Unnamed'}" for coins: ${dto.targetCoins.join(', ')}`,
    ).catch(() => {});

    return job;
  }

  async findAllJobs(userId: number, role: string) {
    const where = (role === 'ADMIN' || role === 'DECISION_MAKER') ? {} : { createdById: userId };
    return this.prisma.scrapingJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { email: true } },
        _count: { select: { results: true } },
      },
    });
  }

  async updateJob(id: number, dto: UpdateJobDto, userId: number, role: string) {
    const job = await this.prisma.scrapingJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    if (role !== 'ADMIN' && job.createdById !== userId) {
      throw new ForbiddenException('You can only modify your own jobs');
    }

    const updated = await this.prisma.scrapingJob.update({
      where: { id },
      data: dto as any,
    });

    // Notify FastAPI to stop/resume if status changed
    if (dto.status === 'PAUSED') {
      await fetch(`${SCRAPER_URL}/scraper/jobs/${id}/stop`, { method: 'POST' }).catch(() => {});
      this.activityLogsService.logActivity(userId, 'UPDATE_JOB', `Paused job #${id}`).catch(() => {});
    } else if (dto.status === 'ACTIVE' && job.status === 'PAUSED') {
      await fetch(`${SCRAPER_URL}/scraper/jobs/${id}/resume`, { method: 'POST' }).catch(() => {});
      this.activityLogsService.logActivity(userId, 'UPDATE_JOB', `Resumed job #${id}`).catch(() => {});
    }

    return updated;
  }

  async deleteJob(id: number, userId: number, role: string) {
    const job = await this.prisma.scrapingJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    if (role !== 'ADMIN' && job.createdById !== userId) {
      throw new ForbiddenException('You can only delete your own jobs');
    }

    // Stop scheduler on FastAPI
    await fetch(`${SCRAPER_URL}/scraper/jobs/${id}/stop`, { method: 'POST' }).catch(() => {});

    this.activityLogsService.logActivity(
      userId,
      'DELETE_JOB',
      `Deleted scraping job #${id}`,
    ).catch(() => {});

    return this.prisma.scrapingJob.delete({ where: { id } });
  }

  async findResults(coin?: string, from?: string, to?: string) {
    const where: any = {};
    if (coin) where.coin = { contains: coin, mode: 'insensitive' };
    if (from || to) {
      where.scrapedAt = {};
      if (from) where.scrapedAt.gte = new Date(from);
      if (to) where.scrapedAt.lte = new Date(to);
    }

    return this.prisma.scrapingResult.findMany({
      where,
      orderBy: { scrapedAt: 'desc' },
      take: 500,
      include: { job: { select: { name: true } } },
    });
  }

  async findResultsByJob(jobId: number) {
    return this.prisma.scrapingResult.findMany({
      where: { jobId },
      orderBy: { scrapedAt: 'asc' },
    });
  }
}
