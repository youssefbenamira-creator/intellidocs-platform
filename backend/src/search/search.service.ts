import { Injectable, Logger } from '@nestjs/common';
import { DocumentAccessService } from '../access/document-access.service';

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8001';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly access: DocumentAccessService) {}

  async query(q: string, limit: number, type: string | undefined, user: { id: number; role: string }) {
    try {
      const allowedRefs = await this.access.getAccessibleRefs(user.id, user.role);
      const body: Record<string, unknown> = { query: q, limit, allowed_refs: allowedRefs };
      if (type && type !== 'all') body.type = type;

      const res = await fetch(`${SCRAPER_URL}/search/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { results: [] };
      return res.json();
    } catch (err) {
      this.logger.error(`Search query failed: ${err.message}`);
      return { results: [] };
    }
  }

  async reindex() {
    const res = await fetch(`${SCRAPER_URL}/search/reindex`, { method: 'POST' });
    return res.json();
  }
}
