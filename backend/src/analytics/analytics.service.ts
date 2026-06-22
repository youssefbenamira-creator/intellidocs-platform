import { Injectable, Logger } from '@nestjs/common';

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8001';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  async getOverview() {
    try {
      const res = await fetch(`${SCRAPER_URL}/analytics/overview`);
      if (!res.ok) return null;
      return res.json();
    } catch (err) {
      this.logger.error(`Analytics overview error: ${err.message}`);
      return null;
    }
  }

  async getTopics(nTopics = 8) {
    try {
      const res = await fetch(`${SCRAPER_URL}/analytics/topics?n_topics=${nTopics}`, {
        method: 'POST',
      });
      if (!res.ok) return { topics: [] };
      return res.json();
    } catch (err) {
      this.logger.error(`Analytics topics error: ${err.message}`);
      return { topics: [] };
    }
  }
}
