import {
  Controller, Post, Body, Headers, UnauthorizedException,
} from '@nestjs/common';
import { ScrapedSiteSyncService } from './scraped-site-sync.service';

/**
 * Service-to-service endpoint used by the FastAPI scraper to register newly
 * crawled pages into the explorer. Guarded by a shared internal key rather than
 * a user JWT (no user context at crawl time).
 */
@Controller('explorer/internal')
export class InternalSyncController {
  constructor(private readonly siteSync: ScrapedSiteSyncService) {}

  @Post('scraped-sync')
  async sync(@Headers('x-internal-key') key: string, @Body() body: { jobId: number }) {
    if (!process.env.INTERNAL_API_KEY || key !== process.env.INTERNAL_API_KEY) {
      throw new UnauthorizedException('Invalid internal key');
    }
    return this.siteSync.syncPages(body.jobId);
  }
}
